import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneOff, SkipForward, Clock, CheckCircle2, XCircle, MessageSquare, ChevronRight, StickyNote } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { KundeData } from "@/lib/kundenStore";
import { updateKontakt } from "@/lib/kundenStore";
import { kontaktQuelleAnzeige } from "@/lib/kontaktQuelle";
import { addAktivitaet } from "@/lib/aktivitaetenStore";
import { starteAnrufFuerKontakt } from "@/lib/anrufStarten";
import { useUser } from "@/contexts/UserContext";

interface PowerdialerProps {
  kontakte: KundeData[];
  onClose: () => void;
}

type CallResult = "erreicht" | "nicht_erreicht" | "mailbox" | "termin" | "kein_interesse" | "follow_up";

const RESULT_OPTIONS: { value: CallResult; label: string; icon: React.ReactNode; color: string }[] = [
  { value: "erreicht", label: "Erreicht", icon: <CheckCircle2 className="h-3 w-3" />, color: "bg-success/10 text-success" },
  { value: "termin", label: "Termin vereinbart", icon: <Clock className="h-3 w-3" />, color: "bg-primary/10 text-primary" },
  { value: "nicht_erreicht", label: "Nicht erreicht", icon: <XCircle className="h-3 w-3" />, color: "bg-destructive/10 text-destructive" },
  { value: "mailbox", label: "Mailbox", icon: <MessageSquare className="h-3 w-3" />, color: "bg-warning/10 text-warning" },
  { value: "follow_up", label: "Follow-Up", icon: <Clock className="h-3 w-3" />, color: "bg-accent text-accent-foreground" },
  { value: "kein_interesse", label: "Kein Interesse", icon: <XCircle className="h-3 w-3" />, color: "bg-muted text-muted-foreground" },
];

const RESULT_LABELS: Record<CallResult, string> = {
  erreicht: "Erreicht",
  nicht_erreicht: "Nicht erreicht",
  mailbox: "Mailbox",
  termin: "Termin vereinbart",
  kein_interesse: "Kein Interesse",
  follow_up: "Follow-Up",
};

