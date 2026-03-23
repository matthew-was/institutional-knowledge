# Approvals

## Document Precedence

The table below lists approved documents in precedence order. In case of contradiction between documents, the higher-ranked document is authoritative. The lower-ranked document must be updated to resolve the contradiction, which triggers cascade unapproval per the approval workflow.

| Rank | Document |
| --- | --- |
| 1 | `documentation/project/overview.md` |
| 2 | `documentation/requirements/user-requirements.md` |
| 3 | `documentation/requirements/phase-1-user-stories.md` |
| 4 | `documentation/decisions/architecture-decisions.md` |
| 5= | `documentation/project/architecture.md` |
| 5= | `documentation/project/system-diagrams.md` |

## Status

| Document | Status | Last Updated |
| --- | --- | --- |
| `documentation/project/overview.md` | Approved | 2026/02/17 |
| `documentation/requirements/user-requirements.md` | Approved | 2026/02/17 |
| `documentation/requirements/phase-1-user-stories.md` | Approved | 2026/02/17 |
| `documentation/decisions/architecture-decisions.md` | Approved | 2026/03/13 |
| `documentation/project/architecture.md` | Approved | 2026/03/13 |
| `documentation/project/system-diagrams.md` | Approved | 2026/03/02 |
| `documentation/tasks/senior-developer-frontend-plan.md` | Approved | 2026/03/03 (revised 2026/03/23) |
| `documentation/tasks/senior-developer-python-plan.md` | Approved | 2026/03/03 |
| `documentation/tasks/integration-lead-contracts.md` | Approved | 2026/03/03 |
| `documentation/tasks/integration-lead-backend-plan.md` | Approved | 2026/03/03 |

## Audit Log

