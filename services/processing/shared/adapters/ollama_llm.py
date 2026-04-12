"""
OllamaLLMAdapter — Phase 1 LLM implementation using the Ollama HTTP API.

ADR-038, ADR-042
"""

import json
from typing import Any

import httpx
import structlog
from pydantic import BaseModel, ValidationError

from shared.config import LLMConfig
from shared.interfaces.llm_service import (
    ChunkResult,
    EntityResult,
    LLMCombinedResult,
    LLMService,
    RelationshipResult,
)


class _ChunkResultModel(BaseModel):
    text: str
    chunk_index: int
    token_count: int


class _EntityResultModel(BaseModel):
    name: str
    type: str
    confidence: float
    normalised_name: str


class _RelationshipResultModel(BaseModel):
    source_entity_name: str
    target_entity_name: str
    relationship_type: str
    confidence: float


class _LLMCombinedResultModel(BaseModel):
    chunks: list[_ChunkResultModel]
    # metadata structure will be tightened in phase 2
    metadata_fields: dict[str, Any]
    entities: list[_EntityResultModel]
    relationships: list[_RelationshipResultModel]


class OllamaLLMAdapter(LLMService):
    def __init__(self, config: LLMConfig, log: structlog.BoundLogger) -> None:
        self._model = config.MODEL
        self._log = log.bind(service="ollama_client")
        self._client = httpx.Client(base_url=config.BASE_URL)

    def close(self) -> None:
        self._client.close()

    @staticmethod
    def _build_prompt(text: str, document_type: str | None) -> str:
        document_type_instruction = (
            f"The assumed document type is '{document_type}' — use this as your "
            f"starting point for `document_type` but replace it if you disagree."
            if document_type is not None
            else "Determine the document type from the content."
        )

        return f"""You are a document analysis assistant specialising in historical archive documents.

Analyse the document text provided and perform the following two passes:

**Pass 1 — Chunking**
Split the text into semantically meaningful chunks. Each chunk should represent a coherent unit of meaning. Estimate the token count for each chunk based on approximately 4 characters per token.

**Pass 2 — Entity and relationship extraction (per chunk)**
Within each chunk identify entities belonging to these types: People, Organisation, Organisation Role, Land Parcel / Field, Date / Event, Legal Reference.
For each entity found, examine whether a relationship exists between it and any other entity in the same chunk. Only use these relationship types: owned_by, transferred_to, witnessed_by, adjacent_to, employed_by, referenced_in, performed_by, succeeded_by. The source and target of each relationship should reflect the direction implied by the relationship type.

Return only a JSON object with exactly these four top-level keys and no other text:

chunks: array of objects, each with:
  - text: the chunk text
  - chunk_index: 0-based integer index
  - token_count: estimated token count
  If there is only one chunk, still return an array with one object. If there is no text return an empty array.

entities: array of objects, each with:
  - name: the entity reference as it appears in the text
  - type: the entity type from the list above
  - confidence: float 0.0–1.0, your confidence the entity and type are correct
  - normalised_name: lowercase version of name with all punctuation removed
  If there is only one entity, still return an array with one object. If no entities are found return an empty array.

relationships: array of objects, each with:
  - source_entity_name: the source entity name
  - target_entity_name: the target entity name
  - relationship_type: one of the relationship types listed above
  - confidence: float 0.0–1.0, your confidence in the relationship
  If there is only one relationship, still return an array with one object. If no relationships are found return an empty array.

metadata_fields: object with:
  - document_type: {document_type_instruction}
  - dates: list of Date / Event entity values found
  - people: list of People entity values found
  - land_references: list of Land Parcel / Field entity values found
  - organisations: list of Organisation entity values found
  - description: a description of the whole document in no more than 5 sentences

Document text:

{text}"""

    def combined_pass(
        self, text: str, document_type: str | None
    ) -> LLMCombinedResult | None:
        prompt = self._build_prompt(text, document_type)
        payload = {
            "prompt": prompt,
            "model": self._model,
            "stream": False,
            "format": "json",
        }

        try:
            response = self._client.post("/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()
            response_data = data.get("response")
            if response_data is None:
                return None
            json_data = json.loads(response_data)

            combined_result = _LLMCombinedResultModel.model_validate(json_data)

            return LLMCombinedResult(
                chunks=[
                    ChunkResult(
                        text=c.text,
                        chunk_index=c.chunk_index,
                        token_count=c.token_count,
                    )
                    for c in combined_result.chunks
                ],
                metadata_fields=combined_result.metadata_fields,
                entities=[
                    EntityResult(
                        name=e.name,
                        type=e.type,
                        confidence=e.confidence,
                        normalised_name=e.normalised_name,
                    )
                    for e in combined_result.entities
                ],
                relationships=[
                    RelationshipResult(
                        source_entity_name=r.source_entity_name,
                        target_entity_name=r.target_entity_name,
                        relationship_type=r.relationship_type,
                        confidence=r.confidence,
                    )
                    for r in combined_result.relationships
                ],
            )

        except httpx.TransportError as tra_err:
            self._log.error(
                "error in request to ollama service", error=type(tra_err).__name__
            )
            return None
        except httpx.HTTPStatusError as stat_err:
            self._log.error(
                "error returned from ollama service", error=type(stat_err).__name__
            )
            return None
        except json.JSONDecodeError as json_err:
            self._log.error(
                "error decoding json response", error=type(json_err).__name__
            )
            return None
        except ValidationError as pyd_err:
            self._log.error(
                "error validating json response", error=type(pyd_err).__name__
            )
            return None
