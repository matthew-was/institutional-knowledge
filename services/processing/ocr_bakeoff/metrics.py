"""Scoring for the OCR bake-off: error rates, key-fact recall and invented text.

All comparisons use a light normalisation so that formatting differences (Markdown
markup, case, trailing punctuation) are not counted as recognition errors, while
real differences (a wrong digit, a dropped word, a changed name) are.
"""

import re
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass

import numpy as np

# A word keeps punctuation that sits inside it (3,412.50  20-45-67  U.K.A.E.A  12/08)
# and currency signs, but not punctuation around it.
_TOKEN = re.compile(r"[\w£$€%@&]+(?:[./:,'’\-][\w£$€%]+)*")
_MARKUP = re.compile(r"<!--.*?-->|<[^>]+>|!?\[[^\]]*\]\([^)]*\)|[#*|_>`~]+")
_ENTITIES = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"}
# Footnote numbers set as superscripts are not part of the words they follow.
_SUPERSCRIPTS = re.compile("[\u2070\u00b9\u00b2\u00b3\u2074-\u2079]+")
# Placeholders a model is told to write for text it will not guess are not words.
_PLACEHOLDER = re.compile(r"\[(?:handwriting|illegible|signature)\]", re.IGNORECASE)
_MIN_NOVEL_WORD_LENGTH = 4


def tokenize(text: str) -> list[str]:
    """Lower-cased words of ``text`` with Markdown and HTML markup removed."""
    for entity, plain in _ENTITIES.items():
        text = text.replace(entity, plain)
    text = (
        _PLACEHOLDER.sub(" ", _SUPERSCRIPTS.sub("", text))
        .replace("\u2019", "'")
        .replace("\u2018", "'")
    )
    return _TOKEN.findall(_MARKUP.sub(" ", text).lower())


def fitting_edit_distance[T](reference: Sequence[T], hypothesis: Sequence[T]) -> int:
    """Smallest edit distance between ``reference`` and any contiguous stretch of
    ``hypothesis``.

    Text the engine produced before or after the reference passage is free, so a
    page-level output can be scored against an excerpt of the page without being
    punished for the rest of it. Insertions, deletions and substitutions inside the
    matched stretch each cost one.
    """
    ref_count, hyp_count = len(reference), len(hypothesis)
    if ref_count == 0:
        return 0
    if hyp_count == 0:
        return ref_count

    # Map tokens to integers so rows can be compared with numpy.
    ids: dict[T, int] = {}
    ref = np.array([ids.setdefault(item, len(ids)) for item in reference])
    hyp = np.array([ids.setdefault(item, len(ids)) for item in hypothesis])
    columns = np.arange(hyp_count + 1)

    # previous[j]: cost of aligning the reference so far with a stretch of the
    # hypothesis ending at j. Starting anywhere in the hypothesis is free.
    previous = np.zeros(hyp_count + 1, dtype=np.int64)
    for i in range(1, ref_count + 1):
        current = np.empty(hyp_count + 1, dtype=np.int64)
        current[0] = i
        substitution = previous[:-1] + (hyp != ref[i - 1])
        deletion = previous[1:] + 1
        current[1:] = np.minimum(substitution, deletion)
        # Insertions (extra hypothesis items) chain along the row.
        current = np.minimum.accumulate(current - columns) + columns
        previous = current
    return int(previous.min())


def word_error_rate(reference: str, hypothesis: str) -> float:
    """Word errors against the best-matching stretch of the hypothesis, per word."""
    ref = tokenize(reference)
    return fitting_edit_distance(ref, tokenize(hypothesis)) / max(1, len(ref))


def character_error_rate(reference: str, hypothesis: str) -> float:
    """Character errors against the best-matching stretch, per character."""
    ref = " ".join(tokenize(reference))
    hyp = " ".join(tokenize(hypothesis))
    return fitting_edit_distance(ref, hyp) / max(1, len(ref))


@dataclass(frozen=True)
class BagScores:
    recall: float
    precision: float

    @property
    def f1(self) -> float:
        total = self.recall + self.precision
        return 0.0 if total == 0 else 2 * self.recall * self.precision / total


def bag_of_words(reference: str, hypothesis: str) -> BagScores:
    """Order-free word overlap, for tables and forms with arbitrary reading order."""
    ref, hyp = Counter(tokenize(reference)), Counter(tokenize(hypothesis))
    overlap = sum((ref & hyp).values())
    return BagScores(
        recall=overlap / max(1, sum(ref.values())),
        precision=overlap / max(1, sum(hyp.values())),
    )


def key_fact_recall(facts: Sequence[str], hypothesis: str) -> tuple[float, list[str]]:
    """Share of key facts found as an exact run of words, and the facts missed.

    A fact such as ``£3. 12s. 9d.`` must appear whole and in order: a digit read
    wrongly makes the fact wrong, which is the failure that matters for retrieval.
    A fact may list alternative acceptable readings separated by ``||``, for a word
    that even a careful human reader cannot settle (``rn`` and ``m`` look alike in
    some typefaces); any one of them counts.
    """
    hyp = tokenize(hypothesis)
    missed: list[str] = []
    for fact in facts:
        readings = [tokenize(option) for option in fact.split("||")]
        if not any(words and _contains_run(hyp, words) for words in readings):
            missed.append(fact)
    found = len(facts) - len(missed)
    return found / max(1, len(facts)), missed


def novel_words(
    hypothesis: str,
    known_texts: Sequence[str],
    min_length: int = _MIN_NOVEL_WORD_LENGTH,
) -> list[str]:
    """Distinct words of ``hypothesis`` that appear in none of ``known_texts``.

    Pass the ground truth and the other engines' outputs for the same page as the
    known texts: a word that no reference and no other engine produced is a
    candidate for text the engine made up. Only words with at least ``min_length``
    letters are listed, which keeps short-fragment noise out of the list.
    """
    known: set[str] = set()
    for text in known_texts:
        known.update(tokenize(text))
    candidates = {
        word
        for word in tokenize(hypothesis)
        if sum(character.isalpha() for character in word) >= min_length
    }
    return sorted(candidates - known)


def _contains_run(haystack: Sequence[str], needle: Sequence[str]) -> bool:
    width = len(needle)
    return any(
        list(haystack[start : start + width]) == list(needle)
        for start in range(len(haystack) - width + 1)
    )
