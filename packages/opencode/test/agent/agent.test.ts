import { afterEach, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { Cause, Effect, Exit, Layer } from "effect"
import path from "path"
import { disposeAllInstances, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { Agent } from "../../src/agent/agent"
import { Auth } from "../../src/auth"
import { Config } from "../../src/config/config"
import { RuntimeFlags } from "../../src/effect/runtime-flags"
import { Global } from "@opencode-ai/core/global"
import { Permission } from "../../src/permission"
import { PermissionV1 } from "@opencode-ai/core/v1/permission"
import { Plugin } from "../../src/plugin"
import { Provider } from "../../src/provider/provider"
import { Skill } from "../../src/skill"
import { Truncate } from "../../src/tool/truncate"

const agentLayer = (flags: Partial<RuntimeFlags.Info> = {}) =>
  LayerNode.compile(
    LayerNode.group([Agent.node, Plugin.node, Provider.node, Auth.node, Config.node, Skill.node, RuntimeFlags.node]),
    [[RuntimeFlags.node, RuntimeFlags.layer(flags)]],
  )

const it = testEffect(agentLayer())

// Helper to evaluate permission for a tool with wildcard pattern
function evalPerm(agent: Agent.Info | undefined, permission: string): PermissionV1.Action | undefined {
  if (!agent) return undefined
  return Permission.evaluate(permission, "*", agent.permission).action
}

function load<A>(fn: (svc: Agent.Interface) => Effect.Effect<A>) {
  return Agent.Service.use(fn)
}

const expectDefaultAgentError = Effect.fn("AgentTest.expectDefaultAgentError")(function* (message: string) {
  const exit = yield* load((svc) => svc.defaultAgent()).pipe(Effect.exit)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain(message)
})

afterEach(async () => {
  await disposeAllInstances()
})

it.instance("returns default native agents when no config", () =>
  Effect.gen(function* () {
    const agents = yield* load((svc) => svc.list())
    const names = agents.map((a) => a.name)
    expect(names).toContain("build")
    expect(names).toContain("plan")
    expect(names).toContain("orchestrate")
    expect(names).toContain("general")
    expect(names).toContain("explore")
    expect(names).toContain("planner")
    expect(names).toContain("coder")
    expect(names).toContain("compaction")
    expect(names).toContain("title")
    expect(names).toContain("summary")
  }),
)

it.instance("build agent has correct default properties", () =>
  Effect.gen(function* () {
    const build = yield* load((svc) => svc.get("build"))
    expect(build).toBeDefined()
    expect(build?.mode).toBe("primary")
    expect(build?.native).toBe(true)
    expect(evalPerm(build, "edit")).toBe("allow")
    expect(evalPerm(build, "read")).toBe("allow")
    expect(evalPerm(build, "group")).toBe("allow")
    expect(evalPerm(build, "task")).toBe("allow")
    expect(evalPerm(build, "glob")).toBe("allow")
    expect(evalPerm(build, "grep")).toBe("allow")
    expect(evalPerm(build, "bash")).toBe("ask")
    expect(evalPerm(build, "question")).toBe("deny")
    expect(evalPerm(build, "skill")).toBe("deny")
    expect(evalPerm(build, "todowrite")).toBe("deny")
    expect(evalPerm(build, "webfetch")).toBe("deny")
    expect(evalPerm(build, "websearch")).toBe("deny")
  }),
)

it.instance("orchestrate agent has grouped-subagent permissions", () =>
  Effect.gen(function* () {
    const orchestrate = yield* load((svc) => svc.get("orchestrate"))
    expect(orchestrate).toBeDefined()
    expect(orchestrate?.mode).toBe("primary")
    expect(orchestrate?.native).toBe(true)
    expect(orchestrate?.description).toBe("Orchestrate mode. Decomposes large goals into grouped parallel subagent work.")
    expect(orchestrate?.prompt).toContain("You are the Orchestrate agent")
    expect(evalPerm(orchestrate, "question")).toBe("allow")
    expect(evalPerm(orchestrate, "group")).toBe("allow")
    expect(evalPerm(orchestrate, "task")).toBe("allow")
    expect(Permission.evaluate("task", "general", orchestrate!.permission).action).toBe("allow")
    expect(Permission.evaluate("task", "explore", orchestrate!.permission).action).toBe("allow")
    expect(Permission.evaluate("task", "scout", orchestrate!.permission).action).toBe("allow")
    expect(Permission.evaluate("task", "planner", orchestrate!.permission).action).toBe("allow")
    expect(Permission.evaluate("task", "coder", orchestrate!.permission).action).toBe("allow")
    expect(Permission.evaluate("skill", "interface", orchestrate!.permission).action).toBe("allow")
    expect(Permission.evaluate("skill", "customize-opencode", orchestrate!.permission).action).toBe("deny")
    expect(evalPerm(orchestrate, "edit")).toBe("allow")
    expect(evalPerm(orchestrate, "read")).toBe("allow")
    expect(evalPerm(orchestrate, "glob")).toBe("allow")
    expect(evalPerm(orchestrate, "grep")).toBe("allow")
    expect(evalPerm(orchestrate, "bash")).toBe("ask")
    expect(evalPerm(orchestrate, "skill")).toBe("deny")
    expect(evalPerm(orchestrate, "todowrite")).toBe("deny")
    expect(evalPerm(orchestrate, "webfetch")).toBe("deny")
    expect(evalPerm(orchestrate, "websearch")).toBe("deny")
  }),
)

it.instance("coder agent is an implementation subagent without recursive delegation", () =>
  Effect.gen(function* () {
    const coder = yield* load((svc) => svc.get("coder"))
    expect(coder).toBeDefined()
    expect(coder?.mode).toBe("subagent")
    expect(coder?.native).toBe(true)
    expect(coder?.description).toBe("Implementation subagent for scoped, high-quality coding work.")
    expect(coder?.prompt).toContain("You are the Coder subagent")
    expect(evalPerm(coder, "read")).toBe("allow")
    expect(Permission.evaluate("read", "secrets.env", coder!.permission).action).toBe("ask")
    expect(Permission.evaluate("read", "secrets.env.local", coder!.permission).action).toBe("ask")
    expect(Permission.evaluate("read", "secrets.env.example", coder!.permission).action).toBe("allow")
    expect(evalPerm(coder, "list")).toBe("allow")
    expect(evalPerm(coder, "glob")).toBe("allow")
    expect(evalPerm(coder, "grep")).toBe("allow")
    expect(evalPerm(coder, "edit")).toBe("allow")
    expect(evalPerm(coder, "bash")).toBe("ask")
    expect(evalPerm(coder, "question")).toBe("deny")
    expect(evalPerm(coder, "task")).toBe("deny")
    expect(evalPerm(coder, "group")).toBe("deny")
    expect(evalPerm(coder, "todowrite")).toBe("deny")
    expect(evalPerm(coder, "webfetch")).toBe("deny")
    expect(evalPerm(coder, "websearch")).toBe("deny")
  }),
)

it.instance("planner agent is a read-only native planning subagent", () =>
  Effect.gen(function* () {
    const planner = yield* load((svc) => svc.get("planner"))
    expect(planner).toBeDefined()
    expect(planner?.mode).toBe("subagent")
    expect(planner?.native).toBe(true)
    expect(planner?.description).toBe(
      "Creates one concrete implementation plan for a complex task. Use multiple planner agents in parallel to compare approaches.",
    )
    expect(planner?.prompt).toContain("You are the Planner subagent")
    expect(evalPerm(planner, "read")).toBe("allow")
    expect(Permission.evaluate("read", "secrets.env", planner!.permission).action).toBe("ask")
    expect(Permission.evaluate("read", "secrets.env.local", planner!.permission).action).toBe("ask")
    expect(Permission.evaluate("read", "secrets.env.example", planner!.permission).action).toBe("allow")
    expect(evalPerm(planner, "list")).toBe("allow")
    expect(evalPerm(planner, "glob")).toBe("allow")
    expect(evalPerm(planner, "grep")).toBe("allow")
    expect(evalPerm(planner, "webfetch")).toBe("allow")
    expect(evalPerm(planner, "websearch")).toBe("allow")
    expect(evalPerm(planner, "bash")).toBe("deny")
    expect(evalPerm(planner, "edit")).toBe("deny")
    expect(evalPerm(planner, "write")).toBe("deny")
    expect(evalPerm(planner, "apply_patch")).toBe("deny")
    expect(evalPerm(planner, "task")).toBe("deny")
    expect(evalPerm(planner, "group")).toBe("deny")
    expect(evalPerm(planner, "todowrite")).toBe("deny")
  }),
)

it.instance("orchestrate prompt documents grouped multi-plan workflow and question discipline", () =>
  Effect.gen(function* () {
    const orchestrate = yield* load((svc) => svc.get("orchestrate"))
    const prompt = orchestrate?.prompt ?? ""
    const lower = prompt.toLowerCase()

    expect(lower).toContain("question tool")
    expect(lower).toContain("group tool")
    expect(lower).toContain("task calls")
    expect(lower).toContain("multi-plan")
    expect(lower).toContain("inspect the repository first")
    expect(lower).toContain("ask targeted questions")
    expect(lower).toContain("do not ask questions that can be answered by reading the repo")
    expect(lower).toContain("ask questions when they are likely to materially improve the work")
    expect(lower).toContain("not only when you are completely blocked")
    expect(lower).toContain("default to asking at least one targeted question")
    expect(lower).toContain("before multi-plan generation")
    expect(lower).toContain("target platform")
    expect(lower).toContain("framework")
    expect(lower).toContain("data model")
    expect(lower).toContain("acceptance criteria")
    expect(lower).toContain("do not let planner fanout substitute for user clarification")
    expect(lower).toContain("ask first, then plan")
    expect(lower).toContain("usually 1-3 questions")
    expect(lower).toContain("one group call equals one logical bucket")
    expect(lower).toContain("use multiple group calls in the same assistant message")
    expect(lower).toContain("priority")
    expect(lower).toContain("avoid having two subagents edit the same file")
    expect(lower).toContain("after grouped results return")
    expect(lower).toContain("for tiny edits")
    expect(lower).toContain("if the repo appears empty or uninitialized")
    expect(lower).toContain("fanout sizing protocol")
    expect(lower).toContain("user prompt breadth")
    expect(lower).toContain("potential difficulty")
    expect(lower).toContain("codebase size")
    expect(lower).toContain("independent workstreams")
    expect(lower).toContain("failure blast radius")
    expect(lower).toContain("use 2 planner tasks for medium tasks")
    expect(lower).toContain("use 3 planner tasks for large tasks")
    expect(lower).toContain("use 4 planner tasks")
    expect(lower).toContain("distinct angle or independent workstream")
    expect(lower).toContain("prefer 2-6 task calls")
    expect(lower).toContain("do not make the user watch avoidable serial phases")
    expect(lower).toContain("implementation dispatch protocol")
    expect(lower).toContain("assign each slice to a coder task")
    expect(lower).toContain("use group to run independent coder tasks concurrently")
    expect(lower).toContain("readiness batching check")
    expect(lower).toContain("parallel dispatch audit")
    expect(lower).toContain("batch-first dispatch loop")
    expect(lower).toContain("construct the widest safe ready-now batch")
    expect(lower).toContain("classify each possible implementation slice")
    expect(lower).toContain("ready-now, blocked-by-dependency, or not-worth-a-subagent")
    expect(lower).toContain("maintain a pending-slices list")
    expect(lower).toContain("treat user wait time as a resource")
    expect(lower).toContain("descriptive group and call names")
    expect(lower).toContain("serial coder drip-feeding is a dispatch failure")
    expect(lower).toContain("do not split foundation -> engine -> cli -> tests into four user waits")
    expect(lower).toContain("launch them together")
    expect(lower).toContain("contract-ready task should not wait for sibling code")
    expect(lower).toContain("one coder per coherent ownership boundary")
    expect(lower).toContain("interface or handoff readme path")
    expect(lower).toContain("use the interface skill")
    expect(lower).toContain("contract-first interface phase")
    expect(lower).toContain("contract/interface files")
    expect(lower).toContain("handoff readmes")
    expect(lower).toContain("work-package map")
    expect(lower).toContain("handoff_files arrays for each coder task")
    expect(lower).toContain("ready-now coder batch")
    expect(lower).toContain("blocked-by-dependency coder batch")
    expect(lower).toContain("before launching multiple coder agents")
    expect(lower).toContain("before coder dispatch")
    expect(lower).toContain("loading the interface skill is not a reason to self-implement")
    expect(lower).toContain("task input handoff_files array")
    expect(lower).toContain("do not paste large handoff docs")
    expect(lower).toContain("keep coder prompts small enough to scan")
    expect(lower).toContain("for real coding work, default to coder agents")
    expect(lower).toContain("do not describe yourself as the sole implementer")
    expect(lower).toContain("do not use being the active agent as a reason to skip coder dispatch")
    expect(lower).toContain("do not use speed, convenience, a complete mental model, or tightly coupled files")
    expect(lower).toContain("tightly coupled")
    expect(lower).toContain("sequence coder work")
    expect(lower).toContain("sequential coder groups")
    expect(lower).toContain("do not announce phase 2 as parallel and then call only engine")
    expect(lower).toContain("do not split engine, cli, tests, docs, adapters, or ui")
    expect(lower).toContain("do not show the user giant coder prompts")
    expect(lower).toContain("shared types")
    expect(lower).toContain("one larger coherent slice")
    expect(lower).toContain("evidence for coder dispatch")
    expect(lower).toContain("post-foundation anti-pattern")
    expect(lower).toContain("foundation complete -> engine-services only -> wait -> cli-interface only")
    expect(lower).toContain("if you defer a coder slice after foundation")
    expect(lower).toContain("name the exact missing concrete artifact")
    expect(lower).toContain("use direct editing only for tiny")
    expect(lower).toContain("if you self-implement")
    expect(lower).toContain("medium, large, multi-file, or multi-module coding")
    expect(lower).toContain("group + coder task calls")
    expect(lower).toContain("treat interface contracts as source of truth")
    expect(lower).toContain("boundary-based")
    expect(lower).toContain("<coder_result state=\"blocked\">")
    expect(lower).toContain("<questions_for_orchestrator>")
    expect(lower).toContain("answer coder questions yourself")
    expect(lower).toContain("user-facing question tool only when")
    expect(lower).toContain("redispatch only the affected coder tasks")
    expect(lower).toContain("do not restart all implementation work unnecessarily")
    expect(lower).toContain("update the relevant interface files or handoff readme")
    expect(lower).toContain("review and reconcile coder output")
    expect(lower).toContain("do not immediately declare success")
    expect(lower).toContain("inspect actual diffs")
    expect(lower).toContain("git diff/status")
    expect(lower).toContain("compare changes against interface docs")
    expect(lower).toContain("run focused tests")
    expect(lower).toContain("broken interfaces")
    expect(lower).toContain("inconsistent contracts")
    expect(lower).toContain("duplicated abstractions")
    expect(lower).toContain("style mismatches")
    expect(lower).toContain("missing tests")
    expect(lower).toContain("leaky boundaries")
    expect(lower).toContain("security, reliability, and performance risks")
    expect(lower).toContain("fix small issues directly")
    expect(lower).toContain("targeted follow-up coder task")
    expect(lower).toContain("use another group for multiple independent follow-up fixes")
    expect(lower).toContain("limit review/fix loops to at most two redispatch rounds")
    expect(lower).toContain("do not claim completion before reviewing coder output")
    expect(lower).toContain("final responses")
    expect(lower).toContain("what not to touch")
    expect(lower).toContain("\"handoff_files\"")
    expect(lower).toContain("subagent_type\": \"coder")
    expect(lower).toContain("subagent_type\": \"planner")
    expect(lower).toContain("auto mode awareness")
    expect(lower).toContain("use local verification commands freely")
    expect(lower).toContain("focused tests, typechecks, linters, and build commands")
    expect(lower).toContain("auto does not mean external deploys, publishing, git pushes, or system mutations are safe")
    expect(lower).toContain("continue asking the user for product, architecture")
  }),
)

it.instance("coder prompt requires scoped implementation quality and structured output", () =>
  Effect.gen(function* () {
    const coder = yield* load((svc) => svc.get("coder"))
    const prompt = coder?.prompt ?? ""
    const lower = prompt.toLowerCase()

    expect(lower).toContain("interface or handoff readme")
    expect(lower).toContain("handoff_files")
    expect(lower).toContain("read it first")
    expect(lower).toContain("assume the handoff files contain the detailed context")
    expect(lower).toContain("treat interface contracts as the source of truth")
    expect(lower).toContain("implement the assigned contract")
    expect(lower).toContain("avoid changing shared contracts unless explicitly told")
    expect(lower).toContain("report a structured question to the orchestrator instead of silently inventing incompatible behavior")
    expect(lower).toContain("expect the orchestrator to review your work")
    expect(lower).toContain("return enough information for review")
    expect(lower).toContain("keep changes focused and reviewable")
    expect(lower).toContain("sequential tightly coupled implementation")
    expect(lower).toContain("make the next coder's job easier")
    expect(lower).toContain("reporting any ordering assumptions")
    expect(lower).toContain("if sibling implementation code is not present yet")
    expect(lower).toContain("implement against the contract")
    expect(lower).toContain("do not stop only because another coder is working")
    expect(lower).toContain("in auto mode, run focused local verification commands when useful")
    expect(lower).toContain("assigned package or directory")
    expect(lower).toContain("do not run deploy, publish, git push, or system mutation commands")
    expect(lower).toContain("report all commands run and their results")
    expect(lower).toContain("do not hide skipped verification")
    expect(lower).toContain("flag any intentional deviation from interface docs")
    expect(lower).toContain("<deviations_from_interface_docs>")
    expect(lower).toContain("continue independently when ambiguity has a safe local default")
    expect(lower).toContain("escalate only material blockers")
    expect(lower).toContain("<coder_result state=\"blocked\">")
    expect(lower).toContain("<question priority=\"high\" type=\"contract\">")
    expect(lower).toContain("<recommended_options>")
    expect(lower).toContain("<safe_default>")
    expect(lower).toContain("contract: interface or handoff doc is incomplete")
    expect(lower).toContain("integration: external api")
    expect(lower).toContain("do not use the user-facing question tool")
    expect(lower).toContain("assigned scope")
    expect(lower).toContain("reusable, composable code")
    expect(lower).toContain("clear boundaries between modules")
    expect(lower).toContain("add or update tests")
    expect(lower).toContain("questions_for_orchestrator")
    expect(lower).toContain("<coder_result>")
    expect(lower).toContain("<files_inspected>")
    expect(lower).toContain("<files_changed>")
    expect(lower).toContain("<implementation_notes>")
    expect(lower).toContain("<quality_notes>")
    expect(lower).toContain("<tests_run>")
    expect(lower).toContain("<risks>")
  }),
)

it.instance("planner prompt requires read-only structured single-plan output", () =>
  Effect.gen(function* () {
    const planner = yield* load((svc) => svc.get("planner"))
    const prompt = planner?.prompt ?? ""
    const lower = prompt.toLowerCase()

    expect(lower).toContain("stay read-only")
    expect(lower).toContain("produce exactly one plan")
    expect(lower).toContain("inspect relevant project files")
    expect(lower).toContain("repository is empty")
    expect(lower).toContain("recommended coder work packages")
    expect(lower).toContain("sequential coder phases")
    expect(lower).toContain("same group after contracts exist")
    expect(lower).toContain("truly require concrete earlier output")
    expect(lower).toContain("do not recommend single-agent implementation")
    expect(lower).toContain("<plan>")
    expect(lower).toContain("<repo_context>")
    expect(lower).toContain("<implementation_phases>")
    expect(lower).toContain("<verification_strategy>")
    expect(lower).toContain("<open_questions>")
  }),
)

it.instance("plan agent denies edits except .opencode/plans/*", () =>
  Effect.gen(function* () {
    const plan = yield* load((svc) => svc.get("plan"))
    expect(plan).toBeDefined()
    // Wildcard is denied
    expect(evalPerm(plan, "edit")).toBe("deny")
    // But specific path is allowed
    expect(Permission.evaluate("edit", ".opencode/plans/foo.md", plan!.permission).action).toBe("allow")
  }),
)

it.instance(
  "auto permission mode does not weaken plan or planner read-only restrictions",
  () =>
    Effect.gen(function* () {
      const plan = yield* load((svc) => svc.get("plan"))
      const planner = yield* load((svc) => svc.get("planner"))
      expect(plan).toBeDefined()
      expect(planner).toBeDefined()
      expect(evalPerm(plan, "edit")).toBe("deny")
      expect(evalPerm(plan, "bash")).toBe("deny")
      expect(evalPerm(plan, "write")).toBe("deny")
      expect(evalPerm(plan, "apply_patch")).toBe("deny")
      expect(evalPerm(planner, "edit")).toBe("deny")
      expect(evalPerm(planner, "bash")).toBe("deny")
      expect(evalPerm(planner, "write")).toBe("deny")
      expect(evalPerm(planner, "apply_patch")).toBe("deny")
      expect(evalPerm(planner, "task")).toBe("deny")
      expect(evalPerm(planner, "group")).toBe("deny")
    }),
  { config: { permission_mode: "auto" } },
)

it.instance("plan agent denies the general subagent by default", () =>
  Effect.gen(function* () {
    const plan = yield* load((svc) => svc.get("plan"))
    expect(plan).toBeDefined()
    expect(Permission.evaluate("task", "general", plan!.permission).action).toBe("deny")
    expect(Permission.evaluate("task", "explore", plan!.permission).action).toBe("allow")
    expect(Permission.evaluate("task", "custom", plan!.permission).action).toBe("allow")
  }),
)

it.instance(
  "user permission can allow the general subagent from plan mode",
  () =>
    Effect.gen(function* () {
      const plan = yield* load((svc) => svc.get("plan"))
      expect(plan).toBeDefined()
      expect(Permission.evaluate("task", "general", plan!.permission).action).toBe("allow")
    }),
  {
    config: {
      permission: {
        task: {
          general: "allow",
        },
      },
    },
  },
)

it.instance("explore agent denies edit and write", () =>
  Effect.gen(function* () {
    const explore = yield* load((svc) => svc.get("explore"))
    expect(explore).toBeDefined()
    expect(explore?.mode).toBe("subagent")
    expect(evalPerm(explore, "edit")).toBe("deny")
    expect(evalPerm(explore, "write")).toBe("deny")
    expect(evalPerm(explore, "todowrite")).toBe("deny")
  }),
)

it.instance("explore agent asks for external directories and allows whitelisted external paths", () =>
  Effect.gen(function* () {
    const explore = yield* load((svc) => svc.get("explore"))
    expect(explore).toBeDefined()
    expect(Permission.evaluate("external_directory", "/some/other/path", explore!.permission).action).toBe("ask")
    expect(Permission.evaluate("external_directory", Truncate.GLOB, explore!.permission).action).toBe("allow")
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "agent-work"), explore!.permission).action,
    ).toBe("allow")
  }),
)

