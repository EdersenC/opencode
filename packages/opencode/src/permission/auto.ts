import fs from "fs"
import os from "os"
import path from "path"

export type Mode = "ask" | "auto"
export type ShellDecision = "allow" | "ask" | "deny"

export type ShellClassifierInput = {
  command: string
  cwd: string
  projectRoot: string
  permissionMode: Mode
  patterns?: readonly string[]
  externalDirectories?: readonly string[]
}

export type ShellClassifierResult = {
  kind: "project-local-shell"
  safe: boolean
  decision: ShellDecision
  reason: string
  matchedRule?: string
}

type PermissionLike = {
  permission: string
  metadata?: Record<string, unknown>
}

const REMOTE_PIPE =
  /\b(curl|wget|iwr|Invoke-WebRequest)\b[\s\S]*\|\s*(sh|bash|zsh|fish|pwsh|powershell|iex|Invoke-Expression)\b/i
const FORK_BOMB = /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;?\s*:/
const DESTRUCTIVE_ROOT =
  /(^|[;&|]\s*)(sudo\s+)?rm\s+(?:-[^\s]*r[^\s]*f[^\s]*|-[^\s]*f[^\s]*r[^\s]*|-[^\s]*r[^\s]*\s+-[^\s]*f|-[^\s]*f[^\s]*\s+-[^\s]*r)\s+(?:--\s+)?(\/(?:\*+)?|~|\$HOME|\$\{HOME\}|\.\.)(?=$|[\s;&|])/i
const PERMISSION_SYSTEM_MUTATION =
  /(^|[;&|]\s*)(sudo\s+)?(chmod|chown)\s+[\s\S]*(\/$|\/etc\b|\/usr\b|\/bin\b|\/sbin\b|\/var\b|\/Library\b|[A-Za-z]:[\\/](Windows|Program Files)\b)/i
const PRIVILEGED = /(^|[;&|]\s*)(sudo|su|doas)\b/i
const GLOBAL_PACKAGE_INSTALL =
  /(^|[;&|]\s*)(npm|pnpm|yarn|bun)\s+(install|add|i)\b(?=[\s\S]*\s(-g|--global)(\s|$))/i
const PUBLISH = /(^|[;&|]\s*)(npm|pnpm|yarn|bun|cargo)\s+publish\b/i
const GIT_PUSH = /(^|[;&|]\s*)git\s+push\b/i
const EXTERNAL_MUTATION =
  /(^|[;&|]\s*)(terraform\s+(apply|destroy)|kubectl\s+(apply|delete|replace|patch|scale|rollout|cordon|drain)|docker\s+(push|run|compose|buildx)|podman\s+(push|run)|gh\s+release\s+create|flyctl\b|vercel\b|firebase\b|heroku\b|sls\b|serverless\b|sst\b|cdk\b|aws\b|az\b|gcloud\b|doctl\b|helm\b)/i
