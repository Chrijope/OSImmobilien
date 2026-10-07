import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight, X, Target } from "lucide-react";
import {
  getCallSession,
  advanceCallSession,
  endCallSession,
  subscribeCallSession,
  focusCallSessionOn,
  type CallSession,
} from "@/lib/callSessionStore";

interface Props {
  currentKundeId: string;
}

export function CallSessionBar({ currentKundeId }: Props) {
  const navigate = useNavigate();
  const [session, setSession] = useState<CallSession | null>(() => getCallSession());

  useEffect(() => subscribeCallSession(() => setSession(getCallSession())), []);

  // Wenn der Nutzer den Kunden direkt aus der Queue geöffnet hat: Index auf ihn ausrichten.
  useEffect(() => {
    if (session && currentKundeId && session.ids.includes(currentKundeId)) {
      focusCallSessionOn(currentKundeId);
    }
  }, [currentKundeId, session?.ids.join("|")]);

  if (!session) return null;
  if (!session.ids.includes(currentKundeId)) return null;

  const position = session.ids.indexOf(currentKundeId) + 1;
  const total = session.ids.length;
  const isLast = position >= total;

  const goNext = () => {
    const nextId = advanceCallSession();
    if (nextId) navigate(`/kunden/${nextId}`);
  };

  return (
    <div className="sticky top-0 z-30 -mx-4 md:-mx-6 mb-4 border-b border-primary/30 bg-primary/10 backdrop-blur px-4 md:px-6 py-2 flex items-center gap-3">
      <Target className="h-4 w-4 text-primary shrink-0" />
      <div className="text-sm font-medium">
        Anruf-Session · Lead <span className="tabular-nums">{position}</span> / <span className="tabular-nums">{total}</span>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={endCallSession} className="gap-1">
          <X className="h-3.5 w-3.5" /> Beenden
        </Button>
        <Button size="sm" onClick={goNext} className="gap-1" disabled={isLast}>
          Weiter <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}