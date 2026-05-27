from typing import Any

from pydantic import BaseModel, ConfigDict, Field


# --- Request models ---


class DatasourceContext(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    data_source_id: int | None = Field(None, alias="dataSourceId")
    database_name: str | None = Field(None, alias="databaseName")
    schema_name: str | None = Field(None, alias="schemaName")


class CopilotRunRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str | None = Field(None, alias="sessionId")
    message: str
    datasource_context: DatasourceContext | None = Field(None, alias="datasourceContext")
    user_id: str | None = Field(None, alias="userId")
    llm_url: str | None = Field(None, alias="llmUrl")
    llm_api_key: str | None = Field(None, alias="llmApiKey")
    llm_model: str | None = Field(None, alias="llmModel")


class CopilotConfirmRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    session_id: str = Field(alias="sessionId")
    trace_id: str = Field(alias="traceId")
    confirmed: bool


# --- SSE event model ---


class SseEvent(BaseModel):
    type: str  # session, status, plan, schema, sql, confirm, result, answer, done, error
    data: Any = None


# --- Internal API response models ---


class ColumnSchema(BaseModel):
    name: str
    type: str | None = None
    comment: str | None = None
    primary_key: bool = False


class TableSchemaInfo(BaseModel):
    name: str
    comment: str | None = None
    columns: list[ColumnSchema] = []
    ddl: str | None = None
    score: float = 0.0


class SchemaSearchResponse(BaseModel):
    tables: list[TableSchemaInfo] = []


class SqlValidateResponse(BaseModel):
    ok: bool
    sql_type: str
    read_only: bool
    requires_confirmation: bool
    warnings: list[str] = []


class SqlExecuteResponse(BaseModel):
    success: bool
    columns: list[str] = []
    rows: list[list[Any]] = []
    row_count: int = 0
    message: str | None = None
    error_code: str | None = None
