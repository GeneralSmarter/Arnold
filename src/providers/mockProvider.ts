import type { AgentMessage, AgentStep } from "../agent/types.js";
import type { Provider, ProviderContext } from "./types.js";

export class MockProvider implements Provider {
  name = "mock" as const;

  async generate(messages: AgentMessage[], _context: ProviderContext): Promise<AgentStep> {
    const last = messages.at(-1);

    if (last?.role === "tool") {
      return {
        type: "final",
        content: `Mock provider received tool result from ${last.name ?? "tool"}:\n${last.content}`
      };
    }

    const text = last?.content.toLowerCase() ?? "";
    if (text.includes("list") && (text.includes("file") || text.includes("dir"))) {
      return {
        type: "tool_request",
        request: {
          toolName: "list_files",
          input: { path: "." }
        }
      };
    }

    if (text.includes("fetch") && text.includes("http")) {
      const url = last?.content.match(/https?:\/\/\S+/)?.[0];
      if (url) {
        return {
          type: "tool_request",
          request: {
            toolName: "fetch_url",
            input: { url }
          }
        };
      }
    }

    if (text.includes("gmail") && text.includes("search")) {
      return {
        type: "tool_request",
        request: {
          toolName: "gmail_search",
          input: { query: "newer_than:7d" }
        }
      };
    }

    return {
      type: "final",
      content:
        "Arnold mock mode is online. Try asking me to list files to see a tool call flow."
    };
  }
}
