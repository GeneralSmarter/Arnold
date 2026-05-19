import "server-only";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { workspaceRoot } from "./workspace";

const execFileAsync = promisify(execFile);

export async function getGitStatus() {
  return git(["status", "--short", "--branch"]);
}

export async function getGitLog(limit = 8) {
  const output = await git(["log", `--max-count=${limit}`, "--pretty=format:%h%x09%cr%x09%s"]);
  return output.split("\n").filter(Boolean).map((line) => {
    const [hash, time, ...subject] = line.split("\t");
    return { hash, time, subject: subject.join("\t") };
  });
}

export async function getGitRemote() {
  const output = await git(["remote", "get-url", "origin"]);
  return output.trim();
}

async function git(args: string[]) {
  try {
    const result = await execFileAsync("git", args, {
      cwd: workspaceRoot,
      timeout: 20_000,
      windowsHide: true
    });
    return result.stdout.trim();
  } catch {
    return "";
  }
}
