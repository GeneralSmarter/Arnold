import "server-only";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { controlGridDir, ensureControlGridDir } from "./workspace";
import { readJsonFile, writeJsonFile } from "./json";

export type TaskStatus = "backlog" | "in-progress" | "done";

export interface ControlTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  owner: string;
  source: string;
  updatedAt: string;
}

interface TaskFile {
  tasks: ControlTask[];
}

const tasksPath = path.join(controlGridDir, "tasks.json");

export async function getTasks() {
  await ensureControlGridDir();
  return (await readJsonFile<TaskFile>(tasksPath, { tasks: [] })).tasks;
}

export async function upsertTask(task: Omit<ControlTask, "id" | "updatedAt"> & { id?: string }) {
  await ensureControlGridDir();
  const file = await readJsonFile<TaskFile>(tasksPath, { tasks: [] });
  const id = task.id || slug(task.title);
  const nextTask: ControlTask = { ...task, id, updatedAt: new Date().toISOString() };
  const index = file.tasks.findIndex((item) => item.id === id);
  if (index >= 0) {
    file.tasks[index] = nextTask;
  } else {
    file.tasks.unshift(nextTask);
  }
  await writeJsonFile(tasksPath, file);
  revalidatePath("/tasks");
}

export async function updateTaskStatus(id: string, status: TaskStatus) {
  const file = await readJsonFile<TaskFile>(tasksPath, { tasks: [] });
  file.tasks = file.tasks.map((task) => task.id === id ? { ...task, status, updatedAt: new Date().toISOString() } : task);
  await writeJsonFile(tasksPath, file);
  revalidatePath("/tasks");
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `task-${Date.now()}`;
}
