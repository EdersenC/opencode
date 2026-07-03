import { applyPromptProfile } from "./profile"
import type { PromptProfileName } from "./profile"

export type PromptSegmentKind =
  | "role"
  | "goal"
  | "context"
  | "constraint"
  | "pressure"
  | "operation"
  | "workflow"
  | "tool_guidance"
  | "example"
  | "output_format"
  | "quality_bar"
  | "model_note"
  | "custom"

export type PromptSegment = {
  id: string
  kind: PromptSegmentKind
  title?: string
  content: string | string[]
  priority?: number
  enabled?: boolean
  tags?: string[]
  metadata?: Record<string, unknown>
}

export type PromptBuildOptions = {
  profile?: PromptProfileName
  model?: string
  modelSize?: "small" | "medium" | "large" | "reasoning" | "unknown"
  agent?: string
  compact?: boolean
  includeExamples?: boolean
  includePressure?: boolean
  includeDebugMarkers?: boolean
  tags?: string[]
  excludeTags?: string[]
  sortByPriority?: boolean
}

export type PromptModelNoteOptions = {
  model?: string | string[]
  modelSize?: PromptBuildOptions["modelSize"] | Array<NonNullable<PromptBuildOptions["modelSize"]>>
  title?: string
  priority?: number
  enabled?: boolean
  tags?: string[]
  metadata?: Record<string, unknown>
}

export type PromptCondition =
  | ((options: PromptBuildOptions) => boolean)
  | {
      profile?: PromptProfileName | PromptProfileName[]
      model?: string | string[]
      modelSize?: PromptBuildOptions["modelSize"] | Array<NonNullable<PromptBuildOptions["modelSize"]>>
      agent?: string | string[]
      tags?: string[]
    }

type PromptEntry = {
  segment: PromptSegment
  order: number
  condition?: PromptCondition
}

type PromptSegmentInput = Omit<PromptSegment, "id"> & { id?: string }

export namespace PromptBuilder {
  export function create(name: string) {
    return new Builder(name)
  }

  export class Builder {
    constructor(
      private readonly name: string,
      private readonly entries: PromptEntry[] = [],
      private readonly nextIndex = 0,
    ) {}

    role(content: string | string[]) {
      return this.add({ kind: "role", title: "Role", content })
    }

    goal(content: string | string[]) {
      return this.add({ kind: "goal", title: "Goal", content })
    }

    context(title: string, content: string | string[]) {
      return this.add({ kind: "context", title, content })
    }

    constraint(content: string | string[]) {
      return this.add({ kind: "constraint", title: "Constraints", content })
    }

    pressure(content: string | string[]): Builder
    pressure(title: string, content: string | string[]): Builder
    pressure(title: string | string[], content?: string | string[]) {
      if (content === undefined) return this.add({ kind: "pressure", title: "Pressure", content: title })
      return this.add({ kind: "pressure", title: title as string, content })
    }

    operation(title: string, items: string[]) {
      return this.add({ kind: "operation", title, content: items })
    }

    operations(title: string, items: string[]) {
      return this.operation(title, items)
    }

    workflow(title: string, steps: string[]) {
      return this.add({ kind: "workflow", title, content: steps })
    }

    toolGuidance(title: string, content: string | string[]) {
      return this.add({ kind: "tool_guidance", title, content })
    }

    example(title: string, content: string | string[]) {
      return this.add({ kind: "example", title: `Example: ${title}`, content })
    }

    outputFormat(content: string | string[]) {
      return this.add({ kind: "output_format", title: "Output Format", content })
    }

    qualityBar(content: string | string[]) {
      return this.add({ kind: "quality_bar", title: "Quality Bar", content })
    }

    modelNote(content: string | string[], options: PromptModelNoteOptions = {}) {
      return this.add({
        kind: "model_note",
        title: options.title ?? "Model Notes",
        content,
        priority: options.priority,
        enabled: options.enabled,
        tags: options.tags,
        metadata: {
          ...(options.metadata ?? {}),
          ...(options.model === undefined ? {} : { model: options.model }),
          ...(options.modelSize === undefined ? {} : { modelSize: options.modelSize }),
        },
      })
    }

    segment(segment: PromptSegment) {
      return this.add(segment)
    }

    when(condition: PromptCondition, build: (builder: Builder) => Builder) {
      const child = build(new Builder(this.name, [], this.nextIndex))
      return new Builder(
        this.name,
        [
          ...this.entries,
          ...child.entries.map((entry) => ({
            ...entry,
            condition: mergeCondition(condition, entry.condition),
          })),
        ],
        this.nextIndex + child.entries.length,
      )
    }

    use(apply: (builder: Builder) => Builder) {
      return apply(this)
    }

