from typing import Any

import httpx

from app.core.config import settings
from app.core.models import (
    SchemaSearchResponse,
    SqlExecuteResponse,
    SqlValidateResponse,
    TableSchemaInfo,
)


class JavaBackendClient:
    """Async HTTP client for Java internal APIs."""

    def __init__(self, base_url: str | None = None):
        self.base_url = (base_url or settings.copilot_java_url).rstrip("/")

    async def schema_search(
        self, ds_ctx: dict, keywords: list[str]
    ) -> SchemaSearchResponse:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/internal/ai/schema/search",
                json={
                    "dataSourceId": ds_ctx.get("data_source_id"),
                    "databaseName": ds_ctx.get("database_name"),
                    "schemaName": ds_ctx.get("schema_name"),
                    "keywords": keywords,
                },
            )
            resp.raise_for_status()
            return SchemaSearchResponse(**resp.json())

    async def table_detail(
        self, ds_ctx: dict, table_name: str
    ) -> TableSchemaInfo:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/internal/ai/schema/table-detail",
                json={
                    "dataSourceId": ds_ctx.get("data_source_id"),
                    "databaseName": ds_ctx.get("database_name"),
                    "schemaName": ds_ctx.get("schema_name"),
                    "tableName": table_name,
                },
            )
            resp.raise_for_status()
            return TableSchemaInfo(**resp.json())

    async def validate_sql(self, sql: str, ds_ctx: dict) -> SqlValidateResponse:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{self.base_url}/internal/ai/sql/validate",
                json={
                    "sql": sql,
                    "dataSourceId": ds_ctx.get("data_source_id"),
                    "databaseName": ds_ctx.get("database_name"),
                    "schemaName": ds_ctx.get("schema_name"),
                },
            )
            resp.raise_for_status()
            return SqlValidateResponse(**resp.json())

    async def execute_sql(self, sql: str, ds_ctx: dict) -> SqlExecuteResponse:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{self.base_url}/internal/ai/sql/execute",
                json={
                    "sql": sql,
                    "dataSourceId": ds_ctx.get("data_source_id"),
                    "databaseName": ds_ctx.get("database_name"),
                    "schemaName": ds_ctx.get("schema_name"),
                },
            )
            resp.raise_for_status()
            return SqlExecuteResponse(**resp.json())
