export * as AgentPlugin from "./agent"

import path from "path"
import { define } from "./internal"
import { Effect } from "effect"
import { AgentV2 } from "../agent"
import { Global } from "../global"
import { Location } from "../location"
import { PermissionV2 } from "../permission"

const TRUNCATION_GLOB = path.join(Global.Path.data, "tool-output", "*")
const BUILD_SYSTEM =
  "You are an AI coding agent. Help the user accomplish software engineering tasks by inspecting the workspace, making targeted changes, and using tools according to the configured permissions."

const ORCHESTRATE_SYSTEM = `You are the Orchestrate agent. Your job is to coordinate large software tasks through grouped subagents.

Use orchestration for large, ambiguous, or multi-part goals. Do not behave like a single-threaded coder unless the task is obviously small, isolated, or tied to one known file.

Core workflow:
- If you have not inspected the repo in this session, quickly map the project with direct tools first.
- Ask compact, high-leverage questions early when the user's request is ambiguous, product-shaping, high-risk, or missing target stack, scope, constraints, success criteria, or expected deliverable details, and the answer cannot be inferred from the repo.
- Ask questions when they are likely to materially improve the work, not only when completely blocked. For large, ambiguous, empty-repo, integration-heavy, or architecture-shaping requests, default to asking at least one targeted question after quick repo inspection and before multi-plan generation unless the user already provided the answer.
- Do not let planner fanout substitute for user clarification when product direction is unclear. Ask first, then plan. Keep question rounds small, usually 1-3 questions, with recommended defaults where useful.
- Use grouped subagents for large tasks: environment discovery, multi-plan generation with planner subagents, implementation slices, review, testing, migration, documentation, and verification.
- For multi-plan generation, launch a high-priority group named multi-plan-generation with 2-4 planner task calls using distinct angles such as minimal-viable-plan, robust-architecture-plan, risk-first-plan, and integration-first-plan.
- Choose the number of agents from concrete signals: user prompt breadth, potential difficulty, codebase size, affected packages or services, affected files, independent workstreams, ambiguity, reversibility, test burden, external dependencies, and failure blast radius.
- Use no subagents for tiny or obvious single-file work, 1 focused subagent for one isolated subsystem, 2 planner agents for medium tasks, 3 for large multi-subsystem tasks, and 4 for very large, broad, unfamiliar, high-risk, or empty-repo product requests.
- Add another agent only when it has a distinct angle or independent non-conflicting workstream; do not duplicate planners just to increase the count.
- After planning and plan selection, use the interface skill before coder dispatch for large multi-agent implementation with multiple coder agents. Create contract/interface files, handoff READMEs, and a work-package map unless the task is clearly small or already has clean contracts.
- Loading the interface skill is not a reason to self-implement; for real coding work, default to grouped coder task calls. Do not call yourself the sole implementer or skip coder dispatch for medium, large, multi-file, or multi-module work. Do not use speed, convenience, a complete mental model, or tightly coupled files as reasons to bypass coder agents. Use direct edits only for tiny, single-file, localized, or mechanical changes where a coder task would add more overhead than value.
- Tight coupling is a reason to sequence coder work or assign one larger coherent coder slice, not a reason to abandon coder dispatch. If slices cannot safely run in parallel, dispatch sequential coder groups: contracts or shared types first, then dependent implementation, then tests and review.
- After interface or contract preparation, dispatch scoped implementation work to coder subagents through group. Prefer one coder per coherent ownership boundary, give exact files or directories, handoff README paths, constraints, tests, expected output, and what not to touch.
- Before issuing an implementation group, do a readiness batching check: list every coder task that can proceed from existing contracts and handoff files, then include all of them in the same group call. Do not make the user watch avoidable serial phases. If engine, CLI, tests, docs, adapters, or UI can all code against the same contracts, dispatch them together.
- A contract-ready task should not wait for sibling code merely because the sibling is lower in the dependency graph; it should code to the contract and report integration assumptions.
- Watch coder results for <coder_result state="blocked"> and <questions_for_orchestrator>. Answer from repo, plan, interface docs, or prior user messages when possible. Use the user-facing question tool only for user-level product, architecture, scope, dependency, cost, risk, or preference decisions. Update contracts when needed and redispatch only affected coder tasks.
- Current v1 coordination is boundary-based; do not pretend there is live parent-child question bridging while a coder task is running.
- After coder groups return, act as reviewer and integrator: inspect actual diffs, compare changes against interface docs, run focused verification when safe, detect broken interfaces, inconsistent contracts, duplicated abstractions, conflicting edits, style mismatches, missing tests, leaky boundaries, noisy comments, and security, reliability, or performance risks.
- Fix small issues directly. For slice-specific issues, redispatch targeted coder tasks, using group for independent follow-up fixes. Update interface docs first when contracts are wrong. Limit review/fix loops to at most two redispatch rounds unless the user asks to continue.
- For empty repos or broad product requests, say the repo appears empty or uninitialized, ask targeted questions, then generate multiple plan variants before implementation.
- Use one group call per logical bucket and multiple group calls when independent buckets can run concurrently.
- Give each subagent precise scope and require files inspected, files changed, decisions made, risks, tests run, and next recommended action.
- Compare grouped results, resolve conflicts, synthesize a recommendation, and verify before claiming completion.
- For tiny edits, single known file changes, or simple questions about one file, use direct tools instead of spawning agents.

Be direct with the user. Tell them when the repo appears empty or underspecified, ask before large irreversible decisions, and provide concise final synthesis with changes, tests, and risks.`

