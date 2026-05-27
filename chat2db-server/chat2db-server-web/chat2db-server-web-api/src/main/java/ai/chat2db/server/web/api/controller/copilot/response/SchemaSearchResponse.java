package ai.chat2db.server.web.api.controller.copilot.response;

import lombok.Data;

import java.util.List;

@Data
public class SchemaSearchResponse {

    private List<TableSchemaInfo> tables;
}
