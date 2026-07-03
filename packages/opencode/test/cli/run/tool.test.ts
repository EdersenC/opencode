import { describe, expect, test } from "bun:test"
import { toolFrame, toolInlineInfo, toolScroll } from "@/cli/cmd/run/tool"
import type { StreamCommit } from "@/cli/cmd/run/types"
import type { ToolPart } from "@opencode-ai/sdk/v2"

function groupPart(metadata: Record<string, unknown>): ToolPart {
  return {
    id: "part_group",
    sessionID: "ses_test",
    messageID: "msg_test",
    callID: "call_group",
    type: "tool",
    tool: "group",
    state: {
      status: "completed",
      input: {
        name: "implementation-slices",
        calls: [{}, {}, {}, {}],
      },
      metadata: {
        group: metadata,
      },
      output: "",
      title: "Group: implementation-slices",
      time: {
        start: 1,
        end: 2,
      },
    },
  } as ToolPart
}

function groupCommit(metadata: Record<string, unknown>): StreamCommit {
  return {
    kind: "tool",
    text: "",
    phase: "final",
    source: "tool",
    tool: "group",
    toolState: "completed",
    part: groupPart(metadata),
  }
}

describe("run tool display rules", () => {
  test("group start output shows batch size", () => {
    expect(toolScroll("start", toolFrame(groupCommit({}), ""))).toBe(
      ["# Group: implementation-slices", "Starting 4 calls."].join("\n"),
    )
  })

  test("group summaries distinguish failed, aborted, and blocked calls", () => {
    const metadata = {
      name: "implementation-slices",
      state: "completed_with_errors",
      callCount: 4,
      completedCount: 1,
      failedCount: 1,
      abortedCount: 1,
      blockedCount: 1,
    }

    expect(toolInlineInfo(groupPart(metadata))).toEqual({
      icon: "!",
      title: "Group: implementation-slices",
      description: "4 calls · 1 failed · 1 aborted · 1 blocked",
    })
    expect(toolScroll("final", toolFrame(groupCommit(metadata), ""))).toBe(
      [
        "# Group: implementation-slices",
        "Completed 1 of 4 calls. Failed 1 of 4 calls. Aborted 1 of 4 calls. Blocked 1 of 4 calls.",
      ].join("\n"),
    )
  })
})
