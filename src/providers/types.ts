import type { AgentMessage, AgentStep } from "../agent/types.js";

export type ProviderName = "mock" | "codex-cli";

export interface ProviderContext {
  workspaceRoot: string;
}

export interface Provider {
  name: ProviderName;
  generate(messages: AgentMessage[], context: ProviderContext): Promise<AgentStep>;
}
