import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export type LocalFiles = Readonly<{
  readText(path: string): Promise<string>
  readBytes(path: string): Promise<Uint8Array>
  mime(path: string): Promise<string>
}>

export type LocalAttachment =
  | Readonly<{ type: "text"; mime: "image/svg+xml"; content: string }>
  | Readonly<{ type: "binary"; mime: string; content: Uint8Array }>

export function readLocalAttachment(file: string) {
  return readLocalAttachmentWith(
    {
      readText: (value) => readFile(value, "utf8"),
      readBytes: (value) => readFile(value),
      mime: async (value) => mimeTypes[path.extname(value).toLowerCase()] ?? "application/octet-stream",
    },
    file,
  )
}

const WINDOWS_DRIVE_PATH = /^([A-Za-z]):[\\/](.*)$/
const FILE_URL_WINDOWS_DRIVE_PATH = /^\/([A-Za-z]):[\\/](.*)$/

export function normalizePastedFilepath(value: string, platform: string) {
  const raw = value.replace(/^['"]+|['"]+$/g, "")
  const filePath = raw.startsWith("file://") ? localFileURLToPath(raw) : raw
  if (platform === "win32") return filePath

  const fileURLWindows = filePath.match(FILE_URL_WINDOWS_DRIVE_PATH)
  if (fileURLWindows) return windowsPathToWslPath(fileURLWindows[1], fileURLWindows[2])

  const windows = filePath.match(WINDOWS_DRIVE_PATH)
  if (windows) return windowsPathToWslPath(windows[1], windows[2])

  return filePath.replace(/\\(.)/g, "$1")
}

const mimeTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
}

function localFileURLToPath(value: string) {
  try {
    return fileURLToPath(value)
  } catch {
    return value
  }
}

function windowsPathToWslPath(drive: string, rest: string) {
  return `/mnt/${drive.toLowerCase()}/${rest.replaceAll("\\", "/")}`
}

export async function readLocalAttachmentWith(files: LocalFiles, path: string): Promise<LocalAttachment | undefined> {
  const mime = await files.mime(path).catch(() => undefined)
  if (!mime) return
  if (mime === "image/svg+xml") {
    const content = await files.readText(path).catch(() => undefined)
    if (!content) return
    return { type: "text", mime, content }
  }
  if (!mime.startsWith("image/") && mime !== "application/pdf") return
  const content = await files.readBytes(path).catch(() => undefined)
  if (!content) return
  return { type: "binary", mime, content }
}
