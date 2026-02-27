# Metadata Schema and Entity Extraction

This skill encodes the vocabulary and knowledge graph schema for the Institutional Knowledge archive system. It defines entity types, relationship types, how entities are extracted from documents, and how they are stored in the database.

---

## When to use

Use this skill when implementing:

- The C2 pipeline (text extraction, processing, embedding) — specifically the LLM combined pass that extracts entities and relationships
- The vocabulary management system (curation UI, vocabulary review queue, deduplication)
- The knowledge graph storage and query interface (`GraphStore`)
- Database migrations for vocabulary and graph tables
- Testing the entity extraction and vocabulary workflow end-to-end

---

## Core Concepts

### Living Vocabulary

The vocabulary is **not static**. Instead, it grows through three pathways:

1. **Seed vocabulary** — Initial controlled vocabulary shipped with the system (populated at deployment)
2. **Manual additions** — Curator explicitly adds terms during curation sessions
3. **LLM-extracted entities** — Entities automatically extracted from documents by the LLM, proposed to the curator for review

The curator is the gatekeeper: they review LLM-extracted entities in the vocabulary review queue, accept them (moving to the controlled vocabulary), reject them (moving to the rejected list), or defer them for later review.

### Unified Vocabulary / Graph Schema

The **vocabulary and knowledge graph are stored in the same tables**. An entity named in a document is both:

- A **vocabulary term** (eligible for review, curation, and inclusion in the controlled vocabulary)
- A **graph entity** (traversable as a node in the knowledge graph)

This unification means entity names are normalised and deduplicated from the start, and vocabulary curation decisions automatically affect graph traversals.

---

## Pattern vs. Phase 1 Examples

**IMPORTANT**: This skill describes a *pattern and architecture*, not a fixed schema. The entity types and relationship types listed below are Phase 1 examples for a family estate archive. Different institutions will have different entity and relationship types. What matters is understanding:

- How entities are extracted and deduplicated
- How relationships are stored and traversed
- How the curator controls what enters the vocabulary
- How the schema scales to domain-specific needs

**When implementing for a different institution**, use the entity and relationship type discovery process described later in this skill to identify the appropriate types for that domain.

---

## Entity Types

### Universal Pattern

Every institution has entities—named things in documents that form a knowledge graph. The extraction and storage pattern is the same regardless of domain:

1. **Extract** entities from document text via LLM
2. **Normalise** entity names to catch variations ("John Smith" = "john smith" = "Smith, John")
3. **Deduplicate** against existing vocabulary (and rejected terms)
4. **Store** in `vocabulary_terms` with confidence scores and source provenance
5. **Curator reviews** and accepts/rejects entities
6. **Graph queries** traverse relationships between accepted entities

The entity *types* (People, Organisation, Location, etc.) are domain-specific and discovered during implementation.

### Phase 1 Example (Family Estate Archive)

For the current project, the following entity types are extracted by the LLM combined pass in C2:

| Type | Description | Examples |
| --- | --- | --- |
| **People** | Individuals named in documents | John Smith, Jane Doe, Lord Blackstone |
| **Organisation** | Companies, solicitors, councils, estate agents, service providers | Cluttons (Estate Agent), Smiths-Gore, Savills, HM Land Registry, Parish Council |
| **Organisation Role** | A role or function that organisations perform (stable across time even as the organisations holding the role change) | Estate Management, Legal Services, Land Agency, Surveying |
| **Land Parcel / Field** | Named fields, plots, parcels, boundaries (typically tied to a specific estate or property) | East Meadow, South Field, Ten Acre Plantation, Walled Garden |
| **Date / Event** | Significant dated events recorded in documents | Death of Estate Owner (1974), Boundary Change (1998), Transfer of Title (1952) |
| **Legal Reference** | Document references, deed numbers, planning references, registration numbers | Deed Poll No. 1234, Conveyance 15 July 1974, Planning Ref: ABC/2001/56 |

**These examples are specific to estates and family archives. Other institutions will identify different entity types during their entity type discovery process (see below).**

