import type { ProviderName } from "../providers/types.js";

export type Role = "user" | "assistant" | "tool" | "system";

export interface AgentMessage {
  role: Role;
  content: string;
  name?: string;
  createdAt: string;
}

export interface Session {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: AgentMessage[];
  provider: ProviderName;
  workspaceRoot: string;
}

export interface ToolRequest {
  toolName: string;
  input: Record<string, unknown>;
}

export type AgentStep =
  | { type: "final"; content: string }
  | { type: "tool_request"; request: ToolRequest };
