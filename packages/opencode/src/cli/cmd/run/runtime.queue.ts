// Serial prompt queue for direct interactive mode.
//
// Prompts arrive from the footer (user types and hits enter) and queue up
// here. The queue drains one turn at a time; ordinary prompts waiting behind
// an active ordinary turn are exposed for edit/removal until they begin.
//
// The queue also handles /exit, /quit, and /new commands, empty-prompt rejection,
// and tracks per-turn wall-clock duration for scrollback summaries plus
// cumulative session timing for the footer status line.
//
// Resolves when the footer closes and all in-flight work finishes.
import * as Locale from "@/util/locale"
import { MessageID, PartID } from "@/session/schema"
import { isExitCommand, isNewCommand } from "./prompt.shared"
import type { FooterApi, FooterEvent, FooterQueuedPrompt, RunPrompt } from "./types"

type Trace = {
  write(type: string, data?: unknown): void
}

type Deferred<T = void> = {
  promise: Promise<T>
  resolve: (value: T | PromiseLike<T>) => void
  reject: (error?: unknown) => void
}

export type QueueInput = {
  footer: FooterApi
  initialInput?: string
  now?: () => number
  trace?: Trace
  onSend?: (prompt: RunPrompt) => void
  onNewSession?: () => void | Promise<void>
  run: (prompt: RunPrompt, signal: AbortSignal) => Promise<void>
}

type State = {
  queue: RunPrompt[]
  queued: FooterQueuedPrompt[]
  active?: RunPrompt
  ctrl?: AbortController
  closed: boolean
}

function defer<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((next, fail) => {
    resolve = next
    reject = fail
  })

  return { promise, resolve, reject }
}

