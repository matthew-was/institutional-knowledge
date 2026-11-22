# OCR Engine Bake-Off Results

**Run**: 2026-11-22, following `ocr-bakeoff-plan.md`; corrected and extended the same day
after the owner reviewed the ground truth and asked for a larger model to be tried.
**Status**: results in; the decision below needs the owner's call because it touches the
plan's own veto rule.

No document text, names or amounts appear here. The page images, ground truth and raw
engine outputs stay outside the repository.

## Guiding principle

Ingestion is a one-off, so the engine is chosen for the quality of the text it reads, not
for speed. Seconds per page are reported below but are **not** a decision rule; the plan's
30-second limit was removed on the owner's instruction.

## Setup

- **Pages**: 12 scanned pages were transcribed; **11 are scored**. Five are 1960s
  typewritten letters (one badly worn, one with handwriting and a pencil note). Six are from
  a photographed 2020 report: two prose pages, a table page, a text-and-photo page, a prose
  page over a heavy watermark, and a closing page with a signature. A seventh report page,
  a photographed form, is **ignored** at the owner's request: it was an image and not
  important.
- **Ground truth**: 2,405 words and 142 key facts (names, dates, amounts, references),
  transcribed from the page images before any engine output was looked at, then reviewed
  and corrected by the owner (see "Owner review").
- **Engines**: the current default (Docling layout with Tesseract), Docling with its own
  engine, Tesseract alone, and Ollama 0.40.17 models: `glm-ocr`, `qwen3.5:9b`,
  `qwen3.5:27b`, `qwen3.6:27b`, `qwen3.8:27b`, `gemma4:12b`, `gemma4:26b` (the 16 GB QAT
  build), `qwen3-vl:8b`, `deepseek-ocr` and `ibm/granite-docling`. After the test,
  `glm-ocr`, `qwen3-vl:8b`, `deepseek-ocr` and `granite-docling` were deleted from the
  machine; the Qwen 3.5, 3.6 and 3.8 models and both Gemma models remain.
- **Method**: every engine reads the same 300 dpi page image (or a 200 dpi copy where named).
  The 9B and other small vision models run at temperature 0 and were each run twice; the
  27B was run once per variant.

## Results

WER is word error rate over the running-text pages; table F1 is bag-of-words on the table
page; key facts are counted over every scored page.

| Engine | WER | Key facts found | Table F1 | Median s/page |
| --- | --- | --- | --- | --- |
| Docling + Tesseract (**baseline**) | 13.4% | 124/142 (87.3%) | 62.1% | 12.7 |
| Docling + auto engine (RapidOCR) | 22.4% | 126/142 (88.7%) | 70.7% | 1.4 |
| Tesseract alone | 12.4% | 124/142 (87.3%) | 91.5% | 1.8 |
| `glm-ocr`, documented prompt | 13.1% | 128/142 (90.1%) | 95.8% | 2.8 |
| `glm-ocr`, generic prompt | 10.6% | 136/142 (95.8%) | 95.8% | 1.7 |
| `deepseek-ocr`, "Free OCR." | 5.9% | 136/142 (95.8%) | 97.8% | 1.9 |
| `deepseek-ocr`, markdown | 24.5% | 105/142 (73.9%) | 97.3% | 1.9 |
| `granite-docling` | 10.5% | 117/142 (82.4%) | 79.3% | 1.6 |
| `qwen3-vl:8b` (3 pages only) | 34.1% | 28/43 (65.1%) | n/a | 38.9 |
| `qwen3.5:9b`, generic prompt | 1.1% | 141/142 (99.3%) | 99.2% | 9.2 |
| `qwen3.5:9b`, 200 dpi | 1.2% | 141/142 (99.3%) | 99.2% | 6.8 |
| `qwen3.5:9b`, strict prompt | 1.1% | 141/142 (99.3%) | 99.2% | 9.1 |
| **`qwen3.5:9b`, strict prompt, 200 dpi** | 1.2% | 141/142 (99.3%) | 99.2% | 6.8 |
| `qwen3.5:27b`, strict prompt | 2.0% | 140/142 (98.6%) | 99.2% | 75.9 |
| `qwen3.5:27b`, strict prompt, 200 dpi | 1.8% | 142/142 (100.0%) | 99.7% | 71.8 |
| `qwen3.6:27b`, strict prompt | 1.8% | 141/142 (99.3%) | 99.2% | 46.4 |
| **`qwen3.6:27b`, strict prompt, 200 dpi** | 0.8% | 142/142 (100.0%) | 98.9% | 37.5 |
| `qwen3.8:27b`, strict prompt | 1.1% | 141/142 (99.3%) | 99.2% | 45.1 |
| `qwen3.8:27b`, strict prompt, 200 dpi | 2.2% | 141/142 (99.3%) | 99.7% | 35.4 |
| `gemma4:12b`, strict prompt (10 of 11 pages: one failed) | 2.6% | 123/126 (97.6%) | 99.2% | 3.9 |
| `gemma4:12b`, strict prompt, 200 dpi | 3.0% | 138/142 (97.2%) | 99.2% | 3.7 |
| `gemma4:26b` (16 GB QAT build), strict prompt | 2.3% | 138/142 (97.2%) | 98.4% | 7.4 |
| `gemma4:26b` (16 GB QAT build), strict prompt, 200 dpi | 3.9% | 138/142 (97.2%) | 98.4% | 9.0 |

