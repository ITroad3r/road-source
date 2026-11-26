import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { MessageCircle, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { chatRoomsFor, chatMessageSchema, type ChatRoom } from "@/lib/candidate-chat";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Props = { dcId: string; name: string; userId: string; roles: readonly string[] | undefined; assigned: boolean };
export function CandidateChat(props: Props) {
  const rooms = chatRoomsFor(props.roles, props.assigned);
  if (!rooms.length) return null;
  return <ChatButton {...props} rooms={rooms} key={`${props.userId}:${rooms.join(",")}`} />;
}

function ChatButton({ dcId, name, userId, rooms }: Props & { rooms: ChatRoom[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ChatRoom>(rooms[0] ?? "sourcing");
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const qc = useQueryClient();
  const unreadKey = ["candidate-chat-unread", userId, dcId];
  const unreadQuery = useQuery({ queryKey: unreadKey, queryFn: async () => {
    const { data, error } = await supabase.rpc("candidate_chat_unread", { _dc: dcId });
    if (error) throw error;
    return data;
  } });
  const roomSignature = rooms.join(",");
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["candidate-chat", userId, dcId] });
        void qc.invalidateQueries({ queryKey: ["candidate-chat-unread", userId, dcId] });
      }, 150);
    };
    const channels = roomSignature.split(",").map(room => {
      let subscribed = false;
      const channel = supabase.channel(`candidate-chat:${dcId}:${room}`, { config: { private: true } })
        .on("broadcast", { event: "changed" }, refresh);
      void supabase.realtime.setAuth().then(() => {
        if (disposed) return;
        channel.subscribe(status => {
          if (status !== "SUBSCRIBED") return;
          const state = qc.getQueryState(["candidate-chat-unread", userId, dcId]);
          if (subscribed || (state && Date.now() - state.dataUpdatedAt > 10000 && state.fetchStatus !== "fetching")) refresh();
          subscribed = true;
        });
      }).catch(() => { if (!disposed) refresh(); });
      return channel;
    });
    return () => { disposed = true; if (timer) clearTimeout(timer); channels.forEach(channel => { void supabase.removeChannel(channel); }); };
  }, [dcId, userId, roomSignature, qc]);
  const count = (room: ChatRoom) => Number(unreadQuery.data?.find(item => item.room === room)?.unread ?? 0);
  const total = rooms.reduce((sum, room) => sum + count(room), 0);
  const label = fr ? "Messages" : "Messages";
  const roomLabel = (room: ChatRoom) => room === "sourcing" ? (fr ? "HRBP · Sourceur" : "HRBP · Sourcer") : "HRBP · Operations";
  return <Dialog open={open} onOpenChange={value => {
    setOpen(value);
    if (value) setSelected(rooms.find(room => count(room) > 0) ?? rooms[0] ?? "sourcing");
  }}>
    <Button type="button" variant={total ? "default" : "outline"} size="sm" className="h-7 gap-1 text-xs" title={total ? `${label} (${total})` : label} aria-label={`${label}: ${name}${total ? ` (${total})` : ""}`} data-unread={total} onClick={() => setOpen(true)}>
      <MessageCircle className="h-3.5 w-3.5" /><span>{total > 0 ? total : label}</span>
    </Button>
    <DialogContent className="w-[calc(100%-1rem)] max-w-xl max-h-[90dvh] flex flex-col overflow-hidden">
      <DialogHeader className="shrink-0 min-w-0"><DialogTitle className="break-words pr-6">{name}</DialogTitle><DialogDescription>{roomLabel(selected)}</DialogDescription></DialogHeader>
      {rooms.length > 1 && <Tabs value={selected} onValueChange={value => { if (value === "sourcing" || value === "operations") setSelected(value); }}>
        <TabsList className="w-full h-auto flex-wrap">{rooms.map(room => <TabsTrigger className="flex-1" key={room} value={room}>{roomLabel(room)}{count(room) > 0 && <span className="ml-2 text-primary">({count(room)})</span>}</TabsTrigger>)}</TabsList>
      </Tabs>}
      {unreadQuery.isError && <div role="alert" className="text-sm text-destructive">{fr ? "Impossible de charger les notifications." : "Could not load unread messages."}<Button variant="ghost" size="sm" onClick={() => { void unreadQuery.refetch(); }}>{fr ? "Réessayer" : "Retry"}</Button></div>}
      {open && <Conversation key={selected} dcId={dcId} room={selected} userId={userId} fr={fr} />}
    </DialogContent>
  </Dialog>;
}

