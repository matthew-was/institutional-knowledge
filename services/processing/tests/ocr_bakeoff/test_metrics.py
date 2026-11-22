"""The bake-off's scoring must be right: it decides which engine reads the archive."""

import random

import pytest

from ocr_bakeoff.metrics import (
    bag_of_words,
    character_error_rate,
    fitting_edit_distance,
    key_fact_recall,
    novel_words,
    tokenize,
    word_error_rate,
)

# --------------------------------------------------------------------------- #
# tokenize
# --------------------------------------------------------------------------- #


def test_tokenize_lowercases_and_drops_trailing_punctuation() -> None:
    assert tokenize("Dear Mr. Wasbrough,") == ["dear", "mr", "wasbrough"]


def test_tokenize_keeps_punctuation_inside_a_word_and_currency_signs() -> None:
    assert tokenize("£3,412.50 sort code 20-45-67 U.K.A.E.A. 12/08") == [
        "£3,412.50",
        "sort",
        "code",
        "20-45-67",
        "u.k.a.e.a",
        "12/08",
    ]


def test_tokenize_ignores_markdown_markup_so_formatting_is_not_an_error() -> None:
    assert tokenize("## Heading\n\n**bold** | cell | <!-- image -->") == [
        "heading",
        "bold",
        "cell",
    ]


def test_tokenize_treats_curly_and_straight_apostrophes_alike() -> None:
    assert tokenize("employer\u2019s visitor's") == ["employer's", "visitor's"]


def test_tokenize_drops_superscript_footnote_numbers() -> None:
    assert tokenize("circumstances\u00b9\u2077. undertaken\u00b2\u2070") == [
        "circumstances",
        "undertaken",
    ]


def test_tokenize_ignores_the_placeholders_models_write_for_unreadable_text() -> None:
    assert tokenize("Yours sincerely, [handwriting] [Illegible] [SIGNATURE] done") == [
        "yours",
        "sincerely",
        "done",
    ]


def test_tokenize_keeps_ordinary_digits() -> None:
    assert tokenize("section 3(2) of 1974") == ["section", "3", "2", "of", "1974"]


def test_tokenize_decodes_the_ampersand_entity() -> None:
    assert tokenize("ADKIN, BELCHER &amp; BOWEN") == ["adkin", "belcher", "&", "bowen"]


# --------------------------------------------------------------------------- #
# fitting_edit_distance
# --------------------------------------------------------------------------- #


def test_identical_sequences_have_distance_zero() -> None:
    assert fitting_edit_distance(list("abc"), list("abc")) == 0


def test_a_reference_found_inside_longer_output_costs_nothing() -> None:
    assert fitting_edit_distance(list("cat"), list("xxcatyy")) == 0


@pytest.mark.parametrize(
    ("hypothesis", "expected"),
    [
        ("cut", 1),  # one substitution
        ("ct", 1),  # one deletion
        ("caat", 1),  # one insertion
        ("dog", 3),  # nothing in common
    ],
)
def test_each_kind_of_error_costs_one(hypothesis: str, expected: int) -> None:
    assert fitting_edit_distance(list("cat"), list(hypothesis)) == expected


def test_an_empty_reference_costs_nothing() -> None:
    assert fitting_edit_distance([], list("abc")) == 0


def test_an_empty_hypothesis_loses_the_whole_reference() -> None:
    assert fitting_edit_distance(list("abc"), []) == 3


def test_fitting_distance_lets_the_hypothesis_ends_go_free() -> None:
    # Plain Levenshtein("kitten", "sitting") is 3, but here the leading "s" and
    # trailing "g" of the hypothesis are outside the matched stretch "ittin".
    assert fitting_edit_distance(list("kitten"), list("sitting")) == 2


def _levenshtein(a: str, b: str) -> int:
    previous = list(range(len(b) + 1))
    for i, char_a in enumerate(a, start=1):
        current = [i]
        for j, char_b in enumerate(b, start=1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (char_a != char_b),
                )
            )
        previous = current
    return previous[-1]


def _brute_force_fitting(reference: str, hypothesis: str) -> int:
    """Best plain edit distance over every contiguous stretch of the hypothesis."""
    return min(
        _levenshtein(reference, hypothesis[start:stop])
        for start in range(len(hypothesis) + 1)
        for stop in range(start, len(hypothesis) + 1)
    )


def test_fast_fitting_distance_agrees_with_brute_force_on_random_strings() -> None:
    rng = random.Random(20261122)
    for _ in range(300):
        reference = "".join(rng.choices("abc ", k=rng.randint(1, 7)))
        hypothesis = "".join(rng.choices("abc ", k=rng.randint(1, 9)))
        assert fitting_edit_distance(list(reference), list(hypothesis)) == (
            _brute_force_fitting(reference, hypothesis)
        ), (reference, hypothesis)


# --------------------------------------------------------------------------- #
# word_error_rate / character_error_rate
# --------------------------------------------------------------------------- #


