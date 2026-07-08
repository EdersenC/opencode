import { describe, expect, test } from "bun:test"
import { createCoderPrompt } from "@/agent/prompt/coder"
import { createOrchestratePrompt } from "@/agent/prompt/orchestrate"
import { createPlannerPrompt } from "@/agent/prompt/planner"
import { PromptBuilder, type PromptBuildOptions } from "@/prompt/builder"
import {
  ORCHESTRATION_VOCABULARY,
  orchestrationVocabularyPackNames,
  renderOrchestrationVocabularyPack,
  requiredOrchestrationVocabulary,
  withAutoLocalVerification,
  withContractFirstHandoff,
  withContractFirstHandoffForPlanner,
  withContractFirstHandoffForWorker,
  withOrchestrationLeadership,
  withParallelWorkstreams,
  withQualityCoding,
  withReviewReconciliation,
} from "@/prompt/packs"

const packFns = {
  "orchestration-leadership": withOrchestrationLeadership,
  "parallel-workstreams": withParallelWorkstreams,
  "contract-first-handoff": withContractFirstHandoff,
  "quality-coding": withQualityCoding,
  "review-reconciliation": withReviewReconciliation,
  "auto-local-verification": withAutoLocalVerification,
} as const

describe("orchestration vocabulary packs", () => {
  test("registers the expected reusable packs", () => {
    expect(orchestrationVocabularyPackNames().toSorted()).toEqual([
      "auto-local-verification",
      "contract-first-handoff",
      "orchestration-leadership",
      "parallel-workstreams",
      "quality-coding",
      "review-reconciliation",
    ])

    for (const name of orchestrationVocabularyPackNames()) {
      expect(ORCHESTRATION_VOCABULARY[name].purpose.length).toBeGreaterThan(0)
      expect(ORCHESTRATION_VOCABULARY[name].words.length).toBeGreaterThan(0)
      expect(ORCHESTRATION_VOCABULARY[name].phrases.length).toBeGreaterThan(0)
    }
  })

  test("each vocabulary pack renders through PromptBuilder deterministically", () => {
    const optionSets: PromptBuildOptions[] = [
      {},
      { compact: true },
      { sortByPriority: true },
      { includeDebugMarkers: true },
      { profile: "explicit" },
      { profile: "reasoning" },
    ]

    for (const name of orchestrationVocabularyPackNames()) {
      const builder = PromptBuilder.create(name).use(packFns[name])
      const prompt = builder.compile()
      for (const options of optionSets) {
        expect(builder.compile(options)).toBe(builder.compile(options))
      }
      for (const phrase of renderOrchestrationVocabularyPack(name)) {
        expect(prompt).toContain(phrase)
      }
    }
  })

  test("rendered vocabulary pack arrays cannot mutate registry state", () => {
    renderOrchestrationVocabularyPack("parallel-workstreams").push("mutated phrase")

    expect(renderOrchestrationVocabularyPack("parallel-workstreams")).not.toContain("mutated phrase")
  })

  test("worker and planner handoff subsets still point at the shared vocabulary", () => {
    const worker = PromptBuilder.create("worker").use(withContractFirstHandoffForWorker).compile()
    const planner = PromptBuilder.create("planner").use(withContractFirstHandoffForPlanner).compile()

    expect(worker).toContain("Treat contracts, interface files, and handoff READMEs as the source of truth.")
    expect(worker).toContain("Respect ownership boundaries before editing.")
    expect(planner).toContain("Plan the contracts, interfaces, ownership boundaries")
    expect(planner).toContain("Separate parallel-ready slices")
  })

  test("orchestrate and coder prompts compose the expected vocabulary packs", () => {
    const orchestrate = createOrchestratePrompt().toLowerCase()
    const coder = createCoderPrompt().toLowerCase()

    for (const term of [
      "lead the work",
      "root coordinator",
      "delegate scoped work",
      "fan out related work",
      "fan in the results",
      "create contracts before dispatching coders",
      "do not declare success before review",
      "focused project-local verification",
    ]) {
      expect(orchestrate).toContain(term)
    }

    for (const term of [
      "write code that is easy to follow",
      "make the structure tell the story",
      "treat contracts, interface files, and handoff readmes as the source of truth",
      "focused project-local verification",
    ]) {
      expect(coder).toContain(term)
    }
  })

  test("auto local verification vocabulary keeps local allowance and external-side-effect bans together", () => {
    const prompt = PromptBuilder.create("auto-local-verification").use(withAutoLocalVerification).compile().toLowerCase()

    expect(prompt).toContain("focused project-local verification commands freely")
    expect(prompt).toContain("external side effects")
    expect(prompt).toContain("deploys")
    expect(prompt).toContain("publishing")
    expect(prompt).toContain("git pushes")
    expect(prompt).toContain("system mutation")
    expect(prompt).toContain("report verification honestly")
  })

  test("snapshots the rendered vocabulary pack surface", () => {
    const prompt = orchestrationVocabularyPackNames()
      .reduce((builder, name) => builder.use(packFns[name]), PromptBuilder.create("orchestration-vocabulary"))
      .compile()

    expect(prompt).toMatchSnapshot("orchestration vocabulary packs")
  })

  test("static and generated prompts contain required drift vocabulary", async () => {
    const groupPrompt = await Bun.file(new URL("../../src/tool/group.txt", import.meta.url)).text()
    const interfaceSkill = await Bun.file(
      new URL("../../../core/src/plugin/skill/interface.md", import.meta.url),
    ).text()
    const orchestrate = createOrchestratePrompt()
    const coder = createCoderPrompt()

    expectContainsAll(orchestrate, [
      "lead",
      "guide",
      "coordinate",
      "delegate",
      "group",
      "cluster",
      "parallel",
      "fan-out",
      "synthesize",
      "reconcile",
    ])
    expectContainsAll(groupPrompt, [
      "bucket",
      "cluster",
      "cohort",
      "common goal",
      "shared objective",
      "parallel lane",
      "fan-out",
      "fan-in",
      "grouped result",
    ])
    expectContainsAll(coder, ["reusable", "composable", "scoped", "interface", "handoff", "verification"])
    expectContainsAll(interfaceSkill, ["contract", "ownership boundary", "work-package map", "handoff README"])

    expect(requiredOrchestrationVocabulary("parallel-workstreams")).toContain("fan-out")
  })

  test("planner coder and interface skill share handoff terminology", async () => {
    const interfaceSkill = await Bun.file(
      new URL("../../../core/src/plugin/skill/interface.md", import.meta.url),
    ).text()
    const planner = createPlannerPrompt()
    const coder = createCoderPrompt()

    for (const value of [planner, coder, interfaceSkill]) {
      expectContainsAll(value, [
        "selected plan",
        "interface contract",
        "handoff README",
        "work-package",
        "ownership lane",
        "dependency boundary",
        "implementation slice",
        "review focus",
        "correctness criteria",
      ])
    }

    expectContainsAll(coder, ["blocker", "orchestrator"])
    expectContainsAll(interfaceSkill, ["blocker", "orchestrator"])
  })
})

function expectContainsAll(value: string, terms: string[]) {
  const lower = value.toLowerCase()
  for (const term of terms) {
    expect(lower).toContain(term.toLowerCase())
  }
}
