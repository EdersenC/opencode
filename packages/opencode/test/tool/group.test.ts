import { afterEach, describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { Deferred, Effect, Exit, Fiber, Result, Schema } from "effect"
import { Agent } from "../../src/agent/agent"
import { BackgroundJob } from "@/background/job"
import { Config } from "@/config/config"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { EventV2Bridge } from "@/event-v2-bridge"
import { GroupTool, Parameters as GroupParameters } from "../../src/tool/group"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { ModelV2 } from "@opencode-ai/core/model"
import { withMode } from "@/permission/auto"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Session } from "@/session/session"
import { SessionRunState } from "@/session/run-state"
import { SessionStatus } from "@/session/status"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import type { TaskPromptOps } from "../../src/tool/task"
import { ToolRegistry } from "@/tool/registry"
import { Truncate } from "@/tool/truncate"
import { disposeAllInstances } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const layer = LayerNode.compile(
  LayerNode.group([
    Agent.node,
    BackgroundJob.node,
    Config.node,
    CrossSpawnSpawner.node,
    Database.node,
    EventV2Bridge.node,
    Ripgrep.node,
    RuntimeFlags.node,
    Session.node,
    SessionProjector.node,
    SessionRunState.node,
    SessionStatus.node,
    ToolRegistry.node,
    Truncate.node,
  ]),
  [[RuntimeFlags.node, RuntimeFlags.layer()]],
)

const it = testEffect(layer)

function parse(input: unknown) {
  return Schema.decodeUnknownResult(GroupParameters)(input)
}

function defer<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const seed = Effect.fn("GroupToolTest.seed")(function* () {
  const session = yield* Session.Service
  const chat = yield* session.create({ title: "Parent" })
  const user = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID: chat.id,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: user.id,
    sessionID: chat.id,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* session.updateMessage(assistant)
  return { chat, assistant }
})

function reply(input: SessionPromptInput, text: string): SessionV1.WithParts {
  const id = MessageID.ascending()
  return {
    info: {
      id,
      role: "assistant",
      parentID: input.messageID ?? MessageID.ascending(),
      sessionID: input.sessionID,
      mode: input.agent ?? "general",
      agent: input.agent ?? "general",
      cost: 0,
      path: { cwd: "/tmp", root: "/tmp" },
      tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      modelID: input.model?.modelID ?? ref.modelID,
      providerID: input.model?.providerID ?? ref.providerID,
      time: { created: Date.now() },
      finish: "stop",
    },
    parts: [
      {
        id: PartID.ascending(),
        messageID: id,
        sessionID: input.sessionID,
        type: "text",
        text,
      },
    ],
  }
}

type SessionPromptInput = Parameters<TaskPromptOps["prompt"]>[0]

const baseCall = {
  tool: "task",
  name: "one",
  description: "First task",
  input: {
    description: "First task",
    prompt: "Do first task",
    subagent_type: "general",
  },
}

function rawInput(overrides?: Record<string, unknown>) {
  return {
    name: "feature-implementation",
    description: "Implement feature pieces together.",
    priority: "medium",
    calls: [baseCall],
    ...overrides,
  }
}

function input(overrides?: Record<string, unknown>) {
  return Schema.decodeUnknownSync(GroupParameters)(rawInput(overrides))
}

function context(
  seedResult: { chat: Session.Info; assistant: SessionV1.Assistant },
  promptOps: TaskPromptOps,
  abort = new AbortController(),
) {
  return {
    sessionID: seedResult.chat.id,
    messageID: seedResult.assistant.id,
    agent: "build",
    abort: abort.signal,
    callID: "call_parent",
    extra: { promptOps },
    messages: [],
    metadata: () => Effect.void,
    ask: () => Effect.void,
  }
}

describe("tool.group parameters", () => {
  it.effect("validates required fields and nested tool constraints", () =>
    Effect.sync(() => {
      expect(Result.isFailure(parse(rawInput({ name: "" })))).toBe(true)
      expect(Result.isFailure(parse(rawInput({ description: "" })))).toBe(true)
      expect(Result.isFailure(parse(rawInput({ calls: [] })))).toBe(true)
      expect(Result.isFailure(parse(rawInput({ priority: "urgent" })))).toBe(true)
      expect(Result.isSuccess(parse(rawInput()))).toBe(true)
      expect(Result.isSuccess(parse(rawInput({ priority: undefined })))).toBe(true)
    }),
  )
})

