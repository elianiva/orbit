import { createFileRoute, Outlet } from "@tanstack/react-router";
import { VaultLayout } from "~/components/vault-layout";

export const Route = createFileRoute("/_vault")({
  component: VaultLayoutRoute,
});

function VaultLayoutRoute() {
  return (
    <VaultLayout>
      <Outlet />
    </VaultLayout>
  );
}
