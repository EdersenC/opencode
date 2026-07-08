import { expect, test } from "bun:test"
import { resolvePermissionMode } from "../src/context/permission"

test("permission mode follows config until locally overridden", () => {
  expect(resolvePermissionMode({ configMode: "auto" })).toBe("auto")
  expect(resolvePermissionMode({ configMode: "auto", override: "normal" })).toBe("normal")
  expect(resolvePermissionMode({ configMode: "ask", override: "auto" })).toBe("auto")
})

test("permission mode auto flag can be locally overridden", () => {
  expect(resolvePermissionMode({ autoFlag: true })).toBe("auto")
  expect(resolvePermissionMode({ autoFlag: true, override: "normal" })).toBe("normal")
})
