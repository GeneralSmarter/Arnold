import "server-only";
import path from "node:path";
import { controlGridDir, ensureControlGridDir } from "./workspace";
import { readJsonFile } from "./json";

export interface CrewAgent {
  id: string;
  name: string;
  role: string;
  mission: string;
  status: "active" | "standby" | "idle" | "away";
  accent: "purple" | "red" | "teal" | "amber";
}

export interface CrewFile {
  mission: string;
  agents: CrewAgent[];
}

const crewPath = path.join(controlGridDir, "crew.json");

export async function getCrew() {
  await ensureControlGridDir();
  return readJsonFile<CrewFile>(crewPath, {
    mission: "Arnold is a personal assistant system that turns vague intentions into visible progress.",
    agents: []
  });
}
