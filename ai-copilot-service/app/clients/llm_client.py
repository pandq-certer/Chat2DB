from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from app.core.config import settings


class LlmClient:
    """OpenAI-compatible LLM client with streaming support."""

    def __init__(self):
        self._default_client = AsyncOpenAI(
            base_url=settings.copilot_llm_url,
            api_key=settings.copilot_llm_api_key,
            timeout=30.0,
            max_retries=1,
        )
        self._default_model = settings.copilot_llm_model

    def _get_client(self, llm_url: str = None, llm_api_key: str = None):
        """Get client with optional custom configuration."""
        if llm_url and llm_api_key:
            import urllib.parse
            parsed = urllib.parse.urlparse(llm_url)

            # Check if URL contains a path like /chat/completions
            if parsed.path and parsed.path != '/' and '/chat/completions' in parsed.path:
                # For APIs like DeepSeek that use full path, use the base URL without path
                base_url = f"{parsed.scheme}://{parsed.netloc}"
            elif parsed.path and parsed.path != '/':
                # If URL already has /v1 or similar, use as-is
                base_url = llm_url
            else:
                base_url = llm_url

            return AsyncOpenAI(
                base_url=base_url,
                api_key=llm_api_key,
                timeout=30.0,
                max_retries=1,
            )
        return self._default_client

    def _get_model(self, llm_model: str = None):
        """Get model with optional custom model."""
        return llm_model or self._default_model

    async def chat(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
        llm_url: str = None,
        llm_api_key: str = None,
        llm_model: str = None,
    ) -> str:
        client = self._get_client(llm_url, llm_api_key)
        model = self._get_model(llm_model)
        response = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    async def chat_stream(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
        llm_url: str = None,
        llm_api_key: str = None,
        llm_model: str = None,
    ) -> AsyncGenerator[str, None]:
        client = self._get_client(llm_url, llm_api_key)
        model = self._get_model(llm_model)
        
        # Debug: print actual URL being used
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"chat_stream: model={model}, base_url={client.base_url}")
        
        stream = await client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                yield delta.content

    async def chat_json(
        self,
        messages: list[dict],
        temperature: float = 0.1,
        max_tokens: int = 4096,
    ) -> str:
        """Chat expecting a JSON response (no streaming)."""
        return await self.chat(messages, temperature, max_tokens)


# Singleton
llm_client = LlmClient()
