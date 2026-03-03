# Senior Developer Plan — Frontend Self-Review

Review of: `documentation/tasks/senior-developer-frontend-plan.md`
Reviewed: 2026-03-03

---

## Review summary

The plan has four areas of concern: one scope gap, two ambiguity findings, and one consistency
note. None of these are blocking defects, but two of the scope gaps require the developer to
decide whether the plan needs a revision before approval.

---

## Completeness

### C1 — Document Intake UI

The upload form, metadata fields, filename parsing, client-side and server-side validation
feedback, and duplicate conflict alert are all planned with components, state, API calls, Zod
schemas, and testing approaches. No section is a placeholder.

**Gap C1-01 — Bulk ingestion progress display not planned.**

The agent scope definition includes "Bulk ingestion progress display (run status, per-file
status, report download)" as a C1 frontend responsibility. The plan does not include any page
or component for this. The architecture (ADR-018, ADR-019) specifies that bulk ingestion runs
via a CLI, not the web UI. The summary report is written to a file and stdout, also not to the
web UI. There are no Phase 1 user stories (US-001 to US-008) that describe a web UI for bulk
ingestion status or report download. UR-024 specifies stdout and a timestamped file, not a web
view. This suggests the "bulk ingestion progress display" item in the agent scope definition
may refer to a Phase 2 web feature, or may have been included in error given that the CLI
handles bulk ingestion entirely in Phase 1.

**Action required**: The developer must confirm whether a bulk ingestion progress page is
expected in the Phase 1 frontend. If yes, the plan must be revised to include it and the
Integration Lead must be asked to define an API contract for run status polling. If no (CLI
only in Phase 1, consistent with ADR-018 and UR-013), no revision is needed and this item
should be noted as explicitly out of scope in the plan.

**Gap C1-02 — File size validation error message not given a distinct component.**

UR-007 requires an actionable error message for rejected file formats. The plan covers this
via `ValidationFeedback`. UR-031 requires size rejection. The plan covers size validation in
`UploadFormSchema` and lists HTTP 413 handling in error handling. However, the plan does not
address what happens if the file is rejected by size at the client before submission, as
distinct from a server-side size rejection. The `UploadFormSchema` covers this, but the plan
does not explicitly state that `ValidationFeedback` renders the size error inline on file
selection (before the user attempts submission). This is a minor gap in clarity, not a missing
component — the component exists but the trigger timing is not stated. The developer can
clarify this at implementation time without a plan revision.

### Curation UI

All four curation capabilities required by US-078 are planned: document queue (US-080), flag
clearing (US-081), metadata correction (US-082), and vocabulary review queue (US-079, US-066).
Manual vocabulary term entry (US-062) is also planned. The separation of the two queues
(US-079) is addressed with distinct routes and components.

**Gap C2-01 — US-086 navigation not explicitly designed.**

US-086 requires upload, curation, and vocabulary management to be sections of a single web
application. The plan includes `CurationNav` for the curation section and a root redirect to
`/upload`. However, there is no planned top-level navigation component connecting the upload
section and the curation section as one application. The developer should confirm whether a
shared application-level navigation header (linking `/upload` and `/curation`) is expected. If
yes, a top-level `AppNav` or similar component should be added to the plan.

---

## Consistency

### ADR-044 shared-key header

The `x-internal-key` header is applied consistently throughout the plan. Every API call table
states "Pending Integration Lead contract" and notes the header is set in Next.js API route
handlers. The `apiClient` centralisation helper is described in the Dependency injection
section. The instruction that the key must never reach the browser is stated explicitly.
No inconsistency found.

### Technology constraints

- Next.js App Router with custom server: applied throughout; Server vs Client Component
  distinction drawn correctly.
- TypeScript strict mode: not contradicted anywhere; no dynamic `any` patterns are proposed.
- nconf: used correctly for the Config singleton in the Configuration section; the pattern
  matches the configuration-patterns skill.
- Zod: applied at every data boundary — upload form schema, duplicate response schema,
  metadata edit schema, add term schema, config validation, API response validation. Consistent.
- Pino: placed server-side only; warning about not bundling into Client Components is present.
- Vitest and React Testing Library: cited correctly in all testing approach sections.
- Biome (ADR-046): not mentioned in the plan. This is expected — Biome is a monorepo-level
  tooling concern covered by a single `biome.json` at the root; it does not require
  per-component planning. No inconsistency.
- No ESLint, no Prettier: not proposed anywhere. Consistent with ADR-046.
- pnpm workspaces: not contradicted. The plan references `apps/frontend/` paths correctly.
- No E2E tests in Phase 1: the testing approach sections describe unit and component tests
  only, with MSW for integration-level frontend tests. Consistent with pipeline-testing-strategy
  skill.

