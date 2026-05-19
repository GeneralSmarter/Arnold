# Arnold Project Handoff

## 1. Project Overview

Arnold is a local TypeScript/Node agent scaffold. The goal is to become a modular local AI agent that can run from a CLI first, use external providers such as Codex CLI, operate on a workspace, and later grow into connectors, workflows, and a UI.

The main user goal is to have a personal, locally runnable agent platform that is easy to extend with subsystems such as code tools, Gmail, web fetch, future calendar/browser tools, and eventually VPS/daemon workflows. The user prefers something playful and useful now, but still simple enough to understand and build on.

Current stage: early v0 scaffold with a working CLI, provider abstraction, tool registry, workspace file tools, safer incremental edit tools, self-programming support tools, Gmail connector, explicit URL fetch connector, Telegram and Discord remote input listeners, safety approvals, and JSON session storage. It is not a finished autonomous agent platform yet.

## 2. Important Context Not Obvious From The Code

- The app name is **Arnold**. Earlier working names were discarded.
- The user wants "OpenClaw/Codex-style" local agent behavior, but without copying branding, proprietary code, or private implementation details.
- Do not assume raw provider API keys are the primary provider model. The preferred pattern is wrapping authenticated local CLIs or using official OAuth/API flows.
- Do not scrape browser cookies, inspect tokens, steal/copy auth material, or bypass provider auth. Use official login/session flows only.
- The user plans to run this on a VPS later, so keep config portable and avoid OS-specific secret stores for now.
- `.agent/config.json` is non-secret project-local config. `.agent/secrets.json` is secret local state and is gitignored.
- WhatsApp was explored, implemented briefly, then explicitly removed at the user's request. Do not re-add messaging connectors without asking first.
- Gmail setup had several OAuth detours:
  - Google device flow rejected Gmail scopes.
  - A first OAuth credential had `redirect_uris: null` and caused blocked loopback/device issues.
  - The current solution uses a **Desktop app** OAuth JSON, browser loopback redirect `http://localhost:<port>/`, and PKCE.
- `codex-cli` is intentionally run with `--sandbox read-only` by default so file edits should happen through Arnold's own edit tools and approval layer.
- User preference: make things practical and playable, but keep readable code over clever abstractions.

## 3. Current Architecture Summary

Main source areas:

- `src/cli.ts`: command routing for chat, config, connector listing, and Gmail auth setup/status/logout.
- `src/agent/loop.ts`: core tool loop. It sends messages to the provider, executes requested tools after policy checks, appends tool results, and loops until final output.
- `src/providers/`: provider interface plus `mock` and experimental `codex-cli`.
- `src/tools/`: Arnold-owned tools. Current tools are file read/write/list/search, `replace_in_file`, `apply_patch`, `typecheck`, git status/diff, shell, Gmail search/read/create draft, and URL fetch.
- `src/safety/`: approval prompt and denylist policy.
- `src/config/config.ts`: validates project-local config and connector settings.
- `src/secrets/secretsStore.ts`: reads/writes `.agent/secrets.json`.
- `src/connectors/`: Gmail auth/client helpers, Telegram Bot API long polling, Discord bot listener, connector metadata, and web/Gmail integration support.
- `src/memory/sessionStore.ts`: JSON session creation/saving under `.agent/sessions`.

Important data flow:

1. `agent chat` loads `.agent/config.json`.
2. A provider is created (`mock` or `codex-cli`).
3. User input is appended to the session.
4. Provider returns either `{ type: "final" }` or `{ type: "tool_request" }`.
5. Arnold resolves the requested tool by name.
6. Safety policy blocks, asks for approval, or allows execution.
7. Tool output is saved as a tool message.
8. Provider sees the new tool result and continues until final.

Provider/tool protocol:

- `codex-cli` prompts Codex to return exactly one JSON object.
- Codex can request tools such as `list_files`, `search_files`, `read_file`, `replace_in_file`, `apply_patch`, `write_file`, `typecheck`, `git_status`, `git_diff`, `shell`, `gmail_search`, `gmail_read`, `gmail_create_draft`, and `fetch_url`.
- The provider prompt tells Codex to inspect files first, search for existing patterns, prefer `replace_in_file` for exact targeted edits, prefer `apply_patch` for multi-line or multi-file edits, run `typecheck`, inspect `git_status`/`git_diff`, and reserve `write_file` for new files or full rewrites.
- If Arnold cannot complete a request because a tool, connector, permission flow, or integration is missing, the provider prompt tells Codex to suggest the smallest Arnold code change that would add the capability.
- If Codex returns invalid or plain output, Arnold treats it as a final answer rather than crashing.

