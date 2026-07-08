import { createMemo } from "solid-js"
import { useLocal } from "../context/local"
import { useSync } from "../context/sync"
import { useDialog } from "../ui/dialog"
import { DialogSelect } from "../ui/dialog-select"

type PermissionModeSelection = "normal" | "auto"

export function DialogPermissionMode() {
  const local = useLocal()
  const sync = useSync()
  const dialog = useDialog()
  const current = createMemo(() =>
    local.permission.active((sync.data.config as { permission_mode?: string }).permission_mode),
  )
  const options = createMemo(() => [
    {
      value: "normal" as const,
      title: "Approve",
      description: current() === "normal" ? "current" : "ask before running permissioned actions",
      footer: current() === "normal" ? "current" : "manual",
    },
    {
      value: "auto" as const,
      title: "Auto",
      description:
        current() === "auto" ? "current" : "auto-approve safe project-local bash commands; risky actions still ask",
      footer: current() === "auto" ? "current" : "safe local",
    },
  ])

  return (
    <DialogSelect<PermissionModeSelection>
      title="Permissions"
      current={current()}
      options={options()}
      onSelect={(option) => {
        local.permission.set(option.value)
        dialog.clear()
      }}
    />
  )
}
