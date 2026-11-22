import pydantic
import pytest

import shared.config


def test_singleton_config_spot_check() -> None:
    assert shared.config.config.AUTH.INBOUND_KEY == "dev-python-service-key"
    assert shared.config.config.PROCESSING.OCR.QUALITY_SCORING.CONFIDENCE_WEIGHT == 0.7


def test_config_missing_attribute() -> None:
    with pytest.raises(pydantic.ValidationError):
        shared.config._load_config(["tests/shared/settings.test.json"])


def test_config_env_var_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(shared.config.config, "_singleton", None)
    monkeypatch.setenv("IK_AUTH__INBOUND_KEY", "overridden-key")
    assert shared.config.config.AUTH.INBOUND_KEY == "overridden-key"


def test_ocr_device_defaults_to_auto_in_committed_settings() -> None:
    assert shared.config.config.PROCESSING.OCR.DEVICE == "auto"


def test_ocr_device_env_var_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(shared.config.config, "_singleton", None)
    monkeypatch.setenv("IK_PROCESSING__OCR__DEVICE", "cuda:1")
    assert shared.config.config.PROCESSING.OCR.DEVICE == "cuda:1"
    # Overriding one key must not wipe its siblings.
    assert shared.config.config.PROCESSING.OCR.PROVIDER == "docling"


def _ocr_config(**overrides: object) -> shared.config.OCRConfig:
    return shared.config.OCRConfig.model_validate(
        {
            "PROVIDER": "docling",
            "QUALITY_THRESHOLD": 60.0,
            "QUALITY_SCORING": {
                "CONFIDENCE_WEIGHT": 0.7,
                "DENSITY_WEIGHT": 0.3,
                "TARGET_CHARS_PER_PAGE": 1800,
            },
            **overrides,
        }
    )


def test_committed_settings_route_pdf_pages_automatically() -> None:
    assert shared.config.config.PROCESSING.OCR.PDF_MODE == "auto"


def test_committed_settings_use_tesseract_for_scans() -> None:
    assert shared.config.config.PROCESSING.OCR.ENGINE == "tesseract"


def test_pdf_mode_and_engine_default_when_omitted() -> None:
    config = _ocr_config()

    assert config.PDF_MODE == "auto"
    assert config.ENGINE == "tesseract"


def test_pdf_mode_env_var_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(shared.config.config, "_singleton", None)
    monkeypatch.setenv("IK_PROCESSING__OCR__PDF_MODE", "ocr")
    assert shared.config.config.PROCESSING.OCR.PDF_MODE == "ocr"


def test_engine_env_var_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(shared.config.config, "_singleton", None)
    monkeypatch.setenv("IK_PROCESSING__OCR__ENGINE", "auto")
    assert shared.config.config.PROCESSING.OCR.ENGINE == "auto"


@pytest.mark.parametrize("pdf_mode", ["auto", "ocr", "text"])
def test_pdf_mode_accepts_valid_values(pdf_mode: str) -> None:
    assert _ocr_config(PDF_MODE=pdf_mode).PDF_MODE == pdf_mode


@pytest.mark.parametrize("pdf_mode", ["", "both", "AUTO", "native", "true"])
def test_pdf_mode_rejects_invalid_values(pdf_mode: str) -> None:
    with pytest.raises(pydantic.ValidationError, match="PDF_MODE"):
        _ocr_config(PDF_MODE=pdf_mode)


@pytest.mark.parametrize("engine", ["tesseract", "auto"])
def test_engine_accepts_valid_values(engine: str) -> None:
    assert _ocr_config(ENGINE=engine).ENGINE == engine


@pytest.mark.parametrize("engine", ["", "easyocr", "rapidocr", "Tesseract"])
def test_engine_rejects_invalid_values(engine: str) -> None:
    with pytest.raises(pydantic.ValidationError, match="ENGINE"):
        _ocr_config(ENGINE=engine)


def test_ocr_device_defaults_to_auto_when_omitted() -> None:
    assert _ocr_config().DEVICE == "auto"


@pytest.mark.parametrize(
    "device", ["auto", "cpu", "cuda", "cuda:0", "cuda:1", "cuda:12", "mps", "xpu"]
)
def test_ocr_device_accepts_valid_values(device: str) -> None:
    assert _ocr_config(DEVICE=device).DEVICE == device


@pytest.mark.parametrize(
    "device", ["", "gpu", "cuda:", "cuda:one", "cuda:-1", "CUDA:1", " cpu", "cuda:1 "]
)
def test_ocr_device_rejects_invalid_values(device: str) -> None:
    with pytest.raises(pydantic.ValidationError, match="DEVICE"):
        _ocr_config(DEVICE=device)