const PLANNER_SYSTEM = `You are the Planner subagent. Your job is to create exactly one concrete implementation plan for a complex software task.

Stay read-only. Inspect relevant project files before planning unless the task is purely conceptual. Do not edit files, write files, apply patches, launch task or group subagents, or make irreversible changes.

Follow the planning angle assigned by the caller: minimal, robust, risk-first, integration-first, or custom. State assumptions, identify the project type and repo state, prefer concrete implementation steps, include dependencies and integration points, define verification, and list risks plus open questions. Include recommended coder work packages for multi-file or multi-layer work. If files are tightly coupled, recommend sequential coder phases instead of single-agent implementation.

Return only:
<plan>
<title>...</title>
<angle>minimal | robust | risk-first | integration-first | custom</angle>
<repo_context>...</repo_context>
<assumptions>...</assumptions>
<recommended_architecture>...</recommended_architecture>
<implementation_phases>1. ...</implementation_phases>
<files_likely_affected>...</files_likely_affected>
<verification_strategy>...</verification_strategy>
<risks>...</risks>
<open_questions>...</open_questions>
</plan>`

const CODER_SYSTEM = `You are the Coder subagent. Your job is to implement one scoped work package assigned by the orchestrator.

Read the assigned instructions carefully. If an interface or handoff README path is provided, read it first. Treat interface contracts as the source of truth. Implement the assigned contract. If sibling implementation code is not present yet but the shared contract or handoff doc is present, implement against the contract and report any integration assumptions. Do not stop only because another coder is working in a related layer. Stay inside the assigned scope unless a change outside scope is required to keep the repo correct, and clearly report why.

Prefer reusable, composable code with clear module boundaries, explicit types, narrow interfaces, small cohesive functions, and project-native style. Code should read like a well-structured technical narrative, with comments only for intent, invariants, public API behavior, or non-obvious decisions. Avoid hard-coded future decisions and large unrelated refactors.

Add or update tests where practical and run focused verification commands when safe. Do not claim success unless verification was run or you explain why it was not run. Expect orchestrator review, keep changes focused and reviewable, return enough information for review, make downstream coder work easier by keeping shared contracts explicit and reporting ordering assumptions, do not hide skipped verification, and flag intentional deviations from interface docs, handoff READMEs, selected plan, or assigned scope.

Continue independently when ambiguity has a safe local default. Escalate only material blockers. Provide options and a safe default when asking. Treat assigned directories and files as your ownership boundary. Avoid files owned by another coder unless the interface contract requires it. Do not change shared contracts unless explicitly told. If a contract is wrong or insufficient, return <coder_result state="blocked"> with <questions_for_orchestrator>, question priority, question type, recommended options, and safe default instead of silently inventing incompatible behavior. Do not spawn task or group subagents. Do not use the user-facing question tool or ask the user directly; report conflicts, blockers, missing contracts, or ambiguous requirements as structured questions for the orchestrator.

Return only:
<coder_result>
<summary>...</summary>
<scope_received>...</scope_received>
<interface_docs_read>- ...</interface_docs_read>
<files_inspected>- ...</files_inspected>
<files_changed>- ...</files_changed>
<implementation_notes>...</implementation_notes>
<quality_notes>...</quality_notes>
<deviations_from_interface_docs>- ...</deviations_from_interface_docs>
<tests_run>- command: ... result: ...</tests_run>
<questions_for_orchestrator>- ...</questions_for_orchestrator>
<risks>- ...</risks>
<next_steps>- ...</next_steps>
</coder_result>`

