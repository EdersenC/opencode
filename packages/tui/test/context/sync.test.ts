import { expect, test } from "bun:test"
import { autoPermissionDecision } from "../../src/context/sync"
import type { PermissionRequest } from "@opencode-ai/sdk/v2"

function request(input: Partial<PermissionRequest> & Pick<PermissionRequest, "permission">): PermissionRequest {
  return {
    id: "permission_test",
    sessionID: "session_test",
    patterns: ["*"],
    always: ["*"],
    metadata: {},
    ...input,
  }
}

test("AUTO TUI decision approves safe project-local permissions", () => {
  expect(autoPermissionDecision(request({ permission: "read", patterns: ["src/index.ts"] }))).toBe("allow")
  expect(autoPermissionDecision(request({ permission: "edit", patterns: ["src/index.ts"] }))).toBe("allow")
  expect(autoPermissionDecision(request({ permission: "group", patterns: ["implementation-slices"] }))).toBe("allow")
  expect(autoPermissionDecision(request({ permission: "task", patterns: ["coder"] }))).toBe("allow")
})

test("AUTO TUI decision keeps external or escaping paths manual", () => {
  expect(autoPermissionDecision(request({ permission: "external_directory", patterns: ["/tmp/*"] }))).toBe("ask")
  expect(autoPermissionDecision(request({ permission: "read", patterns: ["../secret.txt"] }))).toBe("ask")
  expect(autoPermissionDecision(request({ permission: "edit", patterns: ["C:\\Temp\\secret.txt"] }))).toBe("ask")
  expect(autoPermissionDecision(request({ permission: "read", patterns: ["mcp:server:resource"] }))).toBe("ask")
})
