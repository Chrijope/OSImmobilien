import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateInput } from "@/components/ui/date-input";
import { CalendarClock, Pencil, PhoneCall, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type { Bewerber } from "@/lib/bewerbungStore";
import { bedenkzeitRueckrufAktiv, erinnerungLabel, kanalLabel } from "@/lib/bewerberErinnerungen";
import { formatDatum } from "@/lib/utils";

/**
 * Follow-up-Karte im Reiter Übersicht des Bewerbers.
 *
 * Lesemodus für alle Rollen: Ist ein Follow-up gesetzt, stehen Datum,
 * Uhrzeit und der volle Text sichtbar da, ohne dass ein Formular geöffnet
 * werden muss. „Bearbeiten" öffnet das Formular mit Speichern-Knopf; ohne
 * Follow-up erscheint das Formular direkt (wie bisher).
 *
 * Der Rückruf aus der Bedenkzeit (Reiter Closing, Karte Entscheidung)
 * erscheint in derselben Karte auf dieselbe Weise. Bearbeitet wird er im
 * Reiter Closing, weil er dort gepflegt wird. Bedenkzeit und Follow-Up
 * bleiben getrennte Status.
 */
export function FollowUpCard({
  b,
  canEdit,
  onSave,
  onZumClosing,
}: {
  b: Bewerber;
  canEdit: boolean;
  onSave: (patch: Partial<Bewerber>) => void;
  /** Wechsel in den Reiter Closing, dort wird der Bedenkzeit-Rückruf gepflegt */
  onZumClosing?: () => void;
}) {
  const [datum, setDatum] = useState(b.followUpDatum || "");
  const [uhrzeit, setUhrzeit] = useState(b.followUpUhrzeit || "");
  const [notiz, setNotiz] = useState(b.followUpNotiz || "");
  const [bearbeiten, setBearbeiten] = useState(false);

  useEffect(() => {
    setDatum(b.followUpDatum || "");
    setUhrzeit(b.followUpUhrzeit || "");
    setNotiz(b.followUpNotiz || "");
    setBearbeiten(false);
  }, [b.id, b.followUpDatum, b.followUpUhrzeit, b.followUpNotiz]);

  const dirty = datum !== (b.followUpDatum || "") || uhrzeit !== (b.followUpUhrzeit || "") || notiz !== (b.followUpNotiz || "");
  const hatFollowUp = !!b.followUpDatum;
  const rueckruf = bedenkzeitRueckrufAktiv(b);
  const lesemodus = (hatFollowUp || rueckruf) && !bearbeiten;

  const handleSave = () => {
    onSave({ followUpDatum: datum, followUpUhrzeit: uhrzeit, followUpNotiz: datum ? notiz : "" });
    setBearbeiten(false);
    toast({ title: "Follow-Up gespeichert", description: datum ? `Erscheint am ${formatDatum(datum)}${uhrzeit ? ` um ${uhrzeit} Uhr` : ""} in der Inbox.` : "Follow-Up entfernt." });
  };

  const handleClear = () => {
    setDatum(""); setUhrzeit(""); setNotiz("");
    onSave({ followUpDatum: "", followUpUhrzeit: "", followUpNotiz: "" });
    setBearbeiten(false);
    toast({ title: "Follow-Up entfernt" });
  };

  return (
    <Card className="p-4" data-testid="follow-up-karte">
      <div className="flex items-center gap-2 mb-2">
        <CalendarClock className="h-4 w-4 text-blue-500" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          Follow-Up{hatFollowUp || rueckruf ? "" : " (optional)"}
        </p>
      </div>

      {lesemodus ? (
        <div className="space-y-3">
          {hatFollowUp && (
            <div data-testid="follow-up-lesemodus">
              <p className="text-sm font-semibold">
                🔔 {formatDatum(b.followUpDatum)}
                {b.followUpUhrzeit && ` · ${b.followUpUhrzeit} Uhr`}
              </p>
              {b.followUpNotiz ? (
                <p className="mt-1.5 rounded-md border bg-muted/30 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap">{b.followUpNotiz}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground italic">Keine Notiz</p>
              )}
              {canEdit && (
                /* Auf dem Handy hoeher und weiter auseinander: "Entfernen"
                   loescht den Termin und lag mit 28px Hoehe direkt neben
                   "Bearbeiten". Ab `sm` bleibt beides wie bisher. */
                <div className="flex items-center gap-4 mt-2 sm:gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-9 gap-1 text-[11px] sm:h-7" onClick={() => setBearbeiten(true)}>
                    <Pencil className="h-3 w-3" /> Bearbeiten
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-9 text-[11px] text-muted-foreground hover:text-destructive sm:h-7" onClick={handleClear}>
                    Entfernen
                  </Button>
                </div>
              )}
            </div>
          )}

          {rueckruf && (
            <div className={hatFollowUp ? "border-t pt-3" : ""} data-testid="bedenkzeit-lesemodus">
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <PhoneCall className="h-3.5 w-3.5 text-violet-600" />
                Rückruf (Bedenkzeit) {formatDatum(b.bedenkzeitRueckrufAm)}
                {b.bedenkzeitRueckrufUhrzeit && ` · ${b.bedenkzeitRueckrufUhrzeit} Uhr`}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {kanalLabel(b.bedenkzeitKanal)} · Erinnerung {erinnerungLabel(b.bedenkzeitErinnerungTage)}
              </p>
              {b.bedenkzeitVorbereitung ? (
                <p className="mt-1.5 rounded-md border bg-muted/30 px-2.5 py-2 text-xs leading-relaxed whitespace-pre-wrap">{b.bedenkzeitVorbereitung}</p>
              ) : b.bedenkzeitGrund ? (
                <p className="mt-1.5 text-xs text-muted-foreground whitespace-pre-wrap">Entscheidung hängt an: {b.bedenkzeitGrund}</p>
              ) : null}
              {canEdit && onZumClosing && (
                <Button type="button" size="sm" variant="outline" className="h-7 gap-1 text-[11px] mt-2" onClick={onZumClosing}>
                  <Pencil className="h-3 w-3" /> Bearbeiten
                </Button>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">Gepflegt im Reiter Closing, Karte Entscheidung.</p>
            </div>
          )}
        </div>
      ) : canEdit ? (
        <div className="grid grid-cols-1 gap-2" data-testid="follow-up-formular">
          <div>
            <Label className="text-[10px]">Datum (TT.MM.JJJJ)</Label>
            <DateInput value={datum} onChange={setDatum} />
          </div>
          <div>
            <Label className="text-[10px]" htmlFor="follow-up-uhrzeit">Uhrzeit (optional)</Label>
            <Input id="follow-up-uhrzeit" type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} />
          </div>
          {datum && (
            <div>
              <Label className="text-[10px]" htmlFor="follow-up-notiz">Notiz (optional)</Label>
              <Textarea
                id="follow-up-notiz"
                value={notiz}
                onChange={(e) => setNotiz(e.target.value)}
                placeholder="z.B. Rückruf zu Paketwahl, Einwand klären…"
                rows={3}
                className="text-sm"
              />
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" size="sm" className="h-8 text-xs" onClick={handleSave} disabled={!dirty}>
              <Save className="h-3 w-3 mr-1" /> Follow-Up speichern
            </Button>
            {bearbeiten && (
              <Button type="button" variant="ghost" size="sm" className="h-8 text-[11px] text-muted-foreground" onClick={() => {
                setDatum(b.followUpDatum || ""); setUhrzeit(b.followUpUhrzeit || ""); setNotiz(b.followUpNotiz || "");
                setBearbeiten(false);
              }}>
                Abbrechen
              </Button>
            )}
            {(b.followUpDatum || datum) && (
              <Button type="button" variant="ghost" size="sm" className="h-8 text-[11px] text-muted-foreground hover:text-destructive" onClick={handleClear}>
                Entfernen
              </Button>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground italic">Kein Follow-Up gesetzt</p>
      )}

      <p className="text-[10px] text-muted-foreground mt-2">
        Erscheint am Tag in deiner Inbox. Ein Rückruf aus der Bedenkzeit (Reiter Closing) erscheint hier auf dieselbe Weise.
      </p>
    </Card>
  );
}
