Estate Intelligence Project — Conversation Extract
Decisions Made

Multi-tenancy deferred to Phase 3-4: "Stay monolithic... One database, one storage provider per deployment" in Phases 1-2; true multi-tenancy only "12+ months" out when "demand justifies"

Selected approach: Single-tenant-first with multi-tenant-ready abstractions
Rationale: "You learn the domain without fighting deployment complexity"

Tenant awareness added as concept before full multi-tenancy: "Introduce tenant awareness as a concept, but still single-deployment-per-tenant" in Phase 3-4, before Phase 4+ consolidation

Selected approach: Add tenant_id column and query filtering before moving to shared infrastructure
Rationale: "You can test multi-tenant logic without operational complexity"

Multi-tenancy pattern selection deferred: Three options presented (Shared DB with isolation, Separate DBs per tenant, Hybrid) but "you don't need to decide the multi-tenancy strategy now"

Selected approach: Defer pattern choice to Phase 3-4 planning
Rationale: "You need to decide whether to allow multi-tenancy eventually... not decide the strategy now"

Rationale (Implied but Not Written Down)

Why multi-tenancy matters for this project: "You're not asking for anything technically exotic—multi-tenant systems are well-established patterns. The real question is when to build for this, not whether it's possible."

Underlying assumption: This project may eventually become commercial software serving multiple family estates

Why abstraction is the bridge between single and multi-tenant: Current Phase 1 design already supports multi-tenancy through StorageService interface and config-driven setup—"you're already considering: 'What if this pattern repeated?'"

Underlying logic: Good abstractions today cost nothing but unlock optionality later

Why Phase 1-2 must stay monolithic: "You're building a single-user, single-family archive system" and "Phase 1 spec is intentionally monolithic"

Underlying principle: Domain learning and operational simplicity take priority over architectural generality early on

Constraints or Requirements (Emerged)

Tenant context must flow through API key authentication: "API keys can embed tenant context" and "key validation automatically routes to correct tenant"

Implication: tRPC + API key layer (already in Phase 1) is the right place to inject tenant awareness later

S3 paths must be namespaced for future multi-tenancy: Instead of uploads/2024/01/uuid.pdf, use tenant-{id}/archives/2024/01/uuid.pdf

Implication: Even single-tenant Phase 1 should follow this naming convention to avoid refactoring later

Storage abstraction must support independent provider per tenant: "Different tenants can have different storage providers... One uses local FS, another S3, third uses Azure Blob"

Implication: StorageService interface already correct; config layer must extend to support per-tenant overrides

tenant_id field required in database from Phase 1: "Add a tenant_id field to intake_documents table (even though you won't use it yet)"

Implication: Migration needed in Phase 1; no functional use yet, but schema readiness required

No multi-tenant code should be written prematurely: "Don't build multi-tenant code yet... design single-tenant code that could become multi-tenant"

Constraint: Phase 1-2 implementation must avoid tenant-aware logic; only structure data/config to allow it

Contradictions or Tensions with Existing ADRs
No direct contradictions found.
However, one emerging design tension (not yet a contradiction):

Infrastructure as Configuration vs. Multi-tenancy: The existing ADR says "all services behind interfaces"; the multi-tenancy path adds a layer: config must now support dynamic interface selection (which database, which storage provider) based on runtime context (tenant_id), not just deployment-time configuration.

Current state: Not a problem for Phase 1 (config is static per deployment)
Future state: Phase 3-4 must extend config system to support runtime tenant routing without violating the "services behind interfaces" principle
Likely resolution: Middleware layer that resolves config based on tenant context before calling service interfaces

Three-layer security model vs. Tenant context: The existing model (Browser → Next.js validation → Express backend) works for single-tenant. Multi-tenancy requires tenant context to propagate through all three layers (API key identifies tenant, Next.js passes tenant context, Express enforces tenant isolation).

Current state: API key authentication already established; tenant_id in keys is straightforward
No change needed: Existing pattern extends cleanly; no contradiction

Summary of New Direction
This conversation introduced a Phase 3-4 expansion path (multi-tenancy) that was not explicitly in the original project documents. The key insight: add data for multi-tenancy in Phase 1 (tenant_id field, namespaced paths) but implement no logic until Phase 3-4. This allows the single-tenant system to evolve without refactoring.
