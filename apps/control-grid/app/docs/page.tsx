import { FileText, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Panel, SectionTitle } from "@/components/ui/panel";
import { getDocs } from "@/lib/server/docs";

export default async function DocsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const params = await searchParams;
  const query = params.q ?? "";
  const docs = await getDocs(query);

  return (
    <div>
      <SectionTitle eyebrow="Index" title="Docs" />
      <Panel className="mb-6">
        <form className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input name="q" defaultValue={query} placeholder="Search real docs and Arnold session outputs" className="w-full rounded border border-blue-300/20 bg-deck-950 py-2 pl-10 pr-3 text-sm outline-none focus:border-signal-purple" />
          </div>
          <button className="rounded bg-signal-purple px-4 py-2 text-sm font-bold text-white">Search</button>
        </form>
      </Panel>
      <div className="grid gap-4">
        {docs.map((doc) => (
          <Panel key={doc.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex gap-4">
                <div className="grid h-11 w-11 place-items-center rounded border border-blue-300/20 bg-deck-950"><FileText className="h-5 w-5 text-signal-teal" /></div>
                <div>
                  <h2 className="text-lg font-bold text-white">{doc.title}</h2>
                  <p className="mt-1 font-mono text-xs text-slate-500">{doc.path}</p>
                </div>
              </div>
              <Badge tone={doc.kind === "markdown" ? "teal" : "purple"}>{doc.kind}</Badge>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">{doc.excerpt}</p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">{doc.words} words · {new Date(doc.updatedAt).toLocaleString()}</p>
          </Panel>
        ))}
        {docs.length === 0 ? <Panel><p className="text-slate-400">No real docs matched that search.</p></Panel> : null}
      </div>
    </div>
  );
}
