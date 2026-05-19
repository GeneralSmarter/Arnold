import { Badge } from "@/components/ui/badge";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { getCrew } from "@/lib/server/crew";
import { getDiscordStatus } from "@/lib/server/discord";
import { getActivityEvents } from "@/lib/server/sessions";

export default async function VisualPage() {
  const [crew, discord, activity] = await Promise.all([getCrew(), getDiscordStatus(), getActivityEvents(8)]);
  const activeAgent = activity[0]?.status === "in-progress" ? "skynet" : "skynet";

  return (
    <div>
      <SectionTitle eyebrow="Live" title="Visual Office" action={<Badge tone={discord.listenerOnline ? "teal" : "red"}>{discord.listenerOnline ? "Live" : "Offline"}</Badge>} />
      <Panel className="scanline overflow-hidden p-0">
        <div className="grid min-h-[34rem] grid-cols-12 grid-rows-6 gap-1 bg-deck-950 p-4">
          <Room className="col-span-3 row-span-2" label="Scout Bay" accent="red" agent="T" status="standby" />
          <Room className="col-span-6 row-span-2" label="Command HQ" accent="teal" agent="S" status={activeAgent === "skynet" ? "active" : "idle"} />
          <Room className="col-span-3 row-span-2" label="Secure Ops" accent="red" agent="A" status={discord.listenerOnline ? "active" : "away"} />
          <Room className="col-span-3 row-span-2" label="Applications" accent="purple" agent="T" status="standby" />
          <Room className="col-span-6 row-span-2" label="Study Floor" accent="amber" agent="C" status="standby" />
          <Room className="col-span-3 row-span-2" label="Docs Studio" accent="teal" agent="C" status="idle" />
          <div className="col-span-12 row-span-2 rounded border border-blue-300/15 bg-deck-900/70 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-signal-purple">Activity Rail</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              {activity.slice(0, 4).map((event) => <div key={event.id} className="rounded border border-blue-300/15 bg-deck-950/70 p-3 text-sm text-slate-300">{event.title}</div>)}
            </div>
          </div>
        </div>
      </Panel>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {crew.agents.map((agent) => (
          <Panel key={agent.id}>
            <div className="flex items-start gap-4">
              <div className="grid h-14 w-14 place-items-center rounded border border-blue-300/20 bg-deck-950 text-2xl">{agent.name[0]}</div>
              <div>
                <h2 className="font-bold text-white">{agent.name}</h2>
                <Badge tone={agent.status === "active" ? "teal" : "muted"}>{agent.status}</Badge>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">{agent.mission}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function Room({ className, label, accent, agent, status }: { className: string; label: string; accent: "red" | "teal" | "purple" | "amber"; agent: string; status: string }) {
  const border = { red: "border-signal-red/40", teal: "border-signal-teal/40", purple: "border-signal-purple/40", amber: "border-signal-amber/40" }[accent];
  const text = { red: "text-signal-red", teal: "text-signal-teal", purple: "text-signal-purple", amber: "text-signal-amber" }[accent];
  return (
    <div className={`${className} ${border} relative rounded border bg-deck-850/60 p-3`}>
      <p className={`font-mono text-[10px] uppercase tracking-[0.22em] ${text}`}>{label}</p>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2">
        <div className="mb-2 rounded border border-blue-300/20 bg-deck-950 px-2 py-1 text-center font-mono text-[10px] uppercase text-slate-300">{status}</div>
        <div className={`pixelated grid h-16 w-12 place-items-center rounded-sm border ${border} bg-deck-950 text-3xl font-black ${text}`}>{agent}</div>
      </div>
    </div>
  );
}
