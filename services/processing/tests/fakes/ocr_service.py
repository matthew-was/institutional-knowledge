from pipeline.interfaces.ocr_service import (
    FileOpenError,
    OCRResult,
    OCRService,
)


def create_mock_ocr_service(mocked_result: OCRResult) -> OCRService:
    class MockOCRService(OCRService):
        def extract_text(self, file_path: str) -> OCRResult:
            return mocked_result

        def supports_file_type(self, file_extension: str) -> bool:
            return True

    return MockOCRService()


def create_error_ocr_service(error: FileOpenError) -> OCRService:
    class MockOCRService(OCRService):
        def extract_text(self, file_path: str) -> OCRResult:
            raise error

        def supports_file_type(self, file_extension: str) -> bool:
            return True

    return MockOCRService()
