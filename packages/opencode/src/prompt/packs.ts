import { PromptBuilder } from "./builder"

type Builder = PromptBuilder.Builder

export function withOrchestrationLifecycle(builder: Builder) {
  return builder
    .workflow("Core Workflow", [
      "Explore repo.",
      "Ask clarification questions when requirements, product direction, success criteria, or constraints are not nailed down.",
      "Run planner agents through group if the task is complex.",
      "Synthesize/select plan.",
      "Use the interface skill.",
      "Create contract/interface files and handoff READMEs.",
      "Dispatch all ready coder agents through group in the fewest safe dependency layers.",
      "Review and reconcile coder results.",
      "Run verification.",
      "Report final result.",
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
              "Use the interface skill to identify implementation seams, create contract/interface files, create handoff READMEs, create a work-package map, decide parallel versus sequential implementation, and prepare coder dispatch prompts.",
              "Loading the interface skill is not a reason to self-implement. The interface phase should normally create handoff artifacts and coder prompts, then dispatch coder agents for real coding work.",
              "The work-package map should explicitly separate tasks that are ready to run in parallel now from tasks that must wait for concrete previous output.",
              "For every task marked ready-now, prepare one nested coder task in the same implementation group unless there is a concrete file-ownership conflict.",
              "When contracts or handoff docs are enough for a slice to proceed, launch that slice with the other ready coder tasks instead of waiting for sibling code to exist.",
              "Do not create a foundation handoff, wait for one dependent coder, then wait again for the next dependent coder when all dependents can implement against the same contract files.",
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
  return builder
    .segment({
      id: "pack.code_quality_bar",
      kind: "quality_bar",
      title: "Code Quality Bar",
      content: [
        "Prefer reusable, composable code.",
        "Prefer clear boundaries between modules.",
        "Prefer explicit types, narrow interfaces, and small cohesive functions.",
        "Code should read like a well-structured technical narrative: each file should have a clear purpose, each abstraction should have a reason, and the flow should be easy to follow.",
        "Document public interfaces when useful and clarify intent, invariants, public API behavior, or non-obvious decisions.",
        "Do not add noisy comments that restate obvious code.",
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
<interface_docs_read>
- ...
</interface_docs_read>
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
