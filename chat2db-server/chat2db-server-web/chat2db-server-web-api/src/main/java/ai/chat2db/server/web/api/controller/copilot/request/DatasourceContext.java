package ai.chat2db.server.web.api.controller.copilot.request;

import lombok.Data;

@Data
public class DatasourceContext {

    private Long dataSourceId;

    private String databaseName;

    private String schemaName;
}
