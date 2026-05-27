package ai.chat2db.server.web.api.controller.copilot.response;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SqlExecuteResponse {

    private boolean success;

    private List<String> columns = new ArrayList<>();

    private List<List<String>> rows = new ArrayList<>();

    private int rowCount;

    private String message;

    private String errorCode;
}
