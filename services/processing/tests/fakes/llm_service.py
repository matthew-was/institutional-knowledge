from shared.interfaces.llm_service import (
    LLMCombinedResult,
    LLMService,
    QueryUnderstandingResult,
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

        async def close(self) -> None:
            return None

    return MockedQueryLLMService()
