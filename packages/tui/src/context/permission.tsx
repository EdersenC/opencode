import { createStore } from "solid-js/store"
import { useArgs } from "./args"
import { createSimpleContext } from "./helper"

export type PermissionMode = "auto" | "normal"

export function resolvePermissionMode(input: {
  override?: PermissionMode
  configMode?: string
  autoFlag?: boolean
}): PermissionMode {
  if (input.override) return input.override
  if (input.autoFlag) return "auto"
  if (input.configMode === "auto") return "auto"
  return "normal"
}

export const { use: usePermission, provider: PermissionProvider } = createSimpleContext({
  name: "Permission",
  init: () => {
    const args = useArgs()
    const [store, setStore] = createStore<{ override?: PermissionMode }>({
      override: args.auto ? "auto" : undefined,
    })
    return {
      get mode() {
        return resolvePermissionMode({ override: store.override, autoFlag: args.auto })
      },
      active(configMode?: string) {
        return resolvePermissionMode({ override: store.override, autoFlag: args.auto, configMode })
      },
      set(mode: PermissionMode) {
        setStore("override", mode)
      },
      toggle(configMode?: string) {
        setStore(
          "override",
          resolvePermissionMode({ override: store.override, autoFlag: args.auto, configMode }) === "auto"
            ? "normal"
            : "auto",
        )
      },
    }
  },
})
