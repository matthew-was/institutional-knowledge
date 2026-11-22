"""Score stored engine outputs against the ground truth and write the report.

    python -m ocr_bakeoff.score --data DIR [--baseline docling_tesseract]

Reads ``DIR/ground_truth.json`` and ``DIR/outputs/<engine>/<page>__run<N>.json``;
writes ``DIR/results.json`` and ``DIR/results.md``.
"""

import argparse
import json
import statistics
import sys
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass, field
from pathlib import Path

from ocr_bakeoff.metrics import (
    bag_of_words,
    character_error_rate,
    key_fact_recall,
    novel_words,
    tokenize,
    word_error_rate,
)

# Engines whose output is used, with the ground truth, as the vocabulary a word must
# fall outside of to count as possibly invented.
CLASSIC_ENGINES = ("docling_tesseract", "tesseract", "docling_auto")

# Decision rules from documentation/tasks/ocr-bakeoff-plan.md. Speed is reported but is
# deliberately not a rule: ingestion is a one-off, so accuracy is what counts.
MIN_KEY_FACT_GAIN = 0.05
MIN_RELATIVE_WER_REDUCTION = 0.20

GroundTruth = Mapping[str, Mapping[str, object]]
# engine -> page -> run -> {"text": ..., "seconds": ...}
Outputs = Mapping[str, Mapping[str, Mapping[int, Mapping[str, object]]]]


@dataclass
class PageScore:
    wer: float | None
    cer: float | None
    bag_recall: float
    bag_precision: float
    bag_f1: float
    key_fact_recall: float
    key_facts_found: int
    key_facts_total: int
    missed_facts: list[str]
    novel_words: list[str]
    seconds: float


@dataclass
class EngineSummary:
    engine: str
    pages_scored: int
    mean_wer: float | None
    mean_cer: float | None
    mean_table_f1: float | None
    key_fact_recall: float
    key_facts_found: int
    key_facts_total: int
    novel_word_count: int
    median_seconds: float
    max_seconds: float
    repeatability: float | None
    empty_pages: int
    per_page: dict[str, PageScore] = field(default_factory=dict)


def score_page(
    truth: Mapping[str, object], text: str, known_texts: Sequence[str], seconds: float
) -> PageScore:
    reference = str(truth["text"])
    # Order-sensitive scoring only makes sense for running text. Tables and forms have
    # no meaningful reading order, and a partial transcription has no complete text to
    # measure edit distance against.
    ordered = bool(truth.get("order_sensitive", True)) and not truth.get("partial")
    bag = bag_of_words(reference, text)
    raw_facts = truth["key_facts"]
    assert isinstance(raw_facts, list)
    facts = [str(fact) for fact in raw_facts]
    recall, missed = key_fact_recall(facts, text)
    return PageScore(
        wer=word_error_rate(reference, text) if ordered else None,
        cer=character_error_rate(reference, text) if ordered else None,
        bag_recall=bag.recall,
        bag_precision=bag.precision,
        bag_f1=bag.f1,
        key_fact_recall=recall,
        key_facts_found=len(facts) - len(missed),
        key_facts_total=len(facts),
        missed_facts=missed,
        novel_words=novel_words(text, [reference, *known_texts]),
        seconds=seconds,
    )


def summarise_engine(
    engine: str,
    pages: Mapping[str, Mapping[int, Mapping[str, object]]],
    truth: GroundTruth,
    classic_texts: Mapping[str, Mapping[str, str]],
) -> EngineSummary:
    """Score every page of one engine (first run) and aggregate."""
    per_page: dict[str, PageScore] = {}
    for page, runs in pages.items():
        if page not in truth or 1 not in runs or truth[page].get("ignore"):
            continue
        known = [
            text
            for other, by_page in classic_texts.items()
            if other != engine and (text := by_page.get(page)) is not None
        ]
        first = runs[1]
        per_page[page] = score_page(
            truth[page], str(first["text"]), known, float(str(first["seconds"]))
        )

    wers = [s.wer for s in per_page.values() if s.wer is not None]
    cers = [s.cer for s in per_page.values() if s.cer is not None]
    tables = [
        s.bag_f1
        for page, s in per_page.items()
        if not truth[page].get("partial")
        and truth[page].get("order_sensitive") is False
    ]
    found = sum(s.key_facts_found for s in per_page.values())
    total = sum(s.key_facts_total for s in per_page.values())
    seconds = [s.seconds for s in per_page.values()]
    return EngineSummary(
        engine=engine,
        pages_scored=len(per_page),
        mean_wer=statistics.fmean(wers) if wers else None,
        mean_cer=statistics.fmean(cers) if cers else None,
        mean_table_f1=statistics.fmean(tables) if tables else None,
        key_fact_recall=found / max(1, total),
        key_facts_found=found,
        key_facts_total=total,
        novel_word_count=sum(len(s.novel_words) for s in per_page.values()),
        median_seconds=statistics.median(seconds) if seconds else 0.0,
        max_seconds=max(seconds, default=0.0),
        repeatability=_repeatability(pages),
        empty_pages=sum(
            1 for page in per_page if not str(pages[page][1]["text"]).strip()
        ),
        per_page=per_page,
    )


