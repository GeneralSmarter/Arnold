import { createServer } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import type { AppConfig } from "../config/config.js";
import { SecretsStore, type GmailTokenSecrets, type SecretFile } from "../secrets/secretsStore.js";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose"
];

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

interface TokenErrorResponse {
  error: string;
  error_description?: string;
}

export interface LoopbackLoginRequest {
  authUrl: string;
  redirectUri: string;
  codeVerifier: string;
  codePromise: Promise<string>;
  close: () => Promise<void>;
}

export async function beginGmailLoopbackLogin(clientId: string): Promise<LoopbackLoginRequest> {
  const state = randomBytes(24).toString("hex");
  const codeVerifier = base64Url(randomBytes(64));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  let resolveCode: (code: string) => void;
  let rejectCode: (error: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/" && requestUrl.pathname !== "/oauth2callback") {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const returnedState = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error");

      if (error) {
        response.writeHead(400, { "Content-Type": "text/plain" });
        response.end(`Google OAuth error: ${error}`);
        rejectCode(new Error(`Google OAuth error: ${error}`));
        return;
      }

      if (returnedState !== state) {
        response.writeHead(400, { "Content-Type": "text/plain" });
        response.end("Invalid OAuth state. You can close this tab.");
        rejectCode(new Error("Invalid OAuth state returned by Google."));
        return;
      }

      if (!code) {
        response.writeHead(400, { "Content-Type": "text/plain" });
        response.end("Missing OAuth code. You can close this tab.");
        rejectCode(new Error("Missing OAuth code returned by Google."));
        return;
      }

      response.writeHead(200, { "Content-Type": "text/plain" });
      response.end("Arnold Gmail login complete. You can close this tab.");
      resolveCode(code);
    } catch (error) {
      rejectCode(error instanceof Error ? error : new Error("OAuth callback failed."));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "localhost", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Could not start local OAuth callback server.");
  }

  const redirectUri = `http://localhost:${address.port}/`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state
  });

  return {
    authUrl: `${AUTH_URL}?${params.toString()}`,
    redirectUri,
    codeVerifier,
    codePromise,
    close: () => closeServer(server)
  };
}

export async function getGmailAuthStatus(config: AppConfig): Promise<string> {
  const secrets = await new SecretsStore(config.workspaceRoot).load();
  if (!secrets.google?.clientId) {
    return "Gmail OAuth client is not configured.";
  }
  if (!secrets.google.gmail?.refreshToken) {
    return "Gmail is not authenticated.";
  }
  return `Gmail is authenticated. Token expires at ${secrets.google.gmail.expiresAt ?? "unknown"}.`;
}

export async function getValidGmailAccessToken(config: AppConfig): Promise<string> {
  if (!config.connectors.gmail.enabled) {
    throw new Error("Gmail connector is disabled in .agent/config.json.");
  }

  const store = new SecretsStore(config.workspaceRoot);
  const secrets = await store.load();
  const google = secrets.google;
  const gmail = google?.gmail;

  if (!google?.clientId || !google.clientSecret) {
    throw new Error("Gmail OAuth client is missing. Run `agent auth gmail login` first.");
  }
  if (!gmail?.refreshToken) {
    throw new Error("Gmail is not authenticated. Run `agent auth gmail login` first.");
  }

  if (gmail.accessToken && gmail.expiresAt && Date.parse(gmail.expiresAt) > Date.now() + 60_000) {
    return gmail.accessToken;
  }

  const refreshed = await refreshGmailAccessToken(google.clientId, google.clientSecret, gmail.refreshToken);
  const updated: SecretFile = {
    ...secrets,
    google: {
      ...google,
      gmail: toStoredToken(refreshed, gmail.refreshToken)
    }
  };
  await store.save(updated);
  return refreshed.access_token;
}

export function toStoredToken(response: TokenResponse, fallbackRefreshToken?: string): GmailTokenSecrets {
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token ?? fallbackRefreshToken,
    tokenType: response.token_type,
    scope: response.scope,
    expiresAt: new Date(Date.now() + response.expires_in * 1000).toISOString(),
    obtainedAt: new Date().toISOString()
  };
}

export async function exchangeGmailAuthCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<TokenResponse> {
  return fetchForm<TokenResponse>(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
    grant_type: "authorization_code"
  });
}

async function refreshGmailAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<TokenResponse> {
  return fetchForm<TokenResponse>(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
}

async function fetchForm<T>(url: string, body: Record<string, string>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(body)
  });
  const result = (await response.json()) as T | TokenErrorResponse;
  if (!response.ok) {
    const error = result as TokenErrorResponse;
    throw new Error(error.error_description ?? `Request failed with status ${response.status}`);
  }
  return result as T;
}

function formBody(body: Record<string, string>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    params.set(key, value);
  }
  return params;
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
