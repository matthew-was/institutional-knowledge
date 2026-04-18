"""LLM combined pass pipeline step — chunk post-processing (ADR-025, ADR-038)."""

from dataclasses import dataclass
from typing import Literal

import structlog

from shared.config import LLMConfig
from shared.interfaces.llm_service import ChunkResult, LLMCombinedResult, LLMService


@dataclass
class LLMCombinedPassResult:
    result: LLMCombinedResult | None
    step_status: Literal["completed", "failed"]
    error_message: str | None


def build_split_list(
    item_to_split: str, delimiter: str, config: LLMConfig
) -> list[str]:
    return_blocks: list[str] = []

    split_list = item_to_split.split(delimiter)

    tmp_text = ""

    for item in split_list:
        if (tmp_text == "" and len(item) > config.CHUNKING_MAX_TOKENS) or (
            len(tmp_text + delimiter + item) > config.CHUNKING_MAX_TOKENS
        ):
            if tmp_text != "":
                return_blocks.append(tmp_text)
                tmp_text = item
            else:
                return_blocks.append(item)
        else:
            if tmp_text == "":
                tmp_text = item
            else:
                tmp_text += delimiter + item

    if tmp_text != "":
        return_blocks.append(tmp_text)

    return return_blocks


def split_chunks(chunks: list[ChunkResult], config: LLMConfig) -> list[ChunkResult]:
    working_chunks: list[ChunkResult] = []

    for chunk in chunks:
        if len(chunk.text) <= config.CHUNKING_MAX_TOKENS:
            working_chunks.append(chunk)
        else:
            # split the chunk into smaller chunks
            paragraph_blocks = build_split_list(
                item_to_split=chunk.text, delimiter="\n\n", config=config
            )

            for paragraph in paragraph_blocks:
                if len(paragraph) <= config.CHUNKING_MAX_TOKENS:
                    working_chunks.append(
                        ChunkResult(text=paragraph, chunk_index=0, token_count=0)
                    )
                else:
                    sentence_blocks = build_split_list(
                        item_to_split=paragraph, delimiter=". ", config=config
                    )

                    for sentence in sentence_blocks:
                        character_blocks: list[str] = []
                        if len(sentence) < config.CHUNKING_MAX_TOKENS:
                            character_blocks.append(sentence)
                        else:
                            tmp_string = sentence
                            while len(tmp_string) > config.CHUNKING_MAX_TOKENS:
                                character_blocks.append(
                                    tmp_string[0 : config.CHUNKING_MAX_TOKENS]
                                )
                                tmp_string = tmp_string[config.CHUNKING_MAX_TOKENS :]

                            if tmp_string != "":
                                character_blocks.append(tmp_string)

                        for item in character_blocks:
                            working_chunks.append(
                                ChunkResult(text=item, chunk_index=0, token_count=0)
                            )

    return working_chunks


def merge_chunks(chunks: list[ChunkResult], config: LLMConfig) -> list[ChunkResult]:
    working_chunks = []

    i = 0
    while i < len(chunks):
        if len(chunks[i].text) >= config.CHUNKING_MIN_TOKENS:
            working_chunks.append(
                ChunkResult(text=chunks[i].text, chunk_index=0, token_count=0)
            )
            i += 1

        elif i + 1 == len(chunks):
            # last chunk case
            if (
                len(chunks[i].text) < config.CHUNKING_MIN_TOKENS
                and len(working_chunks) > 0
                and len(working_chunks[-1].text) + len(chunks[i].text)
                <= config.CHUNKING_MAX_TOKENS
            ):
                working_chunks[-1].text += " " + chunks[i].text
                i += 1
            else:
                working_chunks.append(
                    ChunkResult(text=chunks[i].text, chunk_index=0, token_count=0)
                )
                i += 1

        else:
            tmp_chunk = chunks[i].text
            j = i + 1
            while len(tmp_chunk) < config.CHUNKING_MIN_TOKENS and j < len(chunks):
                tmp_chunk += " " + chunks[j].text
                j += 1

            if (
                len(tmp_chunk) <= config.CHUNKING_MAX_TOKENS
                and len(working_chunks) > 0
                and len(working_chunks[-1].text) + len(tmp_chunk)
                <= config.CHUNKING_MAX_TOKENS
            ):
                working_chunks[-1].text += " " + tmp_chunk
                i = j

            else:
                working_chunks.append(
                    ChunkResult(text=tmp_chunk, chunk_index=0, token_count=0)
                )
                i = j

    return working_chunks


def run_llm_combined_pass(
    text: str,
    document_type: str | None,
    llm_service: LLMService,
    config: LLMConfig,
    log: structlog.BoundLogger,
) -> LLMCombinedPassResult:
    combined_pass = llm_service.combined_pass(text=text, document_type=document_type)

    if combined_pass is None:
        log.error("error processing llm combined_pass result, pass returned no data")
        return LLMCombinedPassResult(
            result=None,
            step_status="failed",
            error_message="combined_pass returned None",
        )

    chunks_split = split_chunks(chunks=combined_pass.chunks, config=config)

    chunks_merged = merge_chunks(chunks=chunks_split, config=config)

    indexed_chunks: list[ChunkResult] = []

    for i, chunk in enumerate(chunks_merged):
        indexed_chunks.append(
            ChunkResult(text=chunk.text, chunk_index=i, token_count=len(chunk.text))
        )

    combined_result = LLMCombinedResult(
        chunks=indexed_chunks,
        metadata_fields=combined_pass.metadata_fields,
        entities=combined_pass.entities,
        relationships=combined_pass.relationships,
    )

    log.debug(
        "processing llm combined pass successful", chunk_count=len(indexed_chunks)
    )

    return LLMCombinedPassResult(
        result=combined_result, step_status="completed", error_message=None
    )
