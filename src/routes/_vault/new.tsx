import { createFileRoute } from "@tanstack/react-router";
import { NoteForm } from "~/features/vault/components/note-form";

export const Route = createFileRoute("/_vault/new")({
  component: NewNotePage,
});

function NewNotePage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">new note</h1>
        <p className="mt-1 text-muted-foreground">create a note — temporary or permanent</p>
      </header>
      <NoteForm />
    </div>
  );
}
