import { useCallback, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileTree, useFileTree } from "@pierre/trees/react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import { FileTextIcon } from "lucide-react";

interface NoteItem {
  id: string;
  path: string;
  contentPreview: string;
  size: number;
  createdAt: string;
}

interface VaultLayoutProps {
  children: React.ReactNode;
}

export function VaultLayout({ children }: VaultLayoutProps) {
  const navigate = useNavigate();
  const { data: notes = [] } = useQuery<NoteItem[]>({
    queryKey: ["notes"],
    queryFn: async () => {
      const res = await fetch("/api/notes");
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
  });

  const paths = useMemo(() => notes.map((n) => n.path), [notes]);

  const handleSelectionChange = useCallback(
    (selected: readonly string[]) => {
      const path = selected[0];
      if (path && !path.endsWith("/")) {
        navigate({ to: `/${path}` });
      }
    },
    [navigate],
  );

  const { model } = useFileTree({
    paths,
    onSelectionChange: handleSelectionChange,
  });
  useEffect(() => {
    if (paths.length > 0) {
      model.resetPaths(paths);
    }
  }, [paths, model]);

  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border">
          <Link to="/" className="flex items-center gap-2 px-2 py-1.5 text-sm font-semibold">
            <FileTextIcon className="size-4" />
            <span>orbit</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="tree-panel">
                <FileTree
                  model={model}
                  style={
                    {
                      height: "100%",
                      "--trees-padding-inline-override": "0px",
                    } as React.CSSProperties
                  }
                />
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b border-border px-4">
          <SidebarTrigger />
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
