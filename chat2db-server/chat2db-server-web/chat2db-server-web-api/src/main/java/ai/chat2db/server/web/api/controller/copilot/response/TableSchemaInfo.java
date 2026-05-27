package ai.chat2db.server.web.api.controller.copilot.response;

import lombok.Data;

import java.util.List;

@Data
public class TableSchemaInfo {

    private String name;

    private String comment;

    private List<ColumnInfo> columns;

    private String ddl;
}
