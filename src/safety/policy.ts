import type { ApprovalMode } from "../config/config.js";
import type { Tool } from "../tools/types.js";

const DENYLIST = [
  "rm -rf",
  "rm -r",
  "format",
  "del /s",
  "rmdir /s",
  "shutdown",
  "reboot",
  "diskpart",
  "mkfs",
  "dd if=",
  "chmod -r 777",
  "takeown",
  "icacls",
  "git reset --hard",
  "git clean",
  "git checkout --",
  "git push --force",
  ".agent/secrets.json",
  ".agent\\secrets.json"
];

const SAFE_SHELL_PATTERNS = [
  /^git\s+(status|diff|log|show|branch|rev-parse)(\s|$)/i,
  /^npm\s+run\s+(typecheck|lint|test|build)(\s|$)/i,
  /^node\s+--version$/i,
  /^npm\s+--version$/i,
  /^pnpm\s+--version$/i,
  /^tsc\s+--noemit$/i,
  /^rg(\s|$)/i,
  /^dir(\s|$)/i,
  /^type\s+[\w./\\ -]+$/i
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

    if (isSafeShellCommand(command)) {
      return {
        allowed: true,
        needsApproval: false,
        reason: "Shell command is classified as read-only validation or inspection."
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

function isSafeShellCommand(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) {
    return false;
  }
  if (/[|&<>;]/.test(normalized)) {
    return false;
  }
  return SAFE_SHELL_PATTERNS.some((pattern) => pattern.test(normalized));
}
