"""The engines under test, each reduced to: page image in, text out."""

import base64
import io
import re
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol

import httpx
import structlog
from PIL import Image

from pipeline.adapters.docling_ocr import DoclingAdapter
from pipeline.adapters.tesseract_ocr import TesseractAdapter
from shared.config import OCRConfig

# Fixed, minimal and the same for every general-purpose vision model, so the
# models are compared on reading ability and not on prompt craft.
GENERIC_PROMPT = (
    "Transcribe all the text on this page exactly as written, in reading order. "
    "Keep line breaks. Do not correct spelling, do not add or summarise anything, "
    "and write [illegible] for text you cannot read. "
    "Output only the transcription."
)

# As GENERIC_PROMPT, plus a rule against guessing handwriting. In a first run every
# vision model turned an illegible signature into a plausible but wrong name, and one
# read a faint pencil amount wrongly with full confidence.
STRICT_PROMPT = (
    GENERIC_PROMPT[: GENERIC_PROMPT.rindex(" Output only")]
    + " Typed and printed text must be transcribed exactly. Do not guess handwriting:"
    " write [handwriting] in place of any signature, pencil note or margin mark, and"
    " never infer a name or number from elsewhere on the page."
    " Output only the transcription."
)

OLLAMA_URL = "http://127.0.0.1:11434"
_REQUEST_TIMEOUT_SECONDS = 900.0
_DET_BLOCK = re.compile(r"<\|det\|>.*?<\|/det\|>", re.DOTALL)
_SPECIAL_TOKEN = re.compile(r"<\|[^|>]*\|>")
_LOC_TAG = re.compile(r"<loc_\d+>")


@dataclass(frozen=True)
class EngineResult:
    text: str
    seconds: float
    meta: dict[str, object] = field(default_factory=dict)


class Engine(Protocol):
    name: str

    def run(self, image_path: Path) -> EngineResult: ...


class ClassicEngine:
    """An in-process engine from the service: Docling or Tesseract."""

    def __init__(self, name: str, config: OCRConfig, *, tesseract_only: bool) -> None:
        self.name = name
        log = structlog.get_logger()
        self._tesseract_only = tesseract_only
        self._docling = None if tesseract_only else DoclingAdapter(config, log)
        self._tesseract = TesseractAdapter(config, log) if tesseract_only else None

    def run(self, image_path: Path) -> EngineResult:
        started = time.monotonic()
        if self._tesseract is not None:
            result = self._tesseract.extract_text(str(image_path))
        else:
            assert self._docling is not None
            result = self._docling.extract_text(str(image_path))
        return EngineResult(
            text="\n\n".join(result.text_per_page),
            seconds=time.monotonic() - started,
            meta={"confidence": result.confidence_per_page},
        )


class OllamaVisionEngine:
    """A vision-language model served by Ollama, read at temperature 0."""

    def __init__(
        self,
        name: str,
        model: str,
        prompt: str,
        *,
        base_url: str = OLLAMA_URL,
        think: bool | None = None,
        num_ctx: int = 16384,
        num_predict: int = 4096,
        clean: bool = False,
        max_side: int | None = None,
    ) -> None:
        self.name = name
        self._model = model
        self._prompt = prompt
        self._base_url = base_url
        self._think = think
        self._num_ctx = num_ctx
        self._num_predict = num_predict
        self._clean = clean
        self._max_side = max_side

    def _encoded_page(self, image_path: Path) -> str:
        """The page as base64 PNG, shrunk so its longest side is at most max_side."""
        if self._max_side is None:
            return base64.b64encode(image_path.read_bytes()).decode("ascii")
        with Image.open(image_path) as page:
            page.thumbnail((self._max_side, self._max_side), Image.Resampling.LANCZOS)
            buffer = io.BytesIO()
            page.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("ascii")

    def run(self, image_path: Path) -> EngineResult:
        image = self._encoded_page(image_path)
        payload: dict[str, object] = {
            "model": self._model,
            "stream": False,
            "keep_alive": "10m",
            "messages": [{"role": "user", "content": self._prompt, "images": [image]}],
            "options": {
                "temperature": 0,
                "num_ctx": self._num_ctx,
                "num_predict": self._num_predict,
            },
        }
        # Reasoning models would otherwise spend the page budget on a thinking
        # trace before answering, which also pollutes the transcription.
        if self._think is not None:
            payload["think"] = self._think

        started = time.monotonic()
        response = httpx.post(
            f"{self._base_url}/api/chat", json=payload, timeout=_REQUEST_TIMEOUT_SECONDS
        )
        response.raise_for_status()
        elapsed = time.monotonic() - started
        body = response.json()
        text = str(body["message"]["content"])
        if self._clean:
            text = clean_grounded_output(text)
        return EngineResult(
            text=text,
            seconds=elapsed,
            meta={
                "eval_count": body.get("eval_count"),
                "prompt_eval_count": body.get("prompt_eval_count"),
                "done_reason": body.get("done_reason"),
                "thinking_chars": len(body["message"].get("thinking") or ""),
            },
        )


def clean_grounded_output(text: str) -> str:
    """Remove layout coordinates and special tokens from a document model's answer.

    DeepSeek-OCR's grounding mode wraps each region as
    ``<|ref|>label<|/ref|><|det|>[[x1, y1, x2, y2]]<|/det|>`` followed by its text,
    and carries markers such as ``<|md_start|>``. Granite-Docling prefixes each line
    with ``<loc_46><loc_46>...`` coordinates. None of that is page text.
    """
    without_boxes = _DET_BLOCK.sub("", text)
    return _LOC_TAG.sub("", _SPECIAL_TOKEN.sub("", without_boxes)).strip()