it.instance(
  "reference config does not create subagents",
  () =>
    Effect.gen(function* () {
      const agents = yield* load((svc) => svc.list())
      const names = agents.map((agent) => agent.name)
      expect(names).not.toContain("effect")
      expect(names).not.toContain("effectFull")
      expect(names).not.toContain("localdocs")
      expect(names).not.toContain("localdocsFull")
    }),
  {
    config: {
      references: {
        effect: "github.com/effect/effect-smol",
        effectFull: {
          repository: "Effect-TS/effect",
          branch: "main",
        },
        localdocs: "../docs",
        localdocsFull: {
          path: "../local-docs",
        },
      },
    },
  },
)

it.instance("general agent denies todo tools", () =>
  Effect.gen(function* () {
    const general = yield* load((svc) => svc.get("general"))
    expect(general).toBeDefined()
    expect(general?.mode).toBe("subagent")
    expect(general?.hidden).toBeUndefined()
    expect(evalPerm(general, "todowrite")).toBe("deny")
  }),
)

it.instance("compaction agent denies all permissions", () =>
  Effect.gen(function* () {
    const compaction = yield* load((svc) => svc.get("compaction"))
    expect(compaction).toBeDefined()
    expect(compaction?.hidden).toBe(true)
    expect(evalPerm(compaction, "bash")).toBe("deny")
    expect(evalPerm(compaction, "edit")).toBe("deny")
    expect(evalPerm(compaction, "read")).toBe("deny")
  }),
)

