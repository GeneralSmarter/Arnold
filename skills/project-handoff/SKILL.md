# Project Handoff

## Purpose
Use this skill when Arnold needs to preserve project context, summarize progress, or make the workspace easier for a future agent to continue.

## When To Use
- The user asks for a handoff, memory update, status summary, or "what's next".
- Arnold completes meaningful code, docs, connector, scheduling, or workflow changes.
- Another agent or future session needs enough context to continue safely.

## Tools
- `read_file`
- `search_files`
- `git_status`
- `git_diff`
- `dev_memory`
- `replace_in_file`
- `apply_patch`

## Workflow
1. Read `HANDOFF.md` before making major memory edits.
2. Inspect `git_status` so the handoff distinguishes user changes from Arnold changes.
3. Capture durable facts: architecture, commands, setup state, known risks, and next tasks.
4. Avoid logging secrets, tokens, raw email contents, or private personal details unless the user explicitly asks.
5. Keep the handoff concise enough that a future model can quickly absorb it.
6. Use `dev_memory` for short append-only notes; use targeted edits when the standing handoff sections need correction.

## Safety
- Do not read `.agent/secrets.json`.
- Do not write speculative claims as facts.
- Clearly mark untested features and known risks.