describe("tool.group", () => {
  it.instance("is registered as a built-in tool without removing task", () =>
    Effect.gen(function* () {
      const registry = yield* ToolRegistry.Service
      const ids = yield* registry.ids()
      expect(ids).toContain("group")
      expect(ids).toContain("task")
    }),
  )

  it.instance("description teaches full ready-batch parallel dispatch", () =>
    Effect.gen(function* () {
      const tool = yield* GroupTool
      const def = yield* tool.init()

      expect(def.description).toContain("all of those inner task calls start concurrently")
      expect(def.description).toContain("dispatch them together in one implementation group")
      expect(def.description).toContain("Keep nested coder prompts concise")
      expect(def.description).toContain("not limited to one or two task calls")
      expect(def.description).toContain("Do not call a single-coder group")
      expect(def.description).toContain("Do not serially drip-feed engine, CLI, tests, and docs")
      expect(def.description).toContain("Treat calls[] as the batch")
      expect(def.description).toContain("A single nested task is not parallel")
      expect(def.description).toContain("Do not run engine first, then CLI, then tests")
      expect(def.description).toContain("Use descriptive group.name and calls[].name values")
      expect(def.description).toContain("distinguish completed, failed, aborted, and blocked calls")
      expect(def.description).toContain("Batch before narration")
      expect(def.description).toContain("If only one nested coder call is ready")
      expect(def.description).toContain("reclassify deferred slices once")
    }),
  )

  it.instance("rejects unsupported nested tools, recursive group calls, and nested background tasks", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const tool = yield* GroupTool
      const def = yield* tool.init()
      const promptOps: TaskPromptOps = {
        cancel: () => Effect.void,
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (promptInput) => Effect.succeed(reply(promptInput, "done")),
      }
      const run = (value: typeof GroupParameters.Type) =>
        def.execute(value, context(seedResult, promptOps)).pipe(Effect.exit)

      const unsupported = yield* run(input({ calls: [{ ...baseCall, tool: "bash" }] }))
      const recursive = yield* run(input({ calls: [{ ...baseCall, tool: "group" }] }))
      const background = yield* run(
        input({ calls: [{ ...baseCall, input: { ...baseCall.input, background: true } }] }),
      )

      expect(Exit.isFailure(unsupported)).toBe(true)
      expect(Exit.isFailure(recursive)).toBe(true)
      expect(Exit.isFailure(background)).toBe(true)
    }),
  )

  it.instance("passes nested task handoff files through to the child prompt", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const seen: string[] = []
      const promptOps: TaskPromptOps = {
        cancel: () => Effect.void,
        resolvePromptParts: (template) =>
          Effect.sync(() => {
            seen.push(template)
            return [{ type: "text" as const, text: template }]
          }),
        prompt: (promptInput) => Effect.succeed(reply(promptInput, "done")),
      }
      const tool = yield* GroupTool
      const def = yield* tool.init()

      const result = yield* def.execute(
        input({
          calls: [
            {
              tool: "task",
              name: "core-domain-coder",
              description: "Implement the core domain module",
              input: {
                description: "Implement core domain",
                prompt: "Implement the scoped work package.",
                subagent_type: "coder",
                handoff_files: [
                  "docs/orchestration/feature/work-packages.md",
                  "docs/orchestration/feature/contracts.md",
                  "docs/orchestration/feature/core/README.md",
                ],
              },
            },
          ],
        }),
        context(seedResult, promptOps),
      )

      expect(result.metadata.group.state).toBe("completed")
      expect(seen).toHaveLength(1)
      expect(seen[0]).toContain("<handoff_files>")
      expect(seen[0]).toContain("- docs/orchestration/feature/work-packages.md")
      expect(seen[0]).toContain("- docs/orchestration/feature/contracts.md")
      expect(seen[0]).toContain("- docs/orchestration/feature/core/README.md")
      expect(seen[0]).toContain("<task_prompt>\nImplement the scoped work package.\n</task_prompt>")
    }),
  )

  it.instance("executes nested task calls concurrently and waits for all results", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const firstDone = yield* Deferred.make<void>()
      const secondDone = yield* Deferred.make<void>()
      const bothStarted = yield* Deferred.make<void>()
      let started = 0
      const promptOps: TaskPromptOps = {
        cancel: () => Effect.void,
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (promptInput) =>
          Effect.gen(function* () {
            started += 1
            if (started === 2) yield* Deferred.succeed(bothStarted, undefined)
            if (promptInput.parts[0]?.type === "text" && promptInput.parts[0].text.includes("first")) {
              yield* Deferred.await(firstDone)
            } else {
              yield* Deferred.await(secondDone)
            }
            return reply(promptInput, `${promptInput.agent} done ${started}`)
          }),
      }
      const tool = yield* GroupTool
      const def = yield* tool.init()
      let completed = false
      const fiber = yield* def
        .execute(
          input({
            calls: [
              {
                tool: "task",
                name: "first",
                description: "First concurrent task",
                input: { description: "First task", prompt: "first", subagent_type: "general" },
              },
              {
                tool: "task",
                name: "second",
                description: "Second concurrent task",
                input: { description: "Second task", prompt: "second", subagent_type: "general" },
              },
            ],
          }),
          context(seedResult, promptOps),
        )
        .pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              completed = true
            }),
          ),
        )
        .pipe(Effect.forkChild)

      yield* Deferred.await(bothStarted)
      expect(completed).toBe(false)

      yield* Deferred.succeed(firstDone, undefined)
      yield* Effect.yieldNow
      expect(completed).toBe(false)

      yield* Deferred.succeed(secondDone, undefined)
      const result = yield* Fiber.join(fiber)
      expect(result.metadata.group.state).toBe("completed")
      expect(result.output).toContain(`<call index="0" tool="task" name="first" title="1. first" state="completed">`)
      expect(result.output).toContain(`<call index="1" tool="task" name="second" title="2. second" state="completed">`)
    }),
  )

  it.instance("returns completed_with_errors when fail_fast is false and one nested task fails", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const promptOps: TaskPromptOps = {
        cancel: () => Effect.void,
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (promptInput) =>
          promptInput.parts[0]?.type === "text" && promptInput.parts[0].text.includes("fail")
            ? Effect.die(new Error("nested failed"))
            : Effect.succeed(reply(promptInput, "nested succeeded")),
      }
      const tool = yield* GroupTool
      const def = yield* tool.init()
      const result = yield* def.execute(
        input({
          calls: [
            {
              tool: "task",
              name: "success",
              description: "Successful task",
              input: { description: "Success task", prompt: "succeed", subagent_type: "general" },
            },
            {
              tool: "task",
              name: "failure",
              description: "Failing task",
              input: { description: "Failure task", prompt: "fail", subagent_type: "general" },
            },
          ],
        }),
        context(seedResult, promptOps),
      )

      expect(result.metadata.group.state).toBe("completed_with_errors")
      expect(result.metadata.group.completedCount).toBe(1)
      expect(result.metadata.group.failedCount).toBe(1)
      expect(result.output).toContain("<call_result>")
      expect(result.output).toContain("<call_error>")
      expect(result.output).toContain("nested failed")
    }),
  )

  it.instance("preserves blocked coder results in metadata and output", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const blocked = [
        '<coder_result state="blocked">',
        "<summary>Implementation is blocked by one or more questions.</summary>",
        "<questions_for_orchestrator>",
        '<question priority="high" type="contract">Which DTO owns this field?</question>',
        "</questions_for_orchestrator>",
        "<recommended_options><option id=\"A\">Keep it in core.</option></recommended_options>",
        "<safe_default>Keep the field out of the public contract.</safe_default>",
        "</coder_result>",
      ].join("\n")
      const promptOps: TaskPromptOps = {
        cancel: () => Effect.void,
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (promptInput) =>
          Effect.succeed(reply(promptInput, promptInput.agent === "coder" ? blocked : "nested succeeded")),
      }
      const tool = yield* GroupTool
      const def = yield* tool.init()
      const result = yield* def.execute(
        input({
          calls: [
            {
              tool: "task",
              name: "blocked-coder",
              description: "Blocked coder task",
              input: { description: "Blocked coder", prompt: "blocked", subagent_type: "coder" },
            },
            {
              tool: "task",
              name: "success",
              description: "Successful task",
              input: { description: "Success task", prompt: "succeed", subagent_type: "general" },
            },
          ],
        }),
        context(seedResult, promptOps),
      )

      expect(result.metadata.group.state).toBe("completed_with_blockers")
      expect(result.metadata.group.completedCount).toBe(1)
      expect(result.metadata.group.failedCount).toBe(0)
      expect(result.metadata.group.blockedCount).toBe(1)
      expect(result.metadata.calls[0]).toMatchObject({ state: "blocked", blocked: true })
      expect(result.metadata.calls[1]).toMatchObject({ state: "completed" })
      expect(result.output).toContain('state="completed_with_blockers"')
      expect(result.output).toContain('name="blocked-coder" title="1. blocked-coder" state="blocked"')
      expect(result.output).toContain("<call_blocked>")
      expect(result.output).toContain('<question priority="high" type="contract">')
      expect(result.output).toContain("Blocked 1 of 2 calls.")
    }),
  )

  it.instance("cancels nested task calls when the parent abort signal fires", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const abort = new AbortController()
      const ready = defer<SessionPromptInput>()
      const cancelled = defer<SessionID>()
      const promptOps: TaskPromptOps = {
        cancel: (sessionID) =>
          Effect.sync(() => {
            cancelled.resolve(sessionID)
          }),
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (promptInput) =>
          Effect.promise(() => {
            ready.resolve(promptInput)
            return cancelled.promise
          }).pipe(Effect.as(reply(promptInput, "cancelled"))),
      }
      const tool = yield* GroupTool
      const def = yield* tool.init()
      const fiber = yield* def.execute(input(), context(seedResult, promptOps, abort)).pipe(Effect.forkChild)

      const promptInput = yield* Effect.promise(() => ready.promise)
      abort.abort()
      expect(yield* Effect.promise(() => cancelled.promise)).toBe(promptInput.sessionID)
      const result = yield* Fiber.join(fiber)
      expect(result.metadata.group.state).toBe("aborted")
      expect(result.metadata.group.failedCount).toBe(0)
      expect(result.metadata.group.abortedCount).toBe(1)
      expect(result.metadata.calls[0].state).toBe("aborted")
      expect(result.output).toContain(`state="aborted"`)
      expect(result.output).toContain("Failed 0 of 1 calls.")
      expect(result.output).toContain("Aborted 1 of 1 calls.")
      expect(result.output).toContain("<call_aborted>")
    }),
  )

  it.instance("preserves priority metadata and asks group plus inner task permissions", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const asks: unknown[] = []
      const promptOps: TaskPromptOps = {
        cancel: () => Effect.void,
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (promptInput) => Effect.succeed(reply(promptInput, "done")),
      }
      const tool = yield* GroupTool
      const def = yield* tool.init()
      const result = yield* def.execute(input({ priority: "high" }), {
        ...context(seedResult, promptOps),
        ask: (value) =>
          Effect.sync(() => {
            asks.push(value)
          }),
      })

      expect(result.metadata.group.priority).toBe("high")
      expect(result.output).toContain(`priority="high"`)
      expect(asks).toEqual([
        expect.objectContaining({ permission: "group", patterns: ["feature-implementation"] }),
        expect.objectContaining({ permission: "task", patterns: ["general"] }),
      ])
    }),
  )

  it.instance("does not strip auto permission mode from group or nested task asks", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const asks: unknown[] = []
      const promptOps: TaskPromptOps = {
        cancel: () => Effect.void,
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (promptInput) => Effect.succeed(reply(promptInput, "done")),
      }
      const tool = yield* GroupTool
      const def = yield* tool.init()
      yield* def.execute(input({ priority: "high" }), {
        ...context(seedResult, promptOps),
        ask: (value) =>
          Effect.sync(() => {
            asks.push({
              ...value,
              metadata: withMode(value.metadata, "auto"),
            })
          }),
      })

      expect(asks).toEqual([
        expect.objectContaining({
          permission: "group",
          metadata: expect.objectContaining({ permissionMode: "auto" }),
        }),
        expect.objectContaining({
          permission: "task",
          patterns: ["general"],
          metadata: expect.objectContaining({ permissionMode: "auto" }),
        }),
      ])
    }),
  )

  it.instance("returns medium priority in metadata and output", () =>
    Effect.gen(function* () {
      const seedResult = yield* seed()
      const promptOps: TaskPromptOps = {
        cancel: () => Effect.void,
        resolvePromptParts: (template) => Effect.succeed([{ type: "text" as const, text: template }]),
        prompt: (promptInput) => Effect.succeed(reply(promptInput, "done")),
      }
      const tool = yield* GroupTool
      const def = yield* tool.init()
      const result = yield* def.execute(input(), context(seedResult, promptOps))

      expect(result.metadata.group.priority).toBe("medium")
      expect(result.output).toContain(`priority="medium"`)
    }),
  )
})