it.instance(
  "custom agent from config creates new agent",
  () =>
    Effect.gen(function* () {
      const custom = yield* load((svc) => svc.get("my_custom_agent"))
      expect(custom).toBeDefined()
      expect(String(custom?.model?.providerID)).toBe("openai")
      expect(String(custom?.model?.modelID)).toBe("gpt-4")
      expect(custom?.description).toBe("My custom agent")
      expect(custom?.temperature).toBe(0.5)
      expect(custom?.topP).toBe(0.9)
      expect(custom?.native).toBe(false)
      expect(custom?.mode).toBe("all")
    }),
  {
    config: {
      agent: {
        my_custom_agent: {
          model: "openai/gpt-4",
          description: "My custom agent",
          temperature: 0.5,
          top_p: 0.9,
        },
      },
    },
  },
)

it.instance(
  "custom agent config overrides native agent properties",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build).toBeDefined()
      expect(String(build?.model?.providerID)).toBe("anthropic")
      expect(String(build?.model?.modelID)).toBe("claude-3")
      expect(build?.description).toBe("Custom build agent")
      expect(build?.temperature).toBe(0.7)
      expect(build?.color).toBe("#FF0000")
      expect(build?.native).toBe(true)
    }),
  {
    config: {
      agent: {
        build: {
          model: "anthropic/claude-3",
          description: "Custom build agent",
          temperature: 0.7,
          color: "#FF0000",
        },
      },
    },
  },
)

