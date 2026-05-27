"""QueryRouter abstract base class (ADR-040, ADR-042)."""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Literal


@dataclass
class RouteDecision:
    """Decision produced by the query router."""

    strategy: Literal["vector", "graph", "both"]
    extracted_entities: list[str] = field(default_factory=list)
    reasoning: str | None = None


class QueryRouter(ABC):
    """Abstract base class for query routing (ADR-040)."""

    @abstractmethod
    def route(self, query_text: str) -> RouteDecision:
        """Analyse the query and return a routing decision."""
        ...
