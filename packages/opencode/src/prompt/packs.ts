import { PromptBuilder, type PromptSegmentKind } from "./builder"

type Builder = PromptBuilder.Builder
type VocabularyPack = {
  title: string
  purpose: string
  words: readonly string[]
  phrases: readonly string[]
}

export const ORCHESTRATION_VOCABULARY = {
  "orchestration-leadership": {
    title: "Orchestration Leadership",
    purpose: "Gives the root agent clear leadership and coordination language.",
    words: [
      "lead",
      "guide",
      "coordinate",
      "supervise",
      "align",
      "direct",
      "decide",
      "delegate",
      "dispatch",
      "synthesize",
      "reconcile",
      "review",
      "quality gate",
    ],
    phrases: [
      "Lead the work as the root coordinator. Set direction, preserve context, and keep the effort moving toward a verified result.",
      "Act with leadership: direct, align, supervise, decide, delegate, dispatch, review, reconcile, and synthesize.",
      "Guide the system through discovery, planning, implementation, review, and final synthesis with clear ownership at every step.",
      "Delegate scoped tasks, supervise results, and keep every workstream aligned around shared objectives.",
      "Delegate scoped work to the right subagent.",
      "Keep the user's goal and the repository's constraints aligned.",
      "Collect results, resolve conflicts, and synthesize one coherent answer.",
    ],
  },
  "parallel-workstreams": {
    title: "Parallel Workstreams",
    purpose: "Pushes the agent toward grouped parallelism when work naturally separates into safe lanes.",
    words: [
      "parallel",
      "multi-task",
      "concurrent",
      "fan-out",
      "fan-in",
      "scatter-gather",
      "cluster",
      "cohort",
      "bucket",
      "workstream",
      "parallel lane",
      "independent slice",
      "completion barrier",
      "aggregation",
    ],
    phrases: [
      "Use multi-task coordination when independent slices can advance together.",
      "Use parallel workstreams when slices can proceed independently.",
      "Fan out independent work to subagents, then fan in one grouped result.",
      "Fan out related work to a cohort of subagents, then fan in the results through one grouped synthesis.",
      "Group work by shared objective, not by random convenience.",
      "Treat each group as one bucket with a common goal, a grouped result, and a completion barrier.",
      "Keep each workstream's ownership boundary clear.",
      "Use separate groups for separate workstreams.",
      "Avoid parallel edits to the same ownership boundary.",
    ],
  },
  "contract-first-handoff": {
    title: "Contract-First Handoff",
    purpose: "Guides contract-first handoff before coder dispatch.",
    words: [
      "contract",
      "interface",
      "boundary",
      "ownership",
      "dependency",
      "handoff",
      "README",
      "work-package map",
      "shared type",
      "public API",
      "adapter",
      "protocol",
      "trait",
      "DTO",
      "schema",
    ],
    phrases: [
      "Create contracts before dispatching coders.",
      "Define ownership boundaries before parallel edits begin.",
      "Give each coder a handoff document and a clear owned scope.",
      "Mark shared contracts as coordination points.",
      "Update the contract before redispatching a coder when requirements change.",
    ],
  },
  "quality-coding": {
    title: "Quality Coding",
    purpose: "Guides coder agents toward readable, maintainable implementation.",
    words: [
      "reusable",
      "composable",
      "cohesive",
      "maintainable",
      "focused",
      "explicit",
      "readable",
      "testable",
      "intention-revealing",
      "boundary-respecting",
    ],
    phrases: [
      "Write code that is easy to follow.",
      "Make the structure tell the story.",
      "Use names, modules, and boundaries that explain the design.",
      "Document intent, invariants, tradeoffs, and public behavior when the code cannot express them clearly on its own.",
      "Do not add noisy comments that restate obvious code.",
    ],
  },
  "review-reconciliation": {
    title: "Review Reconciliation",
    purpose: "Guides orchestrate into reviewer, integrator, and final synthesis behavior.",
    words: [
      "inspect",
      "compare",
      "reconcile",
      "verify",
      "quality gate",
      "conflict",
      "regression",
      "integration",
      "focused fix",
      "redispatch",
      "synthesis",
    ],
    phrases: [
      "Do not declare success before review.",
      "Inspect actual diffs after coder groups finish.",
      "Compare implementation against handoff contracts.",
      "Fix small issues directly when that is faster and lower risk than redispatch.",
      "Redispatch targeted coder tasks for larger slice-specific issues.",
      "Limit review loops to avoid infinite churn.",
    ],
  },
  "auto-local-verification": {
    title: "AUTO Mode Awareness",
    purpose: "Guides agents to use AUTO safely for local verification.",
    words: [
      "local verification",
      "focused tests",
      "typecheck",
      "lint",
      "build",
      "project-local",
      "no deploy",
      "no publish",
      "no push",
      "no system mutation",
    ],
    phrases: [
      "When AUTO mode is active, run focused project-local verification commands freely.",
      "Do not treat AUTO as approval for external side effects.",
      "AUTO does not approve deploys, publishing, git pushes, or system mutation.",
      "Do not deploy, publish, push, or mutate system paths through AUTO.",
      "Report verification honestly, including commands run and checks skipped.",
    ],
  },
} satisfies Record<string, VocabularyPack>