it.instance(
  "agent disable removes agent from list",
  () =>
    Effect.gen(function* () {
      const explore = yield* load((svc) => svc.get("explore"))
      expect(explore).toBeUndefined()
      const agents = yield* load((svc) => svc.list())
      const names = agents.map((a) => a.name)
      expect(names).not.toContain("explore")
    }),
  {
    config: {
      agent: {
        explore: { disable: true },
      },
    },
  },
)

it.instance(
  "agent permission config merges with defaults",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build).toBeDefined()
      // Specific pattern is denied
      expect(Permission.evaluate("bash", "rm -rf *", build!.permission).action).toBe("deny")
      // Edit still allowed
      expect(evalPerm(build, "edit")).toBe("allow")
    }),
  {
    config: {
      agent: {
        build: {
          permission: {
            bash: {
              "rm -rf *": "deny",
            },
          },
        },
      },
    },
  },
)

it.instance(
  "user permission overrides keep last-rule semantics for orchestrate and planner",
  () =>
    Effect.gen(function* () {
      const orchestrate = yield* load((svc) => svc.get("orchestrate"))
      const planner = yield* load((svc) => svc.get("planner"))
      expect(orchestrate).toBeDefined()
      expect(planner).toBeDefined()

      expect(evalPerm(orchestrate, "group")).toBe("deny")
      expect(Permission.evaluate("task", "planner", orchestrate!.permission).action).toBe("deny")
      expect(evalPerm(planner, "edit")).toBe("allow")
      expect(evalPerm(planner, "task")).toBe("allow")
      expect(evalPerm(planner, "group")).toBe("allow")
    }),
  {
    config: {
      agent: {
        orchestrate: {
          permission: {
            group: "deny",
            task: {
              planner: "deny",
            },
          },
        },
        planner: {
          permission: {
            edit: "allow",
            task: "allow",
            group: "allow",
          },
        },
      },
    },
  },
)

