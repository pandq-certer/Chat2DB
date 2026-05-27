import json

from app.clients.llm_client import llm_client

INTENT_SYSTEM_PROMPT = """你是一个意图识别引擎。分析用户的消息，判断意图并返回 JSON。

意图枚举：
- CHAT: 一般对话、问候、闲聊
- NL2SQL: 用户想要查询或操作数据库数据
- SQL_EXPLAIN: 用户要求解释某段 SQL
- SQL_OPTIMIZE: 用户要求优化某段 SQL
- SQL_FIX: 用户要求修复出错的 SQL
- RESULT_FOLLOW_UP: 用户针对上一次查询结果追问

返回 JSON：
{
  "intent": "NL2SQL",
  "needClarification": false,
  "missingSlots": [],
  "reasoning": "简短说明"
}

只返回 JSON，不要解释。"""


async def detect_intent(
    state: dict, history: list[dict] | None = None
) -> dict:
    messages = [{"role": "system", "content": INTENT_SYSTEM_PROMPT}]

    if history:
        for msg in history[-6:]:
            messages.append(msg)

    messages.append({"role": "user", "content": state["message"]})

    try:
        raw = await llm_client.chat_json(messages, temperature=0)
        result = json.loads(raw)
        state["intent"] = result.get("intent", "CHAT")
        state["need_clarification"] = result.get("needClarification", False)
        state["missing_slots"] = result.get("missingSlots", [])
    except (json.JSONDecodeError, Exception) as e:
        state["intent"] = "CHAT"
        state["need_clarification"] = False
        state["missing_slots"] = []

    return state
