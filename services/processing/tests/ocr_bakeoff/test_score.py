"""Scoring, aggregation and the decision rules that pick the engine."""

import json
from pathlib import Path

import pytest

from ocr_bakeoff.score import (
    EngineSummary,
    evaluate,
    load_outputs,
    render_report,
    score_page,
    summarise_engine,
)

TRUTH = {
    "text": "I enclose a cheque for £550 to Barretts.",
    "key_facts": ["£550", "Barretts"],
}


def _truth(**overrides: object) -> dict[str, object]:
    return {**TRUTH, **overrides}


def _run(text: str, seconds: float = 1.0) -> dict[int, dict[str, object]]:
    return {1: {"text": text, "seconds": seconds}}


# --------------------------------------------------------------------------- #
# score_page
# --------------------------------------------------------------------------- #


def test_a_perfect_page_scores_perfectly() -> None:
    score = score_page(TRUTH, "I enclose a cheque for £550 to Barretts.", [], 2.0)

    assert (score.wer, score.cer, score.key_fact_recall) == (0.0, 0.0, 1.0)
    assert score.novel_words == []
    assert score.seconds == 2.0


def test_a_wrong_digit_costs_a_word_and_loses_the_key_fact() -> None:
    score = score_page(TRUTH, "I enclose a cheque for £560 to Barretts.", [], 1.0)

    assert score.wer == pytest.approx(1 / 8)
    assert score.missed_facts == ["£550"]
    assert (score.key_facts_found, score.key_facts_total) == (1, 2)


def test_running_text_pages_get_error_rates() -> None:
    assert score_page(TRUTH, "x", [], 1.0).wer is not None


@pytest.mark.parametrize(
    "overrides",
    [{"order_sensitive": False}, {"partial": True}],
    ids=["table", "partial"],
)
def test_tables_and_partial_transcriptions_have_no_edit_distance_scores(
    overrides: dict[str, object],
) -> None:
    score = score_page(_truth(**overrides), "£550 Barretts cheque", [], 1.0)

    assert score.wer is None
    assert score.cer is None
    assert score.bag_recall > 0


def test_words_in_no_reference_are_reported_as_possibly_invented() -> None:
    score = score_page(
        TRUTH, "I enclose a cheque for £550 to Barretts. Zebrafish granary.", [], 1.0
    )

    assert score.novel_words == ["granary", "zebrafish"]


def test_words_other_engines_read_are_not_reported_as_invented() -> None:
    score = score_page(
        TRUTH,
        "I enclose a cheque for £550 to Barretts. Letterhead",
        ["Letterhead present in another engine's output"],
        1.0,
    )

    assert score.novel_words == []


# --------------------------------------------------------------------------- #
# summarise_engine
# --------------------------------------------------------------------------- #


def test_summary_aggregates_pages_and_counts_key_facts_across_them() -> None:
    truth: dict[str, dict[str, object]] = {
        "p1": _truth(),
        "p2": {"text": "Dear Mr Chamberlain", "key_facts": ["Chamberlain"]},
    }
    pages = {
        "p1": _run("I enclose a cheque for £550 to Barretts.", 1.0),
        "p2": _run("Dear Mr Chamberlin", 3.0),  # one wrong word of three
    }

    summary = summarise_engine("e", pages, truth, {})

    assert summary.pages_scored == 2
    assert summary.mean_wer == pytest.approx((0 + 1 / 3) / 2)
    assert (summary.key_facts_found, summary.key_facts_total) == (2, 3)
    assert summary.key_fact_recall == pytest.approx(2 / 3)
    assert summary.median_seconds == 2.0
    assert summary.max_seconds == 3.0


def test_table_pages_are_averaged_separately_from_running_text() -> None:
    truth = {
        "text_page": _truth(),
        "table_page": {
            "text": "Tenants AST Rent",
            "key_facts": [],
            "order_sensitive": False,
        },
    }
    pages = {
        "text_page": _run("I enclose a cheque for £550 to Barretts."),
        "table_page": _run("Rent Tenants AST"),
    }

    summary = summarise_engine("e", pages, truth, {})

    assert summary.mean_wer == 0.0  # only the running-text page
    assert summary.mean_table_f1 == 1.0  # order does not matter for the table


def test_pages_without_ground_truth_or_a_first_run_are_skipped() -> None:
    truth = {"p1": _truth()}
    pages = {
        "p1": _run("I enclose a cheque for £550 to Barretts."),
        "unknown_page": _run("text"),
        "only_second_run": {2: {"text": "x", "seconds": 1.0}},
    }

    assert summarise_engine("e", pages, truth, {}).pages_scored == 1


def test_pages_marked_ignore_are_not_scored_at_all() -> None:
    truth = {"p1": _truth(), "skip": _truth(ignore=True)}
    pages = {
        "p1": _run("I enclose a cheque for £550 to Barretts."),
        "skip": _run("completely wrong text"),
    }

    summary = summarise_engine("e", pages, truth, {})

    assert summary.pages_scored == 1
    assert "skip" not in summary.per_page
    assert (summary.key_facts_found, summary.key_facts_total) == (2, 2)


def test_an_engine_that_returns_nothing_loses_everything() -> None:
    summary = summarise_engine("e", {"p1": _run("")}, {"p1": _truth()}, {})

    assert summary.mean_wer == 1.0
    assert summary.key_facts_found == 0
    assert summary.empty_pages == 1


