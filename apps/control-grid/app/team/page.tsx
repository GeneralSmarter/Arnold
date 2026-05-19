import { addAllowedChannelAction, createDiscordChannelAction, renameDiscordChannelAction, setRespondToAllAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { getCrew } from "@/lib/server/crew";
import { getDiscordStatus } from "@/lib/server/discord";
import { getGitLog, getGitRemote } from "@/lib/server/git";

export default async function TeamPage() {
  const [crew, discord, commits, remote] = await Promise.all([getCrew(), getDiscordStatus(), getGitLog(6), getGitRemote()]);
  const discordConfig = discord.config;

  return (
    <div>
      <SectionTitle eyebrow="Crew" title="Team Structure" />
      <Panel className="mb-6 border-signal-purple/25 bg-gradient-to-br from-signal-purple/10 to-deck-850">
        <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-signal-purple">Mission</p>
        <p className="mt-4 max-w-5xl text-2xl font-medium italic leading-10 text-slate-100">"{crew.mission}"</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        {crew.agents.map((agent) => (
          <Panel key={agent.id} className="relative overflow-hidden">
            <div className={`absolute right-4 top-4 h-3 w-3 rounded-full ${agent.status === "active" ? "bg-signal-teal" : "bg-slate-600"}`} />
            <div className="mb-4 text-5xl pixelated">{agent.id === "skynet" ? "S" : agent.id === "t800-scout" ? "T" : "C"}</div>
            <h2 className="text-xl font-bold text-white">{agent.name}</h2>
            <Badge tone={agent.accent} className="mt-2">{agent.role}</Badge>
            <p className="mt-4 text-sm leading-6 text-slate-400">{agent.mission}</p>
          </Panel>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_28rem]" id="discord">
        <Panel>
          <SectionTitle eyebrow="Discord" title="Integration Controls" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-md border border-blue-300/15 bg-deck-900/60 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">Listener</p>
              <p className="mt-2 text-2xl font-semibold">{discord.listenerOnline ? "Online" : "Offline"}</p>
              <p className="mt-2 text-sm text-slate-500">PID {discord.listenerPid ?? "none"}</p>
              <p className="mt-1 text-sm text-slate-500">Token {discord.tokenConfigured ? "configured" : "missing"}</p>
            </div>
            <div className="rounded-md border border-blue-300/15 bg-deck-900/60 p-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-slate-400">Allowed</p>
              <p className="mt-2 text-sm text-slate-300">Guilds: {(discordConfig.allowedGuildIds ?? []).join(", ") || "none"}</p>
              <p className="mt-2 text-sm text-slate-300">Channels: {(discordConfig.allowedChannelIds ?? []).join(", ") || "none"}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <form action={setRespondToAllAction} className="rounded-md border border-blue-300/15 bg-deck-900/60 p-4">
              <label className="flex items-center justify-between gap-4 text-sm text-slate-200">
                Answer all allowed messages
                <input name="respondToAllMessages" type="checkbox" defaultChecked={Boolean(discordConfig.respondToAllMessages)} className="h-4 w-4" />
              </label>
              <button className="mt-4 rounded bg-signal-purple px-3 py-2 text-sm font-semibold text-white">Save behavior</button>
            </form>
            <form action={addAllowedChannelAction} className="rounded-md border border-blue-300/15 bg-deck-900/60 p-4">
              <input name="channelId" placeholder="Discord channel ID" className="w-full rounded border border-blue-300/20 bg-deck-950 px-3 py-2 text-sm outline-none" />
              <button className="mt-4 rounded bg-deck-700 px-3 py-2 text-sm font-semibold text-white">Allow channel</button>
            </form>
            <form action={createDiscordChannelAction} className="rounded-md border border-blue-300/15 bg-deck-900/60 p-4">
              <input name="name" placeholder="new-channel-name" className="w-full rounded border border-blue-300/20 bg-deck-950 px-3 py-2 text-sm outline-none" />
              <button className="mt-4 rounded bg-deck-700 px-3 py-2 text-sm font-semibold text-white">Create channel</button>
            </form>
            <form action={renameDiscordChannelAction} className="rounded-md border border-blue-300/15 bg-deck-900/60 p-4">
              <input name="channelId" placeholder="channel ID" className="mb-2 w-full rounded border border-blue-300/20 bg-deck-950 px-3 py-2 text-sm outline-none" />
              <input name="name" placeholder="new name" className="w-full rounded border border-blue-300/20 bg-deck-950 px-3 py-2 text-sm outline-none" />
              <button className="mt-4 rounded bg-deck-700 px-3 py-2 text-sm font-semibold text-white">Rename channel</button>
            </form>
          </div>
        </Panel>

        <Panel>
          <SectionTitle eyebrow="GitHub" title="Project Pulse" />
          <p className="mb-4 break-all font-mono text-xs text-slate-500">{remote || "No remote found"}</p>
          <div className="space-y-3">
            {commits.map((commit) => (
              <div key={commit.hash} className="rounded border border-blue-300/15 bg-deck-900/60 p-3">
                <p className="font-mono text-xs text-signal-teal">{commit.hash} <span className="text-slate-500">{commit.time}</span></p>
                <p className="mt-1 text-sm text-slate-200">{commit.subject}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
