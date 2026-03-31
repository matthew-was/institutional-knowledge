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
    monkeypatch.setenv("IK_AUTH__INBOUND_KEY", "overridden-key")
    cfg = shared.config._load_config(settings_files=["settings.json"])
    assert cfg.AUTH.INBOUND_KEY == "overridden-key"
