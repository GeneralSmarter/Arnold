import "server-only";
import path from "node:path";
import { mkdir } from "node:fs/promises";

export const workspaceRoot = path.resolve(process.env.ARNOLD_WORKSPACE_ROOT ?? path.join(process.cwd(), "../.."));
export const agentDir = path.join(workspaceRoot, ".agent");
export const controlGridDir = path.join(agentDir, "control-grid");

export async function ensureControlGridDir() {
  await mkdir(controlGridDir, { recursive: true });
}

export function fromWorkspace(...segments: string[]) {
  return path.join(workspaceRoot, ...segments);
}

export function relativeToWorkspace(filePath: string) {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, "/");
}