// Runs the prompt queue until the footer closes.
//
// Subscribes to footer prompt events and drains operations through input.run().
// Ordinary prompts submitted during an ordinary active turn remain local and
// are exposed by the footer for edit/removal until their turn begins.
export async function runPromptQueue(input: QueueInput): Promise<void> {
  const now = input.now ?? Date.now
  const stop = defer<{ type: "closed" }>()
  const done = defer()
  const state: State = {
    queue: [],
    queued: [],
    closed: input.footer.isClosed,
  }
  const timing = {
    sessionStartedAt: now(),
    workingMs: 0,
    betweenMs: 0,
    activeStartedAt: undefined as number | undefined,
    betweenStartedAt: now(),
  }
  let draining: Promise<void> | undefined

  const emit = (next: FooterEvent, row: Record<string, unknown>) => {
    input.trace?.write("ui.patch", row)
    input.footer.event(next)
  }

  const timingSnapshot = () => {
    const at = now()
    const workingMs =
      timing.activeStartedAt === undefined
        ? timing.workingMs
        : timing.workingMs + Math.max(0, at - timing.activeStartedAt)
    const betweenMs =
      timing.activeStartedAt === undefined
        ? timing.betweenMs + Math.max(0, at - timing.betweenStartedAt)
        : timing.betweenMs
    return {
      totalMs: Math.max(0, at - timing.sessionStartedAt),
      workingMs,
      betweenMs,
    }
  }

  const formatTiming = () => {
    const snapshot = timingSnapshot()
    return [
      `total ${Locale.duration(snapshot.totalMs)}`,
      `work ${Locale.duration(snapshot.workingMs)}`,
      `between ${Locale.duration(snapshot.betweenMs)}`,
    ].join(" · ")
  }

  const syncTiming = () => {
    const snapshot = timingSnapshot()
    emit(
      {
        type: "session.timing",
        timing: formatTiming(),
      },
      snapshot,
    )
  }

  const resetTiming = () => {
    const at = now()
    timing.sessionStartedAt = at
    timing.workingMs = 0
    timing.betweenMs = 0
    timing.activeStartedAt = undefined
    timing.betweenStartedAt = at
    syncTiming()
  }

  const startWork = () => {
    const at = now()
    if (timing.activeStartedAt !== undefined) return at
    timing.betweenMs += Math.max(0, at - timing.betweenStartedAt)
    timing.activeStartedAt = at
    syncTiming()
    return at
  }

  const finishWork = () => {
    const at = now()
    if (timing.activeStartedAt === undefined) return at
    timing.workingMs += Math.max(0, at - timing.activeStartedAt)
    timing.activeStartedAt = undefined
    timing.betweenStartedAt = at
    syncTiming()
    return at
  }

  const timingInterval = setInterval(syncTiming, 1000)
  syncTiming()

  const syncQueue = () => {
    const queue = state.queue.length
    emit({ type: "queue", queue }, { queue })
    emit(
      {
        type: "queued.prompts",
        prompts: [...state.queued],
      },
      { queued: state.queued.length },
    )
  }

  const removeLocalQueued = (queued: FooterQueuedPrompt) => {
    if (!state.queued.includes(queued)) return
    state.queued = state.queued.filter((item) => item !== queued)
    syncQueue()
  }

  const finish = () => {
    if (!state.closed || draining) {
      return
    }

    done.resolve()
  }

  const close = () => {
    if (state.closed) {
      return
    }

    syncTiming()
    state.closed = true
    state.queue.length = 0
    state.queued.length = 0
    state.ctrl?.abort()
    stop.resolve({ type: "closed" })
    finish()
  }

  const drain = () => {
    if (draining || state.closed || state.queue.length === 0) {
      return
    }

    draining = (async () => {
      try {
        while (!state.closed && state.queue.length > 0) {
          const prompt = state.queue.shift()
          if (!prompt) {
            continue
          }

          const queued = state.queued.find((item) => item.prompt === prompt)
          if (queued) removeLocalQueued(queued)

          if (prompt.mode !== "shell" && isNewCommand(prompt.text)) {
            syncQueue()
            if (!input.onNewSession) {
              emit(
                {
                  type: "stream.patch",
                  patch: {
                    status: "new sessions unavailable",
                  },
                },
                {
                  status: "new sessions unavailable",
                },
              )
              continue
            }

            emit(
              {
                type: "stream.patch",
                patch: {
                  phase: "running",
                  status: "starting new session",
                  queue: state.queue.length,
                },
              },
              {
                phase: "running",
                status: "starting new session",
                queue: state.queue.length,
              },
            )
            await input.onNewSession()
            resetTiming()
            continue
          }

          const sent =
            prompt.mode === "shell"
              ? prompt
              : {
                  ...prompt,
                  messageID: prompt.messageID ?? queued?.messageID ?? MessageID.ascending(),
                }
          state.active = sent

          emit(
            {
              type: "turn.send",
              queue: state.queue.length,
            },
            {
              phase: "running",
              status: "sending prompt",
              queue: state.queue.length,
            },
          )
          const start = startWork()
          const ctrl = new AbortController()
          state.ctrl = ctrl

          try {
            await input.footer.idle()
            if (state.closed) {
              break
            }

            if (sent.mode !== "shell") {
              const commit = {
                kind: "user",
                text: sent.text,
                phase: "start",
                source: "system",
                messageID: sent.messageID,
              } as const
              input.trace?.write("ui.commit", commit)
              input.footer.append(commit)
            }
            input.onSend?.(sent)

            if (state.closed) {
              break
            }

            const task = input.run(sent, ctrl.signal).then(
              () => ({ type: "done" as const }),
              (error) => ({ type: "error" as const, error }),
            )

            const next = await Promise.race([task, stop.promise])
            if (next.type === "closed") {
              ctrl.abort()
              break
            }

            if (next.type === "error") {
              throw next.error
            }
          } finally {
            if (state.ctrl === ctrl) {
              state.ctrl = undefined
            }

            if (sent.mode !== "shell") {
              const completed = finishWork()
              const duration = Locale.duration(Math.max(0, completed - start))
              emit(
                {
                  type: "turn.duration",
                  duration,
                },
                {
                  duration,
                },
              )
            } else {
              finishWork()
            }
            state.active = undefined
          }
        }
      } catch (error) {
        done.reject(error)
        return
      } finally {
        draining = undefined
        emit(
          {
            type: "turn.idle",
            queue: state.queue.length,
          },
          {
            phase: "idle",
            status: "",
            queue: state.queue.length,
          },
        )
      }

      finish()
    })()
  }

  const submit = (prompt: RunPrompt) => {
    if (!prompt.text.trim() || state.closed) {
      return
    }

    if (prompt.mode !== "shell" && isExitCommand(prompt.text)) {
      input.footer.close()
      return
    }

    const active = state.active
    if (
      active &&
      active.mode !== "shell" &&
      !active.command &&
      prompt.mode !== "shell" &&
      !prompt.command &&
      !isNewCommand(prompt.text)
    ) {
      const queued: FooterQueuedPrompt = {
        messageID: MessageID.ascending(),
        partID: PartID.ascending(),
        prompt,
      }
      state.queued = [...state.queued, queued]
      state.queue.push(prompt)
      syncQueue()
      return
    }

    state.queue.push(prompt)
    syncQueue()
    if (prompt.mode !== "shell" && isNewCommand(prompt.text)) {
      drain()
      return
    }

    emit(
      {
        type: "first",
        first: false,
      },
      {
        first: false,
      },
    )
    drain()
  }

  const offPrompt = input.footer.onPrompt((prompt) => {
    submit(prompt)
  })
  const offClose = input.footer.onClose(() => {
    close()
  })
  const offRemoveQueued = input.footer.onQueuedRemove((messageID) => {
    const queued = state.queued.find((item) => item.messageID === messageID)
    if (!queued) return false
    state.queue = state.queue.filter((prompt) => prompt !== queued.prompt)
    removeLocalQueued(queued)
    return true
  })

  try {
    if (state.closed) {
      return
    }

    submit({
      text: input.initialInput ?? "",
      parts: [],
    })
    finish()
    await done.promise
  } finally {
    clearInterval(timingInterval)
    offPrompt()
    offClose()
    offRemoveQueued()
    close()
    await draining?.catch(() => {})
  }
}
