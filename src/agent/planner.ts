import type { ProviderName } from "../providers/types.js";

export function describeRun(provider: ProviderName, workspaceRoot: string): string {
  return `Provider: ${provider}\nWorkspace: ${workspaceRoot}`;
}
