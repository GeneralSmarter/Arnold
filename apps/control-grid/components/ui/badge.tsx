import { cn } from "@/lib/utils";

export function Badge({ className, tone = "purple", children }: { className?: string; tone?: "purple" | "teal" | "red" | "amber" | "muted"; children: React.ReactNode }) {
  const tones = {
    purple: "border-signal-purple/40 bg-signal-purple/10 text-signal-purple",
    teal: "border-signal-teal/40 bg-signal-teal/10 text-signal-teal",
    red: "border-signal-red/40 bg-signal-red/10 text-signal-red",
    amber: "border-signal-amber/40 bg-signal-amber/10 text-signal-amber",
    muted: "border-slate-600/60 bg-slate-800/40 text-slate-300"
  };
  return <span className={cn("inline-flex items-center rounded border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]", tones[tone], className)}>{children}</span>;
}
