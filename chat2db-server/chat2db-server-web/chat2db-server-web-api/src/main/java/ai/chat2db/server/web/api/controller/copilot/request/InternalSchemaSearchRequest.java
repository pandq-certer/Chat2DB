package ai.chat2db.server.web.api.controller.copilot.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

@Data
public class InternalSchemaSearchRequest {

    @NotNull(message = "dataSourceId is required")
    private Long dataSourceId;

    private String databaseName;

    private String schemaName;

    private List<String> keywords;
}