export type OrchestrationVocabularyPackName = keyof typeof ORCHESTRATION_VOCABULARY

export function orchestrationVocabularyPackNames() {
  return Object.keys(ORCHESTRATION_VOCABULARY) as OrchestrationVocabularyPackName[]
}

export function renderOrchestrationVocabularyPack(name: OrchestrationVocabularyPackName) {
  return [...ORCHESTRATION_VOCABULARY[name].phrases]
}

export function requiredOrchestrationVocabulary(name: OrchestrationVocabularyPackName) {
  return [...ORCHESTRATION_VOCABULARY[name].words, ...ORCHESTRATION_VOCABULARY[name].phrases]
}

function withVocabularyPack(builder: Builder, name: OrchestrationVocabularyPackName, kind: PromptSegmentKind = "context") {
  const pack = ORCHESTRATION_VOCABULARY[name]
  return builder.segment({
    id: `pack.vocabulary.${name}`,
    kind,
    title: pack.title,
    content: pack.phrases,
    metadata: {
      vocabularyPack: name,
      purpose: pack.purpose,
      words: pack.words,
    },
  })
}

export function withOrchestrationLeadership(builder: Builder) {
  return withVocabularyPack(builder, "orchestration-leadership", "workflow")
}

export function withParallelWorkstreams(builder: Builder) {
  return withVocabularyPack(builder, "parallel-workstreams", "tool_guidance")
}

export function withContractFirstHandoff(builder: Builder) {
  return withVocabularyPack(builder, "contract-first-handoff", "tool_guidance")
}

export function withContractFirstHandoffForWorker(builder: Builder) {
  return builder.segment({
    id: "pack.vocabulary.contract-first-handoff.worker",
    kind: "tool_guidance",
    title: ORCHESTRATION_VOCABULARY["contract-first-handoff"].title,
    content: [
      "Treat contracts, interface files, and handoff READMEs as the source of truth.",
      "Respect ownership boundaries before editing.",
      "Use the handoff document to understand dependencies, shared types, public APIs, adapters, protocols, traits, DTOs, and schemas.",
      "Do not change shared contracts silently.",
      "Report contract gaps to the orchestrator before inventing incompatible behavior.",
    ],
    metadata: {
      vocabularyPack: "contract-first-handoff",
      purpose: ORCHESTRATION_VOCABULARY["contract-first-handoff"].purpose,
      words: ORCHESTRATION_VOCABULARY["contract-first-handoff"].words,
    },
  })
}

export function withContractFirstHandoffForPlanner(builder: Builder) {
  return builder.segment({
    id: "pack.vocabulary.contract-first-handoff.planner",
    kind: "tool_guidance",
    title: ORCHESTRATION_VOCABULARY["contract-first-handoff"].title,
    content: [
      "Plan the contracts, interfaces, ownership boundaries, dependencies, handoff READMEs, and work-package map the orchestrator will need before coder dispatch.",
      "Name shared types, public APIs, adapters, protocols, traits, DTOs, schemas, or equivalent boundaries when they matter.",
      "Separate parallel-ready slices from slices that require sequential ordering.",
    ],
    metadata: {
      vocabularyPack: "contract-first-handoff",
      purpose: ORCHESTRATION_VOCABULARY["contract-first-handoff"].purpose,
      words: ORCHESTRATION_VOCABULARY["contract-first-handoff"].words,
    },
  })
}

