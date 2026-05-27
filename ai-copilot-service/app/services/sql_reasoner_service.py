import json

from app.clients.llm_client import llm_client

NL2SQL_SYSTEM_PROMPT = """你是一个专业的 SQL 生成引擎。根据用户的自然语言请求和数据库表结构，生成一条正确的 SQL。

规则：
- 只生成单条 SQL
- 查询类 SQL 自动加 LIMIT，默认 LIMIT 100
- DML/DDL 语句需要标记
- 不允许使用 markdown 代码块包裹
- 不允许在 SQL 前后添加解释文字

返回 JSON 格式：
{
  "sql": "SELECT ...",
  "assumptions": ["假设说明"],
  "explanation": "简要说明"
}

只返回 JSON。"""


async def generate_sql(state: dict) -> dict:
    schema_info = state.get("recalled_schema", {})
    tables = schema_info.get("tables", [])

    schema_desc = _format_schema(tables)
    history = state.get("conversation_history", [])

    messages = [{"role": "system", "content": NL2SQL_SYSTEM_PROMPT}]

    for msg in history[-6:]:
        messages.append(msg)

    user_content = f"数据库表结构：\n{schema_desc}\n\n用户请求：{state['message']}"
    messages.append({"role": "user", "content": user_content})

    try:
        raw = await llm_client.chat_json(messages, temperature=0.1)
        result = json.loads(raw)
        sql = result.get("sql", "").strip()
        if sql.startswith("```"):
            sql = _strip_code_fence(sql)
        state["generated_sql"] = sql
    except (json.JSONDecodeError, Exception):
        raw_text = await llm_client.chat(messages, temperature=0.1)
        state["generated_sql"] = _strip_code_fence(raw_text.strip())

    return state


def _format_schema(tables: list[dict]) -> str:
    if not tables:
        return "（未提供表结构信息）"
    lines = []
    for t in tables:
        name = t.get("name", "")
        comment = t.get("comment", "")
        cols = t.get("columns", [])
        col_str = ", ".join(
            f"{c.get('name', '')} {c.get('type', '')}"
            + (f" PK" if c.get("primary_key") else "")
            + (f" -- {c['comment']}" if c.get("comment") else "")
            for c in cols
        )
        header = f"表 {name}"
        if comment:
            header += f"({comment})"
        lines.append(f"{header}: {col_str}")

        ddl = t.get("ddl")
        if ddl:
            lines.append(f"DDL: {ddl}")

    return "\n".join(lines)


def _strip_code_fence(sql: str) -> str:
    sql = sql.strip()
    if sql.startswith("```"):
        lines = sql.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        sql = "\n".join(lines)
    return sql.strip()