def _repeatability(
    pages: Mapping[str, Mapping[int, Mapping[str, object]]],
) -> float | None:
    """Share of pages whose first two runs give the same words; None if not repeated."""
    pairs = [runs for runs in pages.values() if 1 in runs and 2 in runs]
    if not pairs:
        return None
    same = sum(
        tokenize(str(runs[1]["text"])) == tokenize(str(runs[2]["text"]))
        for runs in pairs
    )
    return same / len(pairs)


@dataclass
class Verdict:
    engine: str
    passes: bool
    reasons: list[str]


def evaluate(summary: EngineSummary, baseline: EngineSummary) -> Verdict:
    """Apply the plan's decision rules to one candidate against the baseline."""
    reasons: list[str] = []
    gain = summary.key_fact_recall - baseline.key_fact_recall
    if gain < MIN_KEY_FACT_GAIN:
        reasons.append(
            f"key-fact recall {summary.key_fact_recall:.1%} is {gain:+.1%} vs baseline "
            f"{baseline.key_fact_recall:.1%} (need +{MIN_KEY_FACT_GAIN:.0%})"
        )
    if summary.mean_wer is None or baseline.mean_wer is None:
        reasons.append("word error rate unavailable")
    else:
        reduction = (baseline.mean_wer - summary.mean_wer) / max(
            baseline.mean_wer, 1e-9
        )
        if reduction < MIN_RELATIVE_WER_REDUCTION:
            reasons.append(
                f"WER {summary.mean_wer:.1%} is a {reduction:+.0%} change vs baseline "
                f"{baseline.mean_wer:.1%} (need a {MIN_RELATIVE_WER_REDUCTION:.0%} cut)"
            )
    if summary.novel_word_count > baseline.novel_word_count:
        reasons.append(
            f"{summary.novel_word_count} possibly invented words vs baseline "
            f"{baseline.novel_word_count}"
        )
    return Verdict(summary.engine, passes=not reasons, reasons=reasons)


def load_outputs(data_dir: Path) -> dict[str, dict[str, dict[int, dict[str, object]]]]:
    outputs: dict[str, dict[str, dict[int, dict[str, object]]]] = {}
    for path in sorted((data_dir / "outputs").glob("*/*__run*.json")):
        page, _, run = path.stem.rpartition("__run")
        outputs.setdefault(path.parent.name, {}).setdefault(page, {})[int(run)] = (
            json.loads(path.read_text())
        )
    return outputs


def _pct(value: float | None) -> str:
    return "n/a" if value is None else f"{value:.1%}"


def render_report(
    summaries: Sequence[EngineSummary], verdicts: Sequence[Verdict], baseline: str
) -> str:
    lines = [
        "# OCR bake-off results",
        "",
        f"Baseline: `{baseline}`. WER and CER cover running-text pages only; "
        "table F1 covers the table page; key facts cover every page.",
        "",
        "| Engine | Pages | WER | CER | Table F1 | Key facts | Possibly invented words "
        "| Median s/page | Repeatable | Empty |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for s in summaries:
        facts = f"{s.key_facts_found}/{s.key_facts_total} ({s.key_fact_recall:.1%})"
        lines.append(
            f"| `{s.engine}` | {s.pages_scored} | {_pct(s.mean_wer)} "
            f"| {_pct(s.mean_cer)} | {_pct(s.mean_table_f1)} | {facts} "
            f"| {s.novel_word_count} | {s.median_seconds:.1f} "
            f"| {_pct(s.repeatability)} | {s.empty_pages} |"
        )
    lines += ["", "## Decision rules", ""]
    for v in verdicts:
        lines.append(f"- `{v.engine}`: **{'PASSES' if v.passes else 'does not pass'}**")
        lines.extend(f"  - {reason}" for reason in v.reasons)
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--baseline", default="docling_tesseract")
    args = parser.parse_args(argv)

    truth: GroundTruth = json.loads((args.data / "ground_truth.json").read_text())
    outputs = load_outputs(args.data)
    classic_texts = {
        engine: {
            page: str(runs[1]["text"])
            for page, runs in outputs[engine].items()
            if 1 in runs
        }
        for engine in CLASSIC_ENGINES
        if engine in outputs
    }
    summaries = [
        summarise_engine(engine, pages, truth, classic_texts)
        for engine, pages in sorted(outputs.items())
    ]
    by_name = {s.engine: s for s in summaries}
    if args.baseline not in by_name:
        print(f"baseline {args.baseline!r} has no outputs yet")
        return 2
    verdicts = [
        evaluate(s, by_name[args.baseline])
        for s in summaries
        if s.engine != args.baseline
    ]
    (args.data / "results.json").write_text(
        json.dumps(
            {
                "summaries": [asdict(s) for s in summaries],
                "verdicts": [asdict(v) for v in verdicts],
            },
            ensure_ascii=False,
            indent=1,
        )
    )
    report = render_report(summaries, verdicts, args.baseline)
    (args.data / "results.md").write_text(report)
    print(report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
