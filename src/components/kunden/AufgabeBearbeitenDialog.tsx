import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { updateAktivitaet, type AktivitaetEntry } from "@/lib/aktivitaetenStore";
import {
  findeAufgabeZuAktivitaet,
  getAufgaben,
  updateAufgabe,
  type Aufgabe,
  type AufgabePrioritaet,
} from "@/lib/aufgabenStore";
import { ladeBuchungZuAktivitaet, verschiebeBuchungIntern } from "@/lib/buchungStore";
import { meetingZeitISO } from "@/lib/meetingZeit";
import { getInvestmentsByKontakt } from "@/lib/investmentsStore";
import { loadAllUsers, type SystemUser } from "@/lib/loadAllUsers";
import { istTerminInZukunft, TERMIN_ZUKUNFT_MELDUNG } from "@/lib/kontaktPipeline";
import { NUR_POPUP_OVERLAY } from "@/lib/popupOverlay";
import { InvestmentAuswahl } from "@/components/kunden/QuickActionDialog";

/**
 * Nachträgliches Bearbeiten einer selbst angelegten Aufgabe oder eines selbst
 * angelegten Termins.
 *
 * Bisher war eine Aufgabe nach dem Anlegen unveränderlich. Wer sich beim Datum
 * vertippt hatte, konnte nur eine zweite Aufgabe anlegen; die alte blieb
 * stehen und bestimmte weiter die Anzeige hinter dem Kundennamen, weil dort
 * immer die zeitlich nächste offene Aufgabe steht.
 *
 * Die Felder entsprechen der Anlege-Maske aus dem QuickActionDialog. Eine
 * Aufgabe liegt technisch zweimal vor: als Eintrag der Aktivitätsliste und als
 * echte Aufgabe in der Tabelle `aufgaben`. Beide werden hier gemeinsam
 * geändert, damit Aktivitätsliste, Pipeline und die Anzeige hinter dem Namen
 * nicht auseinanderlaufen.
 *
 * Bei einem Termin ist das anders, und deshalb fasst der Dialog dort nur den
 * Eintrag in `aktivitaeten` an: Den Rest zieht die Datenbank selbst nach. Der
 * Trigger `meeting_folgeobjekte` verschiebt den Videoraum und die verknüpfte
 * Aufgabe mit, und `meeting_mail_vormerken` schickt den Gästen eine
 * Änderungsmail. Würde der Dialog die Aufgabe zusätzlich selbst ändern, liefe
 * er dem Trigger in die Quere.
 *
 * Eine Ausnahme davon ist der selbst gebuchte Termin. Er hängt an einer
 * Buchung, und die kennt der Trigger nicht: Sie bliebe auf der alten Zeit
 * stehen, samt gesperrtem Kalender und Absagelink des Kunden. Ein solcher
 * Termin wird deshalb über `verschiebeBuchungIntern` bewegt, genau wie im
 * Ergebnis-Kasten. Siehe handleSave.
 */