def test_a_words_seen_by_other_classic_engines_do_not_count_as_invented() -> None:
    truth = {"p1": _truth()}
    pages = {"p1": _run("I enclose a cheque for £550 to Barretts. Granary")}
    classic = {"tesseract": {"p1": "granary"}}

    assert summarise_engine("vlm", pages, truth, classic).novel_word_count == 0


def test_an_engine_is_not_compared_against_its_own_output() -> None:
    truth = {"p1": _truth()}
    pages = {"p1": _run("I enclose a cheque for £550 to Barretts. Granary")}
    classic = {"tesseract": {"p1": "I enclose a cheque for £550 to Barretts. Granary"}}

    summary = summarise_engine("tesseract", pages, truth, classic)

    assert summary.novel_word_count == 1


def test_repeatability_is_the_share_of_pages_whose_runs_agree() -> None:
    truth = {"p1": _truth(), "p2": _truth()}
    pages = {
        "p1": {
            1: {"text": "I enclose a cheque", "seconds": 1.0},
            2: {"text": "I  ENCLOSE a cheque.", "seconds": 1.0},  # same words
        },
        "p2": {
            1: {"text": "I enclose a cheque", "seconds": 1.0},
            2: {"text": "I enclose a different cheque", "seconds": 1.0},
        },
    }

    assert summarise_engine("e", pages, truth, {}).repeatability == 0.5


def test_repeatability_is_unknown_when_a_page_was_only_run_once() -> None:
    summary = summarise_engine("e", {"p1": _run("x")}, {"p1": _truth()}, {})

    assert summary.repeatability is None


# --------------------------------------------------------------------------- #
# evaluate: the decision rules
# --------------------------------------------------------------------------- #


def _summary(
    *,
    recall: float = 0.80,
    wer: float | None = 0.20,
    novel: int = 10,
    seconds: float = 5.0,
) -> EngineSummary:
    return EngineSummary(
        engine="candidate",
        pages_scored=12,
        mean_wer=wer,
        mean_cer=None,
        mean_table_f1=None,
        key_fact_recall=recall,
        key_facts_found=int(recall * 100),
        key_facts_total=100,
        novel_word_count=novel,
        median_seconds=seconds,
        max_seconds=seconds,
        repeatability=None,
        empty_pages=0,
    )


BASELINE = _summary(recall=0.80, wer=0.20, novel=10)


def test_a_clearly_better_engine_passes_every_rule() -> None:
    verdict = evaluate(_summary(recall=0.90, wer=0.10, novel=10), BASELINE)

    assert verdict.passes
    assert verdict.reasons == []


def test_a_small_key_fact_gain_is_not_enough() -> None:
    verdict = evaluate(_summary(recall=0.83, wer=0.10), BASELINE)

    assert not verdict.passes
    assert any("key-fact recall" in reason for reason in verdict.reasons)


def test_a_small_error_rate_cut_is_not_enough() -> None:
    verdict = evaluate(_summary(recall=0.90, wer=0.18), BASELINE)

    assert not verdict.passes
    assert any("WER" in reason for reason in verdict.reasons)


def test_inventing_more_text_than_the_baseline_fails_whatever_else_is_good() -> None:
    verdict = evaluate(_summary(recall=0.95, wer=0.05, novel=11), BASELINE)

    assert not verdict.passes
    assert any("invented" in reason for reason in verdict.reasons)


def test_speed_is_not_a_decision_rule() -> None:
    """Ingestion is a one-off, so a slow but accurate engine can still pass."""
    verdict = evaluate(_summary(recall=0.95, wer=0.05, seconds=600), BASELINE)

    assert verdict.passes


def test_every_failed_rule_is_reported_not_just_the_first() -> None:
    verdict = evaluate(_summary(recall=0.5, wer=0.5, novel=99), BASELINE)

    assert len(verdict.reasons) == 3


def test_missing_error_rates_cannot_pass() -> None:
    verdict = evaluate(_summary(recall=0.95, wer=None), BASELINE)

    assert not verdict.passes


# --------------------------------------------------------------------------- #
# loading and reporting
# --------------------------------------------------------------------------- #


def test_load_outputs_reads_engine_page_and_run_from_the_file_layout(
    tmp_path: Path,
) -> None:
    folder = tmp_path / "outputs" / "glm_ocr"
    folder.mkdir(parents=True)
    (folder / "L1_cow_yards__run1.json").write_text(
        json.dumps({"text": "a", "seconds": 1.5})
    )
    (folder / "L1_cow_yards__run2.json").write_text(
        json.dumps({"text": "b", "seconds": 2.5})
    )

    outputs = load_outputs(tmp_path)

    assert outputs["glm_ocr"]["L1_cow_yards"][1]["text"] == "a"
    assert outputs["glm_ocr"]["L1_cow_yards"][2]["seconds"] == 2.5


def test_the_report_names_each_engine_and_its_verdict() -> None:
    candidate = _summary(recall=0.90, wer=0.10)
    verdict = evaluate(candidate, BASELINE)

    report = render_report([BASELINE, candidate], [verdict], "docling_tesseract")

    assert "docling_tesseract" in report
    assert "candidate" in report
    assert "PASSES" in report
