"""Second-reader cross-check: do disagreements flag a primary reader's real errors?

    python -m ocr_bakeoff.crosscheck --data DIR --primary ENGINE --readers A,B

A *real error* is a word (three or more letters) in the primary reader's output that is
not in the ground truth. A word is *flagged* when any second reader's output does not
contain it, exactly. A good cross-check catches most real errors while flagging few
other words. Ground truth is used only to score the check; it is never part of what
decides a flag, because a real system has no ground truth.

Findings that depend on this analysis (and why exact matching is used) are written up in
documentation/tasks/ocr-bakeoff-results.md.
"""

import argparse
import json
import re
import sys
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from pathlib import Path

from ocr_bakeoff.score import load_outputs

_MARKUP = re.compile(
    r"<!--.*?-->|<[^>]+>|\[(?:handwriting|illegible|signature)\]|[#*|_>`~]+",
    re.IGNORECASE,
)
_WORD = re.compile(r"[a-z0-9£]+")
_MIN_LETTERS = 3

GroundTruth = Mapping[str, Mapping[str, object]]


def words(text: str) -> set[str]:
    """Distinct lower-cased words of at least three characters, markup removed."""
    cleaned = _MARKUP.sub(" ", text.replace("&amp;", "&")).lower()
    cleaned = cleaned.replace("’", "'")
    return {word for word in _WORD.findall(cleaned) if len(word) >= _MIN_LETTERS}


def has_complete_transcription(truth: Mapping[str, object]) -> bool:
    """False for pages whose ground truth covers part of the page, or none of it."""
    return not (
        truth.get("ignore")
        or truth.get("partial")
        or "excerpt" in str(truth.get("scope", "")).lower()
    )


@dataclass
class CrossCheck:
    pages: int = 0
    real_errors: int = 0
    caught: int = 0
    flagged: int = 0
    caught_words: list[str] = field(default_factory=list)
    missed_words: list[str] = field(default_factory=list)
    false_alarms: list[str] = field(default_factory=list)
    skipped_pages: list[str] = field(default_factory=list)

    @property
    def recall(self) -> float:
        return self.caught / max(1, self.real_errors)

    @property
    def precision(self) -> float:
        return self.caught / max(1, self.flagged)

    @property
    def flags_per_page(self) -> float:
        return self.flagged / max(1, self.pages)


def cross_check(
    truth: GroundTruth,
    primary: Mapping[str, str],
    readers: Sequence[Mapping[str, str]],
) -> CrossCheck:
    """Score the readers' disagreements with ``primary`` against the ground truth.

    Pages are used only if the ground truth is complete and the primary and every
    reader have an output for them; the rest are listed in ``skipped_pages``.
    """
    result = CrossCheck()
    for page, page_truth in sorted(truth.items()):
        if not has_complete_transcription(page_truth):
            continue
        texts = [primary.get(page), *(reader.get(page) for reader in readers)]
        if any(text is None for text in texts):
            result.skipped_pages.append(page)
            continue
        primary_words = words(str(texts[0]))
        reader_words = [words(str(text)) for text in texts[1:]]
        real_errors = primary_words - words(str(page_truth["text"]))
        flags = {
            word
            for word in primary_words
            if any(word not in known for known in reader_words)
        }
        result.pages += 1
        result.real_errors += len(real_errors)
        result.flagged += len(flags)
        result.caught += len(real_errors & flags)
        result.caught_words += sorted(real_errors & flags)
        result.missed_words += sorted(real_errors - flags)
        result.false_alarms += sorted(flags - real_errors)
    return result


def _texts_by_page(
    outputs: Mapping[str, Mapping[str, Mapping[int, Mapping[str, object]]]], engine: str
) -> dict[str, str]:
    return {
        page: str(runs[1]["text"])
        for page, runs in outputs.get(engine, {}).items()
        if 1 in runs
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--primary", required=True)
    parser.add_argument("--readers", required=True, help="comma-separated engine names")
    args = parser.parse_args(argv)

    truth: GroundTruth = json.loads((args.data / "ground_truth.json").read_text())
    outputs = load_outputs(args.data)
    names = [name.strip() for name in args.readers.split(",") if name.strip()]
    unknown = [name for name in [args.primary, *names] if name not in outputs]
    if unknown:
        print(f"no outputs for: {unknown}; available: {sorted(outputs)}")
        return 2

    check = cross_check(
        truth,
        _texts_by_page(outputs, args.primary),
        [_texts_by_page(outputs, name) for name in names],
    )
    print(f"primary {args.primary} | readers {names} | {check.pages} pages")
    print(
        f"  real errors={check.real_errors} caught={check.caught} ({check.recall:.0%}) "
        f"flags={check.flagged} ({check.flags_per_page:.1f}/page) "
        f"precision={check.precision:.0%}"
    )
    print(f"  caught: {check.caught_words}\n  missed: {check.missed_words}")
    print(
        f"  false alarms ({len(check.false_alarms)}): {', '.join(check.false_alarms)}"
    )
    if check.skipped_pages:
        print(f"  skipped (missing outputs): {check.skipped_pages}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