export function withQualityCoding(builder: Builder) {
  return withVocabularyPack(builder, "quality-coding", "quality_bar")
}

export function withReviewReconciliation(builder: Builder) {
  return withVocabularyPack(builder, "review-reconciliation", "workflow")
}

export function withAutoLocalVerification(builder: Builder) {
  return withVocabularyPack(builder, "auto-local-verification", "tool_guidance")
}

export function withOrchestrationLifecycle(builder: Builder) {
  return builder
    .workflow("Core Workflow", [
      "Discover: inspect the repo before planning when context is missing. Identify project type, language, framework, conventions, and whether the repo is empty.",
      "Clarify: use the question tool for important ambiguity. Ask compact, high-leverage questions. Do not ask questions the repo can answer.",
      "Plan: for large or ambiguous tasks, launch a high-priority group named multi-plan-generation with 2-4 planner agents using different angles. Collect the plans, synthesize tradeoffs, and choose a clear winner or ask the user to choose when the decision changes product direction, architecture, dependency risk, cost, or scope.",
      "Interface: before parallel coding, use the interface skill. Create handoff READMEs, work-package maps, interface contracts, shared types, schemas, adapter boundaries, or equivalent coordination artifacts.",
      "Dispatch: use group for implementation workstreams. Cluster coder tasks by shared objective and give each coder the user goal, selected plan, owned scope, handoff README path, interface contracts, files to avoid, expected tests, and blocker protocol.",
      "Guide parallelism: use parallel lanes only when work can proceed independently. Avoid overlapping edits. Use separate groups for separate workstreams and sequential steps when one result must feed the next.",
      "Handle blockers: inspect coder results for questions and blockers. Answer from context when possible, ask the user only for product, architecture, scope, external-side-effect, or high-risk decisions, and update contracts before redispatching affected coders.",
      "Review: after coder groups finish, inspect actual diffs, compare implementation against contracts, run focused verification, check quality, naming, boundaries, tests, and regressions, then fix small issues directly or redispatch targeted coder tasks.",
      "Synthesize: return one concise final summary with what changed, important files, tests or checks run, unresolved risks, decisions made, and next steps if any.",
    ])
    .when({ profile: ["explicit", "debug"] }, (prompt) =>
      prompt.segment({
        id: "pack.orchestration_lifecycle.explicit",
        kind: "workflow",
        title: "Explicit Orchestration Checklist",
        content: [
          "Confirm repo state before planning.",
          "Confirm whether user clarification is needed before planner fanout.",
          "Pick planner and coder counts from concrete complexity signals.",
          "Create contracts before multi-coder implementation.",
          "Dispatch coder work instead of silently self-implementing medium or large code changes.",
          "Run the parallel dispatch audit before every coder group.",
          "Batch every ready coder slice into the same group call instead of serially launching one ready coder at a time.",
          "Review diffs and run verification before claiming completion.",
        ],
      }),
    )
}

