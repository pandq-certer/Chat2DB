package ai.chat2db.server.web.api.controller.copilot.internal;

import ai.chat2db.server.domain.api.model.DataSource;
import ai.chat2db.server.domain.api.param.DlExecuteParam;
import ai.chat2db.server.domain.api.service.DataSourceService;
import ai.chat2db.server.domain.api.service.DlTemplateService;
import ai.chat2db.server.tools.base.wrapper.result.DataResult;
import ai.chat2db.server.tools.base.wrapper.result.ListResult;
import ai.chat2db.server.web.api.aspect.ConnectionInfoHandler;
import ai.chat2db.server.web.api.controller.copilot.request.*;
import ai.chat2db.server.web.api.controller.copilot.response.*;
import ai.chat2db.spi.model.ExecuteResult;
import ai.chat2db.spi.model.Header;
import ai.chat2db.spi.sql.Chat2DBContext;
import ai.chat2db.spi.sql.ConnectInfo;
import jakarta.annotation.Resource;
import jakarta.validation.Valid;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/internal/ai")
@Slf4j
public class InternalAiController {

    @Resource
    private InternalAiService internalAiService;

    @Resource
    private DataSourceService dataSourceService;

    @Resource
    private DlTemplateService dlTemplateService;

    @Resource
    private ConnectionInfoHandler connectionInfoHandler;

    @PostMapping("/schema/search")
    public SchemaSearchResponse schemaSearch(@Valid @RequestBody InternalSchemaSearchRequest request) {
        return internalAiService.searchSchema(
                request.getDataSourceId(),
                request.getDatabaseName(),
                request.getSchemaName(),
                request.getKeywords());
    }

    @PostMapping("/schema/table-detail")
    public TableSchemaInfo tableDetail(@Valid @RequestBody InternalTableDetailRequest request) {
        return internalAiService.getTableDetail(
                request.getDataSourceId(),
                request.getDatabaseName(),
                request.getSchemaName(),
                request.getTableName());
    }

    @PostMapping("/sql/validate")
    public SqlValidateResponse sqlValidate(@Valid @RequestBody InternalSqlValidateRequest request) {
        return internalAiService.validateSql(request.getSql());
    }

    @PostMapping("/sql/execute")
    public SqlExecuteResponse sqlExecute(@Valid @RequestBody InternalSqlExecuteRequest request) {
        SqlExecuteResponse response = new SqlExecuteResponse();
        try {
            setupConnectionContext(request.getDataSourceId(),
                    request.getDatabaseName(), request.getSchemaName());

            DlExecuteParam param = new DlExecuteParam();
            param.setSql(request.getSql());
            param.setDataSourceId(request.getDataSourceId());
            param.setDatabaseName(request.getDatabaseName());
            param.setSchemaName(request.getSchemaName());
            param.setConsoleId(request.getConsoleId() != null ? request.getConsoleId() : 0L);
            param.setPageNo(1);
            param.setPageSize(50);

            ListResult<ExecuteResult> result = dlTemplateService.execute(param);
            if (result.getData() != null && !result.getData().isEmpty()) {
                ExecuteResult execResult = result.getData().get(0);
                response.setSuccess(Boolean.TRUE.equals(execResult.getSuccess()));
                response.setMessage(execResult.getMessage());

                if (Boolean.TRUE.equals(execResult.getSuccess())) {
                    List<Header> headers = execResult.getHeaderList();
                    List<List<String>> dataList = execResult.getDataList();
                    if (headers != null) {
                        response.setColumns(headers.stream()
                                .map(Header::getName).toList());
                    }
                    if (dataList != null) {
                        response.setRows(new ArrayList<>(dataList));
                        response.setRowCount(dataList.size());
                    }
                    if (execResult.getFuzzyTotal() != null) {
                        try {
                            response.setRowCount(Integer.parseInt(execResult.getFuzzyTotal()));
                        } catch (NumberFormatException ignored) {}
                    }
                } else {
                    response.setErrorCode("EXECUTION_ERROR");
                }
            }
        } catch (Exception e) {
            log.error("sqlExecute error", e);
            response.setSuccess(false);
            response.setMessage(e.getMessage());
            response.setErrorCode("INTERNAL_ERROR");
        } finally {
            Chat2DBContext.removeContext();
        }
        return response;
    }

    private void setupConnectionContext(Long dataSourceId, String databaseName, String schemaName) {
        DataResult<DataSource> result = dataSourceService.queryById(dataSourceId);
        DataSource ds = result.getData();
        if (ds == null) {
            throw new IllegalArgumentException("DataSource not found: " + dataSourceId);
        }
        ConnectInfo info = connectionInfoHandler.toInfo(dataSourceId, databaseName, null, schemaName);
        Chat2DBContext.putContext(info);
    }
}
