package ai.chat2db.server.web.api.controller.copilot.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class InternalTableDetailRequest {

    @NotNull(message = "dataSourceId is required")
    private Long dataSourceId;

    private String databaseName;

    private String schemaName;

    @NotBlank(message = "tableName is required")
    private String tableName;
}
