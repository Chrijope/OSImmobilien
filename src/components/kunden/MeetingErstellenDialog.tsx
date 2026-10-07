import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Video, Check } from "lucide-react";
import { getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { berlinJetzt } from "@/lib/meetingZeit";
import { BuchungskalenderListe } from "@/components/kunden/BuchungskalenderListe";
import { useEigeneBuchungslinks } from "@/lib/eigeneBuchungslinks";

/**
 * Der Termin, wie ihn der Nutzer eingetragen hat. Datum und Uhrzeit gelten in
 * Berliner Zeit, so wie sie im Formular stehen.
 */
export interface MeetingEintrag {
  thema: string;
  datum: string; // YYYY-MM-DD
  uhrzeit: string; // HH:MM
  dauer: number; // Minuten
  agenda: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTopic?: string;
  defaultDate?: string; // YYYY-MM-DD
  defaultTime?: string; // HH:MM
  defaultDuration?: number;
  defaultAgenda?: string;
  /**
   * Wird beim Speichern aufgerufen. Die gewaehlte Zuordnung kommt als zweiter
   * Wert mit, damit der Aufrufer sie in die Aufgabe schreiben kann. Ueber
   * einen React-Zustand im Aufrufer ginge das nicht: der Klick laeuft mit der
   * Fassung des Rueckrufs, die beim Oeffnen gebunden wurde, und saehe deshalb
   * noch den alten Wert.
   *
   * Gibt der Rueckruf `false` zurueck, bleibt der Dialog offen, damit die
   * Eingaben nicht verloren gehen.
   */
  onCreated: (meeting: MeetingEintrag, investmentId?: string) => void | boolean | Promise<void | boolean>;
  /** Fuer die Buchungskalender oben im Dialog. */
  recipientEmail?: string;
  recipientName?: string;
  kontaktId?: string;
  /**
   * Vorauswahl fuer "Gehoert zu". Das Feld bleibt trotzdem sichtbar.
   * Christian am 21.09.2026: Man kann den Dialog auch von einer Stelle aus
   * oeffnen, die zu keinem Investment gehoert, und dann waere eine
   * unsichtbare Zuordnung geraten.
   */
  investmentIdVorauswahl?: string;
}

/**
 * „Meeting erstellen" fuer alle ohne Videocall-Freigabe.
 *
 * Hiess bis zum 29.09.2026 `ZoomMeetingButton` und legte das Meeting bei Zoom
 * an. Der Knopf war gesperrt, solange kein Zoom-Profil verbunden war, und
 * verbunden hatte es praktisch niemand: Ein Vertriebspartner fuellte alle
 * Pflichtfelder aus und konnte trotzdem nicht speichern. Christian hat Zoom
 * deshalb aus dem Dialog entfernen lassen. Er traegt jetzt nur den Termin ein,
 * in der Kundenakte und am gewaehlten Investment.
 */
export function MeetingErstellenDialog({
  open,
  onOpenChange,
  investmentIdVorauswahl,
  defaultTopic = "",
  defaultDate = "",
  defaultTime = "",
  defaultDuration = 60,
  defaultAgenda = "",
  onCreated,
  recipientEmail,
  recipientName,
  kontaktId,
}: Props) {
  const [topic, setTopic] = useState(defaultTopic || "Beratungsgespräch");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState(defaultTime);
  const [duration, setDuration] = useState(defaultDuration);
  const [agenda, setAgenda] = useState(defaultAgenda);
  const [loading, setLoading] = useState(false);
  // Erst laden, wenn der Dialog offen ist. Er haengt an jeder Kundenseite.
  const { links: eigeneKalender, laedt: kalenderLaedt } = useEigeneBuchungslinks(open);

  // Zuordnung zum Investment. Ohne sie wüsste die Pipeline nicht, auf welcher
  // Kachel der Termin erscheinen soll.
  const [investmentId, setInvestmentId] = useState<string>(investmentIdVorauswahl || "");
  const investments = useMemo(() => {
    if (!kontaktId) return [];
    try { return getInvestmentsByKontakt(kontaktId); } catch { return []; }
  }, [kontaktId, open]);

  // Die Vorauswahl kann erst nach dem Laden der Investments feststehen.
  useEffect(() => {
    if (investmentIdVorauswahl) setInvestmentId(investmentIdVorauswahl);
  }, [investmentIdVorauswahl]);

  // Wenn defaults erst nach Mount reinkommen (z. B. nach Datenladen), aktualisieren.
  useEffect(() => { if (defaultDate) setDate(defaultDate); }, [defaultDate]);
  useEffect(() => { if (defaultTime) setTime(defaultTime); }, [defaultTime]);
  useEffect(() => { if (defaultTopic) setTopic(defaultTopic); }, [defaultTopic]);

  const handleCreate = async () => {
    if (!topic.trim() || !date || !time) {
      toast.error("Bitte Thema, Datum und Uhrzeit ausfüllen.");
      return;
    }
    /*
     * Ohne Zuordnung kein Meeting, sobald es ein Investment gibt.
     *
     * Frueher gab es zusaetzlich die Auswahl "Kunde allgemein". Ein so
     * angelegter Termin erschien auf allen Kacheln gleichzeitig und gehoerte
     * damit zu keinem Vorgang richtig.
     */
    if (investments.length > 0 && !investmentId) {
      toast.error("Bitte auswählen, zu welchem Investment das Meeting gehört.");
      return;
    }
    setLoading(true);
    try {
      const ergebnis = await onCreated(
        { thema: topic.trim(), datum: date, uhrzeit: time, dauer: Number(duration) || 60, agenda: agenda.trim() },
        investmentId || undefined,
      );
      if (ergebnis !== false) onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : "Meeting konnte nicht gespeichert werden");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Gleiche Darstellung wie bei "Aufgabe erstellen": kein abgedunkelter
          Hintergrund, damit Sidebar und Kundenprofil sichtbar bleiben, und
          kein versehentliches Schließen durch einen Klick daneben. */}
      <DialogContent
        overlayClassName="hidden"
        className="max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl border-border"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Video className="h-5 w-5 text-primary" /> Meeting erstellen
          </DialogTitle>
          <DialogDescription>
            Trag Datum und Uhrzeit ein. Der Termin erscheint danach in der Kundenakte und auf der
            gewählten Pipeline-Kachel.
          </DialogDescription>
        </DialogHeader>

        {/*
          Die vier eigenen Buchungskalender, ganz oben.

          Christian am 21.09.2026: Sie sollen an jeder Stelle stehen, an der
          ein Meeting entsteht, nicht nur in der neueren Maske. Wer hier
          landet, hat in aller Regel keine Videocall-Freigabe und sah sie
          deshalb bisher nirgends.
        */}
        <BuchungskalenderListe
          links={eigeneKalender}
          laedt={kalenderLaedt}
          kontaktId={kontaktId}
          kontaktName={recipientName}
          kontaktEmail={recipientEmail}
          investmentId={investmentId || null}
        />

        <div className="space-y-3">
          <div>
            <Label className="text-xs">Thema *</Label>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Beratungsgespräch" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Datum *</Label>
              {/* Berliner Kalendertag, nicht UTC: Kurz nach Mitternacht
                  waere sonst noch der Vortag waehlbar. */}
              <DateInput value={date} onChange={setDate} minDate={berlinJetzt().datum} />
            </div>
            <div>
              <Label className="text-xs">Uhrzeit *</Label>
              <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Dauer (Min)</Label>
              <Input type="number" min={15} max={480} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value) || 60)} />
            </div>
            <div className="flex items-end">
              <p className="text-[11px] text-muted-foreground">Zeitzone: Europe/Berlin</p>
            </div>
          </div>
          <div>
            {/* Kein Sternchen: Ein Meeting entsteht auch ohne Agenda. */}
            <Label className="text-xs">Agenda (optional)</Label>
            <Input value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="z. B. Vorstellung Investmentstrategie" />
          </div>
          {investments.length > 0 && (
            <div>
              <Label className="text-xs">Gehört zu *</Label>
              <select
                value={investmentId}
                onChange={(e) => setInvestmentId(e.target.value)}
                className="mt-1 w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Bitte wählen</option>
                {investments.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.nummer ? `${inv.nummer}. ` : ""}
                    {inv.objektTitel || inv.label || "Investment"}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1">
                Bestimmt, auf welcher Pipeline-Kachel der Termin erscheint.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Abbrechen</Button>
          <Button onClick={() => void handleCreate()} disabled={loading} className="gap-1.5">
            {loading ? "Speichere…" : (<><Check className="h-4 w-4" /> Meeting erstellen</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