`qwen3.5:9b` returned identical words on repeat runs for every page in all four variants.
It occupies 6.1 GB on the GPU. `qwen3.5:27b` is 17 GB, runs 24% on the CPU and 76% on the
two GPUs, and takes about 72-76 seconds a page. `gemma4:12b` is 8 GB, runs fully on the GPU
and takes under 4 seconds a page; it is not fully repeatable (90.9% of pages identical across
two runs) and Ollama aborts it with a "token repeat limit" error on some pages (see finding
8). `gemma4:26b` (16 GB) runs 20% on the CPU and 80% on the two GPUs and takes 7-9 seconds a
page; at 200 dpi only 83.3% of pages were identical across two runs.

**Correction.** An earlier version of this table counted the 15 labels of the ignored form
page as key facts, which penalised engines that cannot read a blurred form (the baseline
scored 0 of 15 there) and showed the baseline at 79.0%. With the page properly ignored the
baseline is 87.3%; qwen's lead is 12.7 points, not 21. The ranking did not change.

## Findings

1. **`qwen3.5:9b` is far ahead of everything else** except its larger sibling, on printed
   text, the worn letter, the table and the watermarked pages. Its word error rate is a
   ninth of the baseline's.
2. **The 27B model is not better.** Its word error rate is higher (1.8-2.0% against
   1.1-1.2%) and, unlike the 9B, its result changes with resolution (one letter went from
   3.1% to 8.1% errors at 200 dpi). Its one advantage is a single key fact, a surname the
   owner reads as `m` that every other engine read as `rn`: the 27B got it right at 200
   dpi and wrong at 300 dpi, so this may be luck, not better reading.
3. **Resolution does not matter on printed text** for the 9B, and a higher resolution does
   not fix faint handwriting. On a faint pencil amount the 9B read the same wrong figure on
   the whole page at 300 dpi and on a close-up crop at native size; at 2x it changed the
   pound figure and at 3x it dropped the middle amount. The information is not in the pixels.
4. **Vision models invent handwriting.** With a plain prompt, three of the five models
   turned an illegible signature into a plausible, wrong name, and `qwen3.5:9b` did so on
   two letters. The classic engines produced garbage there, never a name.
