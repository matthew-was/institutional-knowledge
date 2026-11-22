"""Dynaconf + Pydantic config singleton (ADR-015, ADR-016)."""

import os
import re
from typing import Annotated, Literal, cast

from dynaconf import Dynaconf
from pydantic import BaseModel, Field, field_validator, model_validator


class LLMBaseConfig(BaseModel):
    PROVIDER: str
    BASE_URL: str
    MODEL: str


class OCRQualityScoringConfig(BaseModel):
    CONFIDENCE_WEIGHT: float
    DENSITY_WEIGHT: float
    TARGET_CHARS_PER_PAGE: Annotated[int, Field(gt=0)]


_OCR_DEVICE_PATTERN = re.compile(r"^(auto|cpu|cuda(:\d+)?|mps|xpu)$")


class OCRConfig(BaseModel):
    PROVIDER: str
    QUALITY_THRESHOLD: float
    QUALITY_SCORING: OCRQualityScoringConfig
    # Inference device for Docling's layout/table models: auto, cpu, cuda, cuda:N,
    # mps or xpu. Use cuda:N to keep Docling off the GPU that Ollama is using.
    # Ignored by the Tesseract adapter, which always runs on the CPU.
    DEVICE: str = "auto"
    # How PDF pages are read (images are always OCR'd; they have no text layer):
    #   auto: decide per page. A page with real, visible text uses the PDF's own
    #         text (exact, and keeps tables and drawings intact); a scan, whose text
    #         layer is invisible OCR output or absent, is OCR'd as a whole page.
    #   ocr:  OCR every page of every PDF, ignoring any text layer.
    #   text: use the PDF's own text layer for every page, OCR'ing only embedded
    #         bitmaps. Image-only pages lose their text in this mode.
    PDF_MODE: Literal["auto", "ocr", "text"] = "auto"
    # OCR engine for scanned pages and images. tesseract read typewritten letters
    # best in testing but needs the tesseract binary on the host; auto lets Docling
    # pick its own engine (RapidOCR, or others if installed).
    ENGINE: Literal["tesseract", "auto"] = "tesseract"

    @field_validator("DEVICE")
    @classmethod
    def check_device(cls, value: str) -> str:
        if not _OCR_DEVICE_PATTERN.match(value):
            raise ValueError(
                f"DEVICE must be auto, cpu, cuda, cuda:N, mps or xpu; got {value!r}"
            )
        return value


class LLMConfig(LLMBaseConfig):
    CHUNKING_MIN_TOKENS: Annotated[int, Field(gt=0)]
    CHUNKING_MAX_TOKENS: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def check_token_bounds(self) -> "LLMConfig":
        if self.CHUNKING_MIN_TOKENS >= self.CHUNKING_MAX_TOKENS:
            raise ValueError(
                "CHUNKING_MIN_TOKENS must be less than CHUNKING_MAX_TOKENS"
            )
        return self


class EmbeddingConfig(LLMBaseConfig):
    DIMENSION: Annotated[int, Field(gt=0)]


class MetadataPatternsConfig(BaseModel):
    DOCUMENT_TYPE: list[str]
    DATES: list[str]
    PEOPLE: list[str]
    ORGANISATIONS: list[str]
    LAND_REFERENCES: list[str]
    DESCRIPTION: list[str]


class MetadataCompletenessWeights(BaseModel):
    DOCUMENT_TYPE: float
    DATES: float
    PEOPLE: float
    ORGANISATIONS: float
    LAND_REFERENCES: float
    DESCRIPTION: float


class MetadataConfig(BaseModel):
    EXTRACTOR: str
    PATTERNS: MetadataPatternsConfig
    COMPLETENESS_THRESHOLD: float
    COMPLETENESS_WEIGHTS: MetadataCompletenessWeights


class PipelineConfig(BaseModel):
    RUNNING_STEP_TIMEOUT_MINUTES: int


class ProcessingConfig(BaseModel):
    OCR: OCRConfig
    LLM: LLMConfig
    EMBEDDING: EmbeddingConfig
    METADATA: MetadataConfig
    PIPELINE: PipelineConfig


# Query prefix used to avoid naming collisions with any future pipeline-side equivalents
class QueryVectorSearchConfig(BaseModel):
    TOP_K: Annotated[int, Field(gt=0)]


class QueryContextAssemblyConfig(BaseModel):
    TOKEN_BUDGET: Annotated[int, Field(gt=0)]
    INCLUDE_PARENT_METADATA: bool


class QuerySynthesisConfig(BaseModel):
    LLM: LLMBaseConfig
    CITATION_FIELDS: list[str]


class QueryConfig(BaseModel):
    ROUTER: str
    LLM: LLMBaseConfig
    VECTOR_SEARCH: QueryVectorSearchConfig
    CONTEXT_ASSEMBLY: QueryContextAssemblyConfig
    SYNTHESIS: QuerySynthesisConfig


class AuthConfig(BaseModel):
    INBOUND_KEY: str
    EXPRESS_KEY: str


class ServiceHTTPConfig(BaseModel):
    RETRY_COUNT: Annotated[int, Field(ge=1)]
    RETRY_DELAY_MS: int


class ServiceConfig(BaseModel):
    EXPRESS_BASE_URL: str
    HTTP: ServiceHTTPConfig


class AppConfig(BaseModel):
    PROCESSING: ProcessingConfig
    QUERY: QueryConfig
    AUTH: AuthConfig
    SERVICE: ServiceConfig


def _load_config(settings_files: list[str] | None = None) -> AppConfig:
    # If no settings files specified, find them relative to the processing service root
    if settings_files is None:
        processing_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        settings_files = [
            os.path.join(processing_root, "settings.json"),
            os.path.join(processing_root, "settings.override.json"),
        ]

    dynaconf_settings = Dynaconf(
        envvar_prefix="IK",
        settings_files=settings_files,
    )

    return AppConfig.model_validate(dynaconf_settings.as_dict())


class _ConfigProxy:
    """Lazy-loading proxy for the config singleton.

    Allows `from shared.config import config` to work like a normal variable
    while deferring initialization until first access.
    """

    def __init__(self) -> None:
        self._singleton: AppConfig | None = None

    def __getattr__(self, name: str) -> object:
        if self._singleton is None:
            self._singleton = _load_config()
        return getattr(self._singleton, name)


# Proxy instance cast to AppConfig for static type checking. At runtime, `config`
# is a _ConfigProxy that lazily initializes the AppConfig singleton on first access.
config: AppConfig = cast(AppConfig, _ConfigProxy())
