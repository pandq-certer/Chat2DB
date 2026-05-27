package ai.chat2db.server.web.api.controller.copilot.internal;

import ai.chat2db.server.domain.api.param.ShowCreateTableParam;
import ai.chat2db.server.domain.api.param.TablePageQueryParam;
import ai.chat2db.server.domain.api.param.TableQueryParam;
import ai.chat2db.server.domain.api.service.TableService;
import ai.chat2db.server.tools.base.wrapper.result.DataResult;
import ai.chat2db.server.tools.base.wrapper.result.ListResult;
import ai.chat2db.server.web.api.controller.copilot.response.ColumnInfo;
import ai.chat2db.server.web.api.controller.copilot.response.SchemaSearchResponse;
import ai.chat2db.server.web.api.controller.copilot.response.SqlValidateResponse;
import ai.chat2db.server.web.api.controller.copilot.response.TableSchemaInfo;
import ai.chat2db.spi.model.SimpleTable;
import ai.chat2db.spi.model.TableColumn;
import ai.chat2db.spi.model.TableIndex;
import jakarta.annotation.Resource;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.collections4.CollectionUtils;
import org.apache.commons.lang3.StringUtils;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.stream.Collectors;

@Service
@Slf4j
public class InternalAiService {

    @Resource
    private TableService tableService;

    public SchemaSearchResponse searchSchema(Long dataSourceId, String databaseName,
                                              String schemaName, List<String> keywords) {
        SchemaSearchResponse response = new SchemaSearchResponse();
        if (dataSourceId == null) {
            return response;
        }
        try {
            TablePageQueryParam tableParam = new TablePageQueryParam();
            tableParam.setDataSourceId(dataSourceId);
            tableParam.setDatabaseName(databaseName);
            tableParam.setSchemaName(schemaName);

            ListResult<SimpleTable> tableResult = tableService.queryTables(tableParam);
            if (tableResult == null || CollectionUtils.isEmpty(tableResult.getData())) {
                return response;
            }

            String keywordStr = keywords == null ? "" :
                    String.join(" ", keywords).toLowerCase();

            List<SimpleTable> allTables = tableResult.getData();
            List<SimpleTable> scored = allTables.stream()
                    .sorted((a, b) -> Integer.compare(
                            tableRelevanceScore(b, keywordStr),
                            tableRelevanceScore(a, keywordStr)))
                    .collect(Collectors.toList());

            int limit = Math.min(scored.size(), 15);
            List<TableSchemaInfo> tables = new ArrayList<>();
            for (int i = 0; i < limit; i++) {
                SimpleTable table = scored.get(i);
                TableSchemaInfo info = new TableSchemaInfo();
                info.setName(table.getName());
                info.setComment(table.getComment());

                TableQueryParam colParam = new TableQueryParam();
                colParam.setDataSourceId(dataSourceId);
                colParam.setDatabaseName(databaseName);
                colParam.setSchemaName(schemaName);
                colParam.setTableName(table.getName());

                List<TableColumn> columns = tableService.queryColumns(colParam);
                if (CollectionUtils.isNotEmpty(columns)) {
                    info.setColumns(columns.stream().map(c -> {
                        ColumnInfo ci = new ColumnInfo();
                        ci.setName(c.getName());
                        ci.setType(c.getColumnType());
                        ci.setComment(c.getComment());
                        ci.setPrimaryKey(Boolean.TRUE.equals(c.getPrimaryKey()));
                        return ci;
                    }).collect(Collectors.toList()));
                }

                try {
                    ShowCreateTableParam ddlParam = new ShowCreateTableParam();
                    ddlParam.setDataSourceId(dataSourceId);
                    ddlParam.setDatabaseName(databaseName);
                    ddlParam.setSchemaName(schemaName);
                    ddlParam.setTableName(table.getName());
                    DataResult<String> ddlResult = tableService.showCreateTable(ddlParam);
                    if (ddlResult != null && ddlResult.getData() != null) {
                        info.setDdl(ddlResult.getData());
                    }
                } catch (Exception e) {
                    log.debug("Failed to get DDL for table {}", table.getName(), e);
                }

                tables.add(info);
            }
            response.setTables(tables);
        } catch (Exception e) {
            log.error("searchSchema error", e);
        }
        return response;
    }

