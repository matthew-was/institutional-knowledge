from shared.interfaces.llm_service import (
    LLMCombinedResult,
    LLMService,
    QueryUnderstandingResult,
    SynthesisLLMResult,
)

# Default fallback values used by FullFakeLLMService when no override is supplied
_DEFAULT_UNDERSTANDING = QueryUnderstandingResult(
    intent="find_content",
    refined_search_terms="test query",
    extracted_entities=[],
    routing_hint="vector",
    confidence=0.9,
)
_DEFAULT_SYNTHESIS = SynthesisLLMResult(
    response_text="East Meadow was transferred [Citation 1]."
)


def create_mock_llm_service(mocked_result: LLMCombinedResult | None) -> LLMService:
    class MockedLLMService(LLMService):
        async def combined_pass(
            self, text: str, document_type: str | None
        ) -> LLMCombinedResult | None:
            return mocked_result

        async def understand_query(self, query_text: str) -> QueryUnderstandingResult:
            return QueryUnderstandingResult(
                intent="unknown",
                refined_search_terms=query_text,
                extracted_entities=[],
                routing_hint=None,
                confidence=0.0,
            )

        async def synthesize(self, text: str) -> SynthesisLLMResult:
            return SynthesisLLMResult(response_text="")

        async def close(self) -> None:
            return None

    return MockedLLMService()


def create_mock_llm_service_for_query(
    query_result: QueryUnderstandingResult,
) -> LLMService:
    """Create a fake LLMService whose understand_query() returns a fixed result."""

    class MockedQueryLLMService(LLMService):
        async def combined_pass(
            self, text: str, document_type: str | None
        ) -> LLMCombinedResult | None:
            return None

        async def understand_query(self, query_text: str) -> QueryUnderstandingResult:
            return query_result

        async def synthesize(self, text: str) -> SynthesisLLMResult:
            return SynthesisLLMResult(response_text="")

        async def close(self) -> None:
            return None

    return MockedQueryLLMService()


def create_mock_llm_service_for_synthesis(
    synthesis_result: SynthesisLLMResult,
) -> LLMService:
    """Create a fake LLMService whose synthesize() returns a fixed result."""

    class MockedSynthesisLLMService(LLMService):
        async def combined_pass(
            self, text: str, document_type: str | None
        ) -> LLMCombinedResult | None:
            return None

        async def understand_query(self, query_text: str) -> QueryUnderstandingResult:
            return QueryUnderstandingResult(
                intent="unknown",
                refined_search_terms=query_text,
                extracted_entities=[],
                routing_hint=None,
                confidence=0.0,
            )

        async def synthesize(self, text: str) -> SynthesisLLMResult:
            return synthesis_result

        async def close(self) -> None:
            return None

    return MockedSynthesisLLMService()


class FullFakeLLMService(LLMService):
    """Full LLMService fake for query-layer tests.

    Implements all four LLMService methods. ``understand_query`` and
    ``synthesize`` accept optional overrides so test cases can control
    the returned values without constructing a new class.

    Intended for use in ``QueryHandler`` Tier 2 tests where both methods
    are exercised in the same pipeline run.
    """

    def __init__(
        self,
        understanding_result: QueryUnderstandingResult | None = None,
        synthesis_result: SynthesisLLMResult | None = None,
    ) -> None:
        self._understanding_result = understanding_result or _DEFAULT_UNDERSTANDING
        self._synthesis_result = synthesis_result or _DEFAULT_SYNTHESIS

    async def combined_pass(
        self, text: str, document_type: str | None
    ) -> LLMCombinedResult | None:
        return None  # not used in C3

    async def understand_query(self, query_text: str) -> QueryUnderstandingResult:
        return self._understanding_result

    async def synthesize(self, text: str) -> SynthesisLLMResult:
        return self._synthesis_result

    async def close(self) -> None:
        return None


def create_error_llm_service() -> LLMService:
    """Create a fake LLMService that raises AssertionError on any method call.

    Used in tests where the test verifies that a method is NOT called
    (e.g., synthesize_response should not call the LLM when context is empty).
    """

    class ErrorLLMService(LLMService):
        async def combined_pass(
            self, text: str, document_type: str | None
        ) -> LLMCombinedResult | None:
            raise AssertionError("combined_pass should not be called")

        async def understand_query(self, query_text: str) -> QueryUnderstandingResult:
            raise AssertionError("understand_query should not be called")

        async def synthesize(self, text: str) -> SynthesisLLMResult:
            raise AssertionError("synthesize should not be called")

        async def close(self) -> None:
            return None

    return ErrorLLMService()
