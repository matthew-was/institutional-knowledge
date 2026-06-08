"""Fake EmbeddingService implementations for Tier 2 tests."""

from shared.interfaces.embedding_service import EmbeddingResult, EmbeddingService


class MockEmbeddingService(EmbeddingService):
    """Fake EmbeddingService that always returns a configured result."""

    def __init__(self, mocked_result: EmbeddingResult) -> None:
        self.mocked_result = mocked_result

    async def embed(self, text: str) -> EmbeddingResult:
        return self.mocked_result

    async def close(self) -> None:
        return None


class ErrorEmbeddingService(EmbeddingService):
    """Fake EmbeddingService that always raises a configured exception."""

    def __init__(self, error: Exception) -> None:
        self.error = error

    async def embed(self, text: str) -> EmbeddingResult:
        raise self.error

    async def close(self) -> None:
        return None


def create_mock_embedding_service(
    mocked_result: EmbeddingResult,
) -> EmbeddingService:
    """Return a fake EmbeddingService that always returns the given result."""
    return MockEmbeddingService(mocked_result)


def create_error_embedding_service(error: Exception) -> EmbeddingService:
    """Return a fake EmbeddingService that always raises the given exception."""
    return ErrorEmbeddingService(error)
