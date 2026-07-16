import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

import { VaultLayout } from "~/components/vault-layout";

export const Route = createFileRoute("/_vault")({
  component: VaultLayoutRoute,
  notFoundComponent: VaultNotFound,
});

function VaultLayoutRoute() {
  return (
    <VaultLayout>
      <Outlet />
    </VaultLayout>
  );
}

function VaultNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <h1 className="text-6xl font-bold tracking-tight text-muted-foreground">404</h1>
      <p className="mt-3 text-sm text-muted-foreground">page not found</p>
      <Link
        to="/"
        className="mt-8 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        back to vault
      </Link>
    </div>
  );
}
