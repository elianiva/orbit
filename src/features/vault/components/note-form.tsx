import { type FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { VaultRpc } from "~/features/vault/lib/vault-rpc";

const LANGUAGES = [
  { value: "auto", label: "Auto Detect" },
  { value: "plaintext", label: "Plain Text" },
  { value: "markdown", label: "Markdown" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "javascript", label: "JavaScript" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "json", label: "JSON" },
  { value: "bash", label: "Bash" },
] as const;

const TTL_OPTIONS = [
  { value: 604800, label: "7 days" },
  { value: 2592000, label: "30 days" },
  { value: 0, label: "Never" },
] as const;

export function NoteForm() {
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("auto");
  const [ttl, setTtl] = useState(604800);
  const [error, setError] = useState("");

  const charCount = content.length;
  const lineCount = content ? content.split("\n").length : 0;

  const createMutation = useMutation({
    mutationKey: [...VaultRpc.vault(), "create"],
    mutationFn: VaultRpc.createNote,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: VaultRpc.vault() });
      if (data.id) {
        window.location.href = `/notes/${data.id}`;
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = content.trim();
    if (!text) {
      setError("Please enter some content");
      return;
    }

    setError("");
    createMutation.mutate({ content: text, language, ttl });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex gap-3">
        <div>
          <label htmlFor="note-language" className="sr-only">
            Language
          </label>
          <select
            id="note-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.value} value={lang.value}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="note-ttl" className="sr-only">
            Expires in
          </label>
          <select
            id="note-ttl"
            value={ttl}
            onChange={(e) => setTtl(Number(e.target.value))}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {TTL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="min-h-[60vh] w-full resize-none rounded-md border border-border bg-background p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder="Write your note here..."
        disabled={createMutation.isPending}
        spellCheck={false}
      />

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={createMutation.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating..." : "Create Note"}
        </button>

        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {charCount} chars · {lineCount} lines
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
    </form>
  );
}
