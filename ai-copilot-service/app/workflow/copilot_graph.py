from collections.abc import AsyncGenerator
from typing import Any, Callable

from app.clients.java_backend_client import JavaBackendClient
from app.clients.llm_client import llm_client
from app.core.models import CopilotRunRequest, SseEvent
from app.services.answer_service import summarize_answer
from app.services.intent_service import detect_intent
from app.services.schema_recall_service import recall_schema
from app.services.session_service import session_service
from app.services.sql_reasoner_service import generate_sql
from app.services.sql_repair_service import repair_sql
from app.workflow.state import CopilotState

java_client = JavaBackendClient()


def _emit(events: list[SseEvent], event: SseEvent) -> None:
    events.append(event)


async def run_copilot(request: CopilotRunRequest) -> AsyncGenerator[str, None]:
    state = _initialize_state(request)
    events: list[SseEvent] = []

    # Store custom LLM config if provided
    if request.llm_url and request.llm_api_key:
        state["llm_url"] = request.llm_url
        state["llm_api_key"] = request.llm_api_key
        state["llm_model"] = request.llm_model

    try:
        _emit(events, SseEvent(type="session", data={
            "sessionId": state["session_id"],
            "traceId": state["trace_id"],
        }))

        # Load session
        state = _load_session(state)

        # Detect intent
        _emit(events, SseEvent(type="status", data="正在理解问题"))
        async for event in _detect_intent_step(state):
            yield event

        # Branch on intent
        intent = state.get("intent", "CHAT")

        if intent == "CHAT":
            async for event in _chat_branch(state):
                yield event
            return

        # NL2SQL and related intents need schema + SQL
        if state.get("datasource_context", {}).get("data_source_id"):
            async for event in _sql_branch(state):
                yield event
        else:
            # No datasource, fall back to general chat
            async for event in _chat_branch(state):
                yield event

    except Exception as e:
        yield _sse_line(SseEvent(type="error", data={"message": str(e)}))
        yield _sse_line(SseEvent(type="done", data={}))
        _save_state(state)
        return

    _save_state(state)


async def resume_copilot_confirm(
    session_id: str, trace_id: str, confirmed: bool
) -> AsyncGenerator[str, None]:
    state = session_service.get(session_id)
    if state is None:
        yield _sse_line(SseEvent(type="error", data={"message": "Session not found"}))
        yield _sse_line(SseEvent(type="done", data={}))
        return

    state["trace_id"] = trace_id

    if not confirmed:
        yield _sse_line(SseEvent(type="status", data="已取消执行"))
        yield _sse_line(SseEvent(type="done", data={}))
        _save_state(state)
        return

    sql = state.get("validated_sql") or state.get("generated_sql", "")
    ds_ctx = state.get("datasource_context", {})

    yield _sse_line(SseEvent(type="status", data="正在执行"))

    try:
        result = await java_client.execute_sql(sql, ds_ctx)
        state["execution_result"] = result.model_dump()

        yield _sse_line(SseEvent(type="result", data={
            "rowCount": result.row_count,
            "success": result.success,
        }))

        # Auto-repair if failed
        if not result.success:
            fixed = await repair_sql(sql, result.message or "")
            if fixed:
                state["validated_sql"] = fixed
                yield _sse_line(SseEvent(type="sql", data={"content": fixed}))
                yield _sse_line(SseEvent(type="status", data="正在重新执行"))

                result = await java_client.execute_sql(fixed, ds_ctx)
                state["execution_result"] = result.model_dump()
                yield _sse_line(SseEvent(type="result", data={
                    "rowCount": result.row_count,
                    "success": result.success,
                }))
    except Exception as e:
        yield _sse_line(SseEvent(type="error", data={"message": str(e)}))
        yield _sse_line(SseEvent(type="done", data={}))
        _save_state(state)
        return

    # Summarize
    yield _sse_line(SseEvent(type="status", data="正在总结回答"))
    await summarize_answer(state)
    yield _sse_line(SseEvent(type="answer", data={"content": state.get("final_answer", "")}))
    yield _sse_line(SseEvent(type="done", data={}))
    _save_state(state)


# --- Internal steps ---


async def _detect_intent_step(state: CopilotState) -> AsyncGenerator[str, None]:
    history = state.get("conversation_history", [])
    await detect_intent(state, history)
    yield _sse_line(SseEvent(type="plan", data={"intent": state.get("intent", "CHAT")}))


async def _chat_branch(state: CopilotState) -> AsyncGenerator[str, None]:
    yield _sse_line(SseEvent(type="status", data="正在生成回答"))

    messages = [
        {"role": "system", "content": "你是一个有用的 AI 助手，帮助用户与数据库交互。"},
    ]
    for msg in (state.get("conversation_history") or [])[-6:]:
        messages.append(msg)
    messages.append({"role": "user", "content": state["message"]})

    # Get custom LLM config from state
    llm_url = state.get("llm_url")
    llm_api_key = state.get("llm_api_key")
    llm_model = state.get("llm_model")

    # Debug: print LLM config
    import logging
    logger = logging.getLogger(__name__)
    if llm_url:
        logger.info(f"Using custom LLM: url={llm_url[:50]}..., model={llm_model}")
    else:
        logger.info("Using default LLM")

    full_answer = []
    try:
        async for chunk in llm_client.chat_stream(
            messages, 
            temperature=0.3,
            llm_url=llm_url,
            llm_api_key=llm_api_key,
            llm_model=llm_model
        ):
            full_answer.append(chunk)
            yield _sse_line(SseEvent(type="answer", data={"content": chunk, "streaming": True}))
    except Exception as e:
        logger.error(f"LLM error: {str(e)}")
        yield _sse_line(SseEvent(type="error", data={"message": f"LLM 服务错误: {str(e)}"}))
        yield _sse_line(SseEvent(type="done", data={}))
        return

    state["final_answer"] = "".join(full_answer)
    yield _sse_line(SseEvent(type="done", data={}))


