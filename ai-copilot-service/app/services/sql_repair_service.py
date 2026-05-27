from app.clients.llm_client import llm_client

REPAIR_SYSTEM_PROMPT = """你是一个 SQL 修复工具。给定的 SQL 执行出错，请修正后只返回修正后的 SQL。
不要解释，不要用 markdown 代码块包裹。"""


async def repair_sql(sql: str, error_message: str, db_type: str = "MYSQL") -> str | None:
    messages = [
        {"role": "system", "content": REPAIR_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"数据库类型: {db_type}\n出错的SQL:\n{sql}\n错误信息:\n{error_message}",
        },
    ]
    try:
        result = await llm_client.chat(messages, temperature=0.1)
        fixed = result.strip()
        if fixed.startswith("```"):
            lines = fixed.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            fixed = "\n".join(lines).strip()
        if fixed and fixed != sql:
            return fixed
    except Exception:
        pass
    return None
