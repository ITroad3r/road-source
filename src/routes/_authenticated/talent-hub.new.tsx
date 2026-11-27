import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useTx } from "@/hooks/use-tx";
import { CandidateCreateForm } from "@/components/CandidateCreateForm";
import { useMyRoles } from "@/hooks/useMyRoles";
import { can } from "@/lib/permissions";

export const Route = createFileRoute("/_authenticated/talent-hub/new")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Add candidate — RoadSource" },
    { name: "description", content: "Create a candidate profile and upload a CV to the RoadSource Talent Hub." },
    { property: "og:title", content: "Add candidate — RoadSource" },
    { property: "og:description", content: "Create a candidate profile and upload a CV to the RoadSource Talent Hub." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: NewCandidate,
});
function NewCandidate() {
  const { tx } = useTx();
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const { data: roles, isPending } = useMyRoles(user.id);
  if (isPending) return <div className="p-4 text-muted-foreground">{tx("Loading…", "Chargement…")}</div>;
  if (!can(roles, "candidates.edit")) return <div className="p-4 text-muted-foreground">{tx("Candidate editing access required.", "Accès à la modification des candidats requis.")}</div>;
  const back = () => { void navigate({ to: "/talent-hub" }); };
  return <div className="p-4 md:p-8"><CandidateCreateForm userId={user.id} onSaved={back} onCancel={back} /></div>;
}
