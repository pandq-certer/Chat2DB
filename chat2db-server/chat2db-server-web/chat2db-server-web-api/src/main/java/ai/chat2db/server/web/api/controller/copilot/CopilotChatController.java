package ai.chat2db.server.web.api.controller.copilot;

import ai.chat2db.server.web.api.controller.copilot.request.CopilotChatRequest;
import ai.chat2db.server.web.api.controller.copilot.request.CopilotConfirmRequest;
import ai.chat2db.server.tools.common.util.ContextUtils;
import com.alibaba.fastjson2.JSON;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

@RestController
@RequestMapping("/api/ai/copilot")
@Slf4j
public class CopilotChatController {

    @Value("${chat2db.copilot.base-url:http://localhost:8001}")
    private String copilotBaseUrl;

    private static final Long CHAT_TIMEOUT = Duration.ofMinutes(50).toMillis();

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .version(HttpClient.Version.HTTP_1_1)
            .build();

    @PostMapping("/chat")
    public SseEmitter chat(@RequestBody CopilotChatRequest request,
                           @RequestHeader Map<String, String> headers) {
        SseEmitter sseEmitter = new SseEmitter(CHAT_TIMEOUT);

        sseEmitter.onCompletion(() -> log.info("Copilot SSE completed"));
        sseEmitter.onTimeout(() -> {
            log.info("Copilot SSE timeout");
            sseEmitter.complete();
        });
        sseEmitter.onError(ex -> log.error("Copilot SSE error", ex));

        String baseUrl = copilotBaseUrl;
        Long userId = ContextUtils.getUserId();
        log.info("Copilot chat request starting, baseUrl={}, message={}, userId={}", baseUrl, request.getMessage(), userId);

        // Send initial connect event synchronously to ensure SSE connection is established
        // before the async task tries to send error events
        try {
            sseEmitter.send(SseEmitter.event().name("connected").data("{\"status\":\"connected\"}"));
        } catch (Exception e) {
            log.error("Failed to send initial SSE event", e);
        }

        // Build request body with userId
        Map<String, Object> body = JSON.parseObject(JSON.toJSONString(request));
        if (userId != null) {
            body.put("userId", userId.toString());
        }

        // Convert camelCase to snake_case for LLM config fields
        if (body.containsKey("llmUrl")) {
            body.put("llm_url", body.remove("llmUrl"));
        }
        if (body.containsKey("llmApiKey")) {
            body.put("llm_api_key", body.remove("llmApiKey"));
        }
        if (body.containsKey("llmModel")) {
            body.put("llm_model", body.remove("llmModel"));
        }

        log.info("Copilot request body: {}", JSON.toJSONString(body));
        log.info("Copilot LLM config from request: llmUrl={}, llmApiKey={}", request.getLlmUrl(),
                request.getLlmApiKey() != null ? "***masked***" : "null");

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/ai/copilot/run"))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(JSON.toJSONString(body)))
                .timeout(Duration.ofMinutes(50))
                .build();

        CompletableFuture.runAsync(() -> {
            try {
                HttpResponse<java.io.InputStream> response = httpClient.send(
                        httpRequest, HttpResponse.BodyHandlers.ofInputStream());
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.startsWith("data: ")) {
                            String eventData = line.substring(6).trim();
                            if (eventData.isEmpty()) continue;
                            sseEmitter.send(SseEmitter.event().data(eventData));
                        }
                    }
                }
                sseEmitter.complete();
            } catch (Exception e) {
                log.error("Copilot SSE forwarding error", e);
                try {
                    String errorMsg = e.getMessage() != null ? e.getMessage() : "Unknown error";
                    sseEmitter.send(SseEmitter.event().data(
                            "{\"type\":\"error\",\"data\":{\"message\":\"" + errorMsg.replace("\"", "'") + "\"}}"));
                    sseEmitter.send(SseEmitter.event().data("{\"type\":\"done\",\"data\":{}}"));
                } catch (Exception ignored) {}
                sseEmitter.complete();
            }
        });

        return sseEmitter;
    }

    @PostMapping("/confirm")
    public SseEmitter confirm(@RequestBody CopilotConfirmRequest request) {
        SseEmitter sseEmitter = new SseEmitter(CHAT_TIMEOUT);

        sseEmitter.onCompletion(() -> log.info("Copilot confirm SSE completed"));
        sseEmitter.onTimeout(() -> sseEmitter.complete());

        String baseUrl = copilotBaseUrl;

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/ai/copilot/confirm"))
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .header(HttpHeaders.ACCEPT, MediaType.TEXT_EVENT_STREAM_VALUE)
                .POST(HttpRequest.BodyPublishers.ofString(JSON.toJSONString(request)))
                .timeout(Duration.ofMinutes(50))
                .build();

        CompletableFuture.runAsync(() -> {
            try {
                HttpResponse<java.io.InputStream> response = httpClient.send(
                        httpRequest, HttpResponse.BodyHandlers.ofInputStream());
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(response.body(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        if (line.startsWith("data: ")) {
                            String eventData = line.substring(6).trim();
                            if (eventData.isEmpty()) continue;
                            sseEmitter.send(SseEmitter.event().data(eventData));
                        }
                    }
                }
                sseEmitter.complete();
            } catch (Exception e) {
                log.error("Copilot confirm SSE forwarding error", e);
                try {
                    String errorMsg = e.getMessage() != null ? e.getMessage() : "Unknown error";
                    sseEmitter.send(SseEmitter.event().data(
                            "{\"type\":\"error\",\"data\":{\"message\":\"" + errorMsg.replace("\"", "'") + "\"}}"));
                    sseEmitter.send(SseEmitter.event().data("{\"type\":\"done\",\"data\":{}}"));
                } catch (Exception ignored) {}
                sseEmitter.complete();
            }
        });

        return sseEmitter;
    }
}
