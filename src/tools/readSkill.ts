import type { Tool } from "./types.js";
import { readSkill } from "../skills/skillStore.js";

export const readSkillTool: Tool = {
  name: "read_skill",
  description: "Read a local skills/<name>/SKILL.md workflow file by skill name.",
  risky: false,
  async run(input, context) {
    try {
      const name = String(input.name ?? "").trim();
      if (!name) {
        return { ok: false, content: "Missing required input: name" };
      }
      const skill = await readSkill(context.config.workspaceRoot, name);
      return {
        ok: true,
        content: [
          `Skill: ${skill.name}`,
          `Title: ${skill.title}`,
          `Path: ${skill.path}`,
          "",
          skill.content
        ].join("\n")
      };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        return { ok: false, content: "Skill does not exist." };
      }
      return { ok: false, content: error instanceof Error ? error.message : "Unable to read skill." };
    }
  }
};
