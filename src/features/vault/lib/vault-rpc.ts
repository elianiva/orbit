import { queryOptions } from "@tanstack/react-query";

export interface NoteItem {
  id: string;
  path: string;
  contentPreview: string;
  size: number;
  createdAt: string;
}

export interface NoteDetail {
  id: string;
  path: string;
  content: string;
  frontmatter: unknown;
  size: number;
  createdAt: string;
}

interface CreateNoteInput {
  content: string;
  language?: string;
  ttl?: number;
}

interface MoveNoteInput {
  fromPath: string;
  toPath: string;
}

export const VaultRpc = {
  vault: () => ["vault"] as const,

  listNotes: () =>
    queryOptions({
      queryKey: [...VaultRpc.vault(), "list"],
      queryFn: async (): Promise<NoteItem[]> => {
        const res = await fetch("/api/notes");
        if (!res.ok) throw new Error("Failed to fetch notes");
        return res.json();
      },
    }),

  getNote: (path: string) =>
    queryOptions({
      queryKey: [...VaultRpc.vault(), "byPath", path],
      queryFn: async (): Promise<NoteDetail> => {
        const res = await fetch(`/api/notes/${path}`);
        if (!res.ok) throw new Error("Failed to fetch note");
        return res.json();
      },
    }),

  createNote: (input: CreateNoteInput) =>
    fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }).then(async (res) => {
      const data = (await res.json()) as { id?: string; path?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to create note");
      return data;
    }),

  deleteNote: (path: string) =>
    fetch(`/api/notes/${path}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) throw new Error("Failed to delete note");
    }),

  moveNote: ({ fromPath, toPath }: MoveNoteInput) =>
    fetch(`/api/notes/${fromPath}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moveTo: toPath }),
    }).then(async (res) => {
      const data = (await res.json()) as { id?: string; path?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to move note");
      return data;
    }),
};

export type { CreateNoteInput, MoveNoteInput };
