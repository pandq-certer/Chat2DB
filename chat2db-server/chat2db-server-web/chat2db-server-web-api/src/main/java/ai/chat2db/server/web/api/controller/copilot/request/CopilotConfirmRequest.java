package ai.chat2db.server.web.api.controller.copilot.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class CopilotConfirmRequest {

    @NotBlank(message = "sessionId cannot be blank")
    private String sessionId;

    @NotBlank(message = "traceId cannot be blank")
    private String traceId;

    @NotNull(message = "confirmed is required")
    private Boolean confirmed;
}
