from typing import Any, TypedDict


class CopilotState(TypedDict, total=False):
    session_id: str
    trace_id: str
    user_id: str | None
    message: str
    datasource_context: dict
    intent: str | None
    need_clarification: bool
    missing_slots: list[str]
    recalled_schema: dict
    generated_sql: str | None
    validated_sql: str | None
    sql_type: str | None
    requires_confirmation: bool
    execution_result: dict | None
    final_answer: str | None
    conversation_history: list[dict]
    error: str | None