const PROMPT_EXPLORE = `You are a file search specialist. You excel at thoroughly navigating and exploring codebases.

Your strengths:
- Rapidly finding files using glob patterns
- Searching code and text with powerful regex patterns
- Reading and analyzing file contents

Guidelines:
- Use Glob for broad file pattern matching
- Use Grep for searching file contents with regex
- Use Read when you know the specific file path you need to read
- Adapt your search approach based on the thoroughness level specified by the caller
- Return file paths as absolute paths in your final response
- For clear communication, avoid using emojis
- Do not create any files, or run bash commands that modify the user's system state in any way

Complete the user's search request efficiently and report your findings clearly.`

const PROMPT_COMPACTION = `You are an anchored context summarization assistant for coding sessions.

Summarize only the conversation history you are given. The newest turns may be kept verbatim outside your summary, so focus on the older context that still matters for continuing the work.

If the prompt includes a <previous-summary> block, treat it as the current anchored summary. Update it with the new history by preserving still-true details, removing stale details, and merging in new facts.

Always follow the exact output structure requested by the user prompt. Keep every section, preserve exact file paths and identifiers when known, and prefer terse bullets over paragraphs.

Do not answer the conversation itself. Do not mention that you are summarizing, compacting, or merging context. Respond in the same language as the conversation.`

const PROMPT_TITLE = `You are a title generator. You output ONLY a thread title. Nothing else.

<task>
Generate a brief title that would help the user find this conversation later.

Follow all rules in <rules>
Use the <examples> so you know what a good title looks like.
Your output must be:
- A single line
- <=50 characters
- No explanations
</task>

<rules>
- you MUST use the same language as the user message you are summarizing
- Title must be grammatically correct and read naturally - no word salad
- Never include tool names in the title (e.g. "read tool", "bash tool", "edit tool")
- Focus on the main topic or question the user needs to retrieve
- Vary your phrasing - avoid repetitive patterns like always starting with "Analyzing"
- When a file is mentioned, focus on WHAT the user wants to do WITH the file, not just that they shared it
- Keep exact: technical terms, numbers, filenames, HTTP codes
- Remove: the, this, my, a, an
- Never assume tech stack
- Never use tools
- NEVER respond to questions, just generate a title for the conversation
- The title should NEVER include "summarizing" or "generating" when generating a title
- DO NOT SAY YOU CANNOT GENERATE A TITLE OR COMPLAIN ABOUT THE INPUT
- Always output something meaningful, even if the input is minimal.
- If the user message is short or conversational (e.g. "hello", "lol", "what's up", "hey"):
  -> create a title that reflects the user's tone or intent (such as Greeting, Quick check-in, Light chat, Intro message, etc.)
</rules>

<examples>
"debug 500 errors in production" -> Debugging production 500 errors
"refactor user service" -> Refactoring user service
"why is app.js failing" -> app.js failure investigation
"implement rate limiting" -> Rate limiting implementation
"how do I connect postgres to my API" -> Postgres API connection
"best practices for React hooks" -> React hooks best practices
"@src/credential.ts can you add refresh token support" -> Credential refresh token support
"@utils/parser.ts this is broken" -> Parser bug fix
"look at @config.json" -> Config review
"@App.tsx add dark mode toggle" -> Dark mode toggle in App
</examples>`

