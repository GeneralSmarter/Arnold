import { cn } from "@/lib/utils";

export function Panel({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("rounded-lg border border-blue-300/15 bg-deck-850/82 p-5 shadow-glow", className)}>{children}</section>;
}

export function SectionTitle({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow ? <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.28em] text-signal-teal">{eyebrow}</p> : null}
        <h1 className="text-3xl font-semibold tracking-normal text-slate-50">{title}</h1>
      </div>
      {action}
    </div>
  );
}
