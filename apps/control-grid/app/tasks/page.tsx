import { createTaskAction, updateTaskStatusAction } from "@/app/actions";
import { TopMetrics } from "@/components/sidebar";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { getActivityEvents } from "@/lib/server/sessions";
import { getTasks, type TaskStatus } from "@/lib/server/tasks";
import { getGitStatus } from "@/lib/server/git";

const columns: Array<{ id: TaskStatus; label: string; tone: "muted" | "purple" | "teal" }> = [
  { id: "backlog", label: "Backlog", tone: "muted" },
  { id: "in-progress", label: "In Progress", tone: "purple" },
  { id: "done", label: "Done", tone: "teal" }
];

export default async function TasksPage() {
  const [tasks, activity, gitStatus] = await Promise.all([getTasks(), getActivityEvents(18), getGitStatus()]);
  const dirty = gitStatus.split(/\r?\n/).some((line) => line && !line.startsWith("##"));

  return (
    <div>
      <SectionTitle eyebrow="Control Grid" title="Task Pipeline" />
      <TopMetrics sessions={activity.length} dirty={dirty} />

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        {columns.map((column) => (
          <Panel key={column.id} className="min-h-[26rem]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-mono text-sm uppercase tracking-[0.22em] text-slate-200">{column.label}</h2>
              <Badge tone={column.tone}>{tasks.filter((task) => task.status === column.id).length}</Badge>
            </div>
            <div className="space-y-3">
              {tasks.filter((task) => task.status === column.id).map((task) => (
                <article key={task.id} className="rounded-md border border-blue-300/15 bg-deck-900/70 p-4">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <h3 className="font-semibold text-slate-50">{task.title}</h3>
                    <Badge tone={column.tone}>{task.owner}</Badge>
                  </div>
                  <p className="text-sm leading-6 text-slate-400">{task.description}</p>
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">{task.source}</p>
                  <form action={updateTaskStatusAction} className="mt-4 flex gap-2">
                    <input type="hidden" name="id" value={task.id} />
                    {columns.filter((item) => item.id !== task.status).map((item) => (
                      <button key={item.id} name="status" value={item.id} className="rounded border border-blue-300/20 px-2 py-1 text-xs text-slate-300 hover:border-signal-purple/60">{item.label}</button>
                    ))}
                  </form>
                </article>
              ))}
              {tasks.filter((task) => task.status === column.id).length === 0 ? <p className="rounded border border-dashed border-blue-300/20 p-4 text-sm text-slate-500">No real tasks in this lane yet.</p> : null}
            </div>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Panel>
          <SectionTitle eyebrow="Sessions" title="Recent Arnold Activity" />
          <div className="space-y-3">
            {activity.map((event) => (
              <div key={event.id} className="grid gap-3 rounded-md border border-blue-300/15 bg-deck-900/60 p-4 md:grid-cols-[9rem_1fr_5rem]">
                <Badge tone={event.status === "done" ? "teal" : event.status === "error" ? "red" : "purple"}>{event.status}</Badge>
                <div>
                  <p className="font-semibold text-slate-100">{event.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-400">{event.summary}</p>
                </div>
                <p className="font-mono text-xs text-slate-500">{event.toolCount} tools</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="Write" title="Add Task" />
          <form action={createTaskAction} className="space-y-3">
            <input name="title" placeholder="Task title" className="w-full rounded border border-blue-300/20 bg-deck-950 px-3 py-2 text-sm outline-none focus:border-signal-purple" />
            <textarea name="description" placeholder="Description" rows={4} className="w-full rounded border border-blue-300/20 bg-deck-950 px-3 py-2 text-sm outline-none focus:border-signal-purple" />
            <input name="owner" defaultValue="Skynet" className="w-full rounded border border-blue-300/20 bg-deck-950 px-3 py-2 text-sm outline-none focus:border-signal-purple" />
            <select name="status" className="w-full rounded border border-blue-300/20 bg-deck-950 px-3 py-2 text-sm">
              {columns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
            </select>
            <button className="w-full rounded bg-signal-purple px-4 py-2 text-sm font-bold text-white shadow-glow">Add real task</button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