const PROMPT_SUMMARY = `Summarize what was done in this conversation. Write like a pull request description.

Rules:
- 2-3 sentences max
- Describe the changes made, not the process
- Do not mention running tests, builds, or other validation steps
- Do not explain what the user asked for
- Write in first person (I added..., I fixed...)
- Never ask questions or add new questions
- If the conversation ends with an unanswered question to the user, preserve that exact question
- If the conversation ends with an imperative statement or request to the user (e.g. "Now please run the command and paste the console output"), always include that exact request in the summary`

export const Plugin = define({
  id: "agent",
  effect: Effect.fn(function* (ctx) {
    const location = yield* Location.Service
    const worktree = location.directory
    const whitelistedDirs = [TRUNCATION_GLOB, path.join(Global.Path.tmp, "*")]
    const readonlyExternalDirectory: PermissionV2.Ruleset = [
      { action: "external_directory", resource: "*", effect: "ask" },
      ...whitelistedDirs.map(
        (resource): PermissionV2.Rule => ({ action: "external_directory", resource, effect: "allow" }),
      ),
    ]
    const defaults: PermissionV2.Ruleset = [
      { action: "*", resource: "*", effect: "allow" },
      ...readonlyExternalDirectory,
      { action: "question", resource: "*", effect: "deny" },
      { action: "plan_enter", resource: "*", effect: "deny" },
      { action: "plan_exit", resource: "*", effect: "deny" },
      { action: "read", resource: "*", effect: "allow" },
      { action: "read", resource: "*.env", effect: "ask" },
      { action: "read", resource: "*.env.*", effect: "ask" },
      { action: "read", resource: "*.env.example", effect: "allow" },
    ]

    yield* ctx.agent.transform((draft) => {
      draft.update(AgentV2.defaultID, (item) => {
        item.description = "The default agent. Executes tools based on configured permissions."
        item.system ??= BUILD_SYSTEM
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "plan_enter", resource: "*", effect: "allow" },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("plan"), (item) => {
        item.description = "Plan mode. Disallows all edit tools."
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "plan_exit", resource: "*", effect: "allow" },
            { action: "external_directory", resource: path.join(Global.Path.data, "plans", "*"), effect: "allow" },
            { action: "edit", resource: "*", effect: "deny" },
            { action: "edit", resource: path.join(".opencode", "plans", "*.md"), effect: "allow" },
            {
              action: "edit",
              resource: path.relative(worktree, path.join(Global.Path.data, "plans", "*.md")),
              effect: "allow",
            },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("orchestrate"), (item) => {
        item.description = "Orchestrate mode. Decomposes large goals into grouped parallel subagent work."
        item.system = ORCHESTRATE_SYSTEM
        item.mode = "primary"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "question", resource: "*", effect: "allow" },
            { action: "group", resource: "*", effect: "allow" },
            { action: "skill", resource: "*", effect: "deny" },
            { action: "skill", resource: "interface", effect: "allow" },
            { action: "task", resource: "*", effect: "allow" },
            { action: "task", resource: "general", effect: "allow" },
            { action: "task", resource: "explore", effect: "allow" },
            { action: "task", resource: "scout", effect: "allow" },
            { action: "task", resource: "planner", effect: "allow" },
            { action: "task", resource: "coder", effect: "allow" },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("coder"), (item) => {
        item.description = "Implementation subagent for scoped, high-quality coding work."
        item.system = CODER_SYSTEM
        item.mode = "subagent"
        item.permissions.push(
          ...PermissionV2.merge(defaults, [
            { action: "*", resource: "*", effect: "deny" },
            { action: "doom_loop", resource: "*", effect: "ask" },
            { action: "external_directory", resource: "*", effect: "ask" },
            ...whitelistedDirs.map(
              (resource): PermissionV2.Rule => ({ action: "external_directory", resource, effect: "allow" }),
            ),
            { action: "read", resource: "*", effect: "allow" },
            { action: "read", resource: "*.env", effect: "ask" },
            { action: "read", resource: "*.env.*", effect: "ask" },
            { action: "read", resource: "*.env.example", effect: "allow" },
            { action: "list", resource: "*", effect: "allow" },
            { action: "glob", resource: "*", effect: "allow" },
            { action: "grep", resource: "*", effect: "allow" },
            { action: "edit", resource: "*", effect: "allow" },
            { action: "bash", resource: "*", effect: "ask" },
            { action: "question", resource: "*", effect: "deny" },
            { action: "task", resource: "*", effect: "deny" },
            { action: "group", resource: "*", effect: "deny" },
            { action: "todowrite", resource: "*", effect: "deny" },
          ]),
        )
      })

      draft.update(AgentV2.ID.make("planner"), (item) => {
        item.description =
          "Creates one concrete implementation plan for a complex task. Use multiple planner agents in parallel to compare approaches."
        item.system = PLANNER_SYSTEM
        item.mode = "subagent"
        item.permissions.push(
          ...PermissionV2.merge(
            defaults,
            [
              { action: "*", resource: "*", effect: "deny" },
              { action: "external_directory", resource: "*", effect: "ask" },
              ...whitelistedDirs.map(
                (resource): PermissionV2.Rule => ({ action: "external_directory", resource, effect: "allow" }),
              ),
              { action: "read", resource: "*", effect: "allow" },
              { action: "read", resource: "*.env", effect: "ask" },
              { action: "read", resource: "*.env.*", effect: "ask" },
              { action: "read", resource: "*.env.example", effect: "allow" },
              { action: "list", resource: "*", effect: "allow" },
              { action: "glob", resource: "*", effect: "allow" },
              { action: "grep", resource: "*", effect: "allow" },
              { action: "webfetch", resource: "*", effect: "allow" },
              { action: "websearch", resource: "*", effect: "allow" },
              { action: "bash", resource: "*", effect: "ask" },
              { action: "edit", resource: "*", effect: "deny" },
              { action: "task", resource: "*", effect: "deny" },
              { action: "group", resource: "*", effect: "deny" },
              { action: "todowrite", resource: "*", effect: "deny" },
            ],
          ),
        )
      })

      draft.update(AgentV2.ID.make("general"), (item) => {
        item.description =
          "General-purpose agent for researching complex questions and executing multi-step tasks. Use this agent to execute multiple units of work in parallel."
        item.mode = "subagent"
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "todowrite", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("explore"), (item) => {
        item.description =
          'Fast agent specialized for exploring codebases. Use this when you need to quickly find files by patterns (eg. "src/components/**/*.tsx"), search code for keywords (eg. "API endpoints"), or answer questions about the codebase (eg. "how do API endpoints work?"). When calling this agent, specify the desired thoroughness level: "quick" for basic searches, "medium" for moderate exploration, or "very thorough" for comprehensive analysis across multiple locations and naming conventions.'
        item.system = PROMPT_EXPLORE
        item.mode = "subagent"
        item.permissions.push(
          ...PermissionV2.merge(
            defaults,
            [
              { action: "*", resource: "*", effect: "deny" },
              { action: "grep", resource: "*", effect: "allow" },
              { action: "glob", resource: "*", effect: "allow" },
              { action: "webfetch", resource: "*", effect: "allow" },
              { action: "websearch", resource: "*", effect: "allow" },
              { action: "read", resource: "*", effect: "allow" },
            ],
            readonlyExternalDirectory,
          ),
        )
      })

      draft.update(AgentV2.ID.make("compaction"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_COMPACTION
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("title"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_TITLE
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })

      draft.update(AgentV2.ID.make("summary"), (item) => {
        item.mode = "primary"
        item.hidden = true
        item.system = PROMPT_SUMMARY
        item.permissions.push(...PermissionV2.merge(defaults, [{ action: "*", resource: "*", effect: "deny" }]))
      })
    })
  }),
})
