package ai.chat2db.server.web.api.controller.ai.zhipu.listener;

import ai.chat2db.server.web.api.controller.ai.config.LocalCache;
import ai.chat2db.server.web.api.controller.ai.fastchat.model.FastChatMessage;
import ai.chat2db.server.web.api.controller.ai.fastchat.model.FastChatRole;
import ai.chat2db.server.web.api.controller.ai.zhipu.model.ZhipuChatCompletions;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.unfbx.chatgpt.entity.chat.Message;
import lombok.SneakyThrows;
import lombok.extern.slf4j.Slf4j;
import okhttp3.Response;
import okhttp3.ResponseBody;
import okhttp3.sse.EventSource;
import okhttp3.sse.EventSourceListener;
import org.apache.commons.lang3.StringUtils;
import org.jetbrains.annotations.NotNull;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Objects;

/**
 * description：OpenAIEventSourceListener
 *
 * @author https:www.unfbx.com
 * @date 2023-02-22
 */
@Slf4j
public class ZhipuChatAIEventSourceListener extends EventSourceListener {

    private SseEmitter sseEmitter;
    private String uid;
    private StringBuilder assistantResponse = new StringBuilder();

    private ObjectMapper mapper = new ObjectMapper().disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);

    public ZhipuChatAIEventSourceListener(SseEmitter sseEmitter, String uid) {
        this.sseEmitter = sseEmitter;
        this.uid = uid;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public void onOpen(EventSource eventSource, Response response) {
        log.info("Zhipu Chat Sse connecting...");
    }

    /**
     * {@inheritDoc}
     */
    @SneakyThrows
    @Override
    public void onEvent(EventSource eventSource, String id, String type, @NotNull String data) {
        log.info("Zhipu Chat AI response data：{}", data);
        if (data.equals("[DONE]")) {
            log.info("Zhipu Chat AI closed");
            saveAssistantResponse();
            sseEmitter.send(SseEmitter.event()
                .id("[DONE]")
                .data("[DONE]")
                .reconnectTime(3000));
            sseEmitter.complete();
            return;
        }

        ZhipuChatCompletions chatCompletions = mapper.readValue(data, ZhipuChatCompletions.class);
        String text = chatCompletions.getChoices().get(0).getDelta()==null?
                chatCompletions.getChoices().get(0).getText()
                :chatCompletions.getChoices().get(0).getDelta().getContent();

        Message message = new Message();
        message.setContent(text);
        if (StringUtils.isNotBlank(text)) {
            assistantResponse.append(text);
        }
        sseEmitter.send(SseEmitter.event()
            .id(null)
            .data(message)
            .reconnectTime(3000));
    }

    @SuppressWarnings("unchecked")
    private void saveAssistantResponse() {
        String responseText = assistantResponse.toString().trim();
        if (StringUtils.isBlank(responseText) || StringUtils.isBlank(uid)) {
            return;
        }
        try {
            List<FastChatMessage> messages = (List<FastChatMessage>) LocalCache.CACHE.get(uid);
            if (messages != null) {
                FastChatMessage assistantMsg = new FastChatMessage(FastChatRole.ASSISTANT).setContent(responseText);
                messages.add(assistantMsg);
                LocalCache.CACHE.put(uid, messages, LocalCache.TIMEOUT);
                log.info("ZhipuAI saved assistant response to cache, uid={}, history size={}", uid, messages.size());
            }
        } catch (Exception e) {
            log.error("Failed to save assistant response to cache", e);
        }
    }

    @Override
    public void onClosed(EventSource eventSource) {
        saveAssistantResponse();
        log.info("Zhipu Chat AI closes sse connection closed");
    }

    @Override
    public void onFailure(EventSource eventSource, Throwable t, Response response) {
        try {
            if (Objects.isNull(response)) {
                String message = t.getMessage();
                Message sseMessage = new Message();
                sseMessage.setContent(message);
                sseEmitter.send(SseEmitter.event()
                    .id("[ERROR]")
                    .data(sseMessage));
                sseEmitter.send(SseEmitter.event()
                    .id("[DONE]")
                    .data("[DONE]"));
                sseEmitter.complete();
                return;
            }
            ResponseBody body = response.body();
            String bodyString = Objects.nonNull(t) ? t.getMessage() : "";
            if (Objects.nonNull(body)) {
                bodyString = body.string();
                if (StringUtils.isBlank(bodyString) && Objects.nonNull(t)) {
                    bodyString = t.getMessage();
                }
                log.error("Zhipu Chat AI sse response：{}", bodyString);
            } else {
                log.error("Zhipu Chat AI sse response：{}，error：{}", response, t);
            }
            eventSource.cancel();
            Message message = new Message();
            message.setContent("Zhipu Chat AI error：" + bodyString);
            sseEmitter.send(SseEmitter.event()
                .id("[ERROR]")
                .data(message));
            sseEmitter.send(SseEmitter.event()
                .id("[DONE]")
                .data("[DONE]"));
            sseEmitter.complete();
        } catch (Exception exception) {
            log.error("Zhipu Chat AI send data error:", exception);
        }
    }
}
