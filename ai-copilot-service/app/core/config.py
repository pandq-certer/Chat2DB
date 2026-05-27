from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    copilot_llm_url: str = "http://localhost:11434/v1"
    copilot_llm_api_key: str = "sk-xxx"
    copilot_llm_model: str = "gpt-4o-mini"
    copilot_java_url: str = "http://localhost:10821"
    session_ttl_seconds: int = 1800  # 30 minutes

    model_config = {"env_prefix": "", "case_sensitive": False}


settings = Settings()
