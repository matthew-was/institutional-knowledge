"""
EmbeddingService abstract base class — shared interface for pipeline and query

ADR-024, ADR-042.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class EmbeddingResult:
    embedding: list[float]
    dimension: int
    model: str


class EmbeddingService(ABC):
    @abstractmethod
    async def close(self) -> None: ...

    @abstractmethod
    async def embed(self, text: str) -> EmbeddingResult: ...
