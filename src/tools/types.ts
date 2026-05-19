import type { AppConfig } from "../config/config.js";

export interface ToolContext {
  config: AppConfig;
}

export interface ToolResult {
  ok: boolean;
  content: string;
}

export interface Tool {
  name: string;
  description: string;
  risky: boolean;
  approvalPreview?(input: Record<string, unknown>): string;
  run(input: Record<string, unknown>, context: ToolContext): Promise<ToolResult>;
}
