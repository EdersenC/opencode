# Interface Skill

Use this skill when multiple implementation agents will work on the same feature.

Purpose:
Prepare the ground before coders edit files. Create the contracts, handoff documents, ownership lanes, and dependency map that make parallel implementation safe. This skill turns a selected plan into interface contracts, handoff READMEs, a work-package map, implementation slices, shared objectives, dependency boundaries, correctness criteria, and review focus.

Use contract-first interfaces to define the coordination surface before implementation begins.
Treat each ownership lane as one of the ownership boundaries for an implementation slice.
Name the ownership boundary before dispatch so each coder knows where their work starts and stops.

## When To Use

- After planning is complete.
- Before multiple coder agents start editing.
- When a feature spans multiple modules, services, layers, packages, components, or teams of subagents.
- When shared contracts, APIs, DTOs, adapters, messages, protocols, events, or data flows must be agreed on before implementation.
- When parallel coder work would otherwise risk overlapping edits or incompatible assumptions.

## When Not To Use

- Single-file edits.
- Small bug fixes.
- Tasks where one coder can safely implement everything.
- Pure research or planning.
- Work that already has clean, sufficient contracts and one obvious implementation path.

## Workflow

1. Read the chosen plan and repo context.
2. Identify module, package, service, component, and work-package boundaries.
3. Identify implementation seams: modules, directories, packages, services, components, adapters, layers, interfaces, schemas, DTOs, messages, data shapes, APIs, protocols, traits, abstract classes, boundary functions, and dependency direction.
4. Create or update interface contracts.
5. Create handoff README files.
6. Create a work-package map that clusters coder tasks by shared objective and ownership lane.
7. Decide which coder tasks can run in parallel and which must run sequentially.
8. Produce coder dispatch prompts.
9. Mark the ready-now coder batch separately from tasks that are blocked by unresolved dependencies.
10. Name the review focus for each work package so the orchestrator can reconcile results after fan-in.

## Interface Contracts

Create actual interface code when it reduces coordination risk or clarifies an interface contract:

- TypeScript: interfaces, types, contracts, DTOs, schemas, adapter signatures.
- Go: interfaces, structs, package-level contracts, narrow exported methods.
- Python: Protocols, abstract base classes, dataclasses, type hints, module boundaries.
- Rust: traits, structs, enums, modules, error types.
- Java, Kotlin, or C#: interfaces, classes, records, DTOs, service contracts.
- Languages without formal interfaces: public function signatures, schemas, DTOs, documentation, tests, fixtures, and examples as contracts.

Avoid overengineering. Do not create abstractions only for ceremony. Create the smallest contract that lets independent coders work safely.

Each interface contract should record:

- Which coder owns the implementation.
- Which other work packages consume it.
- Which ownership lane and dependency boundary it protects.
- What correctness means for the contract.
- Which compatibility or public API constraints must not be silently broken.
- Which tests or checks prove the contract is respected.

## Recommended Artifacts

- `docs/orchestration/<feature-slug>/overview.md`
- `docs/orchestration/<feature-slug>/work-packages.md`
- `docs/orchestration/<feature-slug>/interfaces.md`
- `<module-or-package>/README.md` for new modules
- Language-native interface, type, protocol, trait, schema, DTO, or adapter files
- Optional contract tests when useful

Follow the repo's existing documentation and architecture conventions when they exist. Prefer local handoff docs near the code for new module folders. Use `docs/orchestration/<feature-slug>/` for cross-cutting coordination docs when no better convention exists.

## Work-Package Boundaries

Each coder should receive a clear ownership slice:

- Owned files and directories.
- Files and directories to avoid.
- Shared contract files that should not be casually changed.
- Common goal and shared objective for the grouped work.
- Selected plan this implementation slice follows.
- Upstream and downstream dependencies.
- Public contracts the slice must implement or respect.
- Correctness criteria for the slice.
- Review focus for the orchestrator after implementation.
- Expected tests and verification commands.
- Known risks and escalation questions.

