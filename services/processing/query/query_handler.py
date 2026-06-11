"""QueryHandler — orchestrator for the C3 query pipeline (ADR-040, ADR-042)."""

from dataclasses import dataclass

import structlog

from query.context_assembly import assemble_context
from query.interfaces.query_router import QueryRouter
from query.interfaces.search_result import DocumentMetadata, SearchResult
from query.query_understanding import run_query_understanding
from query.response_synthesis import SynthesisResult, synthesize_response
from shared.config import QueryContextAssemblyConfig, QueryVectorSearchConfig
from shared.generated.models import Result
from shared.interfaces.embedding_service import EmbeddingService
from shared.interfaces.http_client import HttpClientBase
from shared.interfaces.llm_service import LLMService


@dataclass
class _QueryHandlerConfig:
    """Narrow config view held by QueryHandler."""

    top_k: int
    token_budget: int
    include_parent_metadata: bool


class QueryHandler:
    """Orchestrates the full C3 query pipeline for a single query request.

    Injects all dependencies at construction so they can be replaced with
    fakes in tests. The single public method is ``handle()``.

    Phase 2 stub: ``_graph_search()`` raises ``NotImplementedError``.
    The ``PassthroughQueryRouter`` ensures it is never called in Phase 1.
    """

    def __init__(
        self,
        query_router: QueryRouter,
        llm_service: LLMService,
        embedding_service: EmbeddingService,
        http_client: HttpClientBase,
        vector_search_config: QueryVectorSearchConfig,
        context_assembly_config: QueryContextAssemblyConfig,
        log: structlog.BoundLogger,
    ) -> None:
        self._query_router = query_router
        self._llm_service = llm_service
        self._embedding_service = embedding_service
        self._http_client = http_client
        self._config = _QueryHandlerConfig(
            top_k=vector_search_config.TOP_K,
            token_budget=context_assembly_config.TOKEN_BUDGET,
            include_parent_metadata=context_assembly_config.INCLUDE_PARENT_METADATA,
        )
        self._log = log

    async def handle(self, query_text: str) -> SynthesisResult:
        """Run the full C3 query pipeline for the given query text.

        Steps:
        1. Route the query (always ``vector`` in Phase 1)
        2. Run query understanding via LLM
        3. Embed ``refined_search_terms``
        4. Call Express vector search
        5. Assemble context within the token budget
        6. Synthesise a cited response

        Returns:
            A ``SynthesisResult`` with ``no_results=True`` when vector search
            returns no matches, otherwise a response with citations.
        """
        log = self._log.bind(service="query_handler")

        # Step 1 — Route
        log.info("query_routing_started")
        route_decision = self._query_router.route(query_text)
        log.info("query_routing_completed", strategy=route_decision.strategy)

        # Step 2 — Query understanding
        understanding = await run_query_understanding(
            query_text=query_text,
            llm_service=self._llm_service,
            log=log,
        )

        # Step 3 — Embed refined_search_terms
        log.info("query_embedding_started")
        embedding_result = await self._embedding_service.embed(
            understanding.refined_search_terms
        )
        log.info("query_embedding_completed", dimension=embedding_result.dimension)

        # Step 4 — Vector search via Express (QUERY-001)
        log.info("vector_search_started", top_k=self._config.top_k)
        api_response = await self._http_client.vector_search(
            embedding=embedding_result.embedding,
            top_k=self._config.top_k,
        )
        search_results = self._map_search_results(api_response.results)
        log.info("vector_search_completed", result_count=len(search_results))

        # Step 5 — Assemble context
        assembled = assemble_context(
            results=search_results,
            token_budget=self._config.token_budget,
            include_parent_metadata=self._config.include_parent_metadata,
        )

        # Step 6 — Synthesise response
        result = await synthesize_response(
            assembled_context=assembled,
            query_text=query_text,
            llm_service=self._llm_service,
            log=log,
        )
        log.info(
            "query_pipeline_completed",
            no_results=result.no_results,
            citation_count=len(result.citations),
        )
        return result

    def _graph_search(self) -> None:
        """Phase 2 stub — graph traversal is not implemented in Phase 1 (QUERY-002).

        The ``PassthroughQueryRouter`` ensures this method is never called
        in Phase 1. It will be implemented when the ``LLMQueryRouter`` and
        graph strategy are introduced in Phase 2.
        """
        raise NotImplementedError(
            "_graph_search is a Phase 2 stub and is not callable in Phase 1"
        )

    @staticmethod
    def _map_search_results(results: list[Result]) -> list[SearchResult]:
        """Transform Express API results to internal SearchResult dataclasses.

        Converts camelCase generated-model fields to snake_case internal types.
        Empty ``documentType`` strings are normalised to ``None`` to match the
        ``str | None`` field on ``DocumentMetadata``.
        """
        mapped: list[SearchResult] = []
        for r in results:
            document_type = r.document.documentType
            mapped.append(
                SearchResult(
                    chunk_id=str(r.chunkId),
                    document_id=str(r.documentId),
                    text=r.text,
                    chunk_index=r.chunkIndex,
                    token_count=r.tokenCount,
                    similarity_score=r.similarityScore,
                    document=DocumentMetadata(
                        description=r.document.description,
                        date=r.document.date,
                        document_type=(document_type if document_type != "" else None),
                    ),
                )
            )
        return mapped