### ADR-045 C3 proxy path

The plan correctly notes that the C3 proxy path is Phase 2 and defers it to OQ-005, flagging
it for the Head of Development. No Phase 1 C3 planning is included. Consistent with ADR-045
and the agent scope instructions.

### ADR-031 Express sole database writer

The plan contains no direct database access from the frontend. All reads and writes go through
Next.js API routes forwarding to Express. Consistent.

---

## Ambiguity

### Ambiguity A-01 — Upload lifecycle: three browser calls vs one

OQ-001 flags this correctly. The plan assumes three separate browser-to-Next.js calls
(initiate, upload, finalize) but acknowledges the Integration Lead may specify a single
browser call that Next.js orchestrates. The component design — specifically the submission
sequence in `DocumentUploadForm` steps 1-7 — will need to change depending on which pattern
is adopted. The plan notes this but does not describe an alternative design for the single-call
pattern. An implementer reading the plan may not know how to handle the single-call variant
without further guidance. However, since this is explicitly called out as OQ-001 and blocked on
Integration Lead, this is acceptable for a draft plan.

### Ambiguity A-02 — Client-side fetch hook choice for curation queues

The plan states "React `useState` + `useEffect`, or a lightweight data-fetching hook such as
`useSWR`" without choosing one. For Phase 1, this choice affects how re-fetch after mutations
is implemented (optimistic updates vs full re-fetch) and whether an additional dependency is
introduced. The Implementer would need to make this choice independently, and different
choices result in meaningfully different code. The plan should either specify the approach or
explicitly delegate the choice to the Implementer. As written, this is an open implementation
ambiguity. The developer can resolve this before approving the plan or delegate it explicitly.

### Ambiguity A-03 — Document metadata detail page fetch: server-side vs client-side

The plan states the `/curation/documents/:id` page fetches the document record "server-side
using React Server Component data fetching" but `DocumentMetadataForm` is a Client Component
that re-renders after a PATCH. The initial data flow (Server Component → props → Client
Component) is correct and a well-established Next.js pattern, but the plan does not address
what happens if the PATCH succeeds and the user navigates away and back — the page would
re-fetch from the server with stale data unless revalidation is configured. For Phase 1
(single user, single session), this is unlikely to matter, but it is an implementation detail
not addressed. The developer can leave this to the Implementer.

---

## Scope gaps

### Coverage of in-scope user stories

Cross-checking the User story coverage table against all in-scope Phase 1 stories:

| Story | In plan? | Notes |
| --- | --- | --- |
| US-001 | Yes | |
| US-002 | Yes | |
| US-003 | Yes | |
| US-003b | Yes | |
| US-004 | Yes | |
| US-005 | Yes | |
| US-006 | Yes | |
| US-078 | Yes | |
| US-079 | Yes | |
| US-080 | Yes | |
| US-081 | Yes | |
| US-082 | Yes | |
| US-083 | Yes | Confirmed absent by design |
| US-086 | Partial | Top-level app navigation not explicitly planned (Gap C2-01) |
| US-087 | Yes | Acknowledged as a constraint |
| US-062 | Yes | |
| US-063 | Yes | |
| US-066 | Yes | |

Stories not in the coverage table but noted as in-scope in the plan's scope summary or agent
instructions:

- **Bulk ingestion progress display** — not covered by any story in US-001 to US-008 or
  US-078 to US-087. See Gap C1-01 above. Developer confirmation required.

---

## Issues requiring developer action before approval

| ID | Severity | Action required |
| --- | --- | --- |
| C1-01 | Must resolve | Confirm whether a bulk ingestion progress page is in scope for Phase 1 frontend. If yes, add to plan. If no, note explicitly as out of scope. |
| C2-01 | Should resolve | Confirm whether a top-level application navigation header connecting `/upload` and `/curation` is expected. If yes, add an `AppNav` component to the plan. |
| A-02 | Should resolve | Specify whether `useSWR` or `useState`+`useEffect` is the adopted pattern for curation queue fetching, or explicitly delegate to the Implementer. |

The following issues do not require plan revision and are noted for the Implementer:

- C1-02: File size validation error timing on file selection (pre-submission) — clarify at
  implementation time.
- A-01: Upload lifecycle variant — blocked on OQ-001; Implementation Lead contracts resolve
  this.
- A-03: Stale data after PATCH on metadata detail page — acceptable for Phase 1 single-user
  context; Implementer decides.

---

## Conclusion

The plan is substantially complete and internally consistent. Three issues require developer
input before the plan is approved. Once those are resolved, the plan is ready for Integration
Lead review of the flagged API calls and for Project Manager decomposition into tasks.
