from app.clients.java_backend_client import JavaBackendClient
from app.clients.llm_client import llm_client


async def recall_schema(
    state: dict, java_client: JavaBackendClient
) -> dict:
    ds_ctx = state.get("datasource_context", {})
    if not ds_ctx.get("data_source_id"):
        state["recalled_schema"] = {"tables": [], "join_paths": []}
        return state

    message = state.get("message", "")
    keywords = _extract_keywords(message)

    try:
        search_result = await java_client.schema_search(ds_ctx, keywords)
        state["recalled_schema"] = {
            "tables": [t.model_dump() for t in search_result.tables],
            "join_paths": [],
        }
    except Exception:
        state["recalled_schema"] = {"tables": [], "join_paths": []}

    return state


def _extract_keywords(message: str) -> list[str]:
    words = message.replace("的", " ").replace("了", " ").replace("在", " ").split()
    return [w for w in words if len(w) >= 2][:10]
