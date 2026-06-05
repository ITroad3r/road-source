import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/talent-hub")({
  component: () => <Outlet />,
});