5. **A stricter prompt fixes signatures but does not reliably stop faint handwriting being
   guessed.** Asking for `[handwriting]` removed every invented signature name in every
   variant. The faint pencil note is a coin toss: the 9B guessed it wrongly at 300 dpi and
   declined at 200 dpi, and the 27B did the reverse. The true amount is confirmed by the
   owner, and by the printed text of another letter in the archive, as £3 12s 9d; the model
   read the shillings as 17.
6. **Tesseract is a weak cross-check.** An earlier version of this document said the
   cross-check caught every handwriting error with few false alarms. That count had the
   ground truth in its known vocabulary, which a real system does not have. Measured without
   it (words of three or more letters, exact match, the ten pages with a complete ground
   truth), the 9B's output compared with Tesseract flags 5.0 words a page and only 4% of
   them are real errors, catching 2 of the 3 real errors; against Docling + Tesseract it
   flags 8.0 a page, 2% real.
7. **A second strong reader is a much better cross-check than Tesseract.** For the 9B as
   primary (exact word match, ten pages with a complete ground truth; 3 real errors): the
   27B-class Qwen models at 200 dpi catch all 3, with 0.4 flagged words a page for the 3.6
   (75% real errors), 0.6 for the 3.5 (50%) and 0.7 for the 3.8 (43%). The same models at 300
   dpi do worse (the 3.6 catches 1 of 3 at 17% real; the 3.8 catches 2 of 3). Gemma 12B and 26B
   catch 2 of 3 with 1.2-1.5 flags a page (13-17% real) and miss the surname; Tesseract
   catches 2 of 3 with 5.0 flags a page (4% real). Combining several readers adds flags
   without catching more. The counts are tiny, so this is a direction, not proof.
8. **Gemma 4 (12B and 26B) are competent but weaker readers, and do not help as a second
   reader.** The 12B at 200 dpi scored 3.0% word errors and 97.2% of key facts in under 4
   seconds a page; the 26B scored 2.3% at 300 dpi (3.9% at 200 dpi) and 97.2% in 7-9 seconds.
   Both are far ahead of the baseline but behind both Qwen models: the 26B makes about five
   times as many real word errors as the 9B (15 against 3 on ten pages), and the Qwen
   models catch 93-100% of them. Both Gemma sizes share the surname error, so a different
   model family did not remove that blind spot. The 12B is not fully repeatable at
   temperature 0 and Ollama aborted it with "token repeat limit reached" on a dense
   letter at 300 dpi and on the ignored form at 200 dpi, repeatably: a repetition loop
   returns no text at all, so a production reader would need a retry or fallback. The 26B
   had no such failures but was the least repeatable at 200 dpi (83.3%).
9. **The newer Qwen generations are as good or better, and faster.** `qwen3.6:27b` at 200 dpi
   scored the lowest word error rate of any run (0.8%) and found all 142 key facts, in 37.5
   seconds a page against the 3.5 27B's 71.8. `qwen3.8:27b` scored 1.1% at 300 dpi and 2.2% at
   200 dpi. Both honoured the thinking-off setting and each runs 30% on the CPU (18 GB). None
   guessed a handwritten amount: they wrote `[handwriting]` for the signatures and for the
   pencil note, or left the note out. The 3.6 and 3.8 moved in opposite directions between
   resolutions (3.6: 0.8% at 200 dpi, 1.8% at 300; 3.8: 2.2% at 200, 1.1% at 300), so the
   differences among the 27B-class models are within the noise of this sample and no ranking
   among them should be trusted.
10. **The surname is read correctly only at 200 dpi, which makes the second read a detector,
    not a better reader.** All three 27B-class models read it correctly at 200 dpi and wrongly
    at 300 dpi; the 9B was wrong at both. At 200 dpi the two letters merge into the shape of
    an `m`, which is right for this word but wrong for another: the 3.5 27B at 200 dpi wrote
    `bam` for `barn` on one page. A read at the other resolution disagrees in both cases, so
    a second read flags the ambiguous letter pair wherever it occurs, whichever reading is
    correct. The value is the flag, not the guess. The 3.6 and 3.8 at 200 dpi read both
    words correctly, so a stronger reader at that resolution may simply read these letters
    better; with one word of each kind the sample cannot tell the two explanations apart.