```text
2026/02/13 - overview.md approved - Developer - reviewed and confirmed after five review cycles; all issues resolved
2026/02/13 13:58 - overview.md unapproved - Developer - scope change in progress; requires re-review before proceeding
2026/02/13 - overview.md approved - Developer - eleven review cycles complete; all issues resolved; user types confirmed
2026/02/13 - user-requirements.md approved - Developer - twelve Product Owner review cycles complete; all substantive issues resolved; seven minor precision issues deferred to implementation time
2026/02/13 - phase-1-user-stories.md written - Product Owner - 99 stories covering all 137 requirements; pending Developer approval
2026/02/14 - overview.md unapproved - Product Owner - upstream cascade: description overwrite behaviour changed (conditional overwrite); requires re-approval after edit
2026/02/14 - user-requirements.md unapproved - Product Owner - upstream cascade from overview.md unapproval; UR-052 must be updated to match conditional overwrite change
2026/02/14 - phase-1-user-stories.md unapproved - Product Owner - upstream cascade from user-requirements.md unapproval; US-052 review finding R-020 depends on UR-052 change
2026/02/14 - overview.md approved - Developer - conditional overwrite change confirmed; no contradictions introduced; re-approved
2026/02/14 - user-requirements.md approved - Developer - UR-052 updated to conditional overwrite; no contradictions with surrounding requirements; re-approved
2026/02/14 - overview.md unapproved - Product Owner - upstream cascade: virtual document grouping restricted to CLI in Phase 1; web UI grouping deferred to Phase 2
2026/02/14 - user-requirements.md unapproved - Product Owner - upstream cascade from overview.md unapproval; UR-035 must be updated to restrict Phase 1 grouping to CLI
2026/02/14 - overview.md approved - Developer - grouping CLI-only in Phase 1 confirmed; no contradictions introduced; re-approved
2026/02/14 - user-requirements.md approved - Developer - UR-035 updated to restrict Phase 1 grouping to CLI; no contradictions with surrounding requirements; re-approved
2026/02/17 - user-requirements.md unapproved - Developer - R-001 resolution: new requirement UR-010 (description validation) added; all subsequent URs renumbered (UR-010 through UR-138); requires re-approval
2026/02/17 - overview.md unapproved - Product Owner - description validation rule added to overview.md to provide upstream traceability for UR-010; requires Developer re-approval
2026/02/17 - user-requirements.md unapproved - Product Owner - upstream cascade from overview.md change; four review findings resolved: UR-018 corrected in Architectural Flags table (was UR-017), UR-010 removed from Architectural Flags table, [ARCHITECTURAL FLAG] tag added to UR-036 body
2026/02/17 - phase-1-user-stories.md unapproved - Product Owner - upstream cascade from overview.md unapproval
2026/02/17 - overview.md approved - Developer - description validation rule confirmed; no contradictions introduced; re-approved
2026/02/17 - user-requirements.md approved - Developer - UR-010 expanded to include server-side enforcement; header date updated to 2026-02-17; no contradictions with surrounding requirements; re-approved
2026/02/17 - phase-1-user-stories.md approved - Developer - US-007 derived-from corrected (UR-010→UR-011); header date updated to 2026-02-17; full review clean; re-approved
2026/02/18 - architecture-decisions.md added - Developer - Head of Development output document; pending HoD session
2026/02/18 - architecture.md added - Developer - Head of Development output document; pending HoD session
2026/02/23 - architecture-decisions.md approved - Developer - ADR-001 to ADR-035; full review session completed; all cross-references verified; four consistency fixes applied; ADR-034 and ADR-035 added during session
2026/02/23 - architecture-decisions.md unapproved - Developer - ADR-036 added post-approval (LLM metadata merge path); requires re-review before proceeding
2026/02/25 - architecture-decisions.md approved - Developer - manual review of ADR-037 to ADR-041 (graph-RAG decisions); consistency review complete; all revisions applied; ready for implementation phase
2026/02/25 - pipeline-diagram.mermaid deleted - Developer - stale file; superseded by system-diagrams.md which reflects all current ADRs; deletion committed
2026/02/25 - architecture.md approved - Developer - manual review of HoD-identified issues complete; all 10 issues resolved (3 critical, 4 high-priority, 3 low-priority); files now consistent with ADR-001 through ADR-041
2026/02/25 - system-diagrams.md approved - Developer - manual review of HoD-identified issues complete; all 10 issues resolved; color scheme updated for accessibility; all four diagrams now consistent with all approved ADRs
2026/02/27 - overview.md unapproved - Developer - C-6 consistency fix: user type table used "Authorized User" while all downstream documents use "Family Member"; correcting to match
2026/02/27 - overview.md approved - Developer - user type table corrected from "Authorized User" to "Family Member"; no cascade required; change has no downstream impact (downstream docs already use "Family Member")
2026/02/28 - architecture-decisions.md unapproved - Developer - ADR-042 added outside Head of Development agent (C3/Python service placement decision); requires HoD review and re-approval before implementation proceeds
2026/02/28 - architecture.md unapproved - Developer - upstream cascade from architecture-decisions.md unapproval; architecture.md does not yet reflect ADR-042
2026/02/28 - system-diagrams.md unapproved - Developer - upstream cascade from architecture-decisions.md unapproval
2026/02/28 - architecture-decisions.md approved - Developer - HoD consistency review complete; ADR-042 through ADR-045 integrated; 16 issues resolved (6 confirmed, 4 high-priority, 6 observations); ADR-001 through ADR-045 consistent
2026/02/28 - architecture.md approved - Developer - HoD consistency review complete; reflects ADR-001 through ADR-045; QueryRouter moved to Python; CLI trust model documented
2026/02/28 - system-diagrams.md approved - Developer - HoD consistency review complete; all four diagrams reflect ADR-001 through ADR-045; CLI node added to Diagram 1; Diagram 4 data flow corrected
2026/03/02 - architecture-decisions.md unapproved - Developer - ADR-046 added (Biome for TypeScript linting and formatting); requires re-approval
2026/03/02 - architecture-decisions.md approved - Developer - ADR-046 is additive; no impact on existing ADRs or architectural rules; re-approved immediately
2026/03/02 - architecture.md unapproved - Developer - upstream cascade from ADR-046; HoD review required to confirm architecture.md is consistent with ADR-046
2026/03/02 - system-diagrams.md unapproved - Developer - upstream cascade from ADR-046; HoD review required to confirm system-diagrams.md is consistent with ADR-046
2026/03/02 - architecture.md approved - Head of Development - ADR-046 is a tooling decision; no runtime architecture, component boundaries, or data flows affected; ADR range reference updated to ADR-046
2026/03/02 - system-diagrams.md approved - Head of Development - ADR-046 is a tooling decision; no diagram content affected; ADR range reference updated to ADR-046
2026/03/03 - senior-developer-frontend-plan.md approved - Developer - review complete; Integration Lead resolved OQ-001 to OQ-004; organisations field added to MetadataEditFields and MetadataEditSchema; readiness confirmed by Senior Developer Frontend agent
2026/03/03 - senior-developer-python-plan.md approved - Developer - review complete; Integration Lead resolved OQ-1 and OQ-6; auth key model updated to auth.inboundKey/auth.expressKey; OQ-2/3/4 deferred to implementer; readiness confirmed by Senior Developer Python agent
2026/03/03 - integration-lead-contracts.md approved - Developer - review complete; all contracts defined for DOC, VOC, PROC, QUERY, ING, ADMIN series; all frontend and Python open questions resolved
2026/03/03 - integration-lead-backend-plan.md approved - Developer - review complete; all 10 self-review issues resolved; final consistency review passed; all 16 Express contracts covered; all 20 handlers described
2026/03/04 - architecture-decisions.md unapproved - Developer - ADR-047 added (ESM module format for TypeScript services); requires re-approval
2026/03/04 - architecture-decisions.md approved - Developer - ADR-047 is additive; no impact on existing ADRs, runtime architecture, or data flows; re-approved immediately
2026/03/13 - architecture-decisions.md unapproved - Head of Development - ADR-048 added (Zod-to-OpenAPI contract pipeline for Express-Python API boundary); requires re-approval
2026/03/13 - architecture-decisions.md approved - Head of Development - ADR-048 is additive; no contradictions with existing ADRs (ADR-001 to ADR-047); closes ADR-032 contract validation risk; re-approved immediately
2026/03/13 - architecture.md unapproved - Head of Development - upstream cascade from ADR-048; architecture.md updated to reflect ADR-048 (ADR range, technology stack row, monorepo comment, cross-cutting table row)
2026/03/13 - architecture.md approved - Head of Development - ADR-048 is a contract tooling decision; no component boundaries, data flows, or ownership rules affected; minor additive updates only; re-approved immediately
2026/03/19 - architecture-decisions.md unapproved - Developer - ADR-049 added (config-driven graph traversal depth limit); requires re-approval
2026/03/19 - architecture-decisions.md approved - Developer - ADR-049 is additive; aligns with ADR-001 (Infrastructure as Configuration); no impact on existing ADRs or runtime architecture; re-approved immediately
2026/03/23 - senior-developer-frontend-plan.md revised - Developer - Hono custom server architecture added; three-tier testing model; framework agnosticism constraints; corrected DuplicateConflictResponse wire shape; nullable date fields; Base UI + Tailwind CSS (ADR-051); Temporal API (ADR-050); revision reviewed and approved via Senior Developer Frontend agent self-review
2026/03/23 - architecture-decisions.md unapproved - Developer - ADR-050 (Temporal API) and ADR-051 (Base UI + Tailwind CSS) added; requires re-approval
2026/03/23 - architecture-decisions.md approved - Developer - ADR-050 and ADR-051 are additive frontend decisions; no impact on backend, Python service, or existing ADRs; re-approved immediately
```