it.instance(
  "global permission config applies to all agents",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build).toBeDefined()
      expect(evalPerm(build, "bash")).toBe("deny")
    }),
  {
    config: {
      permission: {
        bash: "deny",
      },
    },
  },
)

it.instance(
  "agent steps/maxSteps config sets steps property",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      const plan = yield* load((svc) => svc.get("plan"))
      expect(build?.steps).toBe(50)
      expect(plan?.steps).toBe(100)
    }),
  {
    config: {
      agent: {
        build: { steps: 50 },
        plan: { maxSteps: 100 },
      },
    },
  },
)

it.instance(
  "agent mode can be overridden",
  () =>
    Effect.gen(function* () {
      const explore = yield* load((svc) => svc.get("explore"))
      expect(explore?.mode).toBe("primary")
    }),
  {
    config: {
      agent: {
        explore: { mode: "primary" },
      },
    },
  },
)

it.instance(
  "agent name can be overridden",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build?.name).toBe("Builder")
    }),
  {
    config: {
      agent: {
        build: { name: "Builder" },
      },
    },
  },
)

it.instance(
  "agent prompt can be set from config",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build?.prompt).toBe("Custom system prompt")
    }),
  {
    config: {
      agent: {
        build: { prompt: "Custom system prompt" },
      },
    },
  },
)

