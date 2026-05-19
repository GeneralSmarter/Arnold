import Link from "next/link";
import { Activity, Bot, FileText, Gauge, LayoutDashboard, RadioTower, Settings2, Target } from "lucide-react";
import { getDiscordStatus } from "@/lib/server/discord";

const nav = [
  { href: "/tasks", label: "Tasks", icon: Target },
  { href: "/team", label: "Team", icon: Bot },
  { href: "/visual", label: "Visual Office", icon: LayoutDashboard },
  { href: "/docs", label: "Docs", icon: FileText }
];

export async function Sidebar() {
  const discord = await getDiscordStatus();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 flex w-72 flex-col border-r border-blue-300/20 bg-deck-900/96">
      <div className="flex h-48 flex-col items-center justify-center border-b border-blue-300/20 px-6">
        <div className="mb-5 grid h-14 w-14 place-items-center rounded-lg border border-signal-purple/30 bg-signal-purple/10 text-3xl shadow-glow">A</div>
        <div className="w-full rounded-lg border border-blue-300/30 bg-deck-800/70 px-5 py-4 text-center font-mono text-lg font-bold uppercase tracking-[0.24em] text-white">
          Mission Control
        </div>
        <div className="mt-4 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-slate-300">
          <span className={discord.listenerOnline ? "h-2.5 w-2.5 rounded-full bg-signal-teal shadow-teal" : "h-2.5 w-2.5 rounded-full bg-signal-red"} />
          Arnold {discord.listenerOnline ? "online" : "offline"}
        </div>
      </div>
      <nav className="flex-1 space-y-2 px-4 py-6">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="group flex items-center justify-between rounded-md border border-transparent px-4 py-3 text-sm font-semibold text-slate-300 transition hover:border-blue-300/30 hover:bg-deck-800/70 hover:text-white">
              <span className="flex items-center gap-3"><Icon className="h-4 w-4 text-signal-purple" />{item.label}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-signal-teal opacity-0 transition group-hover:opacity-100" />
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-blue-300/20 p-4">
        <Link href="/team#discord" className="flex items-center gap-3 rounded-md border border-blue-300/20 bg-deck-800/60 px-4 py-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">
          <Settings2 className="h-4 w-4" /> Discord Ops
        </Link>
        <div className="mt-4 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500"><RadioTower className="h-3 w-3" /> Localhost deck</div>
      </div>
    </aside>
  );
}

export function TopMetrics({ sessions, dirty }: { sessions: number; dirty: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-lg border border-blue-300/15 bg-deck-850/70 p-4"><Gauge className="mb-2 h-4 w-4 text-signal-teal" /><p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">Sessions</p><p className="text-2xl font-semibold">{sessions}</p></div>
      <div className="rounded-lg border border-blue-300/15 bg-deck-850/70 p-4"><Activity className="mb-2 h-4 w-4 text-signal-purple" /><p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">Workspace</p><p className="text-2xl font-semibold">{dirty ? "Dirty" : "Clean"}</p></div>
      <div className="rounded-lg border border-blue-300/15 bg-deck-850/70 p-4"><RadioTower className="mb-2 h-4 w-4 text-signal-red" /><p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">Discord</p><p className="text-2xl font-semibold">Live</p></div>
    </div>
  );
}
