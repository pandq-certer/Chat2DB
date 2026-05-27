package ai.chat2db.server.web.api.controller.copilot.response;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SqlValidateResponse {

    private boolean ok;

    private String sqlType;

    private boolean readOnly;

    private boolean requiresConfirmation;

    private List<String> warnings = new ArrayList<>();
}
