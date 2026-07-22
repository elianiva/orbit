import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { VaultRpc, type NoteItem } from "~/features/vault/lib/vault-rpc";

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
      className="min-w-40 rounded-none border border-border bg-popover p-1 shadow-md outline-none"
      style={{
        position: "fixed",
        top: context.anchorRect.bottom + 4,
        left: context.anchorRect.left,
        zIndex: 9999,
      }}
    >
      <button
        role="menuitem"
        className="flex w-full cursor-default items-center gap-2 rounded-none px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
        onClick={() => handleAction("rename")}
      >
        <PencilIcon className="size-3.5" />
        Rename
      </button>
      <button
        role="menuitem"
        className="flex w-full cursor-default items-center gap-2 rounded-none px-2 py-1.5 text-xs outline-none hover:bg-accent hover:text-accent-foreground"
        onClick={() => handleAction("copy-path")}
      >
        <CopyIcon className="size-3.5" />
        Copy path
      </button>
      <div className="-mx-1 my-1 h-px bg-border" />
      <button
        role="menuitem"
        className="flex w-full cursor-default items-center gap-2 rounded-none px-2 py-1.5 text-xs outline-none hover:bg-destructive/10 hover:text-destructive"
        onClick={() => handleAction("delete")}
      >
        <Trash2Icon className="size-3.5" />
        Delete
      </button>
    </div>
  );
}

function useVaultMutations() {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationKey: [...VaultRpc.vault(), "delete"],
    mutationFn: VaultRpc.deleteNote,
    onMutate: async (path) => {
      await queryClient.cancelQueries({ queryKey: VaultRpc.listNotes().queryKey });
      const previous = queryClient.getQueryData<NoteItem[]>(VaultRpc.listNotes().queryKey);
      queryClient.setQueryData<NoteItem[]>(
        VaultRpc.listNotes().queryKey,
        (old) => old?.filter((n) => n.path !== path) ?? [],
      );
      return { previous };
    },
    onError: (_err, _path, context) => {
      if (context?.previous) {
        queryClient.setQueryData(VaultRpc.listNotes().queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: VaultRpc.vault() });
    },
  });

  const moveMutation = useMutation({
    mutationKey: [...VaultRpc.vault(), "move"],
    mutationFn: VaultRpc.moveNote,
    onMutate: async ({ fromPath, toPath }) => {
      await queryClient.cancelQueries({ queryKey: VaultRpc.listNotes().queryKey });
      const previous = queryClient.getQueryData<NoteItem[]>(VaultRpc.listNotes().queryKey);
      queryClient.setQueryData<NoteItem[]>(
        VaultRpc.listNotes().queryKey,
        (old) => old?.map((n) => (n.path === fromPath ? { ...n, path: toPath } : n)) ?? [],
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(VaultRpc.listNotes().queryKey, context.previous);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: VaultRpc.vault() });
    },
  });

  return { deleteMutation, moveMutation };
}

export function VaultLayout({ children }: VaultLayoutProps) {
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { deleteMutation, moveMutation } = useVaultMutations();

  const { data: notes = [] } = useQuery(VaultRpc.listNotes());

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

  const { model } = useFileTree({
    paths,
    onSelectionChange: handleSelectionChange,
    dragAndDrop: {
      canDrop: (event) => event.target.kind === "directory" || event.target.kind === "root",
      onDropComplete: (event) => {
        for (const fromPath of event.draggedPaths) {
          const toPath = computeNewPath(fromPath, event.target.directoryPath);
          moveMutation.mutate({ fromPath, toPath });
        }
      },
    },
    renaming: {
      canRename: () => true,
      onRename: (event) => {
        moveMutation.mutate({
          fromPath: event.sourcePath,
          toPath: event.destinationPath,
        });
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

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteConfirm) return;
    deleteMutation.mutate(deleteConfirm, {
      onSuccess: () => model.remove(deleteConfirm),
    });
    setDeleteConfirm(null);
  }, [deleteConfirm, model, deleteMutation]);

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
      <ContextMenuContent item={item} context={context} onAction={handleContextMenuAction} />
    ),
    [handleContextMenuAction],
  );

  return (
    <SidebarProvider>
      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      <Dialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirm(null);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogTitle>Delete note</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete "{deleteConfirm}"? This cannot be undone.
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
