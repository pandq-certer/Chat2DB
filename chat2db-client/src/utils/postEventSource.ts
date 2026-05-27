/**
 * POST-based SSE client using fetch + ReadableStream.
 * EventSourcePolyfill only supports GET, so we need this for the Copilot POST endpoints.
 */

interface PostSseOptions {
  url: string;
  body: unknown;
  headers?: Record<string, string>;
  onEvent: (event: { type: string; data: any }) => void;
  onError?: (error: Error) => void;
  timeoutMs?: number;
}

export function connectPostSse(options: PostSseOptions): () => void {
  const { url, body, headers = {}, onEvent, onError, timeoutMs = 300000 } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const Chat2db = localStorage.getItem('Chat2db');
  const fetchHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    ...headers,
  };
  if (Chat2db) {
    fetchHeaders['Chat2db'] = Chat2db;
  }

  fetch(`${window._BaseURL}${url}`, {
    method: 'POST',
    headers: fetchHeaders,
    body: JSON.stringify(body),
    signal: controller.signal,
    credentials: 'include',
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
            if (!dataStr) continue;
            try {
              const parsed = JSON.parse(dataStr);
              onEvent(parsed);
            } catch {
              // Not JSON, skip
            }
          }
        }
      }

      // Process remaining buffer
      if (buffer.trim().startsWith('data:')) {
        const trimmed = buffer.trim();
        const dataStr = trimmed.startsWith('data: ') ? trimmed.slice(6) : trimmed.slice(5);
        if (dataStr) {
          try {
            const parsed = JSON.parse(dataStr);
            onEvent(parsed);
          } catch {
            // Not JSON, skip
          }
        }
      }
    })
    .catch((err) => {
      if (err.name !== 'AbortError') {
        onError?.(err);
      }
    })
    .finally(() => {
      clearTimeout(timeoutId);
    });

  return () => {
    clearTimeout(timeoutId);
    controller.abort();
  };
}