const REMOTE_DOWNLOAD = /(^|[;&|]\s*)(curl|wget|iwr|Invoke-WebRequest)\b/i
const DIRECTORY_ESCAPE = /(^|[;&|]\s*)(cd|chdir|pushd|push-location|set-location)\s+((['"]?)(\.\.|~|\/|[A-Za-z]:[\\/]|\$HOME|\$\{HOME\}))/i
const REDIRECT_OUTSIDE = /(^|[^0-9])>>?\s*(\/|~|\$HOME\b|\$\{HOME\}|[A-Za-z]:[\\/])/i
const DOCKER_HOST_MOUNT = /(^|[;&|]\s*)(docker|podman)\s+run\b[\s\S]*(^|\s)(-v|--volume)\s+\/:/i
const AMBIGUOUS_DELETE =
  /(^|[;&|]\s*)rm\s+(?:-[^\s]*r[^\s]*f[^\s]*|-[^\s]*f[^\s]*r[^\s]*|-[^\s]*r[^\s]*\s+-[^\s]*f|-[^\s]*f[^\s]*\s+-[^\s]*r)\s+(?:--\s+)?(\.|\*)(?=$|[\s;&|])/i
const SYSTEM_PATH =
  /(^|\s)(\/etc|\/usr|\/bin|\/sbin|\/var|\/opt|\/root|\/tmp|\/Library|~|\$HOME\b|\$\{HOME\}|[A-Za-z]:[\\/](Windows|Program Files))\b/i

const LOCAL_COMMANDS = new Set([
  "[",
  "awk",
  "bash",
  "biome",
  "bun",
  "cargo",
  "cat",
  "chmod",
  "chown",
  "cmake",
  "command",
  "cp",
  "deno",
  "df",
  "diff",
  "du",
  "echo",
  "eslint",
  "find",
  "go",
  "gradle",
  "grep",
  "head",
  "jest",
  "ls",
  "make",
  "mkdir",
  "mocha",
  "mv",
  "node",
  "npm",
  "pnpm",
  "printf",
  "pwd",
  "pytest",
  "python",
  "python3",
  "rg",
  "rm",
  "ruff",
  "sed",
  "sort",
  "tail",
  "test",
  "touch",
  "tree",
  "tsc",
  "tsx",
  "turbo",
  "uniq",
  "vitest",
  "wc",
  "which",
  "xargs",
  "yarn",
])

const GIT_INSPECTION = new Set([
  "branch",
  "diff",
  "grep",
  "log",
  "ls-files",
  "remote",
  "rev-parse",
  "show",
  "status",
])

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

export function classifyShellCommand(input: ShellClassifierInput): ShellClassifierResult {
  if (normalizeMode(input.permissionMode) !== "auto") return ask("AUTO mode is not enabled", "permission-mode")

  const cwd = canonical(input.cwd)
  const projectRoot = canonical(input.projectRoot)
  if (!inside(projectRoot, cwd)) return ask("cwd is outside project root", "cwd-containment")

  const denyResult = denyRule(input.command)
  if (denyResult) return deny(denyResult.reason, denyResult.rule)

  const askResult = askRule(input.command)
  if (askResult) return ask(askResult.reason, askResult.rule)

  const outsideReference = outsidePathReference(input.command, cwd, projectRoot)
  if (outsideReference) return ask(outsideReference.reason, outsideReference.rule)

  if ((input.externalDirectories?.length ?? 0) > 0) {
    return ask("command references path outside project root", "external-directory")
  }

  const unknown = (input.patterns?.length ? input.patterns : [input.command]).find((pattern) => !allowPattern(pattern))
  if (unknown) {
    return ask("command is not recognized as a project-local development command", firstToken(unknown) ?? "unknown")
  }

  return allow("AUTO: project-local command", "project-local")
}

export function shellApproval(input: Omit<ShellClassifierInput, "permissionMode"> & { permissionMode?: Mode }) {
  return classifyShellCommand({
    ...input,
    permissionMode: input.permissionMode ?? "auto",
  })
}

export function autoDecision(input: PermissionLike) {
  if (normalizeMode(input.metadata?.permissionMode) !== "auto") return
  return autoRequestDecision(input)
}

export function canAutoApproveRequest(input: PermissionLike) {
  return autoRequestDecision(input)?.decision === "allow"
}

export function canAutoDenyRequest(input: PermissionLike) {
  return autoRequestDecision(input)?.decision === "deny"
}

export function canAutoApprove(input: PermissionLike) {
  return autoDecision(input)?.decision === "allow"
}

export function canAutoDeny(input: PermissionLike) {
  return autoDecision(input)?.decision === "deny"
}

function autoRequestDecision(input: PermissionLike) {
  const approval = input.metadata?.autoApprove
  if (
    input.permission !== "bash" ||
    typeof approval !== "object" ||
    approval === null ||
    !("kind" in approval) ||
    approval.kind !== "project-local-shell"
  ) {
    return
  }
  if ("decision" in approval) {
    const decision = approval.decision
    if (decision === "allow" || decision === "ask" || decision === "deny") return approval as ShellClassifierResult
  }
  if ("safe" in approval && approval.safe === true) {
    const reason =
      "reason" in approval && typeof approval.reason === "string" ? approval.reason : "AUTO: project-local command"
    return {
      ...(approval as Record<string, unknown>),
      decision: "allow",
      reason,
    } as ShellClassifierResult
  }
}

function denyRule(command: string) {
  if (FORK_BOMB.test(command)) return { reason: "obvious fork bomb", rule: "fork-bomb" }
  if (DESTRUCTIVE_ROOT.test(command)) return { reason: "destructive deletion outside project root", rule: "rm-root-home" }
  if (PERMISSION_SYSTEM_MUTATION.test(command)) {
    return { reason: "system permission mutation outside project root", rule: "chmod-chown-system" }
  }
}

function askRule(command: string) {
  if (REMOTE_PIPE.test(command)) return { reason: "remote script execution", rule: "remote-pipe-shell" }
  if (DOCKER_HOST_MOUNT.test(command)) return { reason: "container host mount outside project root", rule: "docker-host-mount" }
  if (PRIVILEGED.test(command)) return { reason: "privileged command", rule: "privileged-command" }
  if (GLOBAL_PACKAGE_INSTALL.test(command)) return { reason: "global package install", rule: "global-package-install" }
  if (PUBLISH.test(command)) return { reason: "package publish", rule: "package-publish" }
  if (GIT_PUSH.test(command)) return { reason: "git push", rule: "git-push" }
  if (EXTERNAL_MUTATION.test(command)) return { reason: "external deployment or service mutation", rule: "external-mutation" }
  if (REMOTE_DOWNLOAD.test(command)) return { reason: "remote download command", rule: "remote-download" }
  if (DIRECTORY_ESCAPE.test(command)) return { reason: "command changes directory outside project root", rule: "directory-escape" }
  if (REDIRECT_OUTSIDE.test(command)) return { reason: "redirect writes outside project root", rule: "outside-redirection" }
  if (AMBIGUOUS_DELETE.test(command)) return { reason: "ambiguous recursive deletion", rule: "ambiguous-delete" }
  if (SYSTEM_PATH.test(command)) return { reason: "command references system or temporary path", rule: "system-path" }
}

function outsidePathReference(command: string, cwd: string, projectRoot: string) {
  for (const reference of pathReferences(command)) {
    const resolved = resolveReference(reference, cwd)
    if (!resolved) continue
    if (inside(projectRoot, resolved)) continue
    return {
      reason: "command references path outside project root",
      rule: `path:${reference}`,
    }
  }
}

function pathReferences(command: string) {
  const refs: string[] = []
  const patterns = [
    /(^|[\s"'`=])(~(?:[\\/][^\s"'`;&|<>)]*)?|\$HOME(?:[\\/][^\s"'`;&|<>)]*)?|\$\{HOME\}(?:[\\/][^\s"'`;&|<>)]*)?)(?=$|[\s"'`;&|<>),])/g,
    /(^|[\s"'`=])(\.\.(?:[\\/][^\s"'`;&|<>)]*)?)(?=$|[\s"'`;&|<>),])/g,
    /(^|[\s"'`=])([A-Za-z]:[\\/][^\s"'`;&|<>)]*)(?=$|[\s"'`;&|<>),])/g,
    /(^|[\s"'`=])((?<!:)\/[^\s"'`;&|<>)]*)(?=$|[\s"'`;&|<>),])/g,
  ]
  for (const pattern of patterns) {
    pattern.lastIndex = 0
    for (const match of command.matchAll(pattern)) {
      const value = match[2]
      if (!value || value.startsWith("//")) continue
      refs.push(value)
    }
  }
  return refs
}

function resolveReference(reference: string, cwd: string) {
  const expanded = reference
    .replace(/^\$\{HOME\}/, os.homedir())
    .replace(/^\$HOME\b/, os.homedir())
    .replace(/^~(?=$|[\\/])/, os.homedir())
  if (expanded.includes("$") || expanded.includes("`")) return
  return canonical(path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded))
}

function allowPattern(pattern: string) {
  const tokens = tokenize(pattern)
  const command = tokens[0]
  if (!command) return false
  if (command.startsWith("./") || command.startsWith("scripts/") || command.startsWith("script/")) return true
  const name = path.basename(command).toLowerCase()

  if (name === "git") {
    const subcommand = tokens.find((token, index) => index > 0 && !token.startsWith("-"))?.toLowerCase()
    return Boolean(subcommand && GIT_INSPECTION.has(subcommand))
  }

  if (
    (name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") &&
    tokens[1]?.toLowerCase() === "run"
  ) {
    return true
  }

  return LOCAL_COMMANDS.has(name)
}

function firstToken(command: string) {
  return tokenize(command)[0]
}

function tokenize(command: string) {
  const matches = command.match(/"([^"\\]|\\.)*"|'[^']*'|\S+/g) ?? []
  return matches.map((token) => {
    if (token.length < 2) return token
    const first = token[0]
    const last = token[token.length - 1]
    if ((first === '"' || first === "'") && first === last) return token.slice(1, -1)
    return token
  })
}

function canonical(input: string) {
  const resolved = path.resolve(input)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    return resolved
  }
}

function inside(root: string, target: string) {
  const relative = path.relative(normalize(root), normalize(target))
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))
}

function normalize(input: string) {
  const resolved = path.resolve(input)
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

function allow(reason: string, matchedRule: string) {
  return {
    kind: "project-local-shell",
    safe: true,
    decision: "allow",
    reason,
    matchedRule,
  } satisfies ShellClassifierResult
}

function ask(reason: string, matchedRule: string) {
  return {
    kind: "project-local-shell",
    safe: false,
    decision: "ask",
    reason,
    matchedRule,
  } satisfies ShellClassifierResult
}

function deny(reason: string, matchedRule: string) {
  return {
    kind: "project-local-shell",
    safe: false,
    decision: "deny",
    reason,
    matchedRule,
  } satisfies ShellClassifierResult
}
