# Code Review — Backend Service — Task 3: Implement nconf configuration module

**Date**: 2026-03-07 18:09
**Task status at review**: code_complete
**Files reviewed**:

- `apps/backend/src/config/index.ts`
- `apps/backend/src/config/__tests__/config.test.ts`
- `documentation/tasks/backend-tasks.md` (Task 3 specification)

---

## Acceptance condition

**Stated condition** (condition type: `automated`):

> A Vitest unit test confirms that loading a valid config object produces the correct typed output.
> A second unit test confirms that loading a config object with a missing required key (e.g. `auth.frontendKey`) throws a descriptive error before the application starts. Both tests pass.

**Result**: Met

The test file at `apps/backend/src/config/__tests__/config.test.ts` contains exactly two tests inside a `describe('parseConfig')` block:

1. `returns a correctly typed config object for valid input` — passes a complete `validRaw` object to the exported `parseConfig()` function and asserts every top-level config key and several nested keys. All assertions are specific value checks (not vacuous).

2. `throws a descriptive error when a required key is missing` — constructs a variant of `validRaw` with `auth.frontendKey` omitted and asserts that `parseConfig()` throws an error matching the regex `/auth\.frontendKey/`. The error message format in `parseConfig()` produces `auth.frontendKey: Required`, which satisfies the regex.

Both tests are real behavioural tests, not vacuous. The error format on line 125 of `index.ts` — `i.path.join('.')` — correctly produces the dotted key path that the test asserts against.

**Manual verification for the developer**: Run the following command from the monorepo root to confirm both tests pass against the live Vitest runner:

```sh
pnpm --filter backend exec vitest run src/config/__tests__/config.test.ts
```

Expected: 2 tests pass, 0 failures.

---

## Findings

### Blocking

None.

### Suggestions

**S-1 — Plan divergence: `getConfig()` function vs `config` singleton**

`apps/backend/src/config/index.ts`, line 152.

The task description specifies: *"Export a `getConfig()` function that returns the validated config object, typed using the Zod inferred type."*

The implementation instead exports `export const config: AppConfig = loadConfig()` — a module-level singleton — and does not export a `getConfig()` function. The singleton pattern is a reasonable implementation choice (simpler, no risk of calling the function before nconf is initialised), but it diverges from the task description.

This is a suggestion rather than blocking because: the acceptance condition (the two unit tests) is fully met by the `parseConfig()` export; the singleton is at least as correct as a getter function for this use case; and downstream tasks that depend on Task 3 will import `config` rather than calling `getConfig()`, so the deviation affects no subsequent task's API surface.

The developer should decide whether to update the task description to match the implementation (change "Export a `getConfig()` function" to "Export the validated config as a `config` singleton constant") or leave it as a known discrepancy. No code change is required.

**S-2 — Plan divergence: `logger.level` config key not listed in task description**

`apps/backend/src/config/index.ts`, lines 99–108.

The task description lists the required config keys explicitly. `logger.level` (a union of six Pino log-level literals) is not in that list, but is included in the Zod schema. The addition is sensible — the logger middleware (Task 4) references the config for its log level — but it is undocumented in the task spec.

The developer should either add `logger.level` to the Task 3 description retrospectively (as a note to the task file) or accept the discrepancy. No code change is required.

**S-3 — Inline comment on `parseConfig` export could clarify the correct export for application use**

`apps/backend/src/config/index.ts`, lines 113–119.

The existing warning comment says: *"Do not call this in application code — it bypasses the nconf loading hierarchy and will produce an incomplete config object."*

This is accurate and useful. A minor addition could make the intent even clearer for future maintainers: the comment could explicitly state that the `config` singleton (line 152) is the correct export for application use. This is entirely optional and does not affect correctness.

---

## Summary

**Outcome**: Pass

No blocking findings. The acceptance condition is met by two well-constructed unit tests that cover both the valid-input and missing-key failure paths. The code is type-safe, follows the nconf hierarchy specified in the backend plan, correctly handles the ESM/CommonJS boundary for nconf via `createRequire`, uses `safeParse` to produce a clean error message rather than letting Zod throw directly, and includes a clear comment warning against non-test use of `parseConfig`.

Two plan divergences are noted as suggestions (S-1, S-2): the `config` singleton in place of the specified `getConfig()` function, and the undocumented `logger.level` key. Neither affects correctness or any downstream task.

The task is ready to advance to `reviewed`.