function Conversation({ dcId, room, userId, fr }: { dcId: string; room: ChatRoom; userId: string; fr: boolean }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const readThrough = useRef<string | null>(null);
  const queryKey = ["candidate-chat", userId, dcId, room];
  const messages = useInfiniteQuery({ queryKey, initialPageParam: 0, queryFn: async ({ pageParam }) => {
    const { data, error } = await supabase.from("candidate_chat_messages").select("id,sender_id,sender_name,body,created_at")
      .eq("demand_candidate_id", dcId).eq("room", room).order("created_at", { ascending: false }).range(pageParam, pageParam + 49);
    if (error) throw error;
    return data;
  }, getNextPageParam: (last, pages) => last.length === 50 ? pages.length * 50 : undefined });
  const latest = messages.data?.pages[0]?.[0];
  useEffect(() => {
    if (!latest || readThrough.current === latest.created_at || messages.isFetching) return;
    const timestamp = latest.created_at;
    readThrough.current = timestamp;
    void supabase.rpc("mark_candidate_chat_read", { _dc: dcId, _room: room, _through: timestamp }).then(({ error }) => {
      if (error) { readThrough.current = null; toast.error(fr ? "La lecture n’a pas pu être enregistrée." : "Could not mark messages as read."); }
      else void qc.invalidateQueries({ queryKey: ["candidate-chat-unread", userId, dcId] });
    });
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [latest, dcId, room, userId, qc, fr, messages.isFetching]);
  const send = useMutation({ mutationFn: async (body: string) => {
    const { error } = await supabase.from("candidate_chat_messages").insert({ demand_candidate_id: dcId, room, sender_id: userId, body: chatMessageSchema.parse(body) });
    if (error) throw error;
  }, onSuccess: () => { setDraft(""); void qc.invalidateQueries({ queryKey }); }, onError: () => toast.error(fr ? "Message non envoyé. Réessayez." : "Message not sent. Please retry.") });
  const rows = [...(messages.data?.pages.flat() ?? [])].reverse();
  return <>
    <div className="min-h-0 flex-1 overflow-y-auto h-[min(45dvh,24rem)] space-y-3 py-2" role="log" aria-label={fr ? "Conversation" : "Conversation"}>
      {messages.isPending && <p className="text-sm text-muted-foreground">{fr ? "Chargement…" : "Loading…"}</p>}
      {messages.isError && <div role="alert"><p>{fr ? "Conversation indisponible." : "Could not load conversation."}</p><Button variant="outline" onClick={() => { void messages.refetch(); }}>{fr ? "Réessayer" : "Retry"}</Button></div>}
      {messages.hasNextPage && <Button variant="ghost" size="sm" disabled={messages.isFetchingNextPage} onClick={() => { void messages.fetchNextPage(); }}>{fr ? "Messages précédents" : "Older messages"}</Button>}
      {!messages.isPending && !messages.isError && !rows.length && <p className="text-sm text-muted-foreground py-6 text-center">{fr ? "Aucun message." : "No messages yet."}</p>}
      {rows.map(message => <div key={message.id} className={`flex ${message.sender_id === userId ? "justify-end" : "justify-start"}`}>
        <div className={`max-w-[85%] rounded-md px-3 py-2 min-w-0 ${message.sender_id === userId ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
          <div className="text-xs font-semibold break-words">{message.sender_name}</div>
          <p className="text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere] my-1">{message.body}</p>
          <time className="text-[11px] opacity-80" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString(fr ? "fr-FR" : "en-GB", { dateStyle: "short", timeStyle: "short" })}</time>
        </div>
      </div>)}<div ref={bottom} />
    </div>
    <form className="shrink-0 border-t pt-3 flex items-end gap-2" onSubmit={event => { event.preventDefault(); if (!send.isPending && !messages.isError && chatMessageSchema.safeParse(draft).success) send.mutate(draft); }}>
      <Textarea aria-label={fr ? "Votre message" : "Your message"} placeholder={fr ? "Votre message…" : "Your message…"} rows={2} maxLength={5000} className="min-w-0 resize-none" value={draft} disabled={send.isPending || messages.isError || messages.isPending} onChange={event => setDraft(event.target.value)} />
      <Button type="submit" size="icon" disabled={send.isPending || messages.isError || messages.isPending || !chatMessageSchema.safeParse(draft).success} title={fr ? "Envoyer" : "Send"} aria-label={fr ? "Envoyer" : "Send"}>{send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
    </form>
  </>;
}