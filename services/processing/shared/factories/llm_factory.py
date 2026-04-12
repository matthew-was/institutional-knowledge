"""Factory for creating the LLMService adapter (ADR-038, ADR-042)."""

import structlog

from shared.adapters.ollama_llm import OllamaLLMAdapter
from shared.config import LLMConfig
from shared.interfaces.llm_service import LLMService


def create_llm_service(config: LLMConfig, log: structlog.BoundLogger) -> LLMService:
    if config.PROVIDER == "ollama":
        return OllamaLLMAdapter(config=config, log=log)

    raise ValueError(f"{config.PROVIDER} is not a supported LLM Service Provider")
