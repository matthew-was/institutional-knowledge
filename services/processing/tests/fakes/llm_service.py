from shared.interfaces.llm_service import LLMCombinedResult, LLMService


def create_mock_llm_service(mocked_result: LLMCombinedResult | None) -> LLMService:
    class MockedLLMService(LLMService):
        def combined_pass(
            self, text: str, document_type: str | None
        ) -> LLMCombinedResult | None:
            return mocked_result

        def close(self) -> None:
            return None

    return MockedLLMService()