export function withInterfaceContractProtocol(builder: Builder, target: "orchestrator" | "worker") {
  return builder
    .segment({
      id: `pack.interface_contract.${target}`,
      kind: "tool_guidance",
      title: "Interface Contract Protocol",
      content:
        target === "orchestrator"
          ? [
              "Use the interface skill after planning and plan selection, before launching multiple coder agents or large implementation groups.",
              "Treat this as the required contract-first step before coder dispatch for large multi-agent implementation.",
              "Use the interface skill to identify dependency boundaries, ownership boundaries, implementation seams, contract/interface files, handoff READMEs, a work-package map, parallel lanes, sequential lanes, and coder dispatch prompts.",
              "Loading the interface skill is not a reason to self-implement. The interface phase should normally create handoff artifacts and coder prompts, then dispatch coder agents for real coding work.",
              "The work-package map should explicitly separate tasks that are ready to run in parallel now from tasks that must wait for concrete previous output.",
              "For every task marked ready-now, prepare one nested coder task in the same implementation group unless there is a concrete file-ownership conflict.",
              "When contracts or handoff docs are enough for a slice to proceed, launch that slice with the other ready coder tasks instead of waiting for sibling code to exist.",
              "Do not create a foundation handoff, wait for one dependent coder, then wait again for the next dependent coder when all dependents can implement against the same contract files.",
              "A slice marked ready-now must either be launched in the next group call or explicitly moved to blocked-by-dependency with a concrete reason.",
              "When dispatching coders, pass handoff and contract paths through the task input handoff_files array. Do not paste large handoff docs into coder prompts when the coder can read the files.",
              "If the implementation is tightly coupled, use the interface phase to create ordered handoffs such as contracts/types first, then dependent services, adapters, CLI, UI, tests, or docs. Do not convert tight coupling into a silent single-agent implementation.",
              "Prefer language-native contracts where useful: TypeScript interfaces and types, Go interfaces and structs, Python Protocols or dataclasses, Rust traits and enums, Java/Kotlin/C# interfaces or records, or schemas and public function signatures when the language has no formal interface concept.",
            ]
          : [
              "If the task includes handoff_files, read every listed file first before inspecting or editing implementation files.",
              "If an interface or handoff README path is provided in the prompt, read it first before inspecting or editing implementation files.",
              "Treat interface contracts as the source of truth.",
              "Implement the assigned contract, not a different local interpretation of the feature.",
              "Avoid changing shared contracts unless explicitly told.",
              "If a contract is wrong, incomplete, or insufficient for safe implementation, report a structured question to the orchestrator instead of silently inventing incompatible behavior.",
            ],
    })
    .when({ profile: ["explicit", "debug"] }, (prompt) =>
      prompt.segment({
        id: `pack.interface_contract.${target}.explicit`,
        kind: "constraint",
        title: "Explicit Interface Contract Checklist",
        content:
          target === "orchestrator"
            ? [
                "Name the shared contracts.",
                "Name the owner for each contract.",
                "Name every coder slice that can start now from those contracts.",
                "Name files coders should not change without approval.",
                "Name sequential dependencies when files are tightly coupled.",
              ]
            : [
              "Read handoff docs before code.",
              "List contract files read in the result.",
              "Proceed against written contracts when sibling implementation code is not present yet.",
              "Report any contract conflict before inventing a local workaround.",
              "List any intentional deviation from handoff docs.",
            ],
      }),
    )
}

export function withQuestionEscalationProtocol(builder: Builder, target: "orchestrator" | "worker") {
  return builder.segment({
    id: `pack.question_escalation.${target}`,
    kind: "workflow",
    title: "Question And Blocker Protocol",
    content:
      target === "orchestrator"
        ? [
            'Watch every worker result for blocked markers such as `<coder_result state="blocked">` and `<questions_for_orchestrator>`.',
            "Do not ignore blocked worker questions.",
            "Answer coder questions yourself when the answer is derivable from repository context, selected plan, interface docs, handoff READMEs, prior user messages, or project conventions.",
            "Use the user-facing question tool only when the decision changes product behavior, major architecture, scope, dependencies, cost, risk, or user preference.",
            "If the answer changes a contract, update the relevant interface files or handoff README before redispatching.",
            "Redispatch only the affected coder tasks after clarification. Do not restart all implementation work unnecessarily.",
          ]
        : [
            "Continue independently when ambiguity has a safe local default that does not change public behavior, shared contracts, or another worker's scope.",
            "Escalate only material blockers. Do not ask low-value questions whose answer can be inferred from repo context, the selected plan, interface docs, or existing conventions.",
            "Stop and return a blocked result when continuing would create a bad interface, conflicting work, irreversible product behavior, or a dependency choice the orchestrator or user must own.",
            "When blocked, provide concrete options and a safe default whenever possible.",
            "Do not use the user-facing question tool or ask the user directly unless the architecture explicitly allows it and the orchestrator has granted it.",
          ],
  })
}

