import type { Tool } from "./types.js";
import { readGmailMessage } from "../connectors/gmailClient.js";

export const gmailReadTool: Tool = {
  name: "gmail_read",
  description: "Read a Gmail message by message ID.",
  risky: false,
  async run(input, context) {
    try {
      const id = String(input.id ?? "").trim();
      if (!id) {
        return { ok: false, content: "Missing required input: id" };
      }

      const message = await readGmailMessage(context.config, id);
      return {
        ok: true,
        content: [
          `id: ${message.id}`,
          `thread: ${message.threadId}`,
          message.date ? `date: ${message.date}` : undefined,
          message.from ? `from: ${message.from}` : undefined,
          message.to ? `to: ${message.to}` : undefined,
          message.subject ? `subject: ${message.subject}` : undefined,
          "",
          message.body || message.snippet || "(message body was empty)"
        ]
          .filter((line) => line !== undefined)
          .join("\n")
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to read Gmail message." };
    }
  }
};
