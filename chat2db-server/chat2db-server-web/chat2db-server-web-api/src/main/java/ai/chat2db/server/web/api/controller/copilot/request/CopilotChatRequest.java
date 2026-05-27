package ai.chat2db.server.web.api.controller.copilot.request;

import com.alibaba.fastjson2.annotation.JSONField;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CopilotChatRequest {

    private String sessionId;

    @NotBlank(message = "message cannot be blank")
    private String message;

    private DatasourceContext datasourceContext;

    @JSONField(name = "llm_url")
    @JsonProperty("llm_url")
    private String llmUrl;

    @JSONField(name = "llm_api_key")
    @JsonProperty("llm_api_key")
    private String llmApiKey;

    @JSONField(name = "llm_model")
    @JsonProperty("llm_model")
    private String llmModel;
}