export function AufgabeBearbeitenDialog({
  aktivitaet,
  kundeId,
  eigenerName,
  onClose,
}: {
  /** Der Aufgaben-Eintrag aus der Aktivitätsliste. null hält den Dialog zu. */
  aktivitaet: AktivitaetEntry | null;
  kundeId: string;
  /** Name des angemeldeten Nutzers, für die Empfängerwahl "Mir selbst". */
  eigenerName: string;
  onClose: () => void;
}) {
  const { toast } = useToast();

  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [prioritaet, setPrioritaet] = useState<AufgabePrioritaet>("mittel");
  const [faelligAm, setFaelligAm] = useState("");
  const [uhrzeit, setUhrzeit] = useState("");
  const [zugewiesenAnId, setZugewiesenAnId] = useState("");
  const [investmentId, setInvestmentId] = useState("");
  const [speichert, setSpeichert] = useState(false);
  // Die echte Aufgabe zum Listeneintrag, beim Öffnen einmal gesucht.
  const [aufgabe, setAufgabe] = useState<Aufgabe | null>(null);
  const [interneNutzer, setInterneNutzer] = useState<SystemUser[]>([]);
  /** Termine laufen anders als Aufgaben, siehe Kommentar am Dialog. */
  const istTermin = aktivitaet?.art === "meeting";

  const investmentsDesKunden = useMemo(() => {
    try {
      return getInvestmentsByKontakt(kundeId);
    } catch {
      return [];
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kundeId, aktivitaet?.id]);

  // Beim Öffnen die Felder aus dem Eintrag und der echten Aufgabe vorbelegen.
  useEffect(() => {
    if (!aktivitaet) return;
    setTitel(aktivitaet.beschreibung || "");
    setBeschreibung(aktivitaet.details || "");
    setPrioritaet((aktivitaet.prioritaet as AufgabePrioritaet) || "mittel");
    setFaelligAm((aktivitaet.faelligAm || "").slice(0, 10));
    setUhrzeit(aktivitaet.uhrzeit || "");
    let gefunden: Aufgabe | null = null;
    try {
      // Einträge mit dem Präfix "aufgabe-" sind die direkte Sicht auf die
      // Tabelle `aufgaben` (der Aktivitätseintrag fehlt). Dort steckt die
      // Aufgaben-ID gleich im Eintrag, die Schlüsselsuche entfällt.
      // Bei einem Termin wird bewusst nicht gesucht: Die verknüpfte Aufgabe
      // zieht der Trigger `meeting_folgeobjekte` selbst nach.
      gefunden = aktivitaet.art === "meeting"
        ? null
        : aktivitaet.id.startsWith("aufgabe-")
        ? getAufgaben().find((a) => a.id === aktivitaet.id.slice("aufgabe-".length)) || null
        : findeAufgabeZuAktivitaet(kundeId, aktivitaet.beschreibung, aktivitaet.faelligAm);
    } catch {
      gefunden = null;
    }
    setAufgabe(gefunden);
    setZugewiesenAnId(gefunden?.zugewiesenAn || "");
    setInvestmentId(gefunden?.investmentId || "");
    try {
      setInterneNutzer(
        loadAllUsers().filter((u) => {
          const r = (u.rolle || "").toLowerCase();
          return r !== "kunde" && r !== "tippgeber";
        }),
      );
    } catch {
      setInterneNutzer([]);
    }
  }, [aktivitaet, kundeId]);

  const handleSave = async () => {
    if (!aktivitaet) return;
    if (!titel.trim()) {
      toast({ title: "Bitte einen Titel angeben", variant: "destructive" });
      return;
    }
    if (!faelligAm) {
      toast({ title: "Bitte ein Fälligkeitsdatum angeben", variant: "destructive" });
      return;
    }
    if (!uhrzeit) {
      toast({ title: "Bitte eine Uhrzeit angeben", variant: "destructive" });
      return;
    }
    // Wie beim Anlegen muss ein NEU gewählter Termin in der Zukunft liegen.
    // Bleiben Datum und Uhrzeit unverändert, darf auch eine bereits
    // überfällige Aufgabe weiter bearbeitet werden, etwa um den Text zu
    // korrigieren.
    const terminGeaendert =
      faelligAm !== (aktivitaet.faelligAm || "").slice(0, 10) ||
      uhrzeit !== (aktivitaet.uhrzeit || "");
    if (terminGeaendert && !istTerminInZukunft(faelligAm, uhrzeit)) {
      toast({ title: TERMIN_ZUKUNFT_MELDUNG, variant: "destructive" });
      return;
    }

    const empfaengerName =
      interneNutzer.find((u) => u.id === zugewiesenAnId)?.name || eigenerName;

    setSpeichert(true);
    try {
      /*
       * Ein selbst gebuchter Termin hängt an einer Buchung.
       *
       * Sie führt die verbindliche Zeit: Sie sperrt den Kalender des
       * Partners, sie steht im Videoraum und sie hängt am Absagelink des
       * Kunden. Würde der Stift nur den Eintrag in der Kundenakte umtragen,
       * bliebe die Buchung auf der alten Zeit stehen. Deshalb läuft das
       * Verschieben über `verschiebeBuchungIntern`, denselben Weg, den auch
       * "Verschieben" im Ergebnis-Kasten nimmt. Die Datenbankfunktion trägt
       * Termin in der Akte und Videoraum selbst mit um.
       *
       * Eine Mail an den Kunden entsteht dabei nicht: Der Trigger
       * `meeting_mail_vormerken` steigt aus, sobald zu dem Eintrag eine
       * Buchung existiert. Der Kunde bekommt seine Bestätigung ohnehin vom
       * Buchungskalender.
       */
      let buchungVerschoben = false;
      if (istTermin && terminGeaendert && !aktivitaet.id.startsWith("aufgabe-")) {
        const buchung = await ladeBuchungZuAktivitaet(aktivitaet.id);
        const neueZeit = buchung ? meetingZeitISO(faelligAm, uhrzeit) : "";
        // Nur verschieben, wenn sich der Zeitpunkt wirklich ändert. Sonst
        // liefe eine reine Textkorrektur gegen die Vorlauffrist der Buchung.
        if (buchung && Date.parse(buchung.start_at) !== Date.parse(neueZeit)) {
          const ok = await verschiebeBuchungIntern(buchung, neueZeit);
          if (!ok) {
            toast({
              title: "Der Termin konnte nicht verschoben werden",
              description:
                "Zu diesem Termin gehört eine Buchung. Vielleicht ist die neue Zeit schon vergeben oder sie liegt zu kurzfristig. Bitte eine andere Zeit wählen.",
              variant: "destructive",
            });
            return;
          }
          buchungVerschoben = true;
        }
      }
      // Bei einem Waisen-Eintrag ("aufgabe-…") gibt es keinen Datensatz in
      // `aktivitaeten`, dort wird nur die echte Aufgabe geändert.
      if (!aktivitaet.id.startsWith("aufgabe-")) {
        await updateAktivitaet(aktivitaet.id, {
          beschreibung: titel.trim(),
          details: beschreibung.trim(),
          prioritaet,
          // Nach dem Verschieben über die Buchung steht die neue Zeit schon
          // im Eintrag. Sie ein zweites Mal zu schreiben hiesse, gegen die
          // Datenbankfunktion zu arbeiten.
          ...(buchungVerschoben ? {} : { faelligAm, uhrzeit }),
          // Ein Termin hat Teilnehmer, keinen Empfänger. Sein `zugewiesenAn`
          // bleibt deshalb unberührt.
          ...(istTermin ? {} : { zugewiesenAn: empfaengerName }),
        });
      }
      if (aufgabe) {
        const ok = await updateAufgabe(aufgabe.id, {
          titel: titel.trim(),
          beschreibung: beschreibung.trim(),
          prioritaet,
          faelligAm,
          uhrzeit,
          zugewiesenAn: zugewiesenAnId,
          ...(investmentsDesKunden.length > 0 ? { investmentId: investmentId || null } : {}),
        });
        if (!ok) return;
      }
      toast({ title: istTermin ? "Termin aktualisiert ✓" : "Aufgabe aktualisiert ✓", description: titel.trim() });
      onClose();
    } catch (err) {
      console.error("AufgabeBearbeitenDialog:", err);
      // Bei einem Termin sagt die Datenbank selbst, warum sie ablehnt, etwa
      // weil die neue Zeit schon vergeben ist. Diese Meldung ist hilfreicher
      // als ein allgemeiner Satz.
      const meldung = (err as { message?: string })?.message?.trim();
      toast({
        title: "Speichern fehlgeschlagen",
        description: meldung
          || (istTermin
            ? "Der Termin konnte nicht geändert werden. Bitte erneut versuchen."
            : "Die Aufgabe konnte nicht geändert werden. Bitte erneut versuchen."),
        variant: "destructive",
      });
    } finally {
      setSpeichert(false);
    }
  };

  return (
    <Dialog modal={false} open={!!aktivitaet} onOpenChange={(offen) => { if (!offen) onClose(); }}>
      <DialogContent
        overlayClassName={NUR_POPUP_OVERLAY}
        className="max-w-lg max-h-[85vh] overflow-y-auto overflow-x-hidden shadow-2xl border-border"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{istTermin ? "📅 Termin bearbeiten" : "☑️ Aufgabe bearbeiten"}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            Autor und Anlagezeitpunkt bleiben unverändert.
          </p>
        </DialogHeader>

        <div className="min-w-0 space-y-4 pt-2">
          <div>
            <Label className="text-sm font-medium">{istTermin ? "Titel des Termins" : "Titel der Aufgabe"}</Label>
            <Input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder={istTermin ? "z.B. Beratungsgespräch" : "z.B. Unterlagen nachfassen"}
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Beschreibung (optional)</Label>
            <Textarea
              value={beschreibung}
              onChange={(e) => setBeschreibung(e.target.value)}
              placeholder="Details zur Aufgabe..."
              className="mt-1"
              rows={3}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Priorität *</Label>
              <Select value={prioritaet} onValueChange={(v) => setPrioritaet(v as AufgabePrioritaet)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="niedrig">Niedrig</SelectItem>
                  <SelectItem value="mittel">Mittel</SelectItem>
                  <SelectItem value="hoch">Hoch</SelectItem>
                  <SelectItem value="dringend">Dringend</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">{istTermin ? "Termin am" : "Fällig am"}</Label>
              <DateInput value={faelligAm} onChange={(v) => setFaelligAm(v)} className="mt-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-sm font-medium">Uhrzeit *</Label>
              <Input
                type="time"
                value={uhrzeit}
                onChange={(e) => setUhrzeit(e.target.value)}
                className="mt-1"
              />
            </div>
            {/* Ein Termin hat keinen Empfänger, sondern Teilnehmer. Die
                stehen am Eintrag und werden hier nicht angefasst, sonst
                verlören die Gäste ihre Einladung. */}
            {!istTermin && (
            <div>
              <Label className="text-sm font-medium">Zugewiesen an *</Label>
              {/* Auswahl statt Freitext, wie in der Anlege-Maske: Nur so
                  landet die Aufgabe wirklich in der Inbox des Empfängers. */}
              <select
                value={zugewiesenAnId}
                onChange={(e) => setZugewiesenAnId(e.target.value)}
                className="mt-1 w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Mir selbst</option>
                {interneNutzer
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.rolle ? ` · ${u.rolle}` : ""}
                    </option>
                  ))}
              </select>
            </div>
            )}
          </div>
          {/* Die Investment-Zuordnung hängt an der echten Aufgabe. Gibt es zu
              diesem Eintrag keine (Altbestand), gibt es auch nichts zuzuordnen. */}
          {aufgabe && (
            <InvestmentAuswahl
              investments={investmentsDesKunden}
              wert={investmentId}
              setzen={setInvestmentId}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose} disabled={speichert}>
            Abbrechen
          </Button>
          <Button onClick={handleSave} disabled={speichert}>
            {speichert ? "Speichere…" : "Speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
