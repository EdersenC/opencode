import type { PromptBuildOptions } from "@/prompt/builder"
import { createCoderPrompt } from "./coder"
import { createOrchestratePrompt } from "./orchestrate"
import { createPlannerPrompt } from "./planner"

const factories = {
  orchestrate: createOrchestratePrompt,
  planner: createPlannerPrompt,
  coder: createCoderPrompt,
}

export type AgentPromptName = keyof typeof factories

export function previewAgentPrompt(agentName: AgentPromptName, options: PromptBuildOptions = {}) {
  return factories[agentName](options)
}
