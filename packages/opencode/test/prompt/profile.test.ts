import { describe, expect, test } from "bun:test"
import { PromptBuilder } from "@/prompt/builder"
import { applyPromptProfile, resolvePromptProfile } from "@/prompt/profile"

describe("prompt profiles", () => {
  test("resolves deterministic default and explicit profiles", () => {
    expect(resolvePromptProfile().name).toBe("standard")
    expect(resolvePromptProfile({ profile: "compact" })).toMatchObject({
      name: "compact",
      compact: true,
      includeExamples: false,
      includePressure: false,
      detailLevel: "low",
      structureLevel: "light",
    })
    expect(resolvePromptProfile({ modelSize: "small" }).name).toBe("explicit")
    expect(resolvePromptProfile({ modelSize: "reasoning" }).name).toBe("reasoning")
  })

  test("applies profile defaults without overriding explicit options", () => {
    expect(applyPromptProfile({ profile: "compact" })).toMatchObject({
      profile: "compact",
      compact: true,
      includeExamples: false,
      includePressure: false,
    })
    expect(applyPromptProfile({ profile: "compact", includeExamples: true })).toMatchObject({
      profile: "compact",
      includeExamples: true,
    })
    expect(applyPromptProfile({ profile: "debug" }).includeDebugMarkers).toBe(true)
    expect(applyPromptProfile({ profile: "debug", includeDebugMarkers: false }).includeDebugMarkers).toBe(false)
  })

  test("profile-aware segment inclusion works during compile", () => {
    const builder = PromptBuilder.create("profiled")
      .goal("Always visible.")
      .pressure("Pressure visible outside compact.")
      .example("Example", "Example visible outside compact.")
      .when({ profile: "explicit" }, (prompt) => prompt.context("Explicit Only", "Strict checklist."))
      .when({ profile: "reasoning" }, (prompt) => prompt.modelNote("Autonomy note."))

    expect(builder.compile({ profile: "compact" })).not.toContain("Pressure visible outside compact.")
    expect(builder.compile({ profile: "compact" })).not.toContain("Example visible outside compact.")
    expect(builder.compile({ profile: "explicit" })).toContain("Strict checklist.")
    expect(builder.compile({ profile: "reasoning" })).toContain("Autonomy note.")
  })
})