11. **qwen3-vl:8b is not viable.** It always writes a long reasoning trace (`think: false`
    is ignored), once spent its whole 16,384-token budget without answering, and scored
    34.1% word errors on the three pages it read.
12. **Granite-Docling cannot be driven through Docling's own pipeline via Ollama**, which
    strips the structure tags from its output. Called directly, it failed the rules anyway.
13. **A shared blind spot.** Every engine except the 27B-class models at 200 dpi read one
    surname as `rn` where the owner confirms `m`, including Gemma. The letter shapes are
    nearly identical at this print size.

## Owner review

Confirmed or corrected by the owner on 2026-11-22: the signatory named in the letterhead is
the signatory; a worn amount, two dates and a name on the worn letter were right as
transcribed; the table's other surnames and its date were right, and one surname is `m`
not `rn`; one word first transcribed as a typo is correctly "progressing" (an oddly shaped
n); two oddities in a report caption are as printed; the letterhead and reference-number
detail was low quality and is not important, so it is not scored; the pencil amount is
£3 12s 9d.

## Decision under the plan's rules

- **Quantitative rules** (key facts +5 points, word errors -20%, no more possibly invented
  words than the baseline): both `qwen3.5` models pass in every variant. `glm-ocr`
  (generic prompt) and `deepseek-ocr` ("Free OCR.") also pass.
- **Hallucination veto**: an engine that invents names, dates or amounts in illegible
  regions cannot be the default. `qwen3.5:9b` can still guess a faint handwritten amount,
  so by the plan's wording it is **vetoed as the default**, and the plan's fallback is to
  use it only as an escalation behind Tesseract.

### Recommended amendment (owner's decision)

The veto exists to stop *undetectable* fabrication. Findings 6, 7 and 10 show that detection
works far better with a second strong read at a different resolution than with Tesseract or
Gemma. The recommendation is to amend the rule and use:

- **`qwen3.6:27b`, strict prompt, 200 dpi, as the primary reader of scanned pages**: the
  lowest word error rate (0.8%), all key facts, and no guessed handwriting, at about 38
  seconds a page. Its stored text is the archive's text;
- **`qwen3.5:9b`, strict prompt, 200 dpi, as the second reader** of the same page (about 7
  seconds, fits on one GPU): words the two disagree on raise a document flag for review in
  the existing curation queue, with both readings kept, instead of passing silently. On this
  sample the pair disagreed on 0.4 words a page and caught the one real error in the 3.6's
  output. The reverse pairing (9B primary, 3.6 as checker) caught all three of the 9B's
  errors at 0.4 flags a page, 75% of them real: the reads disagree in the same places
  either way, so the flags are what matter;
- Tesseract kept only as the fallback when Ollama is unavailable, and the digital-page
  routing unchanged.

That is about 45 seconds a page, roughly 12 hours per thousand pages. The ranking among the
27B-class models is **not** established by eleven pages (finding 9), so this pairing should
be confirmed on a larger sample before the full ingest.

If the owner prefers to keep the veto as written, the plan's fallback applies: Tesseract as
the default, with `qwen3.5:9b` re-reading only pages that fail the quality gate. That gives
up most of the accuracy gain, and Tesseract is the weaker flagging tool.

`qwen3.5:9b` is also the model already chosen for the pipeline's three LLM roles, so using
it for OCR avoids a second resident model; the 27B would be loaded only for the ingestion
pass.

### Gemma 4 (12B and 26B)

Tested as alternative second readers on the suggestion that a different model family would
err differently. They did not: both share the surname error, add false alarms, and add
nothing over the 27B. The 26B fits the two GPUs slightly better than the Qwen 27B (16 GB, 20%
CPU against 17 GB, 24% CPU). Neither is recommended; `gemma4:31b` (19-20 GB, dense) would
fit worse than the Qwen 27B and was not tested.

