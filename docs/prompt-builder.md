# Prompt Builder

OpenCode can build agent prompts from composable, named segments instead of one giant prompt string. The goal is to keep prompts readable in code, reusable across agents, deterministic, and easy to tune for different model profiles.

## Basic Usage

```ts
import { PromptBuilder } from "@/prompt/builder"

const prompt = PromptBuilder.create("example-agent")
  .role("You are an example agent.")
  .goal("Solve the assigned task.")
  .pressure("Prefer decomposition for broad work.")
  .operation("Default workflow", ["Inspect context", "Identify risks", "Execute", "Verify", "Report"])
  .example("Small task", "For a one-file change, do not spawn subagents.")
  .compile({ profile: "standard" })
```

Each segment has a stable id, kind, optional title, and content. Strings render as paragraphs. String arrays render as bullet lists.

## Segment Types

Use the builder methods for common prompt sections:

- `role(...)`
- `goal(...)`
- `context(title, content)`
- `constraint(...)`
- `pressure(...)` or `pressure(title, content)`
- `operation(title, items)` / `operations(title, items)`
- `workflow(title, steps)`
- `toolGuidance(title, content)`
- `example(title, content)`
- `outputFormat(content)`
- `qualityBar(content)`
- `modelNote(content, options)`
- `segment(segment)` for custom ids, titles, metadata, or kinds

Prefer many named segments over a large unstructured template. A multiline string inside a segment is fine when the content is naturally structured, such as XML-like output format examples.

## Prompt Packs

Reusable prompt packs live in `packages/opencode/src/prompt/packs.ts`. A pack receives a builder and returns a builder:

```ts
import { withCodeQualityBar, withQuestionEscalationProtocol } from "@/prompt/packs"

const prompt = PromptBuilder.create("worker")
  .role("You are a worker agent.")
  .use(withCodeQualityBar)
  .use((builder) => withQuestionEscalationProtocol(builder, "worker"))
  .compile()
```

Current packs include:

- `withCodeQualityBar`
- `withQuestionEscalationProtocol`
- `withInterfaceContractProtocol`
- `withReviewLoop`
- `withOrchestrationLifecycle`
- `withWorkerResultFormat`

Use packs when behavior is shared between agents, such as code quality standards, interface-contract rules, question/blocker handling, review loops, or worker result formats.

## Profiles

Prompt profiles are resolved by `resolvePromptProfile(options)` in `packages/opencode/src/prompt/profile.ts`.

Profiles:

- `standard`: default. Full readable prompt, examples and pressure included.
- `compact`: shorter prompt. Compact spacing, examples omitted, pressure omitted by default.
- `explicit`: stricter structure for small or weaker models. More checklists, examples, and pressure.
- `reasoning`: concise high-level prompt for reasoning models. Fewer examples, still keeps constraints.
- `debug`: full prompt with debug markers enabled by default.

You can select a profile explicitly:

```ts
createCoderPrompt({ profile: "explicit" })
```

Or let model size infer the profile:

```ts
createPlannerPrompt({ modelSize: "small" }) // explicit
createPlannerPrompt({ modelSize: "reasoning" }) // reasoning
```

Explicit options override profile defaults:

```ts
createOrchestratePrompt({ profile: "compact", includeExamples: true })
```

## Conditional Segments

Use `when(...)` to include segments based on profile, model, model size, agent, tags, or a predicate:

```ts
PromptBuilder.create("planner")
  .goal("Create one plan.")
  .when({ profile: "explicit" }, (builder) =>
    builder.workflow("Explicit Checklist", ["State assumptions", "Name files", "Name verification"]),
  )
  .when({ modelSize: "reasoning" }, (builder) =>
    builder.modelNote("Stay concise but preserve concrete phases and risks."),
  )
  .compile({ profile: "explicit" })
```

## Debug Markers

Debug markers are off by default. Enable them with:

```ts
createOrchestratePrompt({ includeDebugMarkers: true })
```

Segments render comments like:

```txt
<!-- prompt-segment: orchestrate:role:0 kind=role -->
```

Use debug markers for prompt preview, tests, or development. Do not depend on them in model-facing behavior.

## Determinism

Prompt output must be deterministic:

- Segment ids are derived from prompt name, segment kind, and insertion order unless explicitly provided.
- Insertion order is preserved by default.
- Priority sorting happens only with `sortByPriority: true`.
- Builder code must not read random values, clocks, external files, or environment variables.
- Runtime model, profile, or agent data should be passed through `PromptBuildOptions`.

## Guardrails

- Do not migrate every prompt just because the builder exists.
- Do not hide behavior in overly clever pack abstractions.
- Do not create huge unstructured prompt blobs inside one segment.
- Keep hard constraints visible in the prompt module that owns them.
- Keep static `.txt` prompts until all import paths and tests are safely migrated.