export function Powerdialer({ kontakte, onClose }: PowerdialerProps) {
  const { user } = useUser();
  const nowIso = new Date().toISOString();
  const callableKontakte = kontakte.filter(k =>
    !!k.telefon && !((k as any).verstecktBis && (k as any).verstecktBis > nowIso)
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [callResult, setCallResult] = useState<CallResult | "">("");
  const [notes, setNotes] = useState("");
  const [callLog, setCallLog] = useState<{ id: string; name: string; result: CallResult; notes: string; time: string }[]>([]);

  const current = callableKontakte[currentIndex];
  const hasNext = currentIndex < callableKontakte.length - 1;

  // Setter-Gesprächsnotizen (synced with setterSkriptNotizen)
  const [setterNotizen, setSetterNotizen] = useState(current?.setterSkriptNotizen || "");

  // Update setter notes when current contact changes
  const updateSetterNotizenForCurrent = () => {
    const next = callableKontakte[currentIndex + 1];
    if (next) setSetterNotizen(next.setterSkriptNotizen || "");
  };

  const handleCall = () => {
    if (!current) return;
    setIsActive(true);
    starteAnrufFuerKontakt(current.id, current.telefon, "Powerdialer", user?.name);
  };

  const handleEndCall = () => {
    setIsActive(false);
  };

  const handleSaveAndNext = () => {
    if (current && callResult) {
      // Save to call log
      setCallLog(prev => [...prev, {
        id: current.id,
        name: `${current.vorname} ${current.nachname}`,
        result: callResult as CallResult,
        notes,
        time: new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
      }]);

      // Save call to activity timeline
      const resultLabel = RESULT_LABELS[callResult as CallResult] || callResult;
      addAktivitaet({
        kundeId: current.id,
        art: "anruf_protokoll",
        beschreibung: `Powerdialer-Anruf: ${resultLabel}`,
        details: notes || undefined,
        ergebnis: resultLabel,
        von: user?.name || "System",
      });

      // Save Setter-Gesprächsnotizen to customer
      if (setterNotizen.trim()) {
        updateKontakt(current.id, { setterSkriptNotizen: setterNotizen });
      }
    }
    setCallResult("");
    setNotes("");
    setIsActive(false);
    if (hasNext) {
      updateSetterNotizenForCurrent();
      setCurrentIndex(i => i + 1);
    }
  };

  const handleSkip = () => {
    // Save setter notes even on skip
    if (current && setterNotizen.trim()) {
      updateKontakt(current.id, { setterSkriptNotizen: setterNotizen });
    }
    setCallResult("");
    setNotes("");
    setIsActive(false);
    if (hasNext) {
      updateSetterNotizenForCurrent();
      setCurrentIndex(i => i + 1);
    }
  };

  if (callableKontakte.length === 0) {
    return (
      <div data-ui="card" className="bg-card rounded-lg border p-6 text-center">
        <p className="text-muted-foreground">Keine Kontakte mit Telefonnummer vorhanden.</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={onClose}>Schließen</Button>
      </div>
    );
  }

  return (
    <div data-ui="card" className="bg-card rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="bg-primary/5 border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Phone className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold text-sm">Powerdialer</h3>
            <p className="text-xs text-muted-foreground">
              {currentIndex + 1} / {callableKontakte.length} Kontakte • {callLog.length} Anrufe erledigt
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">
            Click-to-Call
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClose}>×</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-0">
        {/* Current Contact */}
        <div className="p-5 border-r">
          {current ? (
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold">{current.anrede} {current.vorname} {current.nachname}</p>
                {current.leadTyp && (
                  <Badge className="text-[10px] mt-1 bg-blue-500/10 text-blue-600">
                    {current.leadTyp === "meta" ? "Funnel Lead" : current.leadTyp === "google" ? "Google Ad" : current.leadTyp}
                  </Badge>
                )}
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-mono font-medium">{current.telefon}</span>
                </div>
                {current.email && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">✉</span> {current.email}
                  </div>
                )}
                {current.ort && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="text-xs">📍</span> {current.ort}
                  </div>
                )}
                {kontaktQuelleAnzeige(current) && (
                  <div className="text-xs text-muted-foreground">Quelle: {kontaktQuelleAnzeige(current)}</div>
                )}
              </div>

              {/* Call Controls */}
              <div className="flex gap-2 pt-2">
                {!isActive ? (
                  <Button onClick={handleCall} className="flex-1 gap-2 bg-success hover:bg-success/90 text-white">
                    <Phone className="h-4 w-4" /> Anrufen
                  </Button>
                ) : (
                  <Button onClick={handleEndCall} variant="destructive" className="flex-1 gap-2">
                    <PhoneOff className="h-4 w-4" /> Auflegen
                  </Button>
                )}
                <Button variant="outline" size="icon" aria-label="Überspringen" onClick={handleSkip} title="Überspringen">
                  <SkipForward className="h-4 w-4" />
                </Button>
              </div>

              {/* Call Result */}
              <div className="space-y-2 pt-2">
                <label className="text-xs font-medium">Ergebnis</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {RESULT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setCallResult(opt.value)}
                      className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs border transition-colors ${
                        callResult === opt.value
                          ? "border-primary bg-primary/10 font-medium"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Anruf-Notizen */}
              <div className="space-y-1">
                <label className="text-xs font-medium">Notizen</label>
                <Textarea
                  placeholder="Notizen zum Gespräch..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="h-16 text-sm"
                />
              </div>

              {/* Setter-Gesprächsnotizen (synced with Kundenseite) */}
              <div className="space-y-1 p-3 rounded-lg border-2 border-primary/20 bg-primary/5">
                <div className="flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5 text-primary" />
                  <Label className="text-xs font-semibold">Setter-Gesprächsnotizen</Label>
                </div>
                <p className="text-[10px] text-muted-foreground mb-1">Wird mit der Kundenseite synchronisiert und dem Closer/Vertriebspartner angezeigt.</p>
                <Textarea
                  placeholder="Wichtige Beobachtungen, Einwände, Persönlichkeitstyp, Stimmung..."
                  value={setterNotizen}
                  onChange={e => setSetterNotizen(e.target.value)}
                  className="h-16 text-sm"
                />
              </div>

              <Button
                onClick={handleSaveAndNext}
                disabled={!callResult}
                className="w-full gap-2"
              >
                Speichern & Weiter <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-8">Alle Kontakte durchgearbeitet!</p>
          )}
        </div>

        {/* Call Log */}
        <div className="p-5">
          <h4 className="text-sm font-semibold mb-3">Anruf-Protokoll ({callLog.length})</h4>
          {callLog.length === 0 ? (
            <p className="text-xs text-muted-foreground">Noch keine Anrufe protokolliert.</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {[...callLog].reverse().map((log, i) => {
                const opt = RESULT_OPTIONS.find(o => o.value === log.result);
                return (
                  <div key={i} className="border rounded p-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{log.name}</span>
                      <span className="text-[10px] text-muted-foreground">{log.time}</span>
                    </div>
                    <Badge className={`text-[10px] ${opt?.color || ""}`}>
                      {opt?.label || log.result}
                    </Badge>
                    {log.notes && <p className="text-xs text-muted-foreground">{log.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-muted/30 border-t px-4 py-2">
        <p className="text-[10px] text-muted-foreground">
          💡 Für Browser-Telefonie (VoIP/WebRTC) wird ein Anbieter wie Twilio benötigt. Aktuell: Click-to-Call über Telefon-App.
        </p>
      </div>
    </div>
  );
}
