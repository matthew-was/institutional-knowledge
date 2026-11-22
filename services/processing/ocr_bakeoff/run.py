"""Run candidate engines over the test pages and store their raw outputs.

    python -m ocr_bakeoff.run --data DIR --engines glm_ocr,qwen35_9b --runs 2

``DIR`` holds ``pages/<page>.png`` (the page images) and receives
``outputs/<engine>/<page>__run<N>.json``. Existing outputs are kept, so an
interrupted run resumes where it stopped.
"""

import argparse
import json
import sys
from pathlib import Path

from ocr_bakeoff.engines import Engine, build_engines
from shared.config import config

# Plain OCR engines are deterministic, so repeating them tells us nothing.
_DETERMINISTIC = {"docling_tesseract", "docling_auto", "tesseract"}


def page_images(data_dir: Path, only: set[str] | None = None) -> list[Path]:
    """The full-resolution page images, ignoring the half-size preview copies."""
    return sorted(
        path
        for path in (data_dir / "pages").glob("*.png")
        if not path.stem.endswith("_view") and (only is None or path.stem in only)
    )


def output_path(data_dir: Path, engine: str, page: str, run: int) -> Path:
    return data_dir / "outputs" / engine / f"{page}__run{run}.json"


def run_engine(
    engine: Engine, data_dir: Path, runs: int, only: set[str] | None = None
) -> None:
    repeats = 1 if engine.name in _DETERMINISTIC else runs
    for image in page_images(data_dir, only):
        for run in range(1, repeats + 1):
            target = output_path(data_dir, engine.name, image.stem, run)
            if target.exists():
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            try:
                result = engine.run(image)
            except Exception as exc:  # one bad page must not stop the whole run
                print(f"  FAILED {engine.name} {image.stem}: {exc!r}", flush=True)
                continue
            target.write_text(
                json.dumps(
                    {
                        "text": result.text,
                        "seconds": result.seconds,
                        "meta": result.meta,
                    },
                    ensure_ascii=False,
                    indent=1,
                )
            )
            print(
                f"  {engine.name:22s} {image.stem:22s} run{run} {result.seconds:6.1f}s",
                flush=True,
            )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--engines", required=True, help="comma-separated engine names")
    parser.add_argument("--runs", type=int, default=2, help="repeats for vision models")
    parser.add_argument(
        "--pages", default="", help="comma-separated page ids; default all"
    )
    parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    args = parser.parse_args(argv)

    available = build_engines(config.PROCESSING.OCR, args.ollama_url)
    wanted = [name.strip() for name in args.engines.split(",") if name.strip()]
    only = {p.strip() for p in args.pages.split(",") if p.strip()} or None
    unknown = [name for name in wanted if name not in available]
    if unknown:
        print(f"unknown engines: {unknown}; available: {sorted(available)}")
        return 2
    for name in wanted:
        print(f"== {name}", flush=True)
        run_engine(available[name], args.data, args.runs, only)
    return 0


if __name__ == "__main__":
    sys.exit(main())
