import type { ApprovalMode } from "../config/config.js";
import type { Tool } from "../tools/types.js";

const DENYLIST = [
  "rm -rf",
  "format",
  "del /s",
  "shutdown",
  "reboot",
  "diskpart",
  "mkfs",
  "chmod -r 777",
  ".agent/secrets.json",
  ".agent\\secrets.json"
];

export interface PolicyDecision {
  allowed: boolean;
  needsApproval: boolean;
  reason: string;
}

export function checkToolPolicy(
  tool: Tool,
  input: Record<string, unknown>,
  approvalMode: ApprovalMode
): PolicyDecision {
  if (tool.name === "shell") {
    const command = String(input.command ?? "").toLowerCase();
    const blocked = DENYLIST.find((item) => command.includes(item));
    if (blocked) {
      return {
        allowed: false,
        needsApproval: false,
        reason: `Blocked by shell denylist: ${blocked}`
      };
    }
  }

  if (!tool.risky) {
    return { allowed: true, needsApproval: false, reason: "Tool is read-only." };
  }

  if (approvalMode === "suggest") {
    return {
      allowed: false,
      needsApproval: false,
      reason: "Approval mode is suggest, so risky actions are not executed."
    };
  }

  return {
    allowed: true,
    needsApproval: approvalMode === "confirm",
    reason: approvalMode === "auto" ? "Auto approval mode." : "Confirmation required."
  };
}
