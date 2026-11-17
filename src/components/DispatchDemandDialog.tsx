import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Send } from "lucide-react";

type SourcerOption = { id: string; full_name: string | null; email: string };

export function DispatchDemandDialog({
  demandId,
  demandTitle,
  currentAssignee,
  trigger,
}: {
  demandId: string;
  demandTitle: string;
  currentAssignee?: string | null;
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [assignee, setAssignee] = useState<string>(currentAssignee ?? "");

  const { data: sourcers, isLoading } = useQuery({
    queryKey: ["dispatch-sourcers"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_team_members");
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });

  const dispatch = useMutation({
    mutationFn: async () => {
      if (!assignee) throw new Error("Pick a sourcer first");
      const { error } = await supabase
        .from("demands")
        .update({ assigned_to: assignee, lifecycle: "in_progress" })
        .eq("id", demandId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dash", "demands"] });
      qc.invalidateQueries({ queryKey: ["demand", demandId] });
      qc.invalidateQueries({ queryKey: ["demands"] });
      toast.success("Demand dispatched");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="default">
            <Send className="h-3.5 w-3.5 mr-1" /> Dispatch
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispatch — {demandTitle}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Assign to sourcer</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Loading…" : "Select a teammate"} />
              </SelectTrigger>
              <SelectContent>
                {(sourcers ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.full_name ?? s.id.slice(0,8)}
                  </SelectItem>
                ))}
                {!isLoading && (sourcers ?? []).length === 0 && (
                  <div className="px-3 py-2 text-sm text-muted-foreground">No teammates with sourcing access yet.</div>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              The assignee will be notified and the demand moves to <span className="font-medium">In progress</span>.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => dispatch.mutate()} disabled={!assignee || dispatch.isPending}>
              {dispatch.isPending ? "Dispatching…" : "Dispatch"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
