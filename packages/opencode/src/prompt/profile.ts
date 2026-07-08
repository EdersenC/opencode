import type { PromptBuildOptions } from "./builder"

export type PromptProfileName = "compact" | "standard" | "explicit" | "reasoning" | "debug"

export type PromptProfile = {
  name: PromptProfileName
  compact: boolean
  includeExamples: boolean
  includePressure: boolean
  detailLevel: "low" | "medium" | "high"
  structureLevel: "light" | "normal" | "strict"
}

const profiles = {
  compact: {
    name: "compact",
    compact: true,
    includeExamples: false,
    includePressure: false,
    detailLevel: "low",
    structureLevel: "light",
  },
  standard: {
    name: "standard",
    compact: false,
    includeExamples: true,
    includePressure: true,
    detailLevel: "medium",
    structureLevel: "normal",
  },
  explicit: {
    name: "explicit",
    compact: false,
    includeExamples: true,
    includePressure: true,
    detailLevel: "high",
    structureLevel: "strict",
  },
  reasoning: {
    name: "reasoning",
    compact: true,
    includeExamples: false,
    includePressure: true,
    detailLevel: "medium",
    structureLevel: "normal",
  },
  debug: {
    name: "debug",
    compact: false,
    includeExamples: true,
    includePressure: true,
    detailLevel: "high",
    structureLevel: "strict",
  },
} satisfies Record<PromptProfileName, PromptProfile>

export function resolvePromptProfile(options: PromptBuildOptions = {}): PromptProfile {
  return profiles[options.profile ?? inferProfileName(options)]
}

export function applyPromptProfile(options: PromptBuildOptions = {}): PromptBuildOptions {
  const profile = resolvePromptProfile(options)
  return {
    ...options,
    profile: profile.name,
    compact: options.compact ?? profile.compact,
    includeExamples: options.includeExamples ?? profile.includeExamples,
    includePressure: options.includePressure ?? profile.includePressure,
    includeDebugMarkers: options.includeDebugMarkers ?? profile.name === "debug",
  }
}

function inferProfileName(options: PromptBuildOptions): PromptProfileName {
  if (options.compact === true) return "compact"
  if (options.modelSize === "small") return "explicit"
  if (options.modelSize === "reasoning") return "reasoning"
  return "standard"
}
