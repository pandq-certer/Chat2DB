package ai.chat2db.server.web.api.controller.copilot.response;

import lombok.Data;

@Data
public class ColumnInfo {

    private String name;

    private String type;

    private String comment;

    private Boolean primaryKey = false;
}
