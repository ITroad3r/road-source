import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTx } from "@/hooks/use-tx";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Activity, MessageSquare, ArrowRight, UserPlus, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Entry = {
  id: string;
  kind: string;
  body: string;
  metadata: any;
  author_id: string | null;
  created_at: string;
  demand_id: string | null;
  cv_id: string | null;
  demand_candidate_id: string | null;
  profiles?: { full_name: string | null; email: string } | null;
};

type Scope = { demandId?: string; cvId?: string };

export function ActivityLog({ scope, currentUserId }: { scope: Scope; currentUserId: string }) {
  const { tx } = useTx();
  const qc = useQueryClient();
  const [body, setBody] = useState("");

  const queryKey = ["activity-log", scope.demandId ?? null, scope.cvId ?? null];

  const { data: entries, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("activity_log")
        .select("*, profiles:author_id(full_name, email)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (scope.demandId) q = q.eq("demand_id", scope.demandId);
      if (scope.cvId) q = q.eq("cv_id", scope.cvId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as Entry[];
    },
  });

  const addNote = useMutation({
    mutationFn: async () => {
      const payload = {
        author_id: currentUserId,
        kind: "note",
        body: body.trim(),
        demand_id: scope.demandId ?? null,
        cv_id: scope.cvId ?? null,
      };
      const { error } = await supabase.from("activity_log").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      setBody("");
      qc.invalidateQueries({ queryKey });
      toast.success(tx("Note added", "Note ajoutée"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("activity_log").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4" /> {tx("Activity & notes", "Activité et notes")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Textarea
            placeholder={tx("Add a note… (visible to all teammates)", "Ajouter une note… (visible par toute l'équipe)")}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => addNote.mutate()}
              disabled={!body.trim() || addNote.isPending}
            >
              {addNote.isPending ? tx("Adding…", "Ajout…") : tx("Add note", "Ajouter une note")}
            </Button>
          </div>
        </div>

        <div className="relative pl-5 border-l space-y-4">
          {isLoading && <p className="text-sm text-muted-foreground">{tx("Loading…", "Chargement…")}</p>}
          {!isLoading && (entries?.length ?? 0) === 0 && (
            <p className="text-sm text-muted-foreground">{tx("No activity yet.", "Aucune activité pour le moment.")}</p>
          )}
          {entries?.map((e) => (
            <TimelineItem
              key={e.id}
              entry={e}
              canDelete={e.author_id === currentUserId}
              onDelete={() => deleteEntry.mutate(e.id)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineItem({
  entry,
  canDelete,
  onDelete,
}: {
  entry: Entry;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const { tx } = useTx();
  const author = entry.profiles?.full_name || entry.profiles?.email || tx("System", "Système");
  const Icon = entry.kind === "note" ? MessageSquare : entry.kind === "pipeline_added" ? UserPlus : ArrowRight;

  return (
    <div className="relative">
      <div className="absolute -left-[1.625rem] top-1 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon className="h-3 w-3" />
            <span className="font-medium text-foreground">{author}</span>
            <Badge variant="secondary" className="text-[10px] py-0 h-4 capitalize">
              {entry.kind.replace("_", " ")}
            </Badge>
            <span>· {formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })}</span>
          </div>
          <p className="text-sm mt-1 whitespace-pre-wrap">{entry.body}</p>
        </div>
        {canDelete && (
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