    compile(options: PromptBuildOptions = {}) {
      const buildOptions = applyPromptProfile(options)
      const gap = buildOptions.compact ? "\n" : "\n\n"
      return orderEntries(
        this.entries.filter((entry) => includeEntry(entry, buildOptions)),
        buildOptions,
      )
        .map((entry) => renderSegment(entry.segment, buildOptions))
        .filter((item) => item.length > 0)
        .join(gap)
    }

    private add(segment: PromptSegmentInput) {
      return new Builder(
        this.name,
        [
          ...this.entries,
          {
            segment: {
              ...segment,
              id: segment.id ?? `${this.name}:${segment.kind}:${this.nextIndex}`,
            },
            order: this.nextIndex,
          },
        ],
        this.nextIndex + 1,
      )
    }
  }
}

function orderEntries(entries: PromptEntry[], options: PromptBuildOptions) {
  if (!options.sortByPriority) return entries
  return [...entries].sort((a, b) => (b.segment.priority ?? 0) - (a.segment.priority ?? 0) || a.order - b.order)
}

function includeEntry(entry: PromptEntry, options: PromptBuildOptions) {
  if (entry.segment.enabled === false) return false
  if (entry.segment.kind === "example" && options.includeExamples === false) return false
  if (entry.segment.kind === "pressure" && options.includePressure === false) return false
  if (!includeTags(entry.segment, options)) return false
  if (!includeModelNote(entry.segment, options)) return false
  if (entry.condition === undefined) return true
  return includeCondition(entry.condition, options)
}

function includeTags(segment: PromptSegment, options: PromptBuildOptions) {
  if (options.excludeTags?.some((tag) => segment.tags?.includes(tag))) return false
  if (!options.tags?.length) return true
  if (!segment.tags?.length) return true
  return segment.tags.some((tag) => options.tags?.includes(tag))
}

function includeModelNote(segment: PromptSegment, options: PromptBuildOptions) {
  if (segment.kind !== "model_note") return true
  if (!hasMetadataKey(segment, "model") && !hasMetadataKey(segment, "modelSize")) return true
  return matchesValue(options.model, segment.metadata?.model) && matchesValue(options.modelSize, segment.metadata?.modelSize)
}

function includeCondition(condition: PromptCondition, options: PromptBuildOptions): boolean {
  if (typeof condition === "function") return condition(options)
  if (!matchesValue(options.profile, condition.profile)) return false
  if (!matchesValue(options.model, condition.model)) return false
  if (!matchesValue(options.modelSize, condition.modelSize)) return false
  if (!matchesValue(options.agent, condition.agent)) return false
  if (!condition.tags?.length) return true
  return condition.tags.some((tag) => options.tags?.includes(tag))
}

function mergeCondition(left: PromptCondition, right: PromptCondition | undefined): PromptCondition {
  if (right === undefined) return left
  return (options) => includeCondition(left, options) && includeCondition(right, options)
}

function hasMetadataKey(segment: PromptSegment, key: string) {
  return segment.metadata !== undefined && Object.hasOwn(segment.metadata, key)
}

function matchesValue(value: string | undefined, expected: unknown) {
  if (expected === undefined) return true
  if (value === undefined) return false
  if (Array.isArray(expected)) return expected.includes(value)
  return expected === value
}

function renderSegment(segment: PromptSegment, options: PromptBuildOptions) {
  const gap = options.compact ? "\n" : "\n\n"
  return [
    options.includeDebugMarkers ? `<!-- prompt-segment: ${segment.id} kind=${segment.kind} -->` : "",
    renderHeading(segment),
    renderContent(segment.content),
  ]
    .filter((item) => item.length > 0)
    .join(gap)
}

function renderHeading(segment: PromptSegment) {
  return `${segment.kind === "role" ? "#" : "##"} ${segment.title ?? defaultTitle(segment.kind)}`
}

function defaultTitle(kind: PromptSegmentKind) {
  return (
    {
      role: "Role",
      goal: "Goal",
      context: "Context",
      constraint: "Constraints",
      pressure: "Pressure",
      operation: "Operations",
      workflow: "Workflow",
      tool_guidance: "Tool Guidance",
      example: "Example",
      output_format: "Output Format",
      quality_bar: "Quality Bar",
      model_note: "Model Notes",
      custom: "Notes",
    } satisfies Record<PromptSegmentKind, string>
  )[kind]
}

function renderContent(content: string | string[]) {
  if (Array.isArray(content)) return content.map(renderBullet).filter((item) => item.length > 0).join("\n")
  return cleanText(content)
}

function renderBullet(value: string) {
  const lines = cleanText(value).split("\n")
  if (lines.length === 1 && lines[0] === "") return ""
  return [`- ${lines[0]}`, ...lines.slice(1).map((line) => `  ${line}`)].join("\n")
}

function cleanText(value: string) {
  return value
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
}
