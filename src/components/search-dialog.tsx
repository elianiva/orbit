import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileTextIcon } from "lucide-react";

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";

interface SearchResult {
  id: string;
  path: string;
  title: string;
  snippet: string;
  rank: number;
}

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([]);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch {
      if (!controller.signal.aborted) setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => search(query), 200);
    return () => clearTimeout(timer);
  }, [query, search]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  const handleSelect = useCallback(
    (path: string) => {
      onOpenChange(false);
      void navigate({ to: `/${path}` });
    },
    [navigate, onOpenChange],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search notes"
      description="Search your vault"
    >
      <Command shouldFilter={false}>
        <CommandInput placeholder="search notes..." value={query} onValueChange={setQuery} />
        <CommandList>
          {query.trim().length > 0 && !loading && results.length === 0 && (
            <CommandEmpty>no results</CommandEmpty>
          )}
          {results.map((result) => (
            <CommandItem
              key={result.id}
              value={result.path}
              onSelect={() => handleSelect(result.path)}
            >
              <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex flex-col gap-0.5 overflow-hidden">
                <span className="truncate text-xs font-medium">
                  {result.title || result.path.replace(/^notes\//, "")}
                </span>
                {result.snippet && (
                  <span
                    className="truncate text-[10px] text-muted-foreground"
                    dangerouslySetInnerHTML={{ __html: result.snippet }}
                  />
                )}
              </div>
            </CommandItem>
          ))}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