it.instance(
  "unknown agent properties are placed into options",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build?.options.random_property).toBe("hello")
      expect(build?.options.another_random).toBe(123)
    }),
  {
    config: {
      agent: {
        build: {
          random_property: "hello",
          another_random: 123,
        },
      },
    },
  },
)

it.instance(
  "agent options merge correctly",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(build?.options.custom_option).toBe(true)
      expect(build?.options.another_option).toBe("value")
    }),
  {
    config: {
      agent: {
        build: {
          options: {
            custom_option: true,
            another_option: "value",
          },
        },
      },
    },
  },
)

it.instance(
  "multiple custom agents can be defined",
  () =>
    Effect.gen(function* () {
      const agentA = yield* load((svc) => svc.get("agent_a"))
      const agentB = yield* load((svc) => svc.get("agent_b"))
      expect(agentA?.description).toBe("Agent A")
      expect(agentA?.mode).toBe("subagent")
      expect(agentB?.description).toBe("Agent B")
      expect(agentB?.mode).toBe("primary")
    }),
  {
    config: {
      agent: {
        agent_a: {
          description: "Agent A",
          mode: "subagent",
        },
        agent_b: {
          description: "Agent B",
          mode: "primary",
        },
      },
    },
  },
)

it.instance(
  "Agent.list keeps the default agent first and sorts the rest by name",
  () =>
    Effect.gen(function* () {
      const names = (yield* load((svc) => svc.list())).map((a) => a.name)
      expect(names[0]).toBe("plan")
      expect(names.slice(1)).toEqual(names.slice(1).toSorted((a, b) => a.localeCompare(b)))
    }),
  {
    config: {
      default_agent: "plan",
      agent: {
        zebra: {
          description: "Zebra",
          mode: "subagent",
        },
        alpha: {
          description: "Alpha",
          mode: "subagent",
        },
      },
    },
  },
)

