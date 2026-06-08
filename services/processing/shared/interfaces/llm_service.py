"""
LLMService abstract base class — shared interface for pipeline and query.

ADR-042, ADR-038.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ChunkResult:
    text: str
    chunk_index: int
    token_count: int


@dataclass
class EntityResult:
    name: str
    type: str
    confidence: float
    normalised_name: str


@dataclass
class RelationshipResult:
    source_entity_name: str
    target_entity_name: str
    relationship_type: str
    confidence: float


@dataclass
class LLMCombinedResult:
    chunks: list[ChunkResult] = field(default_factory=list)
    # metadata structure will be tightened in phase 2
    metadata_fields: dict[str, Any] = field(default_factory=dict)
    entities: list[EntityResult] = field(default_factory=list)
    relationships: list[RelationshipResult] = field(default_factory=list)


@dataclass
class QueryUnderstandingResult:
    intent: str
    refined_search_terms: str
    extracted_entities: list[dict[str, str]] = field(default_factory=list)
    routing_hint: str | None = None
    confidence: float = 0.0


@dataclass
class SynthesisLLMResult:
    """Raw response text returned by the LLM for the synthesis call (Task 17)."""

    response_text: str


class LLMService(ABC):
    @abstractmethod
    async def combined_pass(
        self, text: str, document_type: str | None
    ) -> LLMCombinedResult | None: ...

    @abstractmethod
    async def understand_query(self, query_text: str) -> QueryUnderstandingResult: ...

    @abstractmethod
    async def synthesize(self, text: str) -> SynthesisLLMResult: ...

    @abstractmethod
    async def close(self) -> None: ...
