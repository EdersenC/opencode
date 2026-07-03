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
    expect(lower).toContain("contract-first interface phase")
    expect(lower).toContain("implementation dispatch protocol")
    expect(lower).toContain("coder question handling protocol")
    expect(lower).toContain("review and reconcile coder output")
    expect(lower).toContain("verification")
    expect(lower).toContain("final response format")
    expect(lower).toContain("for tiny edits")
    expect(lower).toContain("subagent_type\": \"planner")
    expect(lower).toContain("subagent_type\": \"coder")
  })

  test("planner prompt compiles from builder segments", () => {
    const prompt = createPlannerPrompt()
    const lower = prompt.toLowerCase()

    expect(prompt).toContain("# Role")
    expect(lower).toContain("you are the planner subagent")
    expect(lower).toContain("produce exactly one plan")
    expect(lower).toContain("stay read-only")
    expect(lower).toContain("repo inspection")
    expect(lower).toContain("planning angle")
    expect(lower).toContain("recommended coder work packages")
    expect(lower).toContain("<verification_strategy>")
  })

  test("coder prompt compiles from builder segments", () => {
    const prompt = createCoderPrompt()
    const lower = prompt.toLowerCase()

    expect(prompt).toContain("# Role")
    expect(lower).toContain("you are the coder subagent")
    expect(lower).toContain("scoped work package")
    expect(lower).toContain("read it first")
    expect(lower).toContain("well-structured technical narrative")
    expect(lower).toContain("each abstraction should have a reason")
    expect(lower).toContain("do not add noisy comments that restate obvious code")
    expect(lower).toContain("keep future change in mind without overengineering")
    expect(lower).toContain("blocked result format")
    expect(lower).toContain("completed result format")
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

    expect(prompt).toContain('[segment id="orchestrate:role:0" kind="role"]')
    expect(prompt).toContain("## Multi-Plan Workflow")
    expect(prompt).not.toContain("## Example: multi-plan group call")
  })
})

function duplicateHeadings(prompt: string) {
  const headings = prompt
    .split("\n")
    .filter((line) => line.startsWith("#"))
    .map((line) => line.trim())
  return headings.filter((heading, index) => headings.indexOf(heading) !== index)
}
