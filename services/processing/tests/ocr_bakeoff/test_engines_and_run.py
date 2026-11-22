"""The Ollama client, the DeepSeek output cleaner, and the resumable runner."""

import base64
import io
import json
from pathlib import Path

import httpx
import pytest
import respx
from PIL import Image

from ocr_bakeoff.engines import (
    GENERIC_PROMPT,
    STRICT_PROMPT,
    EngineResult,
    OllamaVisionEngine,
    build_engines,
    clean_grounded_output,
)
from ocr_bakeoff.run import output_path, page_images, run_engine
from shared.config import config

URL = "http://ollama.test"


def _page(tmp_path: Path) -> Path:
    page = tmp_path / "page.png"
    page.write_bytes(b"fake-png-bytes")
    return page


def _answer(content: str, thinking: str = "") -> dict[str, object]:
    return {
        "message": {"role": "assistant", "content": content, "thinking": thinking},
        "eval_count": 12,
        "prompt_eval_count": 3000,
        "done_reason": "stop",
    }


# --------------------------------------------------------------------------- #
# OllamaVisionEngine
# --------------------------------------------------------------------------- #


@respx.mock
def test_the_request_sends_the_page_the_prompt_and_greedy_settings(
    tmp_path: Path,
) -> None:
    route = respx.post(f"{URL}/api/chat").mock(
        return_value=httpx.Response(200, json=_answer("hello"))
    )
    engine = OllamaVisionEngine(
        "e", "glm-ocr", "Text Recognition:", base_url=URL, num_ctx=8192, num_predict=99
    )

    result = engine.run(_page(tmp_path))

    body = json.loads(route.calls.last.request.content)
    assert body["model"] == "glm-ocr"
    assert body["stream"] is False
    assert body["messages"][0]["content"] == "Text Recognition:"
    assert body["messages"][0]["images"] == [
        base64.b64encode(b"fake-png-bytes").decode("ascii")
    ]
    assert body["options"] == {"temperature": 0, "num_ctx": 8192, "num_predict": 99}
    assert "think" not in body
    assert result.text == "hello"


@respx.mock
@pytest.mark.parametrize("think", [True, False])
def test_the_think_flag_is_sent_only_when_set(tmp_path: Path, think: bool) -> None:
    route = respx.post(f"{URL}/api/chat").mock(
        return_value=httpx.Response(200, json=_answer("x"))
    )

    OllamaVisionEngine("e", "m", "p", base_url=URL, think=think).run(_page(tmp_path))

    assert json.loads(route.calls.last.request.content)["think"] is think


@respx.mock
def test_the_result_records_timing_and_how_much_the_model_thought(
    tmp_path: Path,
) -> None:
    respx.post(f"{URL}/api/chat").mock(
        return_value=httpx.Response(200, json=_answer("", thinking="a" * 40))
    )

    result = OllamaVisionEngine("e", "m", "p", base_url=URL).run(_page(tmp_path))

    assert result.seconds >= 0
    assert result.meta["thinking_chars"] == 40
    assert result.meta["eval_count"] == 12
    assert result.meta["done_reason"] == "stop"


@respx.mock
def test_a_server_error_is_raised_not_silently_scored_as_empty(tmp_path: Path) -> None:
    respx.post(f"{URL}/api/chat").mock(return_value=httpx.Response(500))

    with pytest.raises(httpx.HTTPStatusError):
        OllamaVisionEngine("e", "m", "p", base_url=URL).run(_page(tmp_path))


@respx.mock
def test_deepseek_cleaning_is_applied_only_when_requested(tmp_path: Path) -> None:
    respx.post(f"{URL}/api/chat").mock(
        return_value=httpx.Response(200, json=_answer("<|md_start|>text<|md_end|>"))
    )
    page = _page(tmp_path)

    plain = OllamaVisionEngine("e", "m", "p", base_url=URL).run(page)
    cleaned = OllamaVisionEngine("e", "m", "p", base_url=URL, clean=True).run(page)

    assert plain.text == "<|md_start|>text<|md_end|>"
    assert cleaned.text == "text"


