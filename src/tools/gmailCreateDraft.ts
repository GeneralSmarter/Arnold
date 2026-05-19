import type { Tool } from "./types.js";
import { createGmailDraft } from "../connectors/gmailClient.js";

export const gmailCreateDraftTool: Tool = {
  name: "gmail_create_draft",
  description: "Create a Gmail draft without sending it.",
  risky: true,
  async run(input, context) {
    try {
      const to = String(input.to ?? "").trim();
      const subject = String(input.subject ?? "").trim();
      const body = String(input.body ?? "").trim();
      const cc = optionalString(input.cc);
      const bcc = optionalString(input.bcc);

      if (!to) {
        return { ok: false, content: "Missing required input: to" };
      }
      if (!subject) {
        return { ok: false, content: "Missing required input: subject" };
      }
      if (!body) {
        return { ok: false, content: "Missing required input: body" };
      }

      const draft = await createGmailDraft(context.config, { to, subject, body, cc, bcc });
      return {
        ok: true,
        content: draft.messageId
          ? `Created Gmail draft ${draft.id} for message ${draft.messageId}.`
          : `Created Gmail draft ${draft.id}.`
      };
    } catch (error) {
      return { ok: false, content: error instanceof Error ? error.message : "Unable to create Gmail draft." };
    }
  }
};

function optionalString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}
