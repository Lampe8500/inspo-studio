import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { emptyProject, type CaptureMeta, type Project } from "./types";

// Alt gemmes lokalt i ./data (er i .gitignore).
const DATA_DIR = path.join(process.cwd(), "data");
const CAPTURES_DIR = path.join(DATA_DIR, "captures");
const PROJECT_FILE = path.join(DATA_DIR, "project.json");

const ID_RE = /^[a-z0-9-]{6,64}$/;

export function isValidId(id: string) {
  return ID_RE.test(id);
}

export function captureDir(id: string) {
  if (!isValidId(id)) throw new Error("Ugyldigt id");
  return path.join(CAPTURES_DIR, id);
}

export async function saveCapture(meta: CaptureMeta, shot: Buffer) {
  const dir = captureDir(meta.id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "shot.jpg"), shot);
  await fs.writeFile(path.join(dir, "meta.json"), JSON.stringify(meta));
}

export async function readCaptureMeta(id: string): Promise<CaptureMeta | null> {
  try {
    const raw = await fs.readFile(path.join(captureDir(id), "meta.json"), "utf8");
    return JSON.parse(raw) as CaptureMeta;
  } catch {
    return null;
  }
}

export async function readCaptureShot(id: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(path.join(captureDir(id), "shot.jpg"));
  } catch {
    return null;
  }
}

export async function readProject(): Promise<Project> {
  try {
    const raw = await fs.readFile(PROJECT_FILE, "utf8");
    return { ...emptyProject(), ...(JSON.parse(raw) as Partial<Project>) };
  } catch {
    return emptyProject();
  }
}

export async function writeProject(project: Project) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = PROJECT_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(project));
  await fs.rename(tmp, PROJECT_FILE);
}