def test_perfect_text_has_zero_word_error_rate() -> None:
    assert word_error_rate("I enclose the receipt.", "I enclose the receipt.") == 0.0


def test_word_error_rate_counts_one_error_per_wrong_word() -> None:
    # 1 wrong word in 4.
    assert word_error_rate("cheque for £550 today", "cheque for £560 today") == 0.25


def test_word_error_rate_ignores_formatting_differences() -> None:
    assert word_error_rate("Dear Mr. Wasbrough,", "## dear MR wasbrough") == 0.0


def test_word_error_rate_is_not_hurt_by_extra_text_outside_the_passage() -> None:
    reference = "the first line"
    hypothesis = "unrelated header text the first line unrelated footer text"
    assert word_error_rate(reference, hypothesis) == 0.0


def test_word_error_rate_is_hurt_by_missing_text() -> None:
    assert word_error_rate("one two three four", "one two") == 0.5


def test_character_error_rate_scores_a_single_digit_slip_small_but_nonzero() -> None:
    rate = character_error_rate("cheque for £550", "cheque for £560")
    assert 0 < rate < 0.1


# --------------------------------------------------------------------------- #
# bag_of_words
# --------------------------------------------------------------------------- #


def test_bag_of_words_ignores_order() -> None:
    scores = bag_of_words("Tenants AST Rent 11,700", "11,700 Rent AST Tenants")
    assert (scores.recall, scores.precision, scores.f1) == (1.0, 1.0, 1.0)


def test_bag_of_words_recall_drops_when_words_are_missing() -> None:
    scores = bag_of_words("a b c d", "a b")
    assert scores.recall == 0.5
    assert scores.precision == 1.0


def test_bag_of_words_precision_drops_when_words_are_invented() -> None:
    scores = bag_of_words("a b", "a b x y")
    assert scores.recall == 1.0
    assert scores.precision == 0.5


def test_bag_of_words_counts_repeated_words_by_their_multiplicity() -> None:
    scores = bag_of_words("low low low", "low")
    assert scores.recall == pytest.approx(1 / 3)


def test_bag_of_words_f1_is_zero_with_no_overlap() -> None:
    assert bag_of_words("a b", "x y").f1 == 0.0


# --------------------------------------------------------------------------- #
# key_fact_recall
# --------------------------------------------------------------------------- #


def test_key_fact_recall_finds_facts_wherever_they_sit() -> None:
    recall, missed = key_fact_recall(
        ["£550", "Wasbrough"], "Dear Mr. Wasbrough, I enclose a cheque for £550."
    )
    assert (recall, missed) == (1.0, [])


def test_key_fact_with_a_wrong_digit_counts_as_missed() -> None:
    recall, missed = key_fact_recall(["£570", "£550"], "values of £670 and £550")
    assert recall == 0.5
    assert missed == ["£570"]


def test_a_multiword_key_fact_must_appear_whole_and_in_order() -> None:
    recall, missed = key_fact_recall(
        ["Fire Loss Assessors"], "the Assessors Fire Loss committee"
    )
    assert recall == 0.0
    assert missed == ["Fire Loss Assessors"]


def test_key_facts_with_internal_punctuation_match_across_formatting() -> None:
    recall, _ = key_fact_recall(
        ["£3. 12s. 9d."], "receipt for £3. 12s. 9d. for the connections"
    )
    assert recall == 1.0


def test_a_key_fact_with_alternative_readings_matches_any_of_them() -> None:
    fact = "Ellen Koemer||Ellen Koerner"

    assert key_fact_recall([fact], "tenant Ellen Koerner of 13")[0] == 1.0
    assert key_fact_recall([fact], "tenant Ellen Koemer of 13")[0] == 1.0


def test_a_key_fact_with_alternatives_is_missed_when_none_match() -> None:
    recall, missed = key_fact_recall(["Ellen Koemer||Ellen Koerner"], "Ellen Kroner")

    assert recall == 0.0
    assert missed == ["Ellen Koemer||Ellen Koerner"]


def test_key_fact_recall_with_no_facts_is_zero_not_an_error() -> None:
    assert key_fact_recall([], "anything") == (0.0, [])


# --------------------------------------------------------------------------- #
# novel_words
# --------------------------------------------------------------------------- #


def test_novel_words_lists_words_that_no_reference_contains() -> None:
    found = novel_words(
        "the estate and zebrafish granary", ["the estate and granary"], min_length=4
    )
    assert found == ["zebrafish"]


def test_a_word_produced_by_any_other_engine_is_not_novel() -> None:
    found = novel_words("estate zebrafish", ["estate"], min_length=4) + novel_words(
        "estate zebrafish", ["estate", "zebrafish seen elsewhere"]
    )
    assert found == ["zebrafish"]


def test_short_fragments_are_not_reported_as_novel() -> None:
    assert novel_words("the xq zz abc", ["the"], min_length=4) == []


def test_novel_words_are_distinct_and_sorted() -> None:
    assert novel_words("zebra zebra apple", [""], min_length=4) == ["apple", "zebra"]
