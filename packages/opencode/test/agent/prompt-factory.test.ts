import { describe, expect, test } from "bun:test"
import { createCoderPrompt } from "@/agent/prompt/coder"
import { createOrchestratePrompt } from "@/agent/prompt/orchestrate"
import { createPlannerPrompt } from "@/agent/prompt/planner"
import { previewAgentPrompt } from "@/agent/prompt/preview"

describe("agent prompt factories", () => {
  test("orchestrate prompt compiles from builder segments", () => {
    const prompt = createOrchestratePrompt()
    const lower = prompt.toLowerCase()

    expect(prompt).toContain("# Role")
    expect(lower).toContain("environment discovery")
    expect(lower).toContain("question tool usage")
    expect(lower).toContain("multi-plan workflow")
    expect(lower).toContain("auto mode awareness")
    expect(lower).toContain("coder dispatch gate")
    expect(lower).toContain("before every implementation tool call")
    expect(lower).toContain("one group call containing all ready non-conflicting coder slices")
    expect(lower).toContain("a single-coder dispatch is acceptable only")
    expect(lower).toContain("maximize the safe ready batch before narrating the next phase")
    expect(lower).toContain("contract-first interface phase")
    expect(lower).toContain("implementation dispatch protocol")
    expect(lower).toContain("question and blocker protocol")
    expect(lower).toContain("review loop")
    expect(lower).toContain("review and reconcile coder output")
    expect(lower).toContain("verification")
    expect(lower).toContain("final response format")
    expect(lower).toContain("interface contract protocol")
    expect(lower).toContain("code quality bar")
    expect(lower).toContain("for tiny edits")
    expect(lower).toContain("subagent_type\": \"planner")
    expect(lower).toContain("subagent_type\": \"coder")
    expect(lower).toContain("handoff_files")
    expect(lower).toContain("do not paste large handoff docs")
    expect(lower).toContain("readiness batching check")
    expect(lower).toContain("parallel dispatch audit")
    expect(lower).toContain("batch-first dispatch loop")
    expect(lower).toContain("construct the widest safe ready-now batch")
    expect(lower).toContain("maintain a pending-slices list")
    expect(lower).toContain("treat user wait time as a resource")
    expect(lower).toContain("serial coder drip-feeding is a dispatch failure")
    expect(lower).toContain("do not split foundation -> engine -> cli -> tests into four user waits")
    expect(lower).toContain("do not announce parallel implementation")
    expect(lower).toContain("engine, cli, tests, docs, adapters, or ui")
    expect(lower).toContain("do not make the user watch avoidable serial phases")
    expect(lower).toContain("do not show the user giant coder prompts")
    expect(lower).toContain("contract-ready task should not wait for sibling code")
    expect(lower).toContain("group is not limited to one or two agents")
    expect(lower).toContain("multiple nested coder task calls in the same group tool call")
    expect(lower).toContain("post-foundation anti-pattern")
    expect(lower).toContain("post-foundation ready batch")
    expect(lower).toContain("foundation complete -> engine-services only -> wait -> cli-interface only")
    expect(lower).toContain("name the exact missing concrete artifact")
    expect(lower).toContain("cli-coder")
    expect(lower).toContain("test-coder")
    expect(lower).toContain("short enough to understand at a glance")
  })

  test("planner prompt compiles from builder segments", () => {
    const prompt = createPlannerPrompt()
    const lower = prompt.toLowerCase()

    expect(prompt).toContain("# Role")
    expect(lower).toContain("you are the planner subagent")
    expect(lower).toContain("create one concrete plan for the assigned angle")
    expect(lower).toContain("produce exactly one concrete")
    expect(lower).toContain("stay read-only")
    expect(lower).toContain("repo inspection")
    expect(lower).toContain("planning angle")
    expect(lower).toContain("recommended coder work packages")
    expect(lower).toContain("<chosen_approach>")
    expect(lower).toContain("<interface_boundaries>")
    expect(lower).toContain("<work_package_candidates>")
    expect(lower).toContain("<verification_strategy>")
  })

  test("coder prompt compiles from builder segments", () => {
    const prompt = createCoderPrompt()
    const lower = prompt.toLowerCase()

    expect(prompt).toContain("# Role")
    expect(lower).toContain("you are the coder subagent")
    expect(lower).toContain("scoped work package")
    expect(lower).toContain("read the handoff readme and interface contracts first")
    expect(lower).toContain("handoff_files")
    expect(lower).toContain("read it first")
    expect(lower).toContain("assume the handoff files contain the detailed context")
    expect(lower).toContain("sibling implementation code is not present yet")
    expect(lower).toContain("implement against the contract")
    expect(lower).toContain("well-structured technical narrative")
    expect(lower).toContain("each abstraction should have a reason")
    expect(lower).toContain("do not add noisy comments that restate obvious code")
    expect(lower).toContain("keep future change in mind without overengineering")
    expect(lower).toContain("blocked result format")
    expect(lower).toContain("completed result format")
    expect(lower).toContain("interface contract protocol")
    expect(lower).toContain("question and blocker protocol")
    expect(lower).toContain("code quality bar")
    expect(lower).toContain("auto mode")
    expect(lower).toContain("report all commands run")
    expect(lower).toContain("<handoff_docs_read>")
    expect(lower).toContain("<contracts_implemented>")
  })

  test("compiled prompts are deterministic", () => {
    expect(createOrchestratePrompt()).toBe(createOrchestratePrompt())
    expect(createPlannerPrompt()).toBe(createPlannerPrompt())
    expect(createCoderPrompt()).toBe(createCoderPrompt())
  })

  test("compiled prompts do not contain duplicate section headings", () => {
    expect(duplicateHeadings(createOrchestratePrompt())).toEqual([])
    expect(duplicateHeadings(createPlannerPrompt())).toEqual([])
    expect(duplicateHeadings(createCoderPrompt())).toEqual([])
  })

  test("previewAgentPrompt returns compiled prompts with options", () => {
    const prompt = previewAgentPrompt("orchestrate", { includeExamples: false, includeDebugMarkers: true })

    expect(prompt).toContain("<!-- prompt-segment: orchestrate:role:0 kind=role -->")
    expect(prompt).toContain("## Multi-Plan Workflow")
    expect(prompt).not.toContain("## Example: multi-plan group call")
  })

  test("prompt profiles tune prompt length and detail", () => {
    const standard = createOrchestratePrompt({ profile: "standard" })
    const compact = createOrchestratePrompt({ profile: "compact" })
    const explicit = createOrchestratePrompt({ profile: "explicit" })

    expect(compact.length).toBeLessThan(standard.length)
    expect(compact).not.toContain("## Example: multi-plan group call")
    expect(compact).not.toContain("## Clarification Pressure")
    expect(explicit).toContain("## Explicit Orchestration Checklist")
    expect(explicit).toContain("## Explicit Interface Contract Checklist")
    expect(explicit).toContain("## Explicit Code Quality Checklist")
  })

  test("worker profiles include stricter checklists for explicit prompts", () => {
    const coder = createCoderPrompt({ profile: "explicit" })
    const planner = createPlannerPrompt({ profile: "explicit" })

    expect(coder).toContain("## Explicit Code Quality Checklist")
    expect(coder).toContain("## Explicit Interface Contract Checklist")
    expect(planner).toContain("## Explicit Planning Checklist")
  })

  test("debug markers appear only when enabled", () => {
    expect(createCoderPrompt()).not.toContain("<!-- prompt-segment:")
    expect(createCoderPrompt({ includeDebugMarkers: true })).toContain("<!-- prompt-segment:")
    expect(createCoderPrompt({ profile: "debug" })).toContain("<!-- prompt-segment:")
  })
})

function duplicateHeadings(prompt: string) {
  const headings = prompt
    .split("\n")
    .filter((line) => line.startsWith("#"))
    .map((line) => line.trim())
  return headings.filter((heading, index) => headings.indexOf(heading) !== index)
}
