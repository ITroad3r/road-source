import { useState, type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { Trash2, GripVertical, User } from "lucide-react";
import { useTranslation } from "react-i18next";

export const KANBAN_STAGES = [
  "identified",
  "contacted",
  "screened",
  "submitted",
  "client_interview",
  "offer",
  "placed",
  "rejected",
  "withdrawn",
] as const;
export type KanbanStage = (typeof KANBAN_STAGES)[number];

const STAGE_LABEL: Record<KanbanStage, string> = {
  identified: "Identified",
  contacted: "Contacted",
  screened: "Screened",
  submitted: "Submitted",
  client_interview: "Client interview",
  offer: "Offer",
  placed: "Placed",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STAGE_BORDER: Record<KanbanStage, string> = {
  identified: "border-t-slate-400",
  contacted: "border-t-blue-500",
  screened: "border-t-cyan-500",
  submitted: "border-t-purple-500",
  client_interview: "border-t-indigo-500",
  offer: "border-t-teal-500",
  placed: "border-t-green-500",
  rejected: "border-t-red-500",
  withdrawn: "border-t-muted-foreground",
};

export type KanbanCandidate = {
  id: string;
  stage: KanbanStage;
  cv: {
    id: string;
    full_name: string;
    headline: string | null;
    seniority?: string | null;
    daily_rate?: number | null;
    skills?: string[] | null;
  } | null;
};

export function PipelineKanban({
  candidates,
  onStageChange,
  onRemove,
  renderExtra,
}: {
  renderExtra?: (id: string) => ReactNode;
  candidates: KanbanCandidate[];
  onStageChange: (id: string, stage: KanbanStage) => void;
  onRemove: (id: string) => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { t } = useTranslation();
  const [overStage, setOverStage] = useState<KanbanStage | null>(null);

  const byStage: Record<KanbanStage, KanbanCandidate[]> = {
    identified: [], contacted: [], screened: [], submitted: [],
    client_interview: [], offer: [], placed: [], rejected: [], withdrawn: [],
  };
  for (const c of candidates) if (c.cv) byStage[c.stage]?.push(c);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {KANBAN_STAGES.map((stage) => {
          const items = byStage[stage];
          const isOver = overStage === stage;
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={() => {
                if (draggingId) onStageChange(draggingId, stage);
                setDraggingId(null);
                setOverStage(null);
              }}
              className={`w-64 shrink-0 rounded-md bg-muted/40 border-t-4 ${STAGE_BORDER[stage]} ${isOver ? "ring-2 ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-xs font-semibold uppercase tracking-wide">{t(`dash.stage.${stage}`, STAGE_LABEL[stage])}</span>
                <Badge variant="secondary" className="h-5 text-[10px]">{items.length}</Badge>
              </div>
              <div className="p-2 space-y-2 min-h-[80px]">
                {items.map((dc) => (
                  <Card
                    key={dc.id}
                    draggable
                    onDragStart={() => setDraggingId(dc.id)}
                    onDragEnd={() => { setDraggingId(null); setOverStage(null); }}
                    className={`cursor-grab active:cursor-grabbing transition-opacity ${draggingId === dc.id ? "opacity-50" : ""}`}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <Link
                            to="/talent-hub/$cvId"
                            params={{ cvId: dc.cv?.id ?? "" }}
                            className="block font-medium text-sm hover:text-primary truncate"
                          >
                            {dc.cv?.full_name}
                          </Link>
                          <div className="text-xs text-muted-foreground truncate">{dc.cv?.headline ?? "—"}</div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-1" onClick={() => onRemove(dc.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                        {dc.cv?.seniority && <span className="capitalize">{dc.cv.seniority}</span>}
                        {dc.cv?.daily_rate != null && <span>· €{dc.cv.daily_rate}/d</span>}
                      </div>
                      {dc.cv?.skills && dc.cv.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {dc.cv.skills.slice(0, 4).map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px] font-normal h-4 px-1">{s}</Badge>
                          ))}
                          {dc.cv.skills.length > 4 && (
                            <Badge variant="outline" className="text-[10px] font-normal h-4 px-1">+{dc.cv.skills.length - 4}</Badge>
                          )}
                        </div>
                      )}
                      {renderExtra?.(dc.id)}
                    </CardContent>
                  </Card>
                ))}
                {items.length === 0 && (
                  <div className="flex items-center justify-center h-16 text-xs text-muted-foreground/60">
                    <User className="h-3 w-3 mr-1" /> Empty
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