Integrations:

- Gmail uses Google OAuth with Desktop app credentials, browser loopback on `localhost`, PKCE, and refresh-token storage in `.agent/secrets.json`.
- Gmail scopes are `gmail.readonly` and `gmail.compose`; Arnold creates drafts only and does not send mail.
- Web fetch only fetches explicit HTTP(S) URLs. It blocks localhost/private network targets, limits redirects and bytes, strips basic HTML, and does not scrape search engines.
- Telegram uses BotFather bot-token auth stored in `.agent/secrets.json`, long polling from the local machine/Pi, and `connectors.telegram.allowedChatIds` as the remote access whitelist.
- Discord uses a bot token stored in `.agent/secrets.json`, `discord.js` Gateway events, and `connectors.discord.allowedGuildIds` / `allowedChannelIds` as the remote access whitelist.

## 4. Current Implementation Status

Working:

- CLI help, config printing, connectors listing.
- Interactive chat sessions.
- Mock provider tool-flow demo.
- Codex CLI provider with Arnold JSON tool protocol.
- Workspace-safe file listing, reading, and writing.
- Safer incremental edit tools through `replace_in_file` and `apply_patch`.
- Self-programming support tools: `search_files`, `typecheck`, `git_status`, and `git_diff`.
- Approval previews can be customized per tool; the new edit tools use compact previews.
- Shell tool with approval and denylist.
- Project-local config and sessions.
- Gmail OAuth login/status/logout.
- Gmail connector is authenticated and enabled in `.agent/config.json`.
- Gmail search/read/draft tools are implemented.
- Web `fetch_url` tool is implemented and verified against `https://example.com` with network permission.
- Telegram connector/listener is implemented with `agent auth telegram token`, `agent telegram listen`, `/id`, `/status`, `/help`, and `/ask <message>`.
- Discord connector/listener is implemented with `agent auth discord token`, `agent discord listen`, `!id`, `!status`, `!help`, and `!ask <message>`.
- TypeScript typecheck passes via `node node_modules\typescript\bin\tsc --noEmit`.

Partially working or not fully proven:

- End-to-end Gmail search/read/draft through the chat agent still needs real-world testing after auth.
- End-to-end Telegram with a real BotFather token still needs live testing.
- End-to-end Discord with a real bot token and server/channel whitelist still needs live testing.
- Codex's compliance with the JSON tool protocol may vary; prompt/parser are tolerant but not bulletproof.
- `apply_patch` is conservative and TypeScript-clean, but still needs a full interactive `agent chat --provider codex-cli` edit test.
- `write_file` still writes full file contents; use it mainly for new files, full rewrites, or cases where incremental edits are not a good fit.
- Session resume exists only as a placeholder method in `SessionStore`.

Not implemented:

- Web UI/operator console.
- Daemon/server mode.
- Calendar connector.
- Browser automation.
- General web search.
- Email sending, inbox modification, labels, archiving.
- Multi-workspace commands.
- Workflow files/scheduled jobs.
- Strong sandboxing beyond path checks, approval prompts, and command denylist.

## 5. Known Issues And Risks

- OAuth client secrets and refresh tokens are stored in `.agent/secrets.json`. It is gitignored, but still sensitive on disk.
- A Google client secret appeared in earlier chat/editor context. If this project is shared, rotate Google OAuth credentials.
- Gmail OAuth depends on the Google Cloud consent screen and test-user setup. If another account is used, it must be added as a test user.
- `fetch_url` uses simple HTML stripping, not a full readability parser.
- `shell` uses Node child-process execution and is powerful. Approval mode should stay `confirm` unless the user explicitly wants higher autonomy.
- Shell denylist is basic and not a real security sandbox.
- `write_file` can overwrite entire files. It is approval-gated, but its preview is still just raw input.
- The Codex CLI provider shells out once per provider turn, which may be slow and can create verbose behavior.
- `codex-cli` default args include `--sandbox read-only`; changing `ARNOLD_CODEX_ARGS` can bypass that design assumption.

