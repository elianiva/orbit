import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

interface NoteData {
  id: string;
  path: string;
  content: string;
  frontmatter: Record<string, unknown>;
  size: number;
  createdAt: string;
}

export const Route = createFileRoute("/_vault/notes/$id")({
  component: NoteViewPage,
});

function NoteViewPage() {
  const { id } = Route.useParams();
  const {
    data: note,
    isLoading,
    error,
  } = useQuery<NoteData>({
    queryKey: ["note", id],
    queryFn: async () => {
      const res = await fetch(`/api/notes/${id}`);
      if (!res.ok) throw new Error("Note not found");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">loading...</p>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <h1 className="text-6xl font-bold tracking-tight text-muted-foreground">404</h1>
        <p className="mt-3 text-muted-foreground">note not found</p>
        <Link
          to="/"
          className="mt-8 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          back to vault
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{note.id}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {note.size} bytes · {new Date(note.createdAt).toLocaleDateString()}
        </p>
      </header>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted p-4 font-mono text-sm">
        {note.content}
      </pre>
    </div>
  );
}