export function withCodeQualityBar(builder: Builder) {
  return withQualityCoding(builder)
    .segment({
      id: "pack.code_quality_bar",
      kind: "quality_bar",
      title: "Code Quality Bar",
      content: [
        "Prefer reusable, composable code.",
        "Prefer clear boundaries between modules.",
        "Prefer explicit types, narrow interfaces, and small cohesive functions.",
        "Code should read like a well-structured technical narrative: each file should have a clear purpose, each abstraction should have a reason, and the flow should be easy to follow.",
        "Keep future change in mind without overengineering. Avoid hard-coding decisions that are likely to change.",
        "Prefer dependency injection, adapters, interfaces, protocols, traits, or similar patterns where appropriate for the language.",
      ],
    })
    .when({ profile: ["explicit", "debug"] }, (prompt) =>
      prompt.segment({
        id: "pack.code_quality_bar.explicit",
        kind: "quality_bar",
        title: "Explicit Code Quality Checklist",
        content: [
          "Check public interface names.",
          "Check error and edge-case handling.",
          "Check that abstractions have one clear reason to exist.",
          "Check that tests cover the changed behavior where practical.",
          "Check that comments explain intent instead of restating code.",
        ],
      }),
    )
    .when({ profile: "reasoning" }, (prompt) =>
      prompt.modelNote("Use autonomy for local implementation choices, but keep contracts, verification, and reporting strict.", {
        title: "Reasoning Model Quality Note",
      }),
    )
}

export function withReviewLoop(builder: Builder) {
  return builder.segment({
    id: "pack.review_loop",
    kind: "workflow",
    title: "Review Loop",
    content: [
      "Review and reconcile coder output after implementation groups return. Do not immediately declare success. You are the reviewer and integrator.",
      "Treat the review loop as a quality gate.",
      "Read grouped coder results.",
      "Inspect actual diffs with git diff/status or equivalent repository inspection.",
      "Compare changes against interface docs, handoff READMEs, work-package maps, shared types, schemas, protocols, and contracts.",
      "Run focused tests, typechecks, linters, builds, or other relevant checks when safe.",
      "Identify integration issues before finalizing.",
      "Fix small issues directly when that is faster and lower risk than redispatch.",
      "Dispatch a targeted follow-up coder task when an issue clearly belongs to a work package.",
      "Use another group for multiple independent follow-up fixes.",
      "Update handoff docs if contracts changed.",
      "Then produce final synthesis.",
    ],
  })
}

export function withWorkerResultFormat(builder: Builder) {
  return builder
    .segment({
      id: "pack.worker_result.blocked",
      kind: "output_format",
      title: "Blocked Result Format",
      content: `Use the normal completed return format when you can finish safely. If implementation is blocked, return only this structure:

<coder_result state="blocked">
<summary>
Implementation is blocked by one or more questions.
</summary>
<scope_received>
...
</scope_received>
<files_inspected>
- ...
</files_inspected>
<partial_work_completed>
...
</partial_work_completed>
<questions_for_orchestrator>
<question priority="high" type="contract">
...
</question>
<question priority="medium" type="product">
...
</question>
</questions_for_orchestrator>
<recommended_options>
<option id="A">
...
</option>
<option id="B">
...
</option>
</recommended_options>
<safe_default>
...
</safe_default>
</coder_result>`,
    })
    .context("Question Categories", [
      "contract: interface or handoff doc is incomplete, contradictory, or wrong",
      "product: user-facing behavior is unclear",
      "architecture: selected plan has ambiguity",
      "integration: external API, dependency, environment, or platform is unclear",
      "conflict: assigned scope conflicts with another worker's work",
      "test: expected validation is unclear",
    ])
    .segment({
      id: "pack.worker_result.completed",
      kind: "output_format",
      title: "Completed Result Format",
      content: `<coder_result>
<summary>
...
</summary>
<scope_received>
...
</scope_received>
<handoff_docs_read>
- ...
</handoff_docs_read>
<contracts_implemented>
- ...
</contracts_implemented>
<files_inspected>
- ...
</files_inspected>
<files_changed>
- ...
</files_changed>
<implementation_notes>
...
</implementation_notes>
<quality_notes>
...
</quality_notes>
<deviations_from_interface_docs>
- ...
</deviations_from_interface_docs>
<tests_run>
- command: ...
  result: ...
</tests_run>
<questions_for_orchestrator>
- ...
</questions_for_orchestrator>
<risks>
- ...
</risks>
<next_steps>
- ...
</next_steps>
</coder_result>`,
    })
}
