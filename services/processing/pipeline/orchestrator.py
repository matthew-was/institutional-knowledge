"""Pipeline orchestrator — single entry point for the C2 pipeline (ADR-027, ADR-042)."""

from dataclasses import dataclass, field
from typing import Literal
from uuid import UUID

import structlog

from pipeline.interfaces.completeness_scorer import MetadataCompletenessScorer
from pipeline.interfaces.metadata_extractor import (
    MetadataResult,
    PatternMetadataExtractor,
)
from pipeline.interfaces.ocr_service import OCRService
from pipeline.interfaces.pipeline_models import DocumentFlag
from pipeline.interfaces.text_quality_scorer import TextQualityScorer
from pipeline.steps.embedding_generation import (
    ChunkEmbedding,
    run_embedding_generation,
)
from pipeline.steps.llm_combined_pass import (
    LLMCombinedPassResult,
    run_llm_combined_pass,
)
from pipeline.steps.ocr_extraction import ExtractionResult, run_ocr_extraction
from shared.config import EmbeddingConfig, LLMConfig
from shared.generated.models import (
    ApiProcessingResultsPostRequest,
    Chunk,
    Entity,
    Flag,
    Metadata,
    Relationship1,
    Status5,
    StepResults,
)
from shared.interfaces.embedding_service import EmbeddingService
from shared.interfaces.http_client import HttpClientBase
from shared.interfaces.llm_service import EntityResult, LLMService, RelationshipResult

# Step name constants — these match the Express pipeline_steps table values.
STEP_TEXT_EXTRACTION = "text_extraction"
STEP_TEXT_QUALITY_SCORING = "text_quality_scoring"
STEP_PATTERN_METADATA_EXTRACTION = "pattern_metadata_extraction"
STEP_METADATA_COMPLETENESS_SCORING = "metadata_completeness_scoring"
STEP_LLM_COMBINED_PASS = "llm_combined_pass"
STEP_EMBEDDING_GENERATION = "embedding_generation"


@dataclass
class StepResult:
    status: Literal["completed", "failed"]
    error_message: str | None


@dataclass
class PreviousOutputs:
    extracted_text: str | None = None
    text_per_page: list[str] = field(default_factory=list)
    confidence_per_page: list[float] = field(default_factory=list)
    metadata: MetadataResult | None = None


@dataclass
class ProcessingRequest:
    """Internal request type for C2 pipeline processing (PROC-003)."""

    document_id: str
    file_reference: str
    incomplete_steps: list[str]
    previous_outputs: PreviousOutputs | None


@dataclass
class ProcessingResponse:
    """Internal response type for C2 pipeline results (PROC-002)."""

    document_id: str
    step_results: dict[str, StepResult]
    flags: list[DocumentFlag]
    metadata: MetadataResult | None
    chunks: list[ChunkEmbedding] | None
    entities: list[EntityResult] | None
    relationships: list[RelationshipResult] | None