async def _sql_branch(state: CopilotState) -> AsyncGenerator[str, None]:
    # Schema recall
    yield _sse_line(SseEvent(type="status", data="正在检索相关表"))
    await recall_schema(state, java_client)

    tables = state.get("recalled_schema", {}).get("tables", [])
    yield _sse_line(SseEvent(type="schema", data={
        "tables": [t.get("name", "") for t in tables],
    }))

    # Generate SQL
    yield _sse_line(SseEvent(type="status", data="正在生成 SQL"))
    await generate_sql(state)

    sql = state.get("generated_sql", "")
    yield _sse_line(SseEvent(type="sql", data={"content": sql}))

    if not sql:
        yield _sse_line(SseEvent(type="error", data={"message": "未能生成有效的 SQL"}))
        yield _sse_line(SseEvent(type="done", data={}))
        return

    # Validate SQL via Java
    ds_ctx = state.get("datasource_context", {})
    try:
        validation = await java_client.validate_sql(sql, ds_ctx)
        state["sql_type"] = validation.sql_type
        state["requires_confirmation"] = validation.requires_confirmation
    except Exception:
        state["sql_type"] = "SELECT"
        state["requires_confirmation"] = False

    # Add LIMIT if SELECT without it
    if state.get("sql_type") == "SELECT":
        sql = _ensure_limit(sql)
        state["validated_sql"] = sql
    else:
        state["validated_sql"] = sql

    # If DML/DDL, pause for confirmation
    if state.get("requires_confirmation"):
        yield _sse_line(SseEvent(type="confirm", data={
            "required": True,
            "sql": sql,
            "sqlType": state.get("sql_type", ""),
        }))
        yield _sse_line(SseEvent(type="done", data={}))
        return

    # Execute SQL
    yield _sse_line(SseEvent(type="status", data="正在执行查询"))
    try:
        result = await java_client.execute_sql(sql, ds_ctx)
        state["execution_result"] = result.model_dump()

        yield _sse_line(SseEvent(type="result", data={
            "rowCount": result.row_count,
            "success": result.success,
        }))

        # Auto-repair on failure
        if not result.success:
            fixed = await repair_sql(sql, result.message or "")
            if fixed:
                state["validated_sql"] = fixed
                yield _sse_line(SseEvent(type="sql", data={"content": fixed}))
                yield _sse_line(SseEvent(type="status", data="正在重新执行"))

                result = await java_client.execute_sql(fixed, ds_ctx)
                state["execution_result"] = result.model_dump()
                yield _sse_line(SseEvent(type="result", data={
                    "rowCount": result.row_count,
                    "success": result.success,
                }))
    except Exception as e:
        yield _sse_line(SseEvent(type="error", data={"message": str(e)}))
        yield _sse_line(SseEvent(type="done", data={}))
        return

    # Summarize
    yield _sse_line(SseEvent(type="status", data="正在总结回答"))
    await summarize_answer(state)
    yield _sse_line(SseEvent(type="answer", data={"content": state.get("final_answer", "")}))
    yield _sse_line(SseEvent(type="done", data={}))


# --- Helpers ---


def _initialize_state(request: CopilotRunRequest) -> CopilotState:
    ds_ctx = {}
    if request.datasource_context:
        ds_ctx = {
            "data_source_id": request.datasource_context.data_source_id,
            "database_name": request.datasource_context.database_name,
            "schema_name": request.datasource_context.schema_name,
        }
    return CopilotState(
        session_id="",
        trace_id="",
        user_id=request.user_id,
        message=request.message,
        datasource_context=ds_ctx,
    )


def _load_session(state: CopilotState) -> CopilotState:
    session_id, loaded = session_service.get_or_create(state.get("session_id"))
    state["session_id"] = session_id
    state["trace_id"] = loaded.get("trace_id", state.get("trace_id", ""))

    if loaded.get("conversation_history"):
        state["conversation_history"] = loaded["conversation_history"]
    else:
        state["conversation_history"] = []

    return state


def _save_state(state: CopilotState) -> None:
    history = list(state.get("conversation_history", []))
    history.append({"role": "user", "content": state.get("message", "")})
    if state.get("final_answer"):
        history.append({"role": "assistant", "content": state["final_answer"]})
    state["conversation_history"] = history[-20:]  # Keep last 20 turns
    session_service.save(state["session_id"], state)


def _sse_line(event: SseEvent) -> str:
    return f"data: {event.model_dump_json()}\n\n"


def _ensure_limit(sql: str) -> str:
    upper = sql.upper().strip()
    if "LIMIT" not in upper:
        return sql.rstrip(";") + " LIMIT 100"
    return sql
