import * as Tool from "./tool"
import DESCRIPTION_TEXT from "./group.txt"
import { TaskTool } from "./task"
import { Cause, Effect, Exit, Schema } from "effect"
import { PromptBuilder } from "@/prompt/builder"
import { withParallelWorkstreams } from "@/prompt/packs"

const id = "group"
const DESCRIPTION = [
  DESCRIPTION_TEXT.trim(),
  PromptBuilder.create("tool.group").use(withParallelWorkstreams).compile({ compact: true }),
].join("\n\n")

const TaskInput = Schema.Struct({
  description: Schema.NonEmptyString.annotate({ description: "A short description of the nested task" }),
  prompt: Schema.NonEmptyString.annotate({
    description:
      "Concise task instructions for the subagent. Use handoff_files for large contracts, READMEs, and context documents.",
  }),
  subagent_type: Schema.NonEmptyString.annotate({ description: "The type of specialized agent to use for this task" }),
  handoff_files: Schema.optional(Schema.Array(Schema.NonEmptyString)).annotate({
    description:
      "Paths to handoff, interface, contract, or context files the nested task must read before starting.",
  }),
  task_id: Schema.optional(Schema.String).annotate({ description: "Existing task session ID to resume" }),
  command: Schema.optional(Schema.String).annotate({ description: "The command that triggered this task" }),
  background: Schema.optional(Schema.Boolean).annotate({
    description: "Unsupported in group v1. Nested calls must run in foreground.",
  }),
})

const NestedCall = Schema.Struct({
  tool: Schema.String.annotate({ description: 'Nested tool id. v1 supports only "task".' }),
  name: Schema.NonEmptyString.annotate({ description: "Stable nested call name" }),
  description: Schema.NonEmptyString.annotate({ description: "Nested call description" }),
  input: TaskInput,
})

export const Parameters = Schema.Struct({
  name: Schema.NonEmptyString.annotate({ description: "Stable group name" }),
  description: Schema.NonEmptyString.annotate({ description: "What this logical group is meant to accomplish" }),
  priority: Schema.Literals(["low", "medium", "high"])
    .annotate({ description: "Group priority. Defaults to medium.", default: "medium" })
    .pipe(Schema.withDecodingDefault(Effect.succeed("medium" as const))),
  calls: Schema.NonEmptyArray(NestedCall).annotate({
    description:
      "Nested task calls to execute concurrently. This is the parallel batch: include every ready sibling task in one group instead of drip-feeding serial task calls. After foundation/contracts exist, put engine, CLI, tests, docs, adapters, or UI together when they can work from the same handoff files.",
  }),
  fail_fast: Schema.optional(Schema.Boolean).annotate({
    description: "Defaults to false. v1 still waits for all nested calls to settle.",
  }),
})

type Params = typeof Parameters.Type

type CallResult = {
  index: number
  tool: "task"
  name: string
  description: string
  state: "completed" | "failed" | "aborted" | "blocked"
  title?: string
  metadata?: unknown
  output?: string
  error?: string
  durationMs: number
}

type GroupState = "completed" | "completed_with_errors" | "failed" | "aborted" | "blocked" | "completed_with_blockers"

type RunningCall = {
  index: number
  tool: "task"
  name: string
  description: string
  state: "running"
  title?: string
  metadata?: unknown
  durationMs: number
}

function validate(params: Params) {
  for (const [index, call] of params.calls.entries()) {
    if (call.tool === "group") throw new Error(`group call ${index} is recursive; nested group calls are not supported`)
    if (call.tool !== "task")
      throw new Error(`group call ${index} uses unsupported nested tool "${call.tool}"; v1 supports only "task"`)
    if (call.input.background === true)
      throw new Error(
        `group call ${index} sets input.background=true; nested background tasks are not supported in group v1`,
      )
  }
}

function safeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "group"
}