### Still worth testing

- **A larger validation sample** (40-60 pages, with more handwriting and damaged pages) to
  rank the 27B-class models and measure real flag rates.
- **More readers or reads** (two prompts, two resolutions, strips of the page) as further
  flagging signals, now that time is free.

## Sharing the GPUs between interactive questions and ingestion

The owner wants the 9B to answer questions quickly while a 27B-class model reads documents
in idle time. Measured on this machine with Ollama in Docker, on one dense page (a 1960
letter that the 3.6 27B reads in 84 seconds with both GPUs to itself). One run per row.

| Layout | 27B page read | A 9B reply to a user | Needs |
| --- | --- | --- | --- |
| One Ollama, default | 84 s | 82.6 s: the question queues behind the read, then swaps | nothing |
| One Ollama, ingestion cancelled when a question arrives | 84 s | 6.4-6.5 s after the cancel (the swap), then 0.1 s while the 9B stays loaded | a scheduler in the service |
| Two Ollama instances: 9B on the 3080 Ti, 27B on the 3070 Ti and CPU | 166 s (about twice as slow) | 0.1 s throughout; realistic questions took 0.6-0.7 s | two Ollama services, configuration only |
| Two instances, the second allowed to use both cards | 160 s | 0.71 s on average, 1.72 s worst, against 0.61 s alone | no gain over the row above |

- **Swaps**: a single Ollama holds only one of the two models at a time. With the model files
  cached in memory a swap takes about 6.5 s to the 9B and 16 s back to the 27B; the first
  cold load of the 27B from disk took 103 s. An interruption therefore costs the abandoned
  page read plus the 16 s reload.
- **Cancelling**: dropping the HTTP connection stops the 27B at once, whether it is still
  processing the image or part-way through writing.
- **Configuration**: the processing and query models already have separate base URLs in
  `settings.json`, so the two-instance layout needs no code change, only two Ollama services
  with the GPUs pinned.
- **GPU loss**: during these tests the Ollama container lost access to the GPUs (`Failed to
  initialize NVML: Unknown Error`) and silently loaded models on the CPU until it was
  recreated. A real setup needs a health check on that.
- **Long calls**: the backend calls the processing service with a plain `fetch` and no explicit
  timeout, so Node's default timeouts (to be verified; five minutes for response headers)
  would cut off a multi-page document read at 40-80 seconds a page. Processing needs to
  become an asynchronous job under either layout.

Recommendation: start with two instances, which needs no scheduler, keeps the 9B instant
and halves ingestion speed (about 75-80 s a page, which the owner has said is acceptable).
For the large one-off ingest, optionally stop the query instance and run the 27B with both
GPUs. Add cancel-and-swap scheduling later only if it proves necessary.

## Limits of this result

- Eleven pages from five documents is enough to see large differences, not to rank close
  contenders; the Qwen models differ by a handful of words, and one model's score moved by
  about a percentage point with resolution alone.
- The cross-check evidence rests on 3 real errors for the 9B as primary (6 for the 27B);
  it needs a larger sample.
- The ground truth is one reader's transcription, reviewed by the owner.
- Handwriting was a small part of the sample.
- The test pages are clean photographs and good scans. Badly damaged originals were not
  represented.

## If the amendment is accepted

1. Record an ADR that supersedes the engine choice in ADR-011.
2. Add an `OCRService` adapter for vision models served by Ollama (page rendering, strict
   prompt, temperature 0, thinking off) with a second-reader option and one factory entry,
   as ADR-016 intends. Docling now ships output parsers for many OCR vision models, which
   may help for later candidates.
3. Derive a per-page confidence from the two readers' agreement so the quality gate keeps
   working, and add the review flag with both readings.
4. Keep Tesseract as the fallback if Ollama is unavailable.
5. Re-run this harness on a larger sample as the check before release.
