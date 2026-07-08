import { describe, expect } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { SkillPlugin } from "@opencode-ai/core/plugin/skill"
import { SkillV2 } from "@opencode-ai/core/skill"
import { testEffect } from "../lib/effect"
import { host } from "./host"

const it = testEffect(AppNodeBuilder.build(SkillV2.node))

describe("SkillPlugin.Plugin", () => {
  it.effect("registers built-in skills", () =>
    Effect.gen(function* () {
      const skill = yield* SkillV2.Service
      yield* SkillPlugin.Plugin.effect(host({ skill: { ...skill, reload: skill.reload } }))

      const list = yield* skill.list()
      expect(list).toContainEqual(
        expect.objectContaining({ name: "customize-opencode", description: expect.stringContaining("opencode's own configuration") }),
      )
      expect(list).toContainEqual(
        expect.objectContaining({ name: "interface", description: expect.stringContaining("contract-first interfaces") }),
      )
      expect(list.find((item) => item.name === "interface")?.content).toContain("handoff README")
      expect(list.find((item) => item.name === "interface")?.content).toContain("work-package map")
      expect(list.find((item) => item.name === "interface")?.content).toContain("ownership boundaries")
      expect(list.find((item) => item.name === "interface")?.content).toContain("shared objective")
      expect(list.find((item) => item.name === "interface")?.content).toContain("fan-out/fan-in")
      expect(list.find((item) => item.name === "interface")?.content).toContain("coder dispatch prompts")
      expect(list.find((item) => item.name === "interface")?.content).toContain("ready-now coder batch")
      expect(list.find((item) => item.name === "interface")?.content).toContain("Blocked by")
      expect(list.find((item) => item.name === "interface")?.content).toContain("Correctness Criteria")
      expect(list.find((item) => item.name === "interface")?.content).toContain("Review Focus")
    }),
  )
})
