"""The second-reader analysis behind the recommended OCR design must itself be right."""

import json
from pathlib import Path

import pytest

from ocr_bakeoff.crosscheck import (
    cross_check,
    has_complete_transcription,
    main,
    words,
)

TRUTH = {"p1": {"text": "the cheque for five hundred pounds"}}


# --------------------------------------------------------------------------- #
# words / complete-transcription rule
# --------------------------------------------------------------------------- #


def test_words_keeps_distinct_lowercase_words_of_three_or_more_characters() -> None:
    assert words("The cheque, the CHEQUE: £550 of it") == {"the", "cheque", "£550"}


def test_words_ignores_markup_placeholders_and_entities() -> None:
    assert words("## Heading [handwriting] <!-- image --> Barretts &amp; Sons") == {
        "heading",
        "barretts",
        "sons",
    }


def test_words_treats_curly_and_straight_apostrophes_alike() -> None:
    assert words("employer’s employer's") == words("employer's")


@pytest.mark.parametrize(
    ("truth", "complete"),
    [
        ({"text": "x"}, True),
        ({"text": "x", "ignore": True}, False),
        ({"text": "x", "partial": True}, False),
        ({"text": "x", "scope": "excerpt: the first paragraph"}, False),
        ({"text": "x", "scope": "full page"}, True),
    ],
)
def test_only_pages_with_a_complete_transcription_are_scored(
    truth: dict[str, object], complete: bool
) -> None:
    assert has_complete_transcription(truth) is complete


# --------------------------------------------------------------------------- #
# cross_check
# --------------------------------------------------------------------------- #


def test_a_disagreement_on_a_real_error_is_caught() -> None:
    primary = {"p1": "the cheque for five hundred pounts"}  # pounts: a real error
    reader = {"p1": "the cheque for five hundred pounds"}

    result = cross_check(TRUTH, primary, [reader])

    assert (result.real_errors, result.caught, result.flagged) == (1, 1, 1)
    assert result.caught_words == ["pounts"]
    assert (result.recall, result.precision) == (1.0, 1.0)


def test_a_real_error_both_readers_share_is_missed() -> None:
    primary = {"p1": "the cheque for five hundred pounts"}
    reader = {"p1": "the cheque for five hundred pounts"}

    result = cross_check(TRUTH, primary, [reader])

    assert result.caught == 0
    assert result.missed_words == ["pounts"]
    assert result.recall == 0.0


def test_a_disagreement_on_a_correct_word_is_a_false_alarm() -> None:
    primary = {"p1": "the cheque for five hundred pounds"}  # all correct
    reader = {"p1": "the cheque for five hundred"}  # reader dropped a word

    result = cross_check(TRUTH, primary, [reader])

    assert result.real_errors == 0
    assert result.false_alarms == ["pounds"]
    assert result.precision == 0.0


def test_a_word_is_flagged_when_any_reader_lacks_it() -> None:
    primary = {"p1": "the cheque for five hundred pounts"}
    agrees = {"p1": "the cheque for five hundred pounts"}
    disagrees = {"p1": "the cheque for five hundred pounds"}

    result = cross_check(TRUTH, primary, [agrees, disagrees])

    assert result.caught_words == ["pounts"]


def test_matching_is_exact_so_a_one_letter_slip_is_flagged() -> None:
    primary = {"p1": "the cheque for five hunderd pounds"}
    reader = {"p1": "the cheque for five hundred pounds"}

    assert cross_check(TRUTH, primary, [reader]).caught_words == ["hunderd"]


def test_the_ground_truth_never_decides_a_flag() -> None:
    """A correct word the reader lacks is flagged even though the truth has it."""
    primary = {"p1": "the cheque for five hundred pounds"}
    reader = {"p1": "completely different words here"}

    result = cross_check(TRUTH, primary, [reader])

    assert result.flagged == len(words(primary["p1"]))


def test_ignored_partial_and_excerpt_pages_are_not_scored() -> None:
    truth: dict[str, dict[str, object]] = {
        "good": {"text": "alpha beta gamma"},
        "ignored": {"text": "x", "ignore": True},
        "partial": {"text": "x", "partial": True},
        "excerpt": {"text": "x", "scope": "excerpt"},
    }
    texts = {page: "alpha beta gamma" for page in truth}

    result = cross_check(truth, texts, [texts])

    assert result.pages == 1


def test_pages_missing_an_output_are_skipped_and_reported() -> None:
    truth = {"p1": {"text": "alpha beta"}, "p2": {"text": "alpha beta"}}
    primary = {"p1": "alpha beta", "p2": "alpha beta"}
    reader = {"p1": "alpha beta"}  # no output for p2

    result = cross_check(truth, primary, [reader])

    assert result.pages == 1
    assert result.skipped_pages == ["p2"]


def test_counts_add_up_across_pages() -> None:
    truth = {"a": {"text": "one two three"}, "b": {"text": "four five six"}}
    primary = {"a": "one two threx", "b": "four five sixx"}  # one error on each page
    reader = {"a": "one two three", "b": "four five six"}

    result = cross_check(truth, primary, [reader])

    assert (result.pages, result.real_errors, result.caught) == (2, 2, 2)
    assert result.flags_per_page == 1.0


def test_an_empty_result_has_zero_rates_not_a_division_error() -> None:
    result = cross_check({}, {}, [{}])

    assert (result.recall, result.precision, result.flags_per_page) == (0, 0, 0)


# --------------------------------------------------------------------------- #
# command line
# --------------------------------------------------------------------------- #


def _write_output(data: Path, engine: str, page: str, text: str) -> None:
    folder = data / "outputs" / engine
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{page}__run1.json").write_text(
        json.dumps({"text": text, "seconds": 1.0})
    )


def test_the_command_line_reads_the_data_folder_and_reports(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "ground_truth.json").write_text(json.dumps(TRUTH))
    _write_output(tmp_path, "big", "p1", "the cheque for five hundred pounts")
    _write_output(tmp_path, "small", "p1", "the cheque for five hundred pounds")

    code = main(["--data", str(tmp_path), "--primary", "big", "--readers", "small"])

    assert code == 0
    out = capsys.readouterr().out
    assert "real errors=1 caught=1 (100%)" in out
    assert "pounts" in out


def test_the_command_line_rejects_unknown_engines(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "ground_truth.json").write_text(json.dumps(TRUTH))
    _write_output(tmp_path, "big", "p1", "x")

    code = main(["--data", str(tmp_path), "--primary", "big", "--readers", "nope"])

    assert code == 2
    assert "nope" in capsys.readouterr().out
