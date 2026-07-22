import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileTextIcon, PlusIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { VaultRpc } from "~/features/vault/lib/vault-rpc";

export const Route = createFileRoute("/_vault/")({
  component: IndexPage,
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-none border border-border p-4">
      <p className="text-xl font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function IndexPage() {
  const navigate = useNavigate();
  const { data: notes = [], isLoading } = useQuery(VaultRpc.listNotes());

  const totalSize = notes.reduce((acc, n) => acc + n.size, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">orbit</h1>
        <p className="mt-1 text-muted-foreground">your personal knowledge base</p>
      </header>

      {!isLoading && (
        <div className="mb-8 grid grid-cols-3 gap-4">
          <StatCard value={String(notes.length)} label="notes" />
          <StatCard
            value={notes.length > 0 ? formatSize(totalSize) : "\u2014"}
            label="total size"
          />
          <div className="flex items-center justify-center rounded-none border border-border p-4">
            <Link to="/new">
              <Button variant="outline" className="gap-2">
                <PlusIcon className="size-4" />
                new note
              </Button>
            </Link>
          </div>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wider uppercase text-muted-foreground">
          recent notes
        </h2>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[72px] w-full" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-none border border-dashed border-border py-16">
            <FileTextIcon className="mb-3 size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">no notes yet</p>
            <Link to="/new" className="mt-4">
              <Button className="gap-2">
                <PlusIcon className="size-4" />
                create your first note
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-1">
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => navigate({ to: `/${note.path}` })}
                className="group block w-full rounded-none border border-border p-3 text-left transition-colors hover:bg-muted"
              >
                <p className="text-sm font-medium group-hover:text-primary">{note.path}</p>
                {note.contentPreview && (
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                    {note.contentPreview}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{formatSize(note.size)}</span>
                  <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
