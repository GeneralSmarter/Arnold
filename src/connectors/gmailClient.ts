import type { AppConfig } from "../config/config.js";
import { getValidGmailAccessToken } from "./gmailAuth.js";

export interface GmailSearchResult {
  id: string;
  threadId: string;
  subject?: string;
  from?: string;
  date?: string;
  snippet?: string;
}

export interface GmailMessage {
  id: string;
  threadId: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  snippet?: string;
  body: string;
}

export interface GmailDraftResult {
  id: string;
  messageId?: string;
}

interface GmailListResponse {
  messages?: Array<{ id: string; threadId: string }>;
}

interface GmailMessageResponse {
  id: string;
  threadId: string;
  snippet?: string;
  payload?: GmailPayloadPart;
}

interface GmailPayloadPart {
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: { data?: string };
  parts?: GmailPayloadPart[];
}

export async function searchGmail(
  config: AppConfig,
  query: string,
  maxResults: number
): Promise<GmailSearchResult[]> {
  const token = await getValidGmailAccessToken(config);
  const params = new URLSearchParams({
    q: query,
    maxResults: String(maxResults)
  });
  const list = await gmailRequest<GmailListResponse>(token, `/messages?${params.toString()}`);
  const messages = list.messages ?? [];

  return Promise.all(messages.map(async (message) => {
    const detail = await getGmailMetadata(token, message.id);
    return {
      id: detail.id,
      threadId: detail.threadId,
      subject: header(detail, "Subject"),
      from: header(detail, "From"),
      date: header(detail, "Date"),
      snippet: detail.snippet
    };
  }));
}

export async function readGmailMessage(config: AppConfig, id: string): Promise<GmailMessage> {
  const token = await getValidGmailAccessToken(config);
  const message = await gmailRequest<GmailMessageResponse>(
    token,
    `/messages/${encodeURIComponent(id)}?format=full`
  );

  return {
    id: message.id,
    threadId: message.threadId,
    subject: header(message, "Subject"),
    from: header(message, "From"),
    to: header(message, "To"),
    date: header(message, "Date"),
    snippet: message.snippet,
    body: extractMessageBody(message.payload)
  };
}

export async function createGmailDraft(
  config: AppConfig,
  input: { to: string; subject: string; body: string; cc?: string; bcc?: string }
): Promise<GmailDraftResult> {
  const token = await getValidGmailAccessToken(config);
  const raw = buildRawEmail(input);
  const response = await gmailRequest<{ id: string; message?: { id?: string } }>(token, "/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: { raw }
    })
  });
  return { id: response.id, messageId: response.message?.id };
}

async function getGmailMetadata(token: string, id: string): Promise<GmailMessageResponse> {
  const params = new URLSearchParams({ format: "metadata" });
  for (const name of ["From", "Subject", "Date"]) {
    params.append("metadataHeaders", name);
  }
  return gmailRequest<GmailMessageResponse>(token, `/messages/${encodeURIComponent(id)}?${params.toString()}`);
}

async function gmailRequest<T>(
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");

  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${path}`, {
    ...init,
    headers
  });

  const text = await response.text();
  const body = parseJson(text);

  if (!response.ok) {
    throw new Error(`Gmail API request failed (${response.status}): ${formatApiError(body)}`);
  }
  return body as T;
}

function header(message: GmailMessageResponse, name: string): string | undefined {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractMessageBody(part: GmailPayloadPart | undefined): string {
  if (!part) {
    return "";
  }

  const plain = findPart(part, "text/plain");
  if (plain?.body?.data) {
    return decodeBase64Url(plain.body.data);
  }

  const html = findPart(part, "text/html");
  if (html?.body?.data) {
    return stripHtml(decodeBase64Url(html.body.data));
  }

  if (part.body?.data) {
    return decodeBase64Url(part.body.data);
  }

  return "";
}

function findPart(part: GmailPayloadPart, mimeType: string): GmailPayloadPart | undefined {
  if (part.mimeType === mimeType) {
    return part;
  }
  for (const child of part.parts ?? []) {
    const found = findPart(child, mimeType);
    if (found) {
      return found;
    }
  }
  return undefined;
}

function buildRawEmail(input: { to: string; subject: string; body: string; cc?: string; bcc?: string }): string {
  const headers = [
    `To: ${safeHeaderValue(input.to)}`,
    input.cc ? `Cc: ${safeHeaderValue(input.cc)}` : undefined,
    input.bcc ? `Bcc: ${safeHeaderValue(input.bcc)}` : undefined,
    `Subject: ${safeHeaderValue(input.subject)}`,
    "Content-Type: text/plain; charset=UTF-8",
    "MIME-Version: 1.0"
  ].filter(Boolean);

  return base64UrlEncode(`${headers.join("\r\n")}\r\n\r\n${input.body}`);
}

function safeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function stripHtml(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function formatApiError(body: unknown): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: string; status?: string } }).error;
    return [error?.message, error?.status].filter(Boolean).join(" | ");
  }
  return typeof body === "string" ? body : JSON.stringify(body);
}