it.instance("Agent.get returns undefined for non-existent agent", () =>
  Effect.gen(function* () {
    const nonExistent = yield* load((svc) => svc.get("does_not_exist"))
    expect(nonExistent).toBeUndefined()
  }),
)

it.instance("default permission includes doom_loop and external_directory as ask", () =>
  Effect.gen(function* () {
    const build = yield* load((svc) => svc.get("build"))
    expect(evalPerm(build, "doom_loop")).toBe("ask")
    expect(evalPerm(build, "external_directory")).toBe("ask")
  }),
)

it.instance("webfetch is denied by default", () =>
  Effect.gen(function* () {
    const build = yield* load((svc) => svc.get("build"))
    expect(evalPerm(build, "webfetch")).toBe("deny")
  }),
)

it.instance(
  "legacy tools config converts to permissions",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(evalPerm(build, "bash")).toBe("deny")
      expect(evalPerm(build, "read")).toBe("deny")
    }),
  {
    config: {
      agent: {
        build: {
          tools: {
            bash: false,
            read: false,
          },
        },
      },
    },
  },
)

it.instance(
  "legacy tools config maps write/edit/patch to edit permission",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(evalPerm(build, "edit")).toBe("deny")
    }),
  {
    config: {
      agent: {
        build: {
          tools: {
            write: false,
          },
        },
      },
    },
  },
)

it.instance(
  "Truncate.GLOB is allowed even when user denies external_directory globally",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, build!.permission).action).toBe("allow")
      expect(Permission.evaluate("external_directory", Truncate.DIR, build!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", "/some/other/path", build!.permission).action).toBe("deny")
    }),
  {
    config: {
      permission: {
        external_directory: "deny",
      },
    },
  },
)

it.instance("global tmp directory children are allowed for external_directory", () =>
  Effect.gen(function* () {
    const build = yield* load((svc) => svc.get("build"))
    expect(
      Permission.evaluate("external_directory", path.join(Global.Path.tmp, "scratch"), build!.permission).action,
    ).toBe("allow")
    expect(Permission.evaluate("external_directory", "/some/other/path", build!.permission).action).toBe("ask")
  }),
)