def build_engines(config: OCRConfig, ollama_url: str = OLLAMA_URL) -> dict[str, Engine]:
    """Every candidate, by name. Names are used for output folders and the report."""
    tesseract_config = config.model_copy(update={"ENGINE": "tesseract"})
    auto_config = config.model_copy(update={"ENGINE": "auto"})

    def ollama(
        name: str,
        model: str,
        prompt: str,
        *,
        think: bool | None = None,
        num_ctx: int = 16384,
        num_predict: int = 4096,
        clean: bool = False,
        max_side: int | None = None,
    ) -> Engine:
        return OllamaVisionEngine(
            name,
            model,
            prompt,
            base_url=ollama_url,
            think=think,
            num_ctx=num_ctx,
            num_predict=num_predict,
            clean=clean,
            max_side=max_side,
        )

    engines: list[Engine] = [
        ClassicEngine("docling_tesseract", tesseract_config, tesseract_only=False),
        ClassicEngine("docling_auto", auto_config, tesseract_only=False),
        ClassicEngine("tesseract", tesseract_config, tesseract_only=True),
        ollama("glm_ocr", "glm-ocr", "Text Recognition:"),
        ollama("glm_ocr_generic", "glm-ocr", GENERIC_PROMPT),
        ollama("qwen35_9b", "qwen3.5:9b", GENERIC_PROMPT, think=False),
        ollama("qwen35_9b_strict", "qwen3.5:9b", STRICT_PROMPT, think=False),
        # 1900 px on the long side is roughly a 200 dpi scan of an A4 page.
        ollama(
            "qwen35_9b_200dpi", "qwen3.5:9b", GENERIC_PROMPT, think=False, max_side=1900
        ),
        ollama(
            "qwen35_9b_strict_200dpi",
            "qwen3.5:9b",
            STRICT_PROMPT,
            think=False,
            max_side=1900,
        ),
        # Gemma 4 is from a different model family, so its mistakes should differ
        # from Qwen's: useful as a second reader.
        ollama("gemma4_12b_strict", "gemma4:12b", STRICT_PROMPT, think=False),
        ollama(
            "gemma4_12b_strict_200dpi",
            "gemma4:12b",
            STRICT_PROMPT,
            think=False,
            max_side=1900,
        ),
        # Gemma 4 26B is a mixture of experts (3.8B parameters active per token); the
        # 16 GB quantised build is smaller than the Qwen 27B, so it should fit the two
        # GPUs better.
        ollama(
            "gemma4_26b_strict",
            "gemma4:26b-a4b-it-qat",
            STRICT_PROMPT,
            think=False,
            num_ctx=8192,
        ),
        ollama(
            "gemma4_26b_strict_200dpi",
            "gemma4:26b-a4b-it-qat",
            STRICT_PROMPT,
            think=False,
            num_ctx=8192,
            max_side=1900,
        ),
        # Newer Qwen generations at the same 27B size, to see whether they read
        # better or err differently from qwen3.5. Both are thinking models;
        # think=False is sent and checked in a smoke test before any full run.
        ollama(
            "qwen36_27b_strict",
            "qwen3.6:27b",
            STRICT_PROMPT,
            think=False,
            num_ctx=8192,
        ),
        ollama(
            "qwen36_27b_strict_200dpi",
            "qwen3.6:27b",
            STRICT_PROMPT,
            think=False,
            num_ctx=8192,
            max_side=1900,
        ),
        ollama(
            "qwen38_27b_strict",
            "qwen3.8:27b",
            STRICT_PROMPT,
            think=False,
            num_ctx=8192,
        ),
        ollama(
            "qwen38_27b_strict_200dpi",
            "qwen3.8:27b",
            STRICT_PROMPT,
            think=False,
            num_ctx=8192,
            max_side=1900,
        ),
        # The 27B model needs both GPUs (or CPU offload); a smaller context keeps its
        # cache small. A page and its transcription need well under 8k tokens.
        ollama(
            "qwen35_27b_strict",
            "qwen3.5:27b",
            STRICT_PROMPT,
            think=False,
            num_ctx=8192,
        ),
        ollama(
            "qwen35_27b_strict_200dpi",
            "qwen3.5:27b",
            STRICT_PROMPT,
            think=False,
            num_ctx=8192,
            max_side=1900,
        ),
        # qwen3-vl:8b is a thinking model that ignores think=False in Ollama: it
        # writes a reasoning trace first, so it needs a much larger budget to
        # reach its answer.
        ollama(
            "qwen3_vl_8b",
            "qwen3-vl:8b",
            GENERIC_PROMPT,
            num_ctx=24576,
            num_predict=16384,
        ),
        ollama(
            "deepseek_ocr_free", "deepseek-ocr", "Free OCR.", num_ctx=8192, clean=True
        ),
        # Run through Ollama directly: it strips the DocTags structure tokens, which
        # leaves Docling's own pipeline unable to parse the answer.
        ollama(
            "granite_docling",
            "ibm/granite-docling:258m",
            "Convert this page to docling.",
            num_ctx=8192,
            clean=True,
        ),
        ollama(
            "deepseek_ocr_markdown",
            "deepseek-ocr",
            "<|grounding|>Convert the document to markdown.",
            num_ctx=8192,
            clean=True,
        ),
    ]
    return {engine.name: engine for engine in engines}
