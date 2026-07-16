import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { FileTree, useFileTree } from "@pierre/trees/react";
import type {
  ContextMenuItem as FileTreeContextMenuItem,
  ContextMenuOpenContext as FileTreeContextMenuOpenContext,
} from "@pierre/trees";
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
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { FileTextIcon, Trash2Icon, CopyIcon, PencilIcon } from "lucide-react";
import { SearchDialog } from "~/components/search-dialog";

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

function computeNewPath(fromPath: string, targetDir: string | null): string {
  const basename = fromPath.split("/").pop() ?? fromPath;
  return targetDir ? `${targetDir}/${basename}` : basename;
}

function ContextMenuContent({
  item,
  context,
  onAction,
}: {
  item: FileTreeContextMenuItem;
  context: FileTreeContextMenuOpenContext;
  onAction: (action: string, item: FileTreeContextMenuItem) => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        context.close();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [context]);

  function handleAction(action: string) {
    context.close();
    onAction(action, item);
  }

  return (
    <div
      role="menu"
      className="min-w-40 rounded-md border border-border bg-popover p-1 shadow-md outline-none"
      style={{
        position: "fixed",
        top: context.anchorRect.bottom + 4,
        left: context.anchorRect.left,
        zIndex: 9999,
      }}
    >
      <button
        role="menuitem"
        className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
        onClick={() => handleAction("rename")}
      >
        <PencilIcon className="size-3.5" />
        Rename
      </button>
      <button
        role="menuitem"
        className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
        onClick={() => handleAction("copy-path")}
      >
        <CopyIcon className="size-3.5" />
        Copy path
      </button>
      <div className="-mx-1 my-1 h-px bg-border" />
      <button
        role="menuitem"
        className="flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-destructive/10 hover:text-destructive"
        onClick={() => handleAction("delete")}
      >
        <Trash2Icon className="size-3.5" />
        Delete
      </button>
    </div>
  );
}

export function VaultLayout({ children }: VaultLayoutProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchOpen, setSearchOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

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
        void navigate({ to: `/${path}` });
      }
    },
    [navigate],
  );

  const persistMove = useCallback(
    async (fromPath: string, toPath: string) => {
      const res = await fetch(`/api/notes/${fromPath}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moveTo: toPath }),
      });
      if (!res.ok) throw new Error("Failed to move note");
    },
    [],
  );

  const { model } = useFileTree({
    paths,
    onSelectionChange: handleSelectionChange,
    dragAndDrop: {
      canDrop: (event) =>
        event.target.kind === "directory" || event.target.kind === "root",
      onDropComplete: async (event) => {
        try {
          for (const fromPath of event.draggedPaths) {
            const toPath = computeNewPath(fromPath, event.target.directoryPath);
            await persistMove(fromPath, toPath);
          }
          await queryClient.invalidateQueries({ queryKey: ["notes"] });
        } catch {
          await queryClient.invalidateQueries({ queryKey: ["notes"] });
        }
      },
    },
    renaming: {
      canRename: () => true,
      onRename: async (event) => {
        await persistMove(event.sourcePath, event.destinationPath);
        await queryClient.invalidateQueries({ queryKey: ["notes"] });
      },
      onError: (error) => {
        console.error("Rename failed:", error);
      },
    },
    composition: {
      contextMenu: {
        enabled: true,
        triggerMode: "both",
        buttonVisibility: "when-needed",
      },
    },
    flattenEmptyDirectories: true,
  });

  useEffect(() => {
    if (paths.length > 0) {
      model.resetPaths(paths);
    }
  }, [paths, model]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm) return;
    try {
      const res = await fetch(`/api/notes/${deleteConfirm}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete note");
      model.remove(deleteConfirm);
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setDeleteConfirm(null);
  }, [deleteConfirm, model, queryClient]);

  const handleContextMenuAction = useCallback(
    (action: string, item: FileTreeContextMenuItem) => {
      switch (action) {
        case "rename":
          model.startRenaming(item.path);
          break;
        case "copy-path":
          void navigator.clipboard.writeText(item.path);
          break;
        case "delete":
          setDeleteConfirm(item.path);
          break;
      }
    },
    [model],
  );

  const renderContextMenu = useCallback(
    (item: FileTreeContextMenuItem, context: FileTreeContextMenuOpenContext) => (
      <ContextMenuContent
        item={item}
        context={context}
        onAction={handleContextMenuAction}
      />
    ),
    [handleContextMenuAction],
  );

  return (
    <SidebarProvider>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>Delete note</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{deleteConfirm}"? This cannot be
            undone.
          </DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button variant="destructive" onClick={handleDeleteConfirm}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
                  renderContextMenu={renderContextMenu}
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