Avoid overlapping edit scopes. If overlap is unavoidable, make one task own the shared contract and make other tasks depend on it.

## Parallel Versus Sequential Guidance

Run coder tasks in parallel only when their owned files and contracts are clear, their dependencies already exist, and they can complete without editing the same files.

If a task can proceed from written contracts, interface files, fixtures, stubs, or handoff docs, treat it as ready for the next parallel group even if sibling implementation code is not finished yet.

Use fan-out/fan-in deliberately: fan out ready coder tasks in one group, let the cohort work against the same contracts, then fan in results for review, reconciliation, and verification.

Run coder tasks sequentially when:

- One slice creates shared interfaces, schemas, migrations, or generated code another slice depends on.
- Two slices must edit the same file or directory.
- A dependency decision is unresolved.
- A failed contract test would invalidate downstream work.
- The blast radius is high enough that review should happen between phases.

When unsure, create contracts first, dispatch independent implementation slices second, then run a grouped review and verification pass.

Avoid drip-feeding coders. After the foundation or contract layer exists, launch all ready sibling work packages in one implementation group instead of waiting for engine, CLI, tests, docs, adapters, or UI one at a time.

## Coder Dispatch Prompts

Each coder prompt should include:

- Assigned scope.
- Selected plan summary.
- Interface or handoff README path, also passed through the task `handoff_files` array.
- Files and directories to own.
- Files and directories to avoid.
- Public contracts to implement or respect.
- Expected tests.
- Known risks.
- Question escalation protocol.
- Blocker protocol for incomplete contracts, missing dependencies, conflicting ownership, or impossible verification.

Tell coders to read the handoff README first, treat interface contracts as source of truth, avoid changing shared contracts unless explicitly instructed, and report contract gaps or conflicts back to the orchestrator instead of silently inventing incompatible behavior.

Keep coder prompts short. Put detailed contracts, handoff READMEs, and work-package maps in `handoff_files` so the coder reads the source artifact instead of a huge pasted prompt.

## Required Handoff README Template

```markdown
# <Work Package Name>

## Purpose
Describe what this slice owns.

## User Goal
Summarize the user-facing goal this work supports.

## Selected Plan
Summarize the plan this slice follows.

## Owned Scope
List directories/files this coder should primarily edit.

## Avoid / Do Not Edit
List files/directories owned by other slices.

## Public Interfaces / Contracts
List interfaces, types, functions, events, schemas, API endpoints, messages, or DTOs this slice must implement or respect.

## Dependencies
List upstream/downstream dependencies.

## Ownership Lane
Name the implementation slice and dependency boundary this package owns.

## Implementation Notes
Give concrete guidance, constraints, and style expectations.

## Testing Expectations
List tests to add/run.

## Correctness Criteria
Describe what must be true for this slice to be considered correct.

## Review Focus
List the integration, quality, boundary, security, reliability, performance, or contract risks the orchestrator should inspect after implementation.

## Questions / Risks
List known unknowns and when to escalate to orchestrator.
```

## Required Work-Package Map Template

```markdown
# Work Packages

## Package: <name>
- Coder task name:
- Owned scope:
- Handoff doc:
- Contracts:
- Dependencies:
- Can run in parallel with:
- Must run after:
- Review focus:
- Correctness criteria:
```

## Final Output To Prepare

Prepare a concise interface-phase summary for the orchestrator:

- Contract files created or updated.
- Handoff README files created or updated.
- Work-package map path.
- Coder task prompts ready to dispatch.
- Ready-now coder batch for the next group call.
- Blocked-by-dependency coder batch with exact unblock conditions.
- Blockers or orchestrator questions that must be resolved before coder dispatch.
- Parallel groups and sequential dependencies.
- Shared files that coders must not casually edit.
- Remaining questions or risks before implementation.