### Extraction Properties (Universal)

All extracted entities have:

- **Name** — The canonical text of the entity
- **Normalised name** — Lowercase, punctuation stripped; used for deduplication across variations
- **Type** — Domain-specific category (e.g. "Person", "Location", "Artefact", "Event")
- **Confidence** — LLM's extraction confidence (0.0–1.0); indicates quality for curator prioritisation
- **Source** — How the entity entered the system (`seed`, `manual`, `llm_extracted`, `candidate_accepted`)
- **Aliases** — Array of alternate names for the same entity (e.g. "Cluttons" ≈ "Cluttons Estate Agents")
- **Category** — Optional grouping for UI filtering (e.g. "Solicitor", "Land Feature", "Legal Service")

---

### Entity Type Discovery for Other Institutions

When implementing this system for a new institution, identify entity types by:

1. **Read sample documents** from the archive (5–10 representative documents)
2. **Manually annotate** key entities in each document (don't use the LLM yet; do it by hand)
3. **Group entities by category** — What kinds of things appear repeatedly?
   - For a university archive: People (researchers, administrators), Organisations (departments, funding bodies), Publications, Grants, Events
   - For a hospital archive: People (patients, staff), Organisations (departments, external providers), Treatments, Medical Conditions, Equipment
   - For a government archive: People (officials), Organisations (agencies, contractors), Locations (jurisdictions, landmarks), Regulations, Events
4. **Define 5–8 core types** — Start narrow and expand if needed
5. **Write definitions** — One sentence per type, clear and unambiguous
6. **Test the LLM prompt** with a few documents to see if the types capture what matters
7. **Iterate** — Refine after seeing real extraction results

The goal is entity types that are **relevant to the curator's questions** and **reliably extractable by the LLM**. Avoid overly specific types (e.g. "Victorian Novel" vs. "Publication") unless your corpus really requires that granularity.

---

## Relationship Types

### Universal Pattern

Relationships are **directional edges between entities** in the knowledge graph. The pattern is universal:

- Each relationship has a `source_entity`, `target_entity`, and `relationship_type`
- Relationship types are domain-specific and discovered during implementation
- All relationships are stored in the same `vocabulary_relationships` table
- Traversal queries can move forward (source → target) or backward (target ← source)
- Relationships are always evidenced by documents (via `entity_document_occurrences`)

The specific relationship *types* depend on the institution's knowledge questions.

### Phase 1 Example (Family Estate Archive)

The following relationship types connect entities in the family estate knowledge graph:

| Type | Direction | Description |
| --- | --- | --- |
| `owned_by` | Land Parcel → Person / Organisation | Records ownership of land by an individual or organisation |
| `transferred_to` | Land Parcel (from Person) → Land Parcel (to Person) | Records a transfer of land ownership between two parties |
| `witnessed_by` | Document → Person | Person witnessed or signed a document |
| `adjacent_to` | Land Parcel → Land Parcel | Records spatial adjacency of parcels (useful for boundary queries) |
| `employed_by` | Person → Organisation | Person employed by or associated with an organisation |
| `referenced_in` | Entity → Document | Entity is mentioned in a document (generic reference, not ownership/employment) |
| `performed_by` | Organisation Role → Organisation | An organisation holds or has held a specific role (e.g. Estate Management) |
| `succeeded_by` | Organisation → Organisation | Corporate succession: one organisation replaced another (e.g. Cluttons → Smiths-Gore → Savills) |

**Relationship properties** (universal):

- Relationships are **bidirectional** in the data model (the same `vocabulary_relationships` row can be traversed from either direction via `source_term_id` and `target_term_id`)
- Relationships do **not** have date fields. Temporal context comes from the **source documents** attached to each relationship (see `entity_document_occurrences` below). This avoids encoding fuzzy or conflicting historical dates into the graph schema
- Each relationship has a `relationship_type` field (text) that can be extended as new relationship types are discovered during curation

### Relationship Type Discovery for Other Institutions

When implementing this system for a new institution, identify relationship types by:

1. **Read sample documents** and manually identify significant connections between entities
   - In a university archive: researcher → publication, researcher → grant, department → researcher
   - In a hospital archive: patient → treatment, doctor → patient, condition → treatment
   - In a government archive: official → regulation, agency → jurisdiction, regulation → event
2. **Ask: what questions will the curator ask?**
   - "Find all publications by this researcher" → `authored_by` relationship
   - "Find all treatments for this condition" → `treats` relationship
   - "Find all officials in this agency" → `employed_by` relationship
3. **Start with 5–8 core relationships** — More can be added during curation
4. **Test the LLM prompt** to see if the LLM can reliably extract these relationships from sample documents
5. **Iterate** — Curator feedback during Phase 1 will reveal missing relationship types

Example question-to-relationship mapping:

| Question | Entity Types | Relationship Types Needed |
| --- | --- | --- |
| "Who managed the estate?" | Person, Organisation, Role | `performed_by`, `employed_by` |
| "What land did this person own?" | Person, Land Parcel | `owned_by` (reversed) |
| "Who witnessed this deed?" | Document, Person | `witnessed_by` (reversed) |
| "What changed hands between these families?" | Person, Land Parcel | `transferred_to` |

The goal is a relationship type set that **enables the curator's most important questions** without being exhaustive. New relationship types can be added at any time—they're just new values in the `relationship_type` column.

---

## Database Schema

### `vocabulary_terms` Table

Stores all controlled vocabulary terms and LLM-extracted entities.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | UUID v7 | No | Primary key; sortable by time |
| `term` | text | No | The canonical name of the entity (e.g. "John Smith", "East Meadow") |
| `normalised_term` | text | No | Generated column: lowercase, punctuation stripped. Used for deduplication matching |
| `category` | text | Yes | UI grouping and filtering; optional (e.g. "Solicitor", "Land Feature") |
| `description` | text | Yes | Human-readable description added by curator |
| `aliases` | text[] | Yes | Array of alternate names; e.g. `["J. Smith", "John Richard Smith"]` |
| `source` | enum | No | Origin: `seed`, `manual`, `candidate_accepted`, or `llm_extracted` |
| `confidence` | float | Yes | LLM's extraction confidence (0.0–1.0); `NULL` for seed/manual terms |
| `created_at` | timestamp | No | When the term was created |
| `updated_at` | timestamp | No | When the term was last modified |

**Deduplication logic** (UR-093):

When the LLM extracts an entity, Express checks the `vocabulary_terms` table:

1. Compute `normalised_term` for the extracted entity (same logic: lowercase, strip punctuation)
2. Query `vocabulary_terms` WHERE `normalised_term = computed_value`
   - **If found**: The entity is a duplicate; write the `entity_document_occurrences` row linking the existing term to this document
   - **If not found**: Create a new `vocabulary_terms` row with `source: llm_extracted`
3. Also check `rejected_terms` WHERE `normalised_term = computed_value` to prevent re-proposing rejected entities

---

### `vocabulary_relationships` Table

Stores relationships between vocabulary terms (including graph edges).

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | UUID v7 | No | Primary key |
| `source_term_id` | UUID | No | FK to `vocabulary_terms` |
| `target_term_id` | UUID | No | FK to `vocabulary_terms` |
| `relationship_type` | text | No | e.g. `owned_by`, `employed_by`, `performed_by` |
| `created_at` | timestamp | No | When the relationship was created |
| `updated_at` | timestamp | No | When the relationship was last modified |

**Constraints**:

- Foreign keys on both `*_term_id` columns with appropriate CASCADE or RESTRICT behavior (defined in ADR-028)
- Unique constraint on `(source_term_id, target_term_id, relationship_type)` to prevent duplicate relationships

**Traversal**:

Relationships are **bidirectional in queries** — you can traverse from either end:

- Forward: source → target (e.g. find all land parcels owned by John Smith: `owned_by` from source=John to target=Land Parcel)
- Reverse: target ← source (e.g. find who owns East Meadow: reverse `owned_by` from target=East Meadow to source=Person)

---

### `entity_document_occurrences` Table

Tracks every document in which each entity appears. This is the universal source of truth for entity-document provenance.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `entity_id` | UUID | No | FK to `vocabulary_terms` |
| `document_id` | UUID | No | FK to `documents` |
| `created_at` | timestamp | No | When this link was first recorded |

**How it's populated**:

- **For LLM-extracted entities**: When the LLM combined pass returns entities for a document, Express writes one row per entity-document pair (handled in the processing results transaction, ADR-031)
- **For seeded/manual entities**: Initially empty; links accumulate as documents are processed and the LLM extracts matching entity names
- **For curator override**: The curation UI can manually insert a row to associate a seeded entity with a known source document

**Why it's separate from `vocabulary_terms`**:

Normalised deduplication means one `vocabulary_terms` row represents all variations of an entity (e.g. "John Smith", "J. Smith", "Smith, John"). Without this join table, you would lose the information that "John Smith" appeared in documents A, B, and C. The join table keeps that provenance while keeping `vocabulary_terms` clean and deduplicated.

---

### `rejected_terms` Table

Prevents re-proposing rejected entities.

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | UUID | No | Primary key |
| `normalised_term` | text | No | The normalised form (unique index) |
| `original_term` | text | No | The exact text the curator rejected |
| `rejected_at` | timestamp | No | When the rejection occurred |

When a curator rejects an LLM-extracted entity, Express:

1. Moves the `vocabulary_terms` row to `rejected_terms`
2. Adds a unique index on `normalised_term` in `rejected_terms`
3. Future LLM extraction checks `rejected_terms` before proposing entities

---

## Entity Extraction Workflow

### How Entities Are Extracted (C2 Pipeline Step 5)

The LLM combined pass is a single LLM call that returns:

1. **Chunk boundaries and labels** — parsed by C2 and stored in `text_chunks`
2. **Metadata fields** — date range, document type, people, organisations, land references (discarded in Phase 1 per ADR-036)
3. **Graph entities** — entity name, type, and confidence score
4. **Graph relationships** — (source entity, target entity, relationship type, confidence)

**Prompt design** (framework, not exact text):

```text
Given this document chunk:
[chunk text]

Extract:
1. Entities: List each entity as {type, name, confidence (0.0-1.0)}
2. Relationships: List each relationship as {source_entity_name, target_entity_name, relationship_type, confidence}

Use these entity types: [list of types from above]
Use these relationship types: [list of types from above]

Prioritise confidence and specificity. If unsure about an entity, mark low confidence.
```

**Key point**: The LLM prompt is **configured with both entity types AND relationship types**. When implementing for a different institution, you reconfigure the prompt with your domain's entity and relationship types. The LLM uses these type lists to classify what it extracts—it does not invent new types beyond what you tell it to look for.

The LLM returns structured JSON containing both entities and relationships; C2 parses it and returns both to Express.

### Entity Ingestion (Express Transaction)

When Express receives processing results from C2 (including entities and relationships), it:

1. **For each entity**:
   - Compute `normalised_term` (lowercase, strip punctuation)
   - Check `vocabulary_terms WHERE normalised_term = computed_value`
   - If found: use the existing `vocabulary_terms.id`; write `entity_document_occurrences` row
   - If not found: create a new `vocabulary_terms` row with `source: llm_extracted`, `confidence: <LLM confidence>`, and then write `entity_document_occurrences`
   - Check `rejected_terms WHERE normalised_term = computed_value` to skip rejected entities

2. **For each relationship**:
   - Resolve both entity names to their `vocabulary_terms.id` via deduplication
   - Insert or update the `vocabulary_relationships` row with the resolved IDs and `relationship_type`

3. **Commit**: All writes are part of the same transaction (ADR-031). If any write fails, the entire processing result is rolled back.

---

## Synthetic Entities

### What Are Synthetic Entities?

A **synthetic entity** is one created by the curator that does not appear as a named thing in any single document, but emerges from the pattern of relationships across multiple documents.

**Example from a family estate:**

The patriarch owns "East Meadow", "South Field", and "Ten Acre Plantation" individually. On his death, the will transfers all three parcels jointly to two children. The legal documents refer to "Child A" and "Child B" separately—they always appear as individual names. However, from the curator's perspective, for queries like "What land is held jointly?" or "Track joint ownership over time?", it's valuable to create a synthetic entity: "Child A & Child B Joint Partnership" or "The Children's Partnership". This entity:

- Does not appear in any document
- Is created by the curator's manual addition
- Has `source: manual` in the vocabulary
- Has two `owned_by` relationships from each child to the land parcels
- Can have a synthetic relationship `owned_by` (from the synthetic entity to the land parcels) for query convenience

**Example from a university archive:**

Researchers publish as "Smith, J.", "Smith, Jane", and "Jane Smith" across different papers. The LLM extracts these as separate entities initially (they hit deduplication, so they resolve to one person). However, the curator discovers the researcher also publishes under "J.E. Smith-Jones" when married. The curator creates a synthetic entity "Smith-Jones, Jane E." as an alias/synthetic identity that connects all publications, with a relationship `published_under` or `also_known_as`.

### When to Create Synthetic Entities

Consider creating synthetic entities when:

1. **Multiple entities have the same relationship to a single target** — Two children both own the same land; create a synthetic "Joint Owners" entity
2. **Temporal phases of a single concept** — A company name changes; create a synthetic "Company Name Evolution" or track via `succeeded_by` relationships (depends on your needs)
3. **Groupings that matter for queries** — All researchers in a lab; create "Lab Members" as a synthetic organisation role
4. **Abstract relationships** — A synthetic "Boundary Dispute" entity connects multiple land parcels and people involved in a conflict
5. **Bridging concepts** — Two organisations collaborate; create a synthetic "Partnership" entity with relationships to both

### How Synthetic Entities Work in the Schema

Synthetic entities use the same `vocabulary_terms` table with:

- **`source: manual`** — They are created by curator action, not extracted by the LLM
- **Confidence: `NULL`** — They have no LLM confidence score (curator explicitly created them)
- **No `entity_document_occurrences` rows initially** — They exist in the vocabulary but may not be linked to documents. The curator can optionally link them to founding documents (e.g. "The partnership agreement is in Document X")
- **Aliases** — Can include alternate names or historical names (e.g. a synthetic "Partnership" might have aliases representing how it's referred to in different contexts)

In the relationship graph, synthetic entities connect real entities:

```text
Land Parcel ─owned_by→ Child A
Land Parcel ─owned_by→ Child B
Land Parcel ─owned_by→ [Synthetic: Joint Partnership]  ← curator-created link for query convenience
```

When traversing: "Who owns this land?" returns both Child A, Child B, AND the synthetic partnership (if you set up the relationships that way).

### Discovering Synthetic Entity Needs During Phase 1

Pay attention to curator feedback like:

- "I keep looking for all land owned together by these two people"
- "This company is referred to by three different names; it's hard to track"
- "There's a consistent group of people who always appear together in disputes"

These are signals that synthetic entities would improve query performance and curator experience.

### Implementation Notes

1. **UI affordance**: The curation UI should make it easy to create synthetic entities (button: "Create synthetic entity")
2. **Naming convention**: Consider prefixing synthetic entities (e.g. "[Synthetic] Joint Partnership") so they're visually distinct
3. **Documentation**: When a curator creates a synthetic entity, encourage them to add a description explaining why it was created
4. **Graph rebuild**: Synthetic entities are included in the graph rebuild alongside human-reviewed vocabulary

---

## Curation Workflow

### The Review Queue

The vocabulary review queue shows all terms awaiting curator action:

1. **Source**: terms with `source IN ('candidate_accepted', 'llm_extracted')`
2. **Default filter**: Hide low-confidence entities (< 0.3) and show terms awaiting explicit review
3. **Actions**: Accept, Reject, Defer

### Curator Actions

**Accept**: Change `source` from `llm_extracted` to `candidate_accepted`. This moves the entity into the controlled vocabulary.

**Reject**: Delete the `vocabulary_terms` row and insert into `rejected_terms`. The `normalised_term` is marked to prevent re-proposal. (Implementation: Either soft-delete on `vocabulary_terms` or move to `rejected_terms` — choose one pattern at implementation time.)

**Defer**: Leave as `llm_extracted` and move to the next term. The curator can return to it later.

### Graph Rebuild Trigger

After curation, the curator triggers a batch graph rebuild (via UI button or CLI). This:

1. Reads all `vocabulary_terms` with `source IN ('seed', 'manual', 'candidate_accepted')`
2. Reads all corresponding `vocabulary_relationships`
3. Writes the graph structure via the `GraphStore` interface (ADR-037, ADR-039)
4. Is idempotent — running multiple times produces the same result

**Note**: The graph is only built from accepted entities. LLM-extracted entities (`source: llm_extracted`) that remain in the review queue are explicitly excluded — they do not appear in graph traversals until the curator accepts them. This is the human-in-the-loop gate (ADR-014, ADR-039).

---

## Implementation Notes

### Seed File Structure

The seed vocabulary (Knex.js seed file) is human-readable and simple:

```javascript
// seeds/01_vocabulary.js

exports.seed = async (knex) => {
  // Clear existing (development only)
  await knex('vocabulary_terms').del()
  await knex('vocabulary_relationships').del()

  // Seed initial vocabulary
  const terms = [
    {
      id: 'uuid-for-john-smith',
      term: 'John Smith',
      category: 'People',
      description: 'Estate owner, mid-20th century',
      aliases: ['J. Smith', 'John Richard Smith'],
      source: 'seed',
    },
    {
      id: 'uuid-for-east-meadow',
      term: 'East Meadow',
      category: 'Land Feature',
      description: 'Primary field on the eastern boundary',
      source: 'seed',
    },
    // ... more terms
  ]

  await knex('vocabulary_terms').insert(terms)

  // Seed relationships
  const relationships = [
    {
      source_term_id: 'uuid-for-john-smith',
      target_term_id: 'uuid-for-east-meadow',
      relationship_type: 'owned_by',
    },
    // ... more relationships
  ]

  await knex('vocabulary_relationships').insert(relationships)
}
```

**Seeded entities start with no `entity_document_occurrences` rows**. Document links accumulate naturally as the LLM processes documents and extracts matching entity names, or via curator override.

### Curation UI Filtering

The curation UI should provide filters:

- **By source**: Show seed, manual, llm_extracted, candidate_accepted (configurable)
- **By confidence**: Hide low-confidence entities (slider)
- **By category**: Filter to specific categories (People, Organisation, etc.)
- **By review status**: Show awaiting review, deferred, accepted

### Entity Deduplication in Detail

The normalised term matching is critical for accuracy:

```text
Input: "John Richard Smith"
Normalised: "john richard smith"

Input: "john smith"
Normalised: "john smith"

Input: "Smith, John"
Normalised: "smith john"
```

These would **not** deduplicate with the simple normalisation. The production implementation should:

1. Lowercase
2. Remove punctuation and extra spaces
3. Consider more sophisticated matching (e.g. trigram similarity, Levenshtein distance) for partial matches if needed
4. **Document the matching algorithm** in the code and this skill for future implementers

### Confidence Filtering Thresholds

The LLM's confidence scores should inform UI defaults:

- **0.9–1.0**: High confidence — show by default
- **0.7–0.9**: Good confidence — show by default
- **0.5–0.7**: Medium confidence — show but highlight for review
- **0.0–0.5**: Low confidence — hide by default, available via "show all"

Adjust thresholds based on real data during Phase 1.

---

## Related Skills and ADRs

- **ADR-028**: Vocabulary Schema (full schema definition and Knex.js migration strategy)
- **ADR-038**: Entity Extraction in C2 (extraction method, confidence scoring, unified schema rationale)
- **ADR-014**: Human-in-the-Loop Vocabulary Management (curation workflow and curator responsibilities)
- **ADR-037**: Knowledge Graph in PostgreSQL (GraphStore interface and graph operations)
- **ADR-031**: Express as Sole Database Writer (transaction boundaries for processing results)
- **configuration-patterns.md**: How to inject the GraphStore and vocabulary services (config-driven factory pattern)
- **dependency-composition-pattern.md**: How to structure vocabulary and entity extraction handlers for testability

---

## Testing Checklist

When implementing entity extraction and vocabulary management, test:

- ✓ Seed vocabulary loads and relationships are created correctly
- ✓ LLM entity extraction produces entities with confidence scores
- ✓ Normalised term deduplication works for common variations (punctuation, case, reordering)
- ✓ `entity_document_occurrences` rows are created for each document-entity pair
- ✓ Curator can accept/reject entities; accepted entities move to controlled vocabulary
- ✓ Rejected entities prevent re-proposal (checked in `rejected_terms`)
- ✓ Graph rebuild is idempotent — running twice produces the same result
- ✓ Relationship deduplication prevents duplicate edges
- ✓ Backward traversal of relationships works (e.g. find owner of land parcel, not just owned land)
- ✓ Confidence filtering works in the curation UI (show/hide low-confidence entities)

---

## Scaling to Other Institutions

This skill describes a universal architecture for entity extraction and vocabulary management. When implementing for a different institution:

### What Changes (Domain-Specific)

- **Entity types** — Identify 5–8 core types relevant to your documents and curator questions (see Entity Type Discovery section)
- **Relationship types** — Identify 5–10 core relationship types that enable important queries (see Relationship Type Discovery section)
- **Seed vocabulary** — Start with terms and relationships specific to your institution's domain
- **LLM prompt** — Configure with your entity and relationship types (not hardcoded to estate examples)
- **Confidence thresholds** — Adjust based on real extraction results from your documents

### What Stays the Same (Universal Pattern)

- **Schema structure** — `vocabulary_terms`, `vocabulary_relationships`, `entity_document_occurrences`, `rejected_terms`
- **Deduplication logic** — Normalise term names, check for duplicates, prevent re-proposing rejected terms
- **Curation workflow** — LLM extracts, curator reviews, graph rebuilds after acceptance
- **Human-in-the-loop principle** — Curator is the gatekeeper; the system learns from feedback
- **Temporal context** — Source documents provide temporal meaning; relationships don't encode dates

### Implementation Checklist for New Institutions

1. ✓ Run entity type discovery on sample documents (5–10 representative files)
2. ✓ Define 5–8 entity types with clear descriptions
3. ✓ Run relationship type discovery (what questions will curators ask?)
4. ✓ Define 5–10 relationship types as question-to-relationship mappings
5. ✓ Create seed vocabulary (initial terms and relationships for your domain)
6. ✓ Configure the LLM prompt with your entity and relationship types
7. ✓ Test extraction on sample documents; iterate based on results
8. ✓ Set confidence thresholds (likely different from the estate project defaults)
9. ✓ Train curators on the vocabulary review workflow (conceptually identical, domain-specific terms)
10. ✓ Monitor Phase 1 results; refine entity/relationship types based on real extraction failures

---

## Future Extensions

### Phase 2+

- **Graph querying**: The `GraphStore` interface enables complex multi-hop queries (e.g. "find all organisations connected to this person")
- **Entity linking**: Link external entities to known databases (e.g. Companies House for UK organisations, national archives for historical figures)
- **Relationship dating**: If source documents provide clear dates, optionally store relationship temporal bounds (deferred; Phase 1 uses source documents for temporal context)
- **Custom entity types**: Add domain-specific entity types during curation (e.g. "Ship" for maritime archives, "Artefact" for museum collections)
- **Dynamic entity/relationship type configuration**: Admin UI to add new entity and relationship types without code changes

### Performance Optimizations

- Filtered index on `vocabulary_terms.source` for fast curation UI queries
- Partial index on `vocabulary_terms` where `confidence > 0.7` for high-confidence entity queries
- Denormalised entity counts by type/category if the UI needs summary statistics

---