function escapeAttr(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function blockedOutput(output?: string) {
  if (!output) return false
  // TODO: Replace this structured-output convention with live parent-mediated
  // subagent question bridging after child sessions can safely suspend and
  // resume without violating provider tool-call/result matching.
  if (/<coder_result\b[^>]*\bstate\s*=\s*["']blocked["'][^>]*>/i.test(output)) return true
  return /<coder_result\b/i.test(output) && /<questions_for_orchestrator\b/i.test(output)
}

function callContent(call: CallResult) {
  if (call.state === "failed") return ["<call_error>", call.error ?? "Task failed", "</call_error>"]
  if (call.state === "aborted") return ["<call_aborted>", call.error ?? "Task aborted", "</call_aborted>"]
  if (call.state === "blocked") return ["<call_blocked>", call.output ?? "", "</call_blocked>"]
  return ["<call_result>", call.output ?? "", "</call_result>"]
}

function renderOutput(input: {
  name: string
  description: string
  priority: string
  state: GroupState
  completedCount: number
  failedCount: number
  abortedCount: number
  blockedCount: number
  calls: readonly CallResult[]
}) {
  return [
    `<group name="${escapeAttr(input.name)}" priority="${input.priority}" state="${input.state}">`,
    "<group_description>",
    input.description,
    "</group_description>",
    "<group_summary>",
    [
      `Completed ${input.completedCount} of ${input.calls.length} calls.`,
      `Failed ${input.failedCount} of ${input.calls.length} calls.`,
      `Aborted ${input.abortedCount} of ${input.calls.length} calls.`,
      `Blocked ${input.blockedCount} of ${input.calls.length} calls.`,
    ].join(" "),
    "</group_summary>",
    "<group_results>",
    ...input.calls.flatMap((call) => [
      [
        `<call index="${call.index}" tool="task" name="${escapeAttr(call.name)}"`,
        `title="${escapeAttr(call.title ?? call.name)}" state="${call.state}">`,
      ].join(" "),
      "<call_description>",
      call.description,
      "</call_description>",
      ...callContent(call),
      "</call>",
    ]),
    "</group_results>",
    "</group>",
  ].join("\n")
}

function stateFor(calls: readonly CallResult[], parentAborted: boolean) {
  if (parentAborted || calls.every((call) => call.state === "aborted")) return "aborted" as const
  const completedCount = calls.filter((call) => call.state === "completed").length
  const blockedCount = calls.filter((call) => call.state === "blocked").length
  const failedCount = calls.filter((call) => call.state === "failed").length
  const abortedCount = calls.filter((call) => call.state === "aborted").length
  if (completedCount === calls.length) return "completed" as const
  if (failedCount + abortedCount > 0)
    return completedCount === 0 && blockedCount === 0 ? ("failed" as const) : ("completed_with_errors" as const)
  if (blockedCount === calls.length) return "blocked" as const
  if (blockedCount > 0) return "completed_with_blockers" as const
  return "completed_with_errors" as const
}

function errorMessage(exit: Exit.Exit<unknown, unknown>) {
  if (Exit.isSuccess(exit)) return undefined
  const error = Cause.squash(exit.cause)
  return error instanceof Error ? error.message : String(error)
}

export const GroupTool = Tool.define(
  id,
  Effect.gen(function* () {
    const task = yield* TaskTool
    const taskDef = yield* task.init()

    return {
      description: DESCRIPTION,
      parameters: Parameters,
      execute: (params: Params, ctx: Tool.Context) =>
        Effect.gen(function* () {
          validate(params)

          const startedAt = Date.now()
          const groupName = safeName(params.name)
          const runningCalls: RunningCall[] = params.calls.map((call, index) => ({
            index,
            tool: "task",
            name: call.name,
            description: call.description,
            state: "running",
            durationMs: 0,
          }))
          const runningMetadata = () => ({
            group: {
              name: params.name,
              description: params.description,
              priority: params.priority,
              state: "running",
              callCount: params.calls.length,
              completedCount: 0,
              failedCount: 0,
              abortedCount: 0,
              blockedCount: 0,
              startedAt,
              completedAt: startedAt,
              durationMs: Date.now() - startedAt,
            },
            calls: runningCalls.map((call) => ({
              index: call.index,
              tool: call.tool,
              name: call.name,
              description: call.description,
              state: call.state,
              ...(call.title ? { title: call.title } : {}),
              ...(call.metadata !== undefined ? { metadata: call.metadata } : {}),
              durationMs: call.durationMs,
            })),
          })
          yield* ctx.ask({
            permission: id,
            patterns: [params.name],
            always: ["*"],
            metadata: {
              name: params.name,
              description: params.description,
              priority: params.priority,
              callCount: params.calls.length,
            },
          })
          yield* ctx.metadata({
            title: `Group: ${params.name}`,
            metadata: runningMetadata(),
          })

          // fail_fast is accepted for forward compatibility, but v1 keeps all-settled
          // semantics so every nested result can be returned in one grouped output.
          const calls = yield* Effect.forEach(
            params.calls,
            (call, index) =>
              Effect.gen(function* () {
                const callStarted = Date.now()
                const title = `${index + 1}. ${call.name || call.description}`
                const nestedCallID = [ctx.callID ?? "call", "group", groupName, String(index)].join(":")
                const exit = yield* taskDef
                  .execute(
                    {
                      description: call.input.description,
                      prompt: call.input.prompt,
                      subagent_type: call.input.subagent_type,
                      ...(call.input.handoff_files?.length ? { handoff_files: call.input.handoff_files } : {}),
                      ...(call.input.task_id ? { task_id: call.input.task_id } : {}),
                      ...(call.input.command ? { command: call.input.command } : {}),
                    },
                    {
                      ...ctx,
                      callID: nestedCallID,
                      metadata: (value) =>
                        Effect.gen(function* () {
                          runningCalls[index] = {
                            ...runningCalls[index],
                            title,
                            ...(value.metadata !== undefined ? { metadata: value.metadata } : {}),
                            durationMs: Date.now() - callStarted,
                          }
                          yield* ctx.metadata({
                            title: `Group: ${params.name}`,
                            metadata: runningMetadata(),
                          })
                        }),
                    },
                  )
                  .pipe(Effect.exit)
                const durationMs = Date.now() - callStarted
                if (Exit.isSuccess(exit)) {
                  const blocked = blockedOutput(exit.value.output)
                  if (ctx.abort.aborted) {
                    return {
                      index,
                      tool: "task" as const,
                      name: call.name,
                      description: call.description,
                      state: "aborted" as const,
                      title,
                      error: "Task aborted",
                      durationMs,
                    }
                  }
                  return {
                    index,
                    tool: "task" as const,
                    name: call.name,
                    description: call.description,
                    state: blocked ? ("blocked" as const) : ("completed" as const),
                    title,
                    metadata: exit.value.metadata,
                    output: exit.value.output,
                    durationMs,
                  }
                }
                return {
                  index,
                  tool: "task" as const,
                  name: call.name,
                  description: call.description,
                  state: ctx.abort.aborted ? ("aborted" as const) : ("failed" as const),
                  title,
                  error: errorMessage(exit),
                  durationMs,
                }
              }),
            { concurrency: "unbounded" },
          )

          const completedAt = Date.now()
          const completedCount = calls.filter((call) => call.state === "completed").length
          const failedCount = calls.filter((call) => call.state === "failed").length
          const abortedCount = calls.filter((call) => call.state === "aborted").length
          const blockedCount = calls.filter((call) => call.state === "blocked").length
          const state = stateFor(calls, ctx.abort.aborted)
          const metadata = {
            group: {
              name: params.name,
              description: params.description,
              priority: params.priority,
              state,
              callCount: calls.length,
              completedCount,
              failedCount,
              abortedCount,
              blockedCount,
              startedAt,
              completedAt,
              durationMs: completedAt - startedAt,
            },
            calls: calls.map((call) => ({
              index: call.index,
              tool: call.tool,
              name: call.name,
              description: call.description,
              state: call.state,
              ...(call.state === "blocked" ? { blocked: true } : {}),
              ...(call.title ? { title: call.title } : {}),
              ...(call.metadata !== undefined ? { metadata: call.metadata } : {}),
              durationMs: call.durationMs,
            })),
          }

          return {
            title: `Group: ${params.name}`,
            metadata,
            output: renderOutput({
              name: params.name,
              description: params.description,
              priority: params.priority,
              state,
              completedCount,
              failedCount,
              abortedCount,
              blockedCount,
              calls,
            }),
          }
        }),
    }
  }),
)
