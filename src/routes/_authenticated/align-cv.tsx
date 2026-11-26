import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useMyRoles } from "@/hooks/useMyRoles";
import { can } from "@/lib/permissions";
import { AlignCvWorkspace } from "@/components/AlignCvWorkspace";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_authenticated/align-cv")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Align CV — ITROAD GROUP | RoadSource" },
    { name: "description", content: "Align candidate CVs with client requirements and prepare reviewed ITROAD GROUP PDF profiles." },
    { property: "og:title", content: "Align CV — ITROAD GROUP | RoadSource" },
    { property: "og:description", content: "AI-assisted, factual candidate CV alignment with ITROAD GROUP branding." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AlignCvAccess,
});
function AlignCvAccess() {
  const { user } = Route.useRouteContext();
  const { data: roles, isPending, isError } = useMyRoles(user.id);
  const { t } = useTranslation();
  if (isPending) return <div className="p-4 text-muted-foreground">{t("common.loading")}</div>;
  if (isError || !can(roles, "cv.align")) return <Navigate to="/dashboard" replace />;
  return <AlignCvWorkspace />;
}