    public TableSchemaInfo getTableDetail(Long dataSourceId, String databaseName,
                                           String schemaName, String tableName) {
        TableSchemaInfo info = new TableSchemaInfo();
        info.setName(tableName);

        try {
            TableQueryParam colParam = new TableQueryParam();
            colParam.setDataSourceId(dataSourceId);
            colParam.setDatabaseName(databaseName);
            colParam.setSchemaName(schemaName);
            colParam.setTableName(tableName);

            List<TableColumn> columns = tableService.queryColumns(colParam);
            if (CollectionUtils.isNotEmpty(columns)) {
                info.setColumns(columns.stream().map(c -> {
                    ColumnInfo ci = new ColumnInfo();
                    ci.setName(c.getName());
                    ci.setType(c.getColumnType());
                    ci.setComment(c.getComment());
                    ci.setPrimaryKey(Boolean.TRUE.equals(c.getPrimaryKey()));
                    return ci;
                }).collect(Collectors.toList()));
            }

            List<TableIndex> indexes = tableService.queryIndexes(colParam);
            // Index info can be added to TableSchemaInfo if needed

            ShowCreateTableParam ddlParam = new ShowCreateTableParam();
            ddlParam.setDataSourceId(dataSourceId);
            ddlParam.setDatabaseName(databaseName);
            ddlParam.setSchemaName(schemaName);
            ddlParam.setTableName(tableName);
            DataResult<String> ddlResult = tableService.showCreateTable(ddlParam);
            if (ddlResult != null && ddlResult.getData() != null) {
                info.setDdl(ddlResult.getData());
            }
        } catch (Exception e) {
            log.error("getTableDetail error for table {}", tableName, e);
        }
        return info;
    }

    public SqlValidateResponse validateSql(String sql) {
        SqlValidateResponse response = new SqlValidateResponse();

        if (StringUtils.isBlank(sql)) {
            response.setOk(false);
            response.getWarnings().add("SQL is empty");
            return response;
        }

        String trimmed = sql.trim().replaceAll("--.*$", "")
                .replaceAll("/\\*.*?\\*/", "")
                .trim();

        String upperKeyword = trimmed.split("\\s+")[0].toUpperCase();

        switch (upperKeyword) {
            case "SELECT":
            case "WITH":
            case "SHOW":
            case "DESCRIBE":
            case "DESC":
            case "EXPLAIN":
                response.setOk(true);
                response.setSqlType("SELECT");
                response.setReadOnly(true);
                response.setRequiresConfirmation(false);
                break;
            case "INSERT":
            case "UPDATE":
            case "DELETE":
            case "MERGE":
                response.setOk(true);
                response.setSqlType("DML");
                response.setReadOnly(false);
                response.setRequiresConfirmation(true);
                break;
            case "CREATE":
            case "ALTER":
            case "DROP":
            case "TRUNCATE":
            case "RENAME":
                response.setOk(true);
                response.setSqlType("DDL");
                response.setReadOnly(false);
                response.setRequiresConfirmation(true);
                break;
            default:
                response.setOk(true);
                response.setSqlType("UNKNOWN");
                response.setReadOnly(false);
                response.setRequiresConfirmation(true);
                response.getWarnings().add("Unrecognized SQL type: " + upperKeyword);
        }
        return response;
    }

    private int tableRelevanceScore(SimpleTable table, String message) {
        if (StringUtils.isEmpty(message)) return 0;
        int score = 0;
        String tableName = StringUtils.defaultString(table.getName()).toLowerCase();
        String comment = StringUtils.defaultString(table.getComment()).toLowerCase();

        if (message.contains(tableName)) score += 100;

        String[] parts = tableName.split("_");
        for (String part : parts) {
            if (part.length() >= 2 && message.contains(part)) score += 20;
        }

        if (StringUtils.isNotEmpty(comment)) {
            for (String word : comment.split("[\\s,，、（）()]+")) {
                if (word.length() >= 2 && message.contains(word)) score += 15;
            }
        }
        return score;
    }
}
