#!/usr/bin/env python3
"""
Chat2DB LLM Configuration Test Script

Tests:
1. Python copilot service health
2. LLM API connectivity (streaming chat)
3. Java backend copilot proxy

Usage:
  python test_llm_config.py
  python test_llm_config.py --url https://api.openai.com/v1 --key sk-xxx --model gpt-4o-mini
"""

import asyncio
import json
import sys
import argparse
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def test_copilot_health(base_url: str = "http://127.0.0.1:8001"):
    """Test if the Python copilot service is running."""
    import urllib.request
    import urllib.error

    url = f"{base_url}/health"
    logger.info(f"Testing copilot service health: {url}")
    try:
        req = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
            logger.info(f"  Copilot service is running: {data}")
            return True
    except urllib.error.URLError as e:
        logger.error(f"  Copilot service is NOT running at {base_url}")
        logger.error(f"  Error: {e.reason}")
        logger.error(f"  Fix: cd ai-copilot-service && pip install -e . && uvicorn app.main:app --port 8001")
        return False
    except Exception as e:
        logger.error(f"  Copilot health check failed: {e}")
        return False


async def test_llm_stream(api_url: str, api_key: str, model: str):
    """Test LLM API connectivity with a streaming chat request."""
    try:
        from openai import AsyncOpenAI
    except ImportError:
        logger.error("  openai package not installed. Run: pip install openai")
        return False

    logger.info(f"Testing LLM streaming: url={api_url}, model={model}")
    logger.info(f"  API key: {api_key[:8]}...{api_key[-4:]}" if len(api_key) > 12 else f"  API key: {api_key}")

    # Normalize URL
    if "/chat/completions" in api_url:
        from urllib.parse import urlparse
        parsed = urlparse(api_url)
        api_url = f"{parsed.scheme}://{parsed.netloc}"
        if parsed.path and parsed.path not in ("/", ""):
            api_url = f"{api_url}{parsed.path}".replace("/chat/completions", "")
        logger.info(f"  Normalized URL: {api_url}")

    client = AsyncOpenAI(base_url=api_url, api_key=api_key)

    try:
        logger.info("  Sending test message...")
        stream = await client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Say hello in one word."}],
            max_tokens=10,
            stream=True,
        )
        chunks = []
        async for chunk in stream:
            delta = chunk.choices[0].delta
            if delta.content:
                chunks.append(delta.content)

        full_response = "".join(chunks)
        logger.info(f"  LLM response: {full_response}")
        logger.info("  LLM streaming test PASSED")
        return True
    except Exception as e:
        logger.error(f"  LLM streaming test FAILED: {type(e).__name__}: {e}")
        if "Connection" in str(e):
            logger.error(f"  Fix: Check if the LLM service is running at {api_url}")
        elif "auth" in str(e).lower() or "401" in str(e) or "api_key" in str(e).lower():
            logger.error(f"  Fix: Check your API key")
        elif "model" in str(e).lower() or "404" in str(e):
            logger.error(f"  Fix: Check your model name. Available models may differ from '{model}'")
        return False


def test_java_copilot_proxy(java_url: str = "http://localhost:10821"):
    """Test the Java backend copilot proxy endpoint."""
    import urllib.request
    import urllib.error

    url = f"{java_url}/api/ai/copilot/chat"
    logger.info(f"Testing Java copilot proxy: {url}")

    body = json.dumps({
        "message": "hello",
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            url,
            data=body,
            headers={"Content-Type": "application/json", "Accept": "text/event-stream"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            logger.info(f"  Response status: {resp.status}")
            full_data = resp.read().decode("utf-8")
            events = []
            for line in full_data.split("\n"):
                if line.startswith("data: "):
                    try:
                        event = json.loads(line[6:])
                        events.append(event.get("type", "unknown"))
                    except json.JSONDecodeError:
                        pass
            logger.info(f"  SSE event types received: {events}")
            if events:
                logger.info("  Java copilot proxy test PASSED")
                return True
            else:
                logger.warning("  No SSE events received")
                return False
    except urllib.error.URLError as e:
        logger.error(f"  Java copilot proxy test FAILED: {e.reason}")
        logger.error(f"  Fix: Make sure the Java backend is running at {java_url}")
        return False
    except Exception as e:
        logger.error(f"  Java copilot proxy test failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Chat2DB LLM Configuration Test")
    parser.add_argument("--url", default=None, help="LLM API URL (e.g., https://api.openai.com/v1)")
    parser.add_argument("--key", default=None, help="LLM API key")
    parser.add_argument("--model", default=None, help="LLM model name")
    parser.add_argument("--copilot-url", default="http://127.0.0.1:8001", help="Python copilot service URL")
    parser.add_argument("--java-url", default="http://localhost:10821", help="Java backend URL")
    parser.add_argument("--skip-copilot", action="store_true", help="Skip copilot service test")
    parser.add_argument("--skip-llm", action="store_true", help="Skip direct LLM test")
    parser.add_argument("--skip-java", action="store_true", help="Skip Java proxy test")
    args = parser.parse_args()

    print("=" * 60)
    print("Chat2DB LLM Configuration Diagnostic")
    print("=" * 60)

    results = {}

    # Test 1: Copilot service health
    if not args.skip_copilot:
        print("\n--- Test 1: Python Copilot Service ---")
        results["copilot"] = test_copilot_health(args.copilot_url)

    # Test 2: Direct LLM connectivity
    if not args.skip_llm:
        print("\n--- Test 2: Direct LLM API ---")
        # Read config from environment or arguments
        try:
            sys.path.insert(0, "ai-copilot-service")
            from app.core.config import settings
            default_url = settings.copilot_llm_url
            default_key = settings.copilot_llm_api_key
            default_model = settings.copilot_llm_model
        except Exception:
            default_url = "http://localhost:11434/v1"
            default_key = "sk-xxx"
            default_model = "gpt-4o-mini"

        llm_url = args.url or default_url
        llm_key = args.key or default_key
        llm_model = args.model or default_model

        logger.info(f"Using LLM config: url={llm_url}, model={llm_model}")
        results["llm"] = asyncio.run(test_llm_stream(llm_url, llm_key, llm_model))

    # Test 3: Java backend proxy
    if not args.skip_java:
        print("\n--- Test 3: Java Backend Copilot Proxy ---")
        results["java_proxy"] = test_java_copilot_proxy(args.java_url)

    # Summary
    print("\n" + "=" * 60)
    print("Summary:")
    for name, passed in results.items():
        status = "PASS" if passed else "FAIL"
        print(f"  {name}: {status}")
    print("=" * 60)

    all_passed = all(results.values())
    if not all_passed:
        print("\nTroubleshooting tips:")
        if not results.get("copilot"):
            print("  1. Start the Python copilot service:")
            print("     cd ai-copilot-service && uvicorn app.main:app --port 8001")
        if not results.get("llm"):
            print("  2. Configure a valid LLM API:")
            print("     Set environment variables or edit ai-copilot-service/app/core/config.py")
            print("     Or configure in the Chat2DB UI: Settings > AI")
            print("     Example: export COPILOT_LLM_URL=https://api.openai.com/v1")
            print("              export COPILOT_LLM_API_KEY=sk-your-key")
            print("              export COPILOT_LLM_MODEL=gpt-4o-mini")
        if not results.get("java_proxy"):
            print("  3. Start the Java backend and ensure it's running")
    sys.exit(0 if all_passed else 1)


if __name__ == "__main__":
    main()
