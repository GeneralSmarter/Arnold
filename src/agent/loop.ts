import type { AgentMessage, Session } from "./types.js";
import type { AppConfig } from "../config/config.js";
import type { Provider } from "../providers/types.js";
import type { SessionStore } from "../memory/sessionStore.js";
import { getTool } from "../tools/registry.js";
import { checkToolPolicy } from "../safety/policy.js";
import { askForApproval } from "../safety/approvals.js";

export class AgentLoop {
  constructor(
    private readonly config: AppConfig,
    private readonly provider: Provider,
    private readonly sessionStore: SessionStore,
    private readonly session: Session
  ) {}

  async runUserTurn(input: string): Promise<string> {
    this.session.messages.push(makeMessage("user", input));
    await this.sessionStore.save(this.session);

    for (let i = 0; i < 10; i += 1) {
      const step = await this.provider.generate(this.session.messages, {
        workspaceRoot: this.config.workspaceRoot
      });

      if (step.type === "final") {
        this.session.messages.push(makeMessage("assistant", step.content));
        await this.sessionStore.save(this.session);
        return step.content;
      }

      const tool = getTool(step.request.toolName);
      if (!tool) {
        const content = `Tool not found: ${step.request.toolName}`;
        this.session.messages.push(makeMessage("tool", content, step.request.toolName));
        await this.sessionStore.save(this.session);
        continue;
      }

      const policy = checkToolPolicy(tool, step.request.input, this.config.approvalMode);
      if (!policy.allowed) {
        const content = `Tool blocked by safety policy: ${policy.reason}`;
        this.session.messages.push(makeMessage("tool", content, tool.name));
        await this.sessionStore.save(this.session);
        continue;
      }

      if (policy.needsApproval) {
        const approved = await askForApproval(tool, step.request.input, this.config.workspaceRoot);
        if (!approved) {
          const content = "Tool execution declined by user.";
          this.session.messages.push(makeMessage("tool", content, tool.name));
          await this.sessionStore.save(this.session);
          continue;
        }
      }

      const result = await tool.run(step.request.input, { config: this.config });
      this.session.messages.push(makeMessage("tool", result.content, tool.name));
      await this.sessionStore.save(this.session);
    }

    const content = "Stopped after too many tool steps. Try a narrower request.";
    this.session.messages.push(makeMessage("assistant", content));
    await this.sessionStore.save(this.session);
    return content;
  }
}

function makeMessage(role: AgentMessage["role"], content: string, name?: string): AgentMessage {
  return {
    role,
    content,
    name,
    createdAt: new Date().toISOString()
  };
}
