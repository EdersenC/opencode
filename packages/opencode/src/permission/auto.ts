export type Mode = "ask" | "auto"

type AutoApproval = {
  kind: "project-local-shell"
  safe: boolean
  reason: string
}

type PermissionLike = {
  permission: string
  metadata?: Record<string, unknown>
}

const UNSAFE_SHELL_PATTERNS = [
  { reason: "privileged command", pattern: /(^|[;&|]\s*)(sudo|su|doas)\b/i },
  { reason: "shell installer pipeline", pattern: /\|\s*(sh|bash|zsh|fish|pwsh|powershell)\b/i },
  { reason: "remote download command", pattern: /(^|[;&|]\s*)(curl|wget)\b/i },
  { reason: "remote shell/file transfer", pattern: /(^|[;&|]\s*)(ssh|scp|rsync)\b/i },
  { reason: "git push", pattern: /(^|[;&|]\s*)git\s+push\b/i },
  { reason: "package publish", pattern: /(^|[;&|]\s*)(npm|pnpm|yarn)\s+publish\b/i },
  { reason: "deployment command", pattern: /(^|[;&|]\s*)(firebase|flyctl|vercel|heroku|sls|serverless|sst|cdk|cf)\b/i },
  { reason: "cloud/provider command", pattern: /(^|[;&|]\s*)(aws|az|gcloud|doctl|kubectl|helm|terraform|pulumi)\b/i },
  { reason: "container command", pattern: /(^|[;&|]\s*)(docker|podman)\b/i },
  { reason: "process/system command", pattern: /(^|[;&|]\s*)(kill|killall|pkill|systemctl|service|launchctl|ufw|iptables|ip)\b/i },
  { reason: "system redirection", pattern: /(^|[^0-9])>>?\s*(\/|~|\$HOME\b|\$env:HOME\b)/i },
  { reason: "system path", pattern: /(^|\s)(\/etc|\/usr|\/bin|\/sbin|\/var|\/opt|\/root|\/tmp|~|\$HOME\b)\b/i },
  { reason: "windows system path", pattern: /(^|\s)[A-Za-z]:[\\/](Windows|Program Files)([\\/]|$)/i },
]

export function normalizeMode(value: unknown): Mode {
  return value === "auto" ? "auto" : "ask"
}

export function withMode(metadata: Record<string, unknown> | undefined, mode: unknown) {
  const normalized = normalizeMode(mode)
  if (normalized === "ask") return metadata ?? {}
  return {
    ...(metadata ?? {}),
    permissionMode: normalized,
  }
}

export function shellApproval(input: { patterns: readonly string[]; externalDirectories: readonly string[] }) {
  if (input.externalDirectories.length > 0) {
    return {
      kind: "project-local-shell",
      safe: false,
      reason: "external directory",
    } satisfies AutoApproval
  }

  for (const pattern of input.patterns) {
    const unsafe = UNSAFE_SHELL_PATTERNS.find((item) => item.pattern.test(pattern))
    if (!unsafe) continue
    return {
      kind: "project-local-shell",
      safe: false,
      reason: unsafe.reason,
    } satisfies AutoApproval
  }

  return {
    kind: "project-local-shell",
    safe: true,
    reason: "project local shell",
  } satisfies AutoApproval
}

export function canAutoApproveRequest(input: PermissionLike) {
  const approval = input.metadata?.autoApprove
  return (
    input.permission === "bash" &&
    typeof approval === "object" &&
    approval !== null &&
    "kind" in approval &&
    approval.kind === "project-local-shell" &&
    "safe" in approval &&
    approval.safe === true
  )
}

export function canAutoApprove(input: PermissionLike) {
  if (normalizeMode(input.metadata?.permissionMode) !== "auto") return false
  return canAutoApproveRequest(input)
}