it.instance(
  "Truncate.GLOB is allowed even when user denies external_directory per-agent",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, build!.permission).action).toBe("allow")
      expect(Permission.evaluate("external_directory", Truncate.DIR, build!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", "/some/other/path", build!.permission).action).toBe("deny")
    }),
  {
    config: {
      agent: {
        build: {
          permission: {
            external_directory: "deny",
          },
        },
      },
    },
  },
)

it.instance(
  "explicit Truncate.GLOB deny is respected",
  () =>
    Effect.gen(function* () {
      const build = yield* load((svc) => svc.get("build"))
      expect(Permission.evaluate("external_directory", Truncate.GLOB, build!.permission).action).toBe("deny")
      expect(Permission.evaluate("external_directory", Truncate.DIR, build!.permission).action).toBe("deny")
    }),
  {
    config: {
      permission: {
        external_directory: {
          "*": "deny",
          [Truncate.GLOB]: "deny",
        },
      },
    },
  },
)

it.instance(
  "skill directories are allowed for external_directory",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const skillDir = path.join(test.directory, ".opencode", "skill", "perm-skill")
      yield* Effect.promise(() =>
        Bun.write(
          path.join(skillDir, "SKILL.md"),
          `---
name: perm-skill
description: Permission skill.
---

# Permission Skill
`,
        ),
      )

      const home = process.env.OPENCODE_TEST_HOME
      process.env.OPENCODE_TEST_HOME = test.directory
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          process.env.OPENCODE_TEST_HOME = home
        }),
      )

      const build = yield* load((svc) => svc.get("build"))
      const target = path.join(skillDir, "reference", "notes.md")
      expect(Permission.evaluate("external_directory", target, build!.permission).action).toBe("allow")
    }),
  { git: true },
)

it.instance(
  "project reference directories are allowed for external_directory",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const build = yield* load((svc) => svc.get("build"))
      const target = path.resolve(test.directory, "../docs/reference/notes.md")
      expect(Permission.evaluate("external_directory", target, build!.permission).action).toBe("allow")
    }),
  {
    git: true,
    config: {
      references: {
        docs: "../docs",
      },
    },
  },
)

it.instance("defaultAgent returns build when no default_agent config", () =>
  Effect.gen(function* () {
    const agent = yield* load((svc) => svc.defaultAgent())
    expect(agent).toBe("build")
  }),
)

it.instance("defaultInfo returns resolved build agent when no default_agent config", () =>
  Effect.gen(function* () {
    const agent = yield* load((svc) => svc.defaultInfo())
    expect(agent.name).toBe("build")
    expect(agent.mode).toBe("primary")
  }),
)

it.instance(
  "defaultAgent respects default_agent config set to plan",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("plan")
    }),
  {
    config: {
      default_agent: "plan",
    },
  },
)

it.instance(
  "defaultAgent respects default_agent config set to orchestrate",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("orchestrate")
    }),
  {
    config: {
      default_agent: "orchestrate",
    },
  },
)

it.instance(
  "defaultAgent respects default_agent config set to custom agent with mode all",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      expect(agent).toBe("my_custom")
    }),
  {
    config: {
      default_agent: "my_custom",
      agent: {
        my_custom: {
          description: "My custom agent",
        },
      },
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to subagent",
  () => expectDefaultAgentError('default agent "explore" is a subagent'),
  {
    config: {
      default_agent: "explore",
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to planner subagent",
  () => expectDefaultAgentError('default agent "planner" is a subagent'),
  {
    config: {
      default_agent: "planner",
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to coder subagent",
  () => expectDefaultAgentError('default agent "coder" is a subagent'),
  {
    config: {
      default_agent: "coder",
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to hidden agent",
  () => expectDefaultAgentError('default agent "compaction" is hidden'),
  {
    config: {
      default_agent: "compaction",
    },
  },
)

it.instance(
  "defaultAgent throws when default_agent points to non-existent agent",
  () => expectDefaultAgentError('default agent "does_not_exist" not found'),
  {
    config: {
      default_agent: "does_not_exist",
    },
  },
)

it.instance(
  "defaultAgent returns plan when build is disabled and default_agent not set",
  () =>
    Effect.gen(function* () {
      const agent = yield* load((svc) => svc.defaultAgent())
      // build is disabled, so it should return plan (next primary agent)
      expect(agent).toBe("plan")
    }),
  {
    config: {
      agent: {
        build: { disable: true },
      },
    },
  },
)

it.instance(
  "defaultAgent throws when all primary agents are disabled",
  () => expectDefaultAgentError("no primary visible agent found"),
  {
    config: {
      agent: {
        build: { disable: true },
        plan: { disable: true },
        orchestrate: { disable: true },
      },
    },
  },
)
