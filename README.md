# Arnold

Arnold is a clean local AI agent scaffold with a CLI-first interface. It is meant to be a small, readable foundation you can play with and extend into a bigger local agent later.

## What This Is

- A minimal TypeScript and Node.js agent loop.
- A local CLI named `agent`.
- A modular provider layer with mock mode and an experimental Codex CLI wrapper.
- A small tool system for file reads, incremental edits, full file writes, file listing, and shell commands.
- Connector tools for Gmail and explicit web URL fetching.
- Telegram and Discord listeners for remote `/ask` messages from allowed chats/channels.
- A basic safety layer with approval modes and a destructive-command denylist.
- Project-local JSON config and session storage.

## What This Is Not

- It is not a finished autonomous assistant.
- It is not a React, desktop, or web UI.
- It is not a database-backed app.
- It does not scrape browser cookies, inspect tokens, bypass auth, or manage provider credentials.
- It does not send email, modify your inbox, scrape search results, or automate a browser yet.

## Install

```bash
pnpm install
pnpm build
```

During development:

```bash
pnpm dev
```

After building:

```bash
pnpm start chat
```

If you link the package globally later, the binary name is:

```bash
agent chat
```

## Commands

Print help:

```bash
agent
```

Start chat:

```bash
agent chat
```

Print config:

```bash
agent config
```

List connectors:

```bash
agent connectors
```

Check Gmail auth:

```bash
agent auth gmail status
```

Configure Telegram:

```bash
agent auth telegram token
agent telegram listen
```

Configure Discord:

```bash
agent auth discord token
agent discord listen
```

Useful overrides:

```bash
agent chat --provider mock --approval confirm --workspace .
agent chat --provider codex-cli
```

## Connectors

Arnold exposes connectors to the agent as tools. Setup and debugging commands live in the CLI, but the agent uses the same tool registry as local file and shell tools.

Core local tools:

- `read_file`: read a workspace text file.
- `replace_in_file`: replace exact text in a workspace file.
- `apply_patch`: apply a conservative unified-style text patch.
- `write_file`: write a full file when incremental edits are not a good fit.
- `list_files`: list workspace files and folders.
- `shell`: run a shell command from the workspace root.

Current connector tools:

- `gmail_search`: search Gmail with Gmail query syntax.
- `gmail_read`: read a Gmail message by ID.
- `gmail_create_draft`: create a Gmail draft without sending it.
- `fetch_url`: fetch readable text from an explicit public HTTP(S) URL.

Remote input surfaces:

- Telegram long polling can receive `/ask` commands and pass them into Arnold.
- Discord can receive `!ask` commands from allowed servers or channels.

Connector secrets are stored in:

```text
.agent/secrets.json
```

This file is ignored by git. Do not paste OAuth secrets into `.agent/config.json`.

## Gmail Setup

Create a Google Cloud OAuth client for a desktop/installed app, download the client secret JSON file, then run:

```bash
agent auth gmail login
```

Arnold will ask for:

- Google OAuth client JSON path, or a client ID
- Google OAuth client secret if you entered a client ID manually

Paste the downloaded JSON path when prompted. Arnold starts a local callback server, prints a Google authorization URL, and waits for you to approve the request in your browser. Arnold stores the refresh/access token metadata in `.agent/secrets.json`.

Enable the connector in `.agent/config.json`:

```json
{
  "connectors": {
    "gmail": {
      "enabled": true,
      "defaultSearchLimit": 10
    }
  }
}
```

Useful commands:

```bash
agent auth gmail status
agent auth gmail logout
```

The first Gmail pass requests these scopes:

```text
https://www.googleapis.com/auth/gmail.readonly
https://www.googleapis.com/auth/gmail.compose
```

Arnold can create drafts but does not send email.

## Web Fetch

The `fetch_url` tool reads explicit HTTP(S) URLs. It does not scrape search engines and does not automate a browser.

Default web settings live in `.agent/config.json`:

```json
{
  "connectors": {
    "web": {
      "enabled": true,
      "maxBytes": 500000,
      "maxRedirects": 3,
      "blockedHosts": ["localhost", "127.0.0.1", "::1"],
      "allowedDomains": []
    }
  }
}
```

Arnold blocks private/local network targets by default. Set `allowedDomains` only if you want to restrict fetching to a known list of public domains.

## Telegram Setup

Create a Telegram bot by messaging `@BotFather` in Telegram and running `/newbot`. Copy the bot token, then run:

```bash
agent auth telegram token
```

Enable Telegram in `.agent/config.json`:

```json
{
  "connectors": {
    "telegram": {
      "enabled": true,
      "allowedChatIds": [],
      "pollTimeoutSeconds": 25
    }
  }
}
```

Start the listener:

```bash
agent telegram listen
```

Message your bot with `/id`, copy the returned chat ID into `allowedChatIds`, then restart the listener. After that, use:

```text
/status
/ask what are the next tasks in HANDOFF.md?
```

