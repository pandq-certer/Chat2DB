package ai.chat2db.server.web.api.controller.copilot.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class InternalSqlValidateRequest {

    @NotBlank(message = "sql is required")
    private String sql;

    @NotNull(message = "dataSourceId is required")
    private Long dataSourceId;

    private String databaseName;

    private String schemaName;
}
