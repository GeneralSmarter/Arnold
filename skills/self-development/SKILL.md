# Self-Development

## Purpose
Use this skill when Arnold is asked to inspect, improve, debug, or extend its own codebase.

## When To Use
- The user asks Arnold to add a feature, fix a bug, improve tools, update prompts, or change documentation.
- The request affects `src/`, `README.md`, `HANDOFF.md`, `.agent/`, or Arnold's local workflows.
- Arnold cannot complete a task because a missing tool, connector, permission path, or workflow needs to be added.

## Tools
- `git_status`
- `search_files`
- `list_files`
- `read_file`
- `replace_in_file`
- `apply_patch`
- `write_file`
- `project_checks`
- `typecheck`
- `git_diff`
- `dev_memory`

## Workflow
1. Start with `git_status` and note unrelated user changes without reverting them.
2. Search for existing patterns before inventing new structure.
3. Read the relevant files before editing.
4. For broad changes, summarize the intended plan before risky edits.
5. Prefer `replace_in_file` for exact edits and `apply_patch` for coherent multi-line edits.
6. Use `write_file` only for new files or intentional full rewrites.
7. Run `project_checks`, then the most relevant validation command. For TypeScript changes, run `typecheck`.
8. Inspect `git_status` and `git_diff` before the final answer.
9. Use `dev_memory` to append a concise note after meaningful project changes.
10. Final response should name changed files, checks run, what changed, and any remaining risk.

## Safety
- Never read `.agent/secrets.json`.
- Do not change approval mode to `auto` unless the user explicitly asks.
- Do not run destructive shell commands.
- Do not delete, move, or overwrite user work unless the user explicitly asks.
- If blocked, explain the smallest code change that would unblock Arnold.