@respx.mock
def test_a_large_page_is_shrunk_to_the_requested_longest_side(tmp_path: Path) -> None:
    route = respx.post(f"{URL}/api/chat").mock(
        return_value=httpx.Response(200, json=_answer("x"))
    )
    big = tmp_path / "big.png"
    Image.new("RGB", (3000, 4000), "white").save(big)

    OllamaVisionEngine("e", "m", "p", base_url=URL, max_side=1000).run(big)

    sent = json.loads(route.calls.last.request.content)["messages"][0]["images"][0]
    with Image.open(io.BytesIO(base64.b64decode(sent))) as page:
        assert page.size == (750, 1000)  # aspect ratio kept


@respx.mock
def test_a_page_already_smaller_than_max_side_is_not_enlarged(tmp_path: Path) -> None:
    route = respx.post(f"{URL}/api/chat").mock(
        return_value=httpx.Response(200, json=_answer("x"))
    )
    small = tmp_path / "small.png"
    Image.new("RGB", (400, 600), "white").save(small)

    OllamaVisionEngine("e", "m", "p", base_url=URL, max_side=1000).run(small)

    sent = json.loads(route.calls.last.request.content)["messages"][0]["images"][0]
    with Image.open(io.BytesIO(base64.b64decode(sent))) as page:
        assert page.size == (400, 600)


def test_the_strict_prompt_keeps_the_generic_instructions_and_forbids_guessing() -> (
    None
):
    assert STRICT_PROMPT.startswith(GENERIC_PROMPT[:80])
    assert "[handwriting]" in STRICT_PROMPT
    assert "never infer a name or number" in STRICT_PROMPT
    assert STRICT_PROMPT.endswith("Output only the transcription.")


# --------------------------------------------------------------------------- #
# clean_grounded_output
# --------------------------------------------------------------------------- #


def test_bounding_boxes_and_markers_are_removed_but_the_text_is_kept() -> None:
    raw = (
        "<|im_end|>\n<|ref|>title<|/ref|><|det|>[[34, 88, 370, 172]]<|/det|>\n"
        "INVOICE 4471\n<|md_start|>Total £10<|md_end|>"
    )

    assert clean_grounded_output(raw) == "title\nINVOICE 4471\nTotal £10"


def test_granite_docling_layout_coordinates_are_removed() -> None:
    raw = "<loc_46><loc_46><loc_166><loc_52>ADKIN, BELCHER\n<loc_73><loc_54>T. BOWEN"

    assert clean_grounded_output(raw) == "ADKIN, BELCHER\nT. BOWEN"


def test_text_with_no_markers_is_unchanged() -> None:
    assert clean_grounded_output("  plain text  ") == "plain text"


# --------------------------------------------------------------------------- #
# build_engines
# --------------------------------------------------------------------------- #


def test_every_candidate_in_the_plan_is_registered() -> None:
    engines = build_engines(config.PROCESSING.OCR, URL)

    assert set(engines) == {
        "docling_tesseract",
        "docling_auto",
        "tesseract",
        "glm_ocr",
        "glm_ocr_generic",
        "qwen35_9b",
        "qwen35_9b_strict",
        "qwen35_9b_200dpi",
        "qwen35_9b_strict_200dpi",
        "gemma4_12b_strict",
        "gemma4_12b_strict_200dpi",
        "gemma4_26b_strict",
        "gemma4_26b_strict_200dpi",
        "qwen35_27b_strict",
        "qwen36_27b_strict",
        "qwen36_27b_strict_200dpi",
        "qwen38_27b_strict",
        "qwen38_27b_strict_200dpi",
        "qwen35_27b_strict_200dpi",
        "qwen3_vl_8b",
        "deepseek_ocr_free",
        "deepseek_ocr_markdown",
        "granite_docling",
    }
    assert all(name == engine.name for name, engine in engines.items())


