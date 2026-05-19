import path from "node:path";

const PROTECTED_WORKSPACE_PATHS = [".agent/secrets.json"];

export function resolveInsideWorkspace(workspaceRoot: string, requestedPath: string): string {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(root, requestedPath);
  const relative = path.relative(root, target);
  const isOutside = relative.startsWith("..") || path.isAbsolute(relative);
  if (isOutside) {
    throw new Error("Attempted path traversal outside workspace.");
  }
  return target;
}

export function assertNotProtectedWorkspacePath(workspaceRoot: string, targetPath: string): void {
  if (isProtectedWorkspacePath(workspaceRoot, targetPath)) {
    throw new Error("Access to protected Arnold secret files is blocked.");
  }
}

export function isProtectedWorkspacePath(workspaceRoot: string, targetPath: string): boolean {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(targetPath);
  const relative = normalizeRelative(path.relative(root, target));
  return PROTECTED_WORKSPACE_PATHS.includes(relative);
}

function normalizeRelative(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}
