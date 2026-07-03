import { describe, expect, test } from "bun:test"
import { PromptBuilder } from "@/prompt/builder"

describe("PromptBuilder", () => {
  test("creates a simple prompt with role, goal, and constraint", () => {
    const prompt = PromptBuilder.create("orchestrate")
      .role("You are the Orchestrate agent.")
      .goal("Coordinate large software tasks through grouped subagents.")
      .constraint("Do not over-orchestrate small tasks.")
      .compile()

    expect(prompt).toBe(`# Role

You are the Orchestrate agent.

## Goal

Coordinate large software tasks through grouped subagents.

## Constraints

Do not over-orchestrate small tasks.`)
  })

  test("renders pressure and example segments", () => {
    const prompt = PromptBuilder.create("orchestrate")
      .pressure("Dispatch pressure", "Large ambiguous tasks should be decomposed instead of handled as one giant edit.")
      .example("Large local-first app request", "Expected behavior: discover, clarify, plan, interface, implement, review.")
      .compile()

    expect(prompt).toContain("## Dispatch pressure")
    expect(prompt).toContain("Large ambiguous tasks should be decomposed instead of handled as one giant edit.")
    expect(prompt).toContain("## Example: Large local-first app request")
    expect(prompt).toContain("Expected behavior: discover, clarify, plan, interface, implement, review.")
  })

  test("renders operations and workflows as structured bullets", () => {
    const prompt = PromptBuilder.create("orchestrate")
      .operations("Workflow", ["Inspect the repo", "Ask important questions", "Dispatch coders"])
      .workflow("Review loop", ["Inspect diffs", "Compare against contracts", "Run focused tests"])
      .compile()

    expect(prompt).toContain(`## Workflow

- Inspect the repo
- Ask important questions
- Dispatch coders`)
    expect(prompt).toContain(`## Review loop

- Inspect diffs
- Compare against contracts
- Run focused tests`)
  })

  test("preserves deterministic insertion ordering", () => {
    const builder = PromptBuilder.create("ordering")
      .segment({ id: "second-priority", kind: "goal", content: "This stays first.", priority: 100 })
      .segment({ id: "first-priority", kind: "constraint", content: "This stays second.", priority: 1 })

    expect(builder.compile()).toBe(builder.compile())
    expect(builder.compile().indexOf("This stays first.")).toBeLessThan(builder.compile().indexOf("This stays second."))
  })

  test("sorts by priority only when explicitly requested", () => {
    const builder = PromptBuilder.create("ordering")
      .segment({ id: "low", kind: "goal", content: "Low priority.", priority: 1 })
      .segment({ id: "high", kind: "goal", content: "High priority.", priority: 100 })

    expect(builder.compile().indexOf("Low priority.")).toBeLessThan(builder.compile().indexOf("High priority."))
    expect(builder.compile({ sortByPriority: true }).indexOf("High priority.")).toBeLessThan(
      builder.compile({ sortByPriority: true }).indexOf("Low priority."),
    )
  })

  test("omits disabled segments, examples, and pressure when filtered", () => {
    const builder = PromptBuilder.create("filters")
      .segment({ id: "disabled", kind: "goal", content: "Hidden.", enabled: false })
      .pressure("Visible pressure.")
      .example("Visible example", "Example body.")
      .goal("Visible goal.")

    expect(builder.compile()).toContain("Visible pressure.")
    expect(builder.compile()).toContain("Example body.")
    expect(builder.compile()).toContain("Visible goal.")
    expect(builder.compile()).not.toContain("Hidden.")

    const filtered = builder.compile({ includeExamples: false, includePressure: false })
    expect(filtered).not.toContain("Visible pressure.")
    expect(filtered).not.toContain("Example body.")
    expect(filtered).toContain("Visible goal.")
  })

  test("includes model-specific notes only when matching build options", () => {
    const builder = PromptBuilder.create("model-notes")
      .modelNote("Use the reasoning model note.", { modelSize: "reasoning" })
      .modelNote("Use the GPT note.", { model: "gpt-5" })
      .modelNote("Always include this note.")

    expect(builder.compile()).not.toContain("Use the reasoning model note.")
    expect(builder.compile()).not.toContain("Use the GPT note.")
    expect(builder.compile()).toContain("Always include this note.")

    const prompt = builder.compile({ model: "gpt-5", modelSize: "reasoning" })
    expect(prompt).toContain("Use the reasoning model note.")
    expect(prompt).toContain("Use the GPT note.")
    expect(prompt).toContain("Always include this note.")
  })

  test("supports conditional segment blocks", () => {
    const builder = PromptBuilder.create("conditional")
      .goal("Always visible.")
      .when({ agent: "orchestrate" }, (prompt) => prompt.pressure("Only for orchestrate."))
      .when((options) => options.modelSize === "small", (prompt) => prompt.modelNote("Keep sections compact."))

    expect(builder.compile()).toContain("Always visible.")
    expect(builder.compile()).not.toContain("Only for orchestrate.")
    expect(builder.compile({ agent: "orchestrate" })).toContain("Only for orchestrate.")
    expect(builder.compile({ modelSize: "small" })).toContain("Keep sections compact.")
  })

  test("handles string arrays consistently", () => {
    const prompt = PromptBuilder.create("arrays").goal(["First item", "Second item\nwith detail"]).compile()

    expect(prompt).toBe(`## Goal

- First item
- Second item
  with detail`)
  })

  test("does not emit extra trailing whitespace or unstable spacing", () => {
    const prompt = PromptBuilder.create("spacing")
      .role("  Trimmed role.  ")
      .operation("Steps", [" First step. ", "Second step.\n  with detail.  "])
      .compile()

    expect(prompt).toBe(`# Role

Trimmed role.

## Steps

- First step.
- Second step.
    with detail.`)
    expect(prompt).not.toMatch(/[ \t]+$/m)
    expect(prompt).not.toMatch(/\s$/)
  })
})