@respx.mock
def test_the_general_models_get_the_same_generic_prompt(tmp_path: Path) -> None:
    route = respx.post(f"{URL}/api/chat").mock(
        return_value=httpx.Response(200, json=_answer("x"))
    )
    engines = build_engines(config.PROCESSING.OCR, URL)

    engines["qwen35_9b"].run(_page(tmp_path))
    engines["qwen3_vl_8b"].run(_page(tmp_path))

    prompts = {
        json.loads(call.request.content)["messages"][0]["content"]
        for call in route.calls
    }
    assert prompts == {GENERIC_PROMPT}


@respx.mock
def test_qwen35_has_thinking_off_and_qwen3_vl_gets_a_bigger_budget(
    tmp_path: Path,
) -> None:
    route = respx.post(f"{URL}/api/chat").mock(
        return_value=httpx.Response(200, json=_answer("x"))
    )
    engines = build_engines(config.PROCESSING.OCR, URL)

    engines["qwen35_9b"].run(_page(tmp_path))
    engines["qwen3_vl_8b"].run(_page(tmp_path))

    qwen35, qwen3_vl = (json.loads(call.request.content) for call in route.calls)
    assert qwen35["think"] is False
    assert "think" not in qwen3_vl  # it ignores the flag, so none is sent
    assert qwen3_vl["options"]["num_predict"] > qwen35["options"]["num_predict"]


# --------------------------------------------------------------------------- #
# runner
# --------------------------------------------------------------------------- #


class _FakeEngine:
    def __init__(self, name: str, fail_on: str | None = None) -> None:
        self.name = name
        self.calls: list[str] = []
        self._fail_on = fail_on

    def run(self, image_path: Path) -> EngineResult:
        self.calls.append(image_path.stem)
        if image_path.stem == self._fail_on:
            raise RuntimeError("boom")
        return EngineResult(text=f"text of {image_path.stem}", seconds=0.5)


def _data_dir(tmp_path: Path, pages: list[str]) -> Path:
    (tmp_path / "pages").mkdir()
    for page in pages:
        (tmp_path / "pages" / f"{page}.png").write_bytes(b"x")
        (tmp_path / "pages" / f"{page}_view.png").write_bytes(b"x")
    return tmp_path


def test_page_images_skips_the_half_size_preview_copies(tmp_path: Path) -> None:
    data = _data_dir(tmp_path, ["a", "b"])

    assert [p.stem for p in page_images(data)] == ["a", "b"]


def test_page_images_can_be_limited_to_named_pages(tmp_path: Path) -> None:
    data = _data_dir(tmp_path, ["a", "b", "c"])

    assert [p.stem for p in page_images(data, {"b"})] == ["b"]


def test_outputs_are_written_per_engine_page_and_run(tmp_path: Path) -> None:
    data = _data_dir(tmp_path, ["a"])

    run_engine(_FakeEngine("vlm"), data, runs=2)

    first = json.loads(output_path(data, "vlm", "a", 1).read_text())
    assert first["text"] == "text of a"
    assert output_path(data, "vlm", "a", 2).exists()


def test_deterministic_engines_are_run_once_whatever_runs_says(tmp_path: Path) -> None:
    data = _data_dir(tmp_path, ["a"])
    engine = _FakeEngine("tesseract")

    run_engine(engine, data, runs=3)

    assert engine.calls == ["a"]
    assert not output_path(data, "tesseract", "a", 2).exists()


def test_an_interrupted_run_resumes_without_redoing_finished_work(
    tmp_path: Path,
) -> None:
    data = _data_dir(tmp_path, ["a", "b"])
    run_engine(_FakeEngine("vlm"), data, runs=1, only={"a"})
    engine = _FakeEngine("vlm")

    run_engine(engine, data, runs=1)

    assert engine.calls == ["b"]


def test_one_failing_page_does_not_stop_the_rest_and_leaves_no_output(
    tmp_path: Path,
) -> None:
    data = _data_dir(tmp_path, ["a", "b", "c"])
    engine = _FakeEngine("vlm", fail_on="b")

    run_engine(engine, data, runs=1)

    assert engine.calls == ["a", "b", "c"]
    assert output_path(data, "vlm", "a", 1).exists()
    assert not output_path(data, "vlm", "b", 1).exists()
    assert output_path(data, "vlm", "c", 1).exists()
