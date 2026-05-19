import { spawn } from "node:child_process";
import type { AgentMessage, AgentStep } from "../agent/types.js";
import type { Provider, ProviderContext } from "./types.js";
import { listTools } from "../tools/registry.js";

export class CodexCliProvider implements Provider {
  name = "codex-cli" as const;

  constructor(
    private readonly command = process.env.ARNOLD_CODEX_COMMAND ?? defaultCodexCommand(),
    private readonly args = splitCommandArgs(
      process.env.ARNOLD_CODEX_ARGS ?? "exec --skip-git-repo-check --sandbox read-only -"
    )
  ) {}

  async generate(messages: AgentMessage[], context: ProviderContext): Promise<AgentStep> {
    const prompt = renderPrompt(messages, context);
    const output = await runCodex(this.command, this.args, prompt, context.workspaceRoot);
    return parseProviderOutput(output);
  }
}

function renderPrompt(messages: AgentMessage[], context: ProviderContext): string {
  return [
    "You are being called by Arnold, a local experimental agent shell. Arnold owns all tools and safety approvals.",
    "Return exactly one JSON object and no Markdown, code fences, commentary, or surrounding text.",
    "",
    "Valid response shapes:",
    JSON.stringify({ type: "final", content: "Concise answer to the user." }),
    JSON.stringify({
      type: "tool_request",
      toolName: "read_file",
      input: { path: "relative/path.ts" }
    }),
    "",
    "Rules:",
    "- Use tool_request whenever you need to inspect files, edit files, list files, run commands, fetch URLs, or use connectors.",
    "- File paths must be relative to the workspace root.",
    "- To edit code, inspect the relevant file first.",
    "- Prefer replace_in_file for exact targeted edits and apply_patch for multi-line or multi-file changes.",
    "- Use write_file for new files, full rewrites, or cases where incremental edits cannot apply safely.",
    "- Do not claim a tool ran unless Arnold provided a TOOL result.",
    "- Do not ask for raw provider API keys or inspect auth tokens.",
    "",
    `Workspace root: ${context.workspaceRoot}`,
    "",
    "Available tools:",
    ...listTools().map((tool) =>
      JSON.stringify({
        name: tool.name,
        description: tool.description,
        risky: tool.risky
      })
    ),
    "",
    ...messages.map((message) => {
      const name = message.name ? `(${message.name})` : "";
      return `${message.role.toUpperCase()}${name}: ${message.content}`;
    })
  ].join("\n");
}

function parseProviderOutput(output: string): AgentStep {
  const parsed = tryParseJsonObject(output);
  if (!parsed) {
    return { type: "final", content: output };
  }

  if (parsed.type === "final" && typeof parsed.content === "string") {
    return { type: "final", content: parsed.content };
  }

  if (
    parsed.type === "tool_request" &&
    typeof parsed.toolName === "string" &&
    parsed.input &&
    typeof parsed.input === "object" &&
    !Array.isArray(parsed.input)
  ) {
    return {
      type: "tool_request",
      request: {
        toolName: parsed.toolName,
        input: parsed.input as Record<string, unknown>
      }
    };
  }

  return {
    type: "final",
    content: `Provider returned invalid Arnold protocol JSON:\n${output}`
  };
}

function tryParseJsonObject(output: string): Record<string, unknown> | undefined {
  const trimmed = stripCodeFence(output.trim());
  try {
    const value = JSON.parse(trimmed) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    const extracted = extractFirstJsonObject(trimmed);
    if (!extracted) {
      return undefined;
    }
    try {
      const value = JSON.parse(extracted) as unknown;
      return isRecord(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
}

function stripCodeFence(output: string): string {
  const match = output.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1].trim() : output;
}

function extractFirstJsonObject(output: string): string | undefined {
  const start = output.indexOf("{");
  if (start === -1) {
    return undefined;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < output.length; i += 1) {
    const char = output[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return output.slice(start, i + 1);
      }
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

async function runCodex(
  command: string,
  args: string[],
  prompt: string,
  cwd: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const spawnTarget = getSpawnTarget(command, args);
    const child = spawn(spawnTarget.command, spawnTarget.args, {
      cwd,
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        reject(
          new Error(
            "Codex CLI command was not found. Install Codex CLI and run `codex login` separately, or switch provider to mock."
          )
        );
        return;
      }
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim() || "(Codex CLI completed with no output)");
        return;
      }
      reject(
        new Error(
          `Codex CLI exited with code ${code}. ${stderr.trim() || "Check that Codex CLI is installed and logged in."}`
        )
      );
    });

    child.stdin.write(prompt);
    child.stdin.end();
  });
}

function defaultCodexCommand(): string {
  return process.platform === "win32" ? "codex.cmd" : "codex";
}

function splitCommandArgs(value: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "\"" | "'" | undefined;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quote) {
      if (char === "\\" && (value[i + 1] === quote || value[i + 1] === "\\")) {
        current += value[i + 1];
        i += 1;
        continue;
      }
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }

  if (current) {
    args.push(current);
  }
  return args;
}

function getSpawnTarget(command: string, args: string[]): { command: string; args: string[] } {
  if (process.platform !== "win32" || !command.toLowerCase().endsWith(".cmd")) {
    return { command, args };
  }

  return {
    command: "cmd.exe",
    args: ["/d", "/s", "/c", command, ...args]
  };
}