## 6. Next Recommended Tasks

Priority next steps:

1. Test Gmail end-to-end from `agent chat`: search recent emails, read one message by ID, and create a draft.
2. Run one manual `codex-cli` chat edit to confirm Codex uses `replace_in_file` or `apply_patch` and that the approval preview feels good.
3. Add `agent sessions list` and `agent chat --resume`.
4. Add a tool-call/activity log view in CLI output so users can see what Arnold is doing without opening session JSON.
5. Add `agent tools` to list all available tools and their risky/read-only status.
6. Add remote approval commands such as `/approve <id>` and `/deny <id>` for Telegram/Discord.
7. Add workflow files under a future `workflows/` folder.

Avoid doing next unless the user confirms:

- Re-adding WhatsApp or messaging connectors.
- Enabling email sending.
- Setting approval mode to `auto`.
- Letting Telegram or Discord execute risky tools without a remote approval flow.
- Adding browser automation that relies on cookies or private browser sessions.
- Moving secrets into normal config.

Tasks that need user confirmation:

- Whether to add a web UI or keep CLI-only for the next phase.
- Whether to support Gmail inbox modification, labels, archive/delete, or send.
- Whether VPS deployment should use local files, environment variables, or a more formal secret manager.

## 7. Session Update Log

### 2026-05-19

- Added Telegram connector config and connector registry metadata.
- Added Telegram bot token storage under `.agent/secrets.json` with `agent auth telegram token|status|logout`.
- Added Telegram long-polling listener with `agent telegram listen`.
- Added Telegram commands `/id`, `/help`, `/status`, and `/ask <message>`.
- Telegram `/ask` runs the agent in `suggest` approval mode for now, so read-only tools can run but risky tools are blocked until remote approval is implemented.
- Added Discord connector config and connector registry metadata.
- Added Discord bot token storage under `.agent/secrets.json` with `agent auth discord token|status|logout`.
- Added Discord listener with `agent discord listen`.
- Added Discord commands `!id`, `!help`, `!status`, and `!ask <message>`.
- Added Discord server setup command `agent discord ensure-channels [channel-name...]`.
- Discord `!ask` runs the agent in `suggest` approval mode for now, so read-only tools can run but risky tools are blocked until remote approval is implemented.
- Updated README with Telegram and Discord setup instructions.
- Added self-programming support tools (`search_files`, `typecheck`, `git_status`, `git_diff`) and increased the agent loop budget from 10 to 20 tool steps.
- Updated the Codex CLI provider prompt to use an inspect/edit/typecheck/diff loop for programming tasks.
- Updated missing-tool, blocked-tool, and capability-gap behavior so Arnold suggests code changes when it cannot do something yet.

### 2026-05-18

- Created Arnold v0 TypeScript/Node CLI scaffold.
- Added `agent chat`, `agent config`, mock provider, and experimental Codex CLI provider.
- Added workspace file tools: `list_files`, `read_file`, `write_file`, and `shell`.
- Added approval modes: `suggest`, `confirm`, `auto`, plus shell denylist.
- Added project-local `.agent/config.json` and `.agent/sessions`.
- Added README with setup, safety, provider, and extension guidance.
- Fixed Windows Codex CLI execution by using the `.cmd` wrapper path through `cmd.exe`.
- Added then removed WhatsApp Cloud API support after user decided to scrap it.
- Added connector foundation, `.agent/secrets.json` secret store, and `.gitignore`.
- Added Gmail connector with OAuth login/status/logout, Gmail search/read/create-draft tools.
- Added web `fetch_url` tool with private/local URL blocking.
- Changed Gmail auth from rejected device flow to Desktop app browser OAuth with `localhost` loopback and PKCE.
- Enabled Gmail in `.agent/config.json` after successful OAuth login.
- Updated Codex CLI provider to request Arnold JSON tool calls so it can inspect/edit workspace files through Arnold's tools.
- Added `replace_in_file` and `apply_patch` so Arnold can make safer incremental edits without defaulting to full-file rewrites.
- Updated approval previews so tools can show focused approval details instead of only raw JSON.
- Refreshed this handoff document so a future session can pick up cleanly.
