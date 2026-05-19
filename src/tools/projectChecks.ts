import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Tool } from "./types.js";

interface PackageJson {
  scripts?: Record<string, string>;
}

const PREFERRED_CHECKS = ["typecheck", "lint", "test", "build"];

export const projectChecksTool: Tool = {
  name: "project_checks",
  description: "Discover package.json validation scripts and recommend safe project checks to run.",
  risky: false,
  async run(_input, context) {
    try {
      const packageJsonPath = path.join(context.config.workspaceRoot, "package.json");
      const parsed = JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJson;
      const scripts = parsed.scripts ?? {};
      const available = Object.keys(scripts).sort();
      const recommended = PREFERRED_CHECKS.filter((name) => scripts[name]);

      return {
        ok: true,
        content: [
          "Available package scripts:",
          available.length
            ? available.map((name) => `- ${name}: npm run ${name}`).join("\n")
            : "- (none)",
          "",
          "Recommended validation order:",
          recommended.length
            ? recommended.map((name) => `- npm run ${name}`).join("\n")
            : "- No standard validation scripts found."
        ].join("\n")
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { ok: false, content: "No package.json found at the workspace root." };
      }
      return { ok: false, content: error instanceof Error ? error.message : "Unable to inspect project checks." };
    }
  }
};