Telegram `/ask` runs Arnold with `suggest` approval mode for now. Read-only tools can run, but risky actions such as file edits, shell commands, and Gmail draft creation are blocked until a dedicated remote approval flow is added.

## Discord Setup

Create an app at the Discord Developer Portal, add a bot to it, then copy the bot token. In the bot settings, enable the Message Content Intent so Arnold can read `!ask` messages.

Save the token:

```bash
agent auth discord token
```

Enable Discord in `.agent/config.json`:

```json
{
  "connectors": {
    "discord": {
      "enabled": true,
      "allowedGuildIds": [],
      "allowedChannelIds": [],
      "commandPrefix": "!"
    }
  }
}
```

Invite the bot to your server from the Developer Portal OAuth2 URL generator. Select `bot` scope and grant basic send/read message permissions.

Start the listener:

```bash
agent discord listen
```

In Discord, send:

```text
!id
```

Copy the returned guild ID or channel ID into `.agent/config.json`, then restart the listener. After that, use:

```text
!status
!ask what are the next tasks in HANDOFF.md?
```

Discord `!ask` runs Arnold with `suggest` approval mode for now. Read-only tools can run, but risky actions such as file edits, shell commands, and Gmail draft creation are blocked until a dedicated remote approval flow is added.

## Mock Mode

Mock mode is the default provider. It returns placeholder responses and demonstrates a tool-call flow.

Try:

```text
list files
```

Arnold should request the `list_files` tool, execute it, add the result to the session, and return a mock summary.

## Codex CLI Mode

The `codex-cli` provider is experimental. It shells out to an installed `codex` command through subprocess execution.

You must install Codex CLI and run its official login flow separately:

```bash
codex login
```

Arnold does not ask for an API key, inspect tokens, copy tokens, store tokens, or manage Codex authentication. If the `codex` command is missing or not logged in, Arnold returns a clean error.

The default command is controlled by:

```bash
ARNOLD_CODEX_COMMAND=codex
ARNOLD_CODEX_ARGS="exec --skip-git-repo-check --sandbox read-only -"
```

This is intentionally easy to change later as the provider adapter matures.

In `codex-cli` mode, Arnold asks Codex to respond with a small JSON protocol. Codex can request tools such as `list_files`, `read_file`, `replace_in_file`, `apply_patch`, `write_file`, `shell`, `gmail_search`, and `fetch_url`. Arnold executes those tools through its own safety layer, so code edits can use targeted replacements or patches while shell commands still follow the configured approval mode.

Example:

```text
Read the code in src/cli.ts and explain how the CLI commands are routed.
```

For edits, Arnold will ask before writing in `confirm` mode:

```text
Update src/cli.ts so the help output mentions the new command.
```

## Config And Sessions

Arnold stores project-local state in:

```text
.agent/config.json
.agent/sessions/
```

Default config:

```json
{
  "provider": "mock",
  "approvalMode": "confirm",
  "workspaceRoot": "current working directory",
  "connectors": {
    "gmail": {
      "enabled": false,
      "defaultSearchLimit": 10
    },
    "web": {
      "enabled": true,
      "maxBytes": 500000,
      "maxRedirects": 3,
      "blockedHosts": ["localhost", "127.0.0.1", "::1"],
      "allowedDomains": []
    },
    "telegram": {
      "enabled": false,
      "allowedChatIds": [],
      "pollTimeoutSeconds": 25
    },
    "discord": {
      "enabled": false,
      "allowedGuildIds": [],
      "allowedChannelIds": [],
      "commandPrefix": "!"
    }
  }
}
```

Each chat starts a new session. The session store includes a placeholder `loadLatest` method so resume support can be expanded later.

## Safety Model

Tools only operate inside the configured workspace root. Path traversal and outside-root file access are blocked.

Approval modes:

- `suggest`: risky tools are not executed.
- `confirm`: ask `y/N` before risky edit tools, shell commands, and Gmail draft creation.
- `auto`: run allowed actions without prompting.

The shell tool always blocks commands containing:

```text
rm -rf
format
del /s
shutdown
reboot
diskpart
mkfs
chmod -R 777
```

`replace_in_file`, `apply_patch`, and `write_file` are all approval-gated in `confirm` mode.

This safety layer is a starting point, not a complete sandbox. Treat shell access carefully, especially on a VPS.

## Extension Points

Add providers in:

```text
src/providers/
```

Add tools in:

```text
src/tools/
```

Future connector subsystems for additional email providers, websites, messaging channels, browser tools, OAuth flows, and custom workflows should use official APIs and explicit user-authorized sessions. Do not build token scraping or auth bypasses into Arnold.

## Future Ideas

- Resume latest session.
- Web operator console with chat, activity timeline, tool approvals, and workspace context.
- Provider adapters for local models and official API providers.
- OAuth-backed calendar and additional email connectors.
- Browser automation with explicit user sessions.
- Workflow definitions for repeatable tasks.
- Richer safety policies per workspace, tool, and environment.
