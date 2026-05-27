"""Factory for creating the LLMService adapter (ADR-038, ADR-042)."""

import structlog

from shared.adapters.ollama_llm import OllamaLLMAdapter
from shared.config import LLMConfig
from shared.interfaces.llm_service import LLMService


def create_llm_service(config: LLMConfig, log: structlog.BoundLogger) -> LLMService:
    # NOTE: When wiring the query service (later task), QueryConfig.LLM is typed as
    # LLMBaseConfig (no chunking fields), but create_llm_service expects LLMConfig
    # (with chunking constraints). To maintain explicit separation between pipeline
    # and query LLM services, create a separate
    # create_llm_service_for_query(config: LLMBaseConfig) factory at that time.
    if config.PROVIDER == "ollama":
        return OllamaLLMAdapter(config=config, log=log)

    raise ValueError(f"{config.PROVIDER} is not a supported LLM Service Provider")
