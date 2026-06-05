import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/root")({
  component: () => <Navigate to="/" replace />,
});