class PipelineOrchestrator:
    """Sequences all six C2 pipeline steps and POSTs results to Express (ADR-027)."""

    def __init__(
        self,
        ocr_service: OCRService,
        quality_scorer: TextQualityScorer,
        metadata_extractor: PatternMetadataExtractor,
        completeness_scorer: MetadataCompletenessScorer,
        llm_service: LLMService,
        embedding_service: EmbeddingService,
        http_client: HttpClientBase,
        llm_config: LLMConfig,
        embedding_config: EmbeddingConfig,
        log: structlog.BoundLogger,
    ) -> None:
        self._ocr_service = ocr_service
        self._quality_scorer = quality_scorer
        self._metadata_extractor = metadata_extractor
        self._completeness_scorer = completeness_scorer
        self._llm_service = llm_service
        self._embedding_service = embedding_service
        self._http_client = http_client
        self._llm_config = llm_config
        self._embedding_config = embedding_config
        self._log = log

    async def process(self, request: ProcessingRequest) -> ProcessingResponse:
        """Run the C2 pipeline for one document and POST results to Express."""

        document_id = request.document_id
        log = self._log.bind(document_id=document_id)

        step_results: dict[str, StepResult] = {}
        all_flags: list[DocumentFlag] = []

        # ------------------------------------------------------------------ #
        # Step 1 — OCR extraction (re-entrancy: skip if already completed)
        # ------------------------------------------------------------------ #
        if STEP_TEXT_EXTRACTION in request.incomplete_steps:
            log.info("running step: text_extraction")
            extraction = run_ocr_extraction(
                file_path=request.file_reference,
                ocr_service=self._ocr_service,
                log=log,
            )
            step_results[STEP_TEXT_EXTRACTION] = StepResult(
                status=extraction.step_status,
                error_message=extraction.error_message,
            )
            all_flags.extend(extraction.document_flags)
        else:
            # Use previously extracted text supplied by Express (ADR-027)
            prev = request.previous_outputs
            text_per_page = prev.text_per_page if prev is not None else []
            confidence_per_page = prev.confidence_per_page if prev is not None else []
            extraction = ExtractionResult(
                text_per_page=text_per_page,
                confidence_per_page=confidence_per_page,
                extraction_method="previous",
                page_count=len(text_per_page),
                document_flags=[],
                step_status="completed",
                error_message=None,
            )

        # Flag gate: if step 1 produced any flags, halt pipeline
        if len(extraction.document_flags) > 0:
            log.info(
                "halting pipeline after step 1 due to flags",
                flag_count=len(extraction.document_flags),
            )
            response = self._build_response(
                document_id=document_id,
                step_results=step_results,
                flags=extraction.document_flags,
                metadata=None,
                chunks=None,
                entities=None,
                relationships=None,
            )
            await self._post_results(response)
            return response

        # ------------------------------------------------------------------ #
        # Step 2 — Text quality scoring
        # ------------------------------------------------------------------ #
        if STEP_TEXT_QUALITY_SCORING in request.incomplete_steps:
            log.info("running step: text_quality_scoring")
            quality_result = self._quality_scorer.score(
                text_per_page=extraction.text_per_page,
                confidence_per_page=extraction.confidence_per_page,
            )
            step_results[STEP_TEXT_QUALITY_SCORING] = StepResult(
                status="completed",
                error_message=None,
            )

            if not quality_result.passed_threshold:
                failing_pages = quality_result.failing_pages
                quality_flag = DocumentFlag(
                    type="quality_threshold_failure",
                    reason=(f"Pages {failing_pages} below quality threshold"),
                )
                all_flags.append(quality_flag)
                log.info(
                    "quality threshold not met; recording flag and continuing",
                    failing_pages=failing_pages,
                )

        # ------------------------------------------------------------------ #
        # Step 3 — Pattern metadata extraction
        # ------------------------------------------------------------------ #
        full_text = "\n".join(extraction.text_per_page)
        if STEP_PATTERN_METADATA_EXTRACTION in request.incomplete_steps:
            log.info("running step: pattern_metadata_extraction")
            metadata_result = self._metadata_extractor.extract(
                text=full_text, document_type_hint=None
            )
            step_results[STEP_PATTERN_METADATA_EXTRACTION] = StepResult(
                status="completed",
                error_message=None,
            )
        else:
            # Use previous metadata from Express if step 3 already ran
            prev = request.previous_outputs
            if prev is not None and prev.metadata is not None:
                metadata_result = prev.metadata
            else:
                metadata_result = MetadataResult(
                    document_type=None,
                    dates=[],
                    people=[],
                    organisations=[],
                    land_references=[],
                    description=None,
                    detection_confidence={},
                )

        # ------------------------------------------------------------------ #
        # Step 4 — Metadata completeness scoring
        # ------------------------------------------------------------------ #
        completeness_flag: DocumentFlag | None = None
        if STEP_METADATA_COMPLETENESS_SCORING in request.incomplete_steps:
            log.info("running step: metadata_completeness_scoring")
            completeness_result = self._completeness_scorer.score(
                metadata_result=metadata_result
            )
            step_results[STEP_METADATA_COMPLETENESS_SCORING] = StepResult(
                status="completed",
                error_message=None,
            )

            if not completeness_result.passed_threshold:
                completeness_flag = DocumentFlag(
                    type="completeness_threshold_failure",
                    reason=(
                        f"Metadata completeness score "
                        f"{completeness_result.score:.1f} below threshold; "
                        f"missing fields: {completeness_result.missing_fields}"
                    ),
                )

        # Combined flag rule (US-039, UR-055): if BOTH text quality AND completeness
        # failed in this run, merge into a single flag with both reasons.
        quality_flags = [f for f in all_flags if f.type == "quality_threshold_failure"]
        if quality_flags and completeness_flag is not None:
            combined_reason = quality_flags[0].reason + "; " + completeness_flag.reason
            all_flags = [f for f in all_flags if f.type != "quality_threshold_failure"]
            all_flags.append(
                DocumentFlag(
                    type="quality_and_completeness_failure",
                    reason=combined_reason,
                )
            )
        elif completeness_flag is not None:
            all_flags.append(completeness_flag)

        # ------------------------------------------------------------------ #
        # Step 5 — LLM combined pass
        # ------------------------------------------------------------------ #
        llm_pass_result: LLMCombinedPassResult | None = None
        if STEP_LLM_COMBINED_PASS in request.incomplete_steps:
            log.info("running step: llm_combined_pass")
            llm_pass_result = await run_llm_combined_pass(
                text=full_text,
                document_type=metadata_result.document_type,
                llm_service=self._llm_service,
                config=self._llm_config,
                log=log,
            )
            step_results[STEP_LLM_COMBINED_PASS] = StepResult(
                status=llm_pass_result.step_status,
                error_message=llm_pass_result.error_message,
            )

        # ------------------------------------------------------------------ #
        # Step 6 — Embedding generation
        # ------------------------------------------------------------------ #
        chunks: list[ChunkEmbedding] | None = None
        entities: list[EntityResult] | None = None
        relationships: list[RelationshipResult] | None = None

        if STEP_EMBEDDING_GENERATION in request.incomplete_steps:
            if llm_pass_result is not None and llm_pass_result.result is not None:
                log.info("running step: embedding_generation")
                embedding_result = await run_embedding_generation(
                    llm_result=llm_pass_result.result,
                    embedding_service=self._embedding_service,
                    embedding_dimension=self._embedding_config.DIMENSION,
                    log=log,
                )
                step_results[STEP_EMBEDDING_GENERATION] = StepResult(
                    status=embedding_result.step_status,
                    error_message=embedding_result.error_message,
                )
                if embedding_result.step_status == "completed":
                    chunks = embedding_result.embeddings
                    entities = llm_pass_result.result.entities
                    relationships = llm_pass_result.result.relationships

        # ------------------------------------------------------------------ #
        # Description overwrite precedence (OQ-5):
        #   1. LLM step 5 description (if available in metadata_fields)
        #   2. Step 3 pattern extraction description
        #   3. Previous outputs description (intake description)
        # ------------------------------------------------------------------ #
        final_description = metadata_result.description
        if llm_pass_result is not None and llm_pass_result.result is not None:
            llm_description = llm_pass_result.result.metadata_fields.get("description")
            if llm_description is not None and str(llm_description).strip() != "":
                final_description = str(llm_description)

        if final_description is None:
            prev = request.previous_outputs
            if prev is not None and prev.metadata is not None:
                final_description = prev.metadata.description

        # Build the final metadata with the resolved description
        resolved_metadata = MetadataResult(
            document_type=metadata_result.document_type,
            dates=metadata_result.dates,
            people=metadata_result.people,
            organisations=metadata_result.organisations,
            land_references=metadata_result.land_references,
            description=final_description,
            detection_confidence=metadata_result.detection_confidence,
        )

        log.info(
            "pipeline processing complete",
            step_count=len(step_results),
            flag_count=len(all_flags),
        )

        response = self._build_response(
            document_id=document_id,
            step_results=step_results,
            flags=all_flags,
            metadata=resolved_metadata,
            chunks=chunks,
            entities=entities,
            relationships=relationships,
        )
        await self._post_results(response)
        return response

    def _build_response(
        self,
        document_id: str,
        step_results: dict[str, StepResult],
        flags: list[DocumentFlag],
        metadata: MetadataResult | None,
        chunks: list[ChunkEmbedding] | None,
        entities: list[EntityResult] | None,
        relationships: list[RelationshipResult] | None,
    ) -> ProcessingResponse:
        return ProcessingResponse(
            document_id=document_id,
            step_results=step_results,
            flags=flags,
            metadata=metadata,
            chunks=chunks,
            entities=entities,
            relationships=relationships,
        )

    async def _post_results(self, response: ProcessingResponse) -> None:
        """Convert internal ProcessingResponse to the generated model and POST."""

        # Convert step_results to generated model
        step_results_api: dict[str, StepResults] = {}
        for step_name, result in response.step_results.items():
            step_results_api[step_name] = StepResults(
                status=(
                    Status5.completed
                    if result.status == "completed"
                    else Status5.failed
                ),
                errorMessage=result.error_message or "",
            )

        # Convert flags
        flags_api = [Flag(type=f.type, reason=f.reason) for f in response.flags]

        # Build metadata — use empty defaults when pipeline halted early
        meta = response.metadata
        metadata_api = Metadata(
            documentType=meta.document_type or "" if meta is not None else "",
            dates=meta.dates if meta is not None else [],
            people=meta.people if meta is not None else [],
            organisations=meta.organisations if meta is not None else [],
            landReferences=(meta.land_references if meta is not None else []),
            description=meta.description or "" if meta is not None else "",
        )

        # Convert chunks
        chunks_api: list[Chunk] = []
        if response.chunks is not None:
            for chunk in response.chunks:
                chunks_api.append(
                    Chunk(
                        chunkIndex=chunk.chunk_index,
                        text=chunk.text,
                        tokenCount=(chunk.token_count if chunk.token_count > 0 else 1),
                        embedding=chunk.embedding,
                    )
                )

        # Convert entities
        entities_api: list[Entity] = []
        if response.entities is not None:
            for ent in response.entities:
                entities_api.append(
                    Entity(
                        name=ent.name,
                        type=ent.type,
                        confidence=ent.confidence,
                        normalisedName=ent.normalised_name,
                    )
                )

        # Convert relationships
        relationships_api: list[Relationship1] = []
        if response.relationships is not None:
            for rel in response.relationships:
                relationships_api.append(
                    Relationship1(
                        sourceEntityName=rel.source_entity_name,
                        targetEntityName=rel.target_entity_name,
                        relationshipType=rel.relationship_type,
                        confidence=rel.confidence,
                    )
                )

        payload = ApiProcessingResultsPostRequest(
            documentId=UUID(response.document_id),
            stepResults=step_results_api,
            flags=flags_api,
            metadata=metadata_api,
            chunks=chunks_api,
            entities=entities_api,
            relationships=relationships_api,
        )

        await self._http_client.post_processing_results(payload=payload)
