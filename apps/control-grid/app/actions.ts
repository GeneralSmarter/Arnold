"use server";

import { redirect } from "next/navigation";
import { addAllowedDiscordChannel, createDiscordChannel, renameDiscordChannel, setDiscordRespondToAll } from "@/lib/server/discord";
import { updateTaskStatus, upsertTask, type TaskStatus } from "@/lib/server/tasks";

export async function createTaskAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const owner = String(formData.get("owner") ?? "Skynet").trim() || "Skynet";
  const status = String(formData.get("status") ?? "backlog") as TaskStatus;
  if (title) {
    await upsertTask({ title, description, owner, status, source: "Control Grid" });
  }
  redirect("/tasks");
}

export async function updateTaskStatusAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "backlog") as TaskStatus;
  if (id) {
    await updateTaskStatus(id, status);
  }
  redirect("/tasks");
}

export async function setRespondToAllAction(formData: FormData) {
  await setDiscordRespondToAll(formData.get("respondToAllMessages") === "on");
  redirect("/team");
}

export async function addAllowedChannelAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "").trim();
  if (channelId) {
    await addAllowedDiscordChannel(channelId);
  }
  redirect("/team");
}

export async function createDiscordChannelAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (name) {
    await createDiscordChannel(name);
  }
  redirect("/team");
}

export async function renameDiscordChannelAction(formData: FormData) {
  const channelId = String(formData.get("channelId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  if (channelId && name) {
    await renameDiscordChannel(channelId, name);
  }
  redirect("/team");
}
