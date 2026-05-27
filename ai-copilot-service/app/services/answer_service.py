from app.clients.llm_client import llm_client

SUMMARIZE_SYSTEM_PROMPT = """你是一个数据分析助手。根据用户的提问、执行的 SQL 和查询结果，用中文简洁回答用户的问题。
直接给出答案和具体数据，不需要重复 SQL。"""


async def summarize_answer(state: dict) -> dict:
    execution = state.get("execution_result", {})
    sql = state.get("validated_sql") or state.get("generated_sql", "")

    result_desc = _format_result(execution)

    messages = [
        {"role": "system", "content": SUMMARIZE_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"用户问题: {state['message']}\n\n"
                f"执行的SQL:\n{sql}\n\n"
                f"查询结果:\n{result_desc}\n\n"
                f"请根据以上查询结果，用中文简洁地回答用户的问题。"
            ),
        },
    ]

    answer_parts = []
    async for chunk in llm_client.chat_stream(messages, temperature=0.3):
        answer_parts.append(chunk)

    state["final_answer"] = "".join(answer_parts)
    return state


def _format_result(execution: dict) -> str:
    if not execution:
        return "（无执行结果）"

    if not execution.get("success"):
        return f"执行失败: {execution.get('message', '未知错误')}"

    columns = execution.get("columns", [])
    rows = execution.get("rows", [])
    row_count = execution.get("row_count", len(rows))

    if not columns and not rows:
        return f"操作成功，影响 {row_count} 行"

    lines = [f"查询成功，共 {row_count} 行结果。"]
    lines.append(f"列: {', '.join(columns)}")

    for row in rows[:30]:
        cells = [str(v) if v is not None else "" for v in row]
        lines.append(" | ".join(cells))

    if len(rows) > 30:
        lines.append(f"... (共 {row_count} 行，已截断)")

    return "\n".join(lines)
