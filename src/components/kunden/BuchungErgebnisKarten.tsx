import { MeetingVersandStatus } from "@/components/buchung/MeetingVersandStatus";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, Copy, RefreshCw, Send, Trash2, XCircle } from "lucide-react";
import { setzeBuchungStatus } from "@/lib/buchungStore";
import { addAktivitaet, loescheAktivitaet } from "@/lib/aktivitaetenStore";
import { cacheGetById, onCacheChange } from "@/lib/dataCache";
import { TERMINE_AKTUALISIERT_EVENT } from "@/lib/terminAnzeige";
import { versendeMeetingEinladung } from "@/lib/meetingEinladung";
import { stelleKundenspracheSicher } from "@/lib/kundenSprache";
import { KundenspracheHinweis } from "@/components/kunden/KundenspracheHinweis";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { TerminErgebnisDialog } from "@/components/kunden/TerminErgebnisDialog";
import {
  ladeErgebnisTermine, lokalesDatum, lokaleUhrzeit, terminErschienen, terminNoShow, terminText,
  type ErgebnisKontext, type ErgebnisTermin,
} from "@/lib/terminErgebnis";
import { schliesseErledigteAutomatikAufgaben } from "@/lib/aufgabenStore";
import { verschiebeAufgabenPraefix } from "@/lib/terminErgebnis";
import { noShowErfasst } from "@/lib/kundenNaechsteAktion";

/**
 * Ergebnis-Karten fuer anstehende Termine, im Kopfbereich des Kundenprofils.
 *
 * Zwei Quellen, eine Darstellung: Selbstbuchungen ueber den Buchungslink und
 * von Hand angelegte Meetings. Jede Karte traegt Erschienen, No-Show und
 * Verschoben, das Investment, den Raumlink zum Kopieren und einen Knopf, die
 * Einladung erneut zu senden.
 *
 * Was bei den drei Antworten geschieht, steht seit 09/2026 nicht mehr hier,
 * sondern in `src/lib/terminErgebnis.ts`. Dieselben Funktionen ruft die
 * Aktionsliste im Kundenprofil. So gibt es nur eine Fassung der No-Show-Kette.
 */

export function BuchungErgebnisKarten({
  kundeId,
  kundeName,
  kundeEmail,
  kundeTelefon,
  beraterName,
  canSet,
  userName,
  rueckblickTage,
}: {
  kundeId: string;
  kundeName: string;
  kundeEmail?: string;
  kundeTelefon?: string;
  /** Zustaendiger Vertriebspartner des Kunden, Ziel der No-Show-Aufgabe. */
  beraterName?: string;
  canSet: boolean;
  userName: string;
  /**
   * Wie weit zurueck ein unerledigter Termin noch einen Kasten bekommt.
   * `null` heisst: ohne Grenze. Ohne Angabe gilt `RUECKBLICK_TAGE`.
   */
  rueckblickTage?: number | null;
}) {
  const { toast } = useToast();
  const [termine, setTermine] = useState<ErgebnisTermin[]>([]);
  const [beschaeftigt, setBeschaeftigt] = useState<string | null>(null);
  const [verschieben, setVerschieben] = useState<ErgebnisTermin | null>(null);

  const kontext: ErgebnisKontext = {
    kundeId,
    kundeName,
    beraterName,
    // Die Kennung vom Kontakt, damit die Folgeaufgabe nicht ueber den Namen
    // gesucht wird. Gleiche Quelle wie `beraterName`.
    beraterId: beraterName
      ? cacheGetById<{ zustaendig_id?: string }>("kontakte", kundeId)?.zustaendig_id || undefined
      : undefined,
    userName,
    melde: (meldung) => { toast(meldung); },
  };

  // Laedt beim Einhaengen und immer dann nach, wenn sich Termine geaendert
  // haben koennten. Vorher lief das Laden genau einmal: Ein Meeting, das im
  // offenen Profil erstellt wurde, bekam erst nach einem kompletten Neuladen
  // der Seite eine Karte. Jetzt horcht die Karte auf den Datenzwischenspeicher
  // (aktivitaeten, buchungen) und auf das window-Ereignis des Dialogs, das
  // auch im Testkonto-Modus ohne Realtime ankommt.
  useEffect(() => {
    let lebt = true;
    const laden = async () => {
      const geladen = await ladeErgebnisTermine(kundeId, { rueckblickTage });
      if (!lebt) return;
      // Bestandsfall: Ist zu diesem Zeitpunkt schon ein No-Show erfasst (etwa
      // im Kasten zum festen Termin), braucht der Termin keinen Kasten mehr.
      // Abhakbar bleibt er in "Naechste Aktion", dort ohne neue Folgekette.
      const kontakt = cacheGetById<{ meta?: unknown }>("kontakte", kundeId);
      setTermine(geladen.filter((t) => !noShowErfasst(kontakt, lokalesDatum(t.startAt), lokaleUhrzeit(t.startAt))));
    };
    void laden();

    // Entprellt: Beim Anlegen eines Meetings kommen mehrere Ereignisse kurz
    // nacheinander (Aktivitaet, Aufgabe, E-Mail-Protokoll). Ein Timer buendelt
    // sie zu einem einzigen Nachladen.
    let timer: number | undefined;
    const nachladenAngestossen = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => { timer = undefined; void laden(); }, 300);
    };
    const unsubCache = onCacheChange((table) => {
      if (table === "aktivitaeten" || table === "buchungen") nachladenAngestossen();
    });
    window.addEventListener(TERMINE_AKTUALISIERT_EVENT, nachladenAngestossen);

    return () => {
      lebt = false;
      if (timer !== undefined) window.clearTimeout(timer);
      unsubCache();
      window.removeEventListener(TERMINE_AKTUALISIERT_EVENT, nachladenAngestossen);
    };
  }, [kundeId, rueckblickTage]);

  if (termine.length === 0) return <MeetingVersandStatus kundeId={kundeId} />;

  const entferne = (key: string) => setTermine((prev) => prev.filter((t) => t.key !== key));

  const handleErschienen = async (t: ErgebnisTermin) => {
    setBeschaeftigt(t.key);
    const ok = await terminErschienen(t, kontext);
    setBeschaeftigt(null);
    if (ok) entferne(t.key);
  };

  const handleNoShow = async (t: ErgebnisTermin) => {
    setBeschaeftigt(t.key);
    const ok = await terminNoShow(t, kontext);
    setBeschaeftigt(null);
    if (ok) entferne(t.key);
  };

  /** Die Einladung noch einmal senden, falls der Kunde den Link nicht mehr findet. */
  const handleErneutSenden = async (t: ErgebnisTermin) => {
    if (!kundeEmail || !t.modus) return;
    setBeschaeftigt(t.key);
    // Einmalige Rückfrage „Deutsch oder English?“, falls noch nie gewählt (Plan Kundensprache 2.4).
    await stelleKundenspracheSicher(kundeId);
    const erfolg = await versendeMeetingEinladung({
      meetingId: t.aktivitaet?.id,
      kalenderUid: t.aktivitaet?.meetingKommunikation?.icsUid,
      kalenderSequenz: t.aktivitaet?.meetingRevision,
      kundeId,
      kundeName,
      kundeEmail,
      berater: beraterName || userName,
      // Die Kennung des zustaendigen Beraters, damit die Mail ihn nicht ueber
      // seinen Namen suchen muss. Sie steht am Kontakt und ist dieselbe
      // Quelle, aus der `beraterName` stammt.
      beraterId: beraterName
        ? cacheGetById<{ zustaendig_id?: string }>("kontakte", kundeId)?.zustaendig_id
        : undefined,
      titel: t.titel,
      datum: lokalesDatum(t.startAt),
      uhrzeit: lokaleUhrzeit(t.startAt),
      meetingLink: t.modus === "video" ? t.raumLink : undefined,
      dauerMinuten: t.dauerMinuten,
      modus: t.modus,
      treffpunkt: t.treffpunkt,
      kundeTelefon: t.modus === "telefon" ? kundeTelefon : undefined,
      // Eigener Schluessel je Stunde: Doppelklick-sicher, bewusstes erneutes
      // Senden bleibt moeglich.
      schluesselZusatz: `neu-${crypto.randomUUID()}`,
    });
    setBeschaeftigt(null);
    if (!erfolg) {
      toast({ title: "Die Einladung konnte nicht versendet werden", variant: "destructive" });
      return;
    }
    addAktivitaet({
      kundeId,
      art: "email",
      // Wie beim Erstversand: die Art des Termins gehoert in die Zeile, sonst
      // sehen alle drei Arten im Verlauf gleich aus.
      beschreibung: `Einladung ${t.modus === "vor_ort" ? "zum Vor-Ort-Termin" : t.modus === "telefon" ? "zum Telefontermin" : "zum Videogespräch"} erneut verschickt an ${kundeName}`,
      details: `An ${kundeEmail} · Termin: ${terminText(t.startAt)}`,
      von: userName,
    });
    toast({ title: "Einladung erneut gesendet ✓", description: `An ${kundeEmail}` });
  };

  /**
   * Loescht den Termin auf beiden Seiten: Bei Selbstbuchungen ueber die
   * Absage (raeumt Buchung, Raum und Termin serverseitig ab), bei von Hand
   * angelegten Meetings werden Raum beendet, Termin-Aktivitaet entfernt und
   * die zugehoerige Aufgabe abgehakt. Der Verlauf erhaelt einen Vermerk.
   */
  const handleLoeschen = async (t: ErgebnisTermin) => {
    // Nur ein Videogespraech hat einen Raum, der sich schliessen kann. Bei
    // "Vor Ort" und "Telefon" gibt es weder Zugangslink noch einen Eintrag in
    // "Meine Gespraeche"; der Satz versprach dort etwas, das gar nicht
    // existiert, und liess den Eindruck entstehen, es ginge noch etwas anderes
    // verloren als der Termin selbst.
    const istVideo = t.modus === "video";
    const bestaetigt = await confirmDialog({
      title: "Termin löschen?",
      description: istVideo
        ? `„${t.titel}" am ${terminText(t.startAt)} wird entfernt. Der Zugangslink funktioniert danach nicht mehr, und der Termin verschwindet auch aus „Meine Gespräche".`
        : `„${t.titel}" am ${terminText(t.startAt)} wird entfernt.`,
      confirmText: "Löschen",
      variant: "destructive",
    });
    if (!bestaetigt) return;
    setBeschaeftigt(t.key);
    let ok = true;
    if (t.quelle === "buchung" && t.buchung) {
      ok = (await setzeBuchungStatus(t.buchung.id, "abgesagt")).ok;
    } else if (t.aktivitaet) {
      ok = await loescheAktivitaet(t.aktivitaet.id);

    }
    setBeschaeftigt(null);
    if (!ok) { toast({ title: "Der Termin konnte nicht gelöscht werden", variant: "destructive" }); return; }

    /*
     * Die Folgeaufgabe aus einer Verschiebung mit abraeumen.
     *
     * Die Aufgabe ZUM TERMIN verschwindet von selbst, dafuer sorgt der
     * Fremdschluessel `aufgaben.meeting_aktivitaet_id` mit ON DELETE CASCADE.
     * Die Folgeaufgabe aus einer Verschiebung haengt aber nicht daran: Auf
     * dieser Spalte liegt ein eindeutiger Index, je Termin kann also nur EINE
     * Aufgabe verknuepft sein, und das ist die Terminaufgabe selbst.
     *
     * Sie blieb deshalb offen stehen und sagte "Bitte den Kunden vorher
     * erinnern und den Termin vorbereiten", zu einem Termin, den es nicht mehr
     * gibt. Eine leere Menge gueltiger Ausloeser heisst: alles zu diesem
     * Termin schliessen.
     *
     * Die No-Show-Aufgabe bleibt ausdruecklich stehen. Sie meint etwas
     * anderes, naemlich den Kunden neu zu kontaktieren, und das gilt weiter,
     * auch wenn der alte Termin verschwindet.
     */
    try {
      await schliesseErledigteAutomatikAufgaben(verschiebeAufgabenPraefix(t.key), new Set());
    } catch (fehler) {
      // Der Termin ist weg, das ist die Hauptsache. Eine liegengebliebene
      // Aufgabe laesst sich von Hand abhaken, ein Abbruch hier nicht.
      console.error("Folgeaufgabe zum verschobenen Termin nicht geschlossen:", fehler);
    }

    addAktivitaet({
      kundeId,
      art: "notiz",
      beschreibung: `🗑 Termin gelöscht: ${t.titel} am ${terminText(t.startAt)}`,
      von: userName,
    });
    entferne(t.key);
    toast({ title: "Termin gelöscht ✓" });
  };

  return (
    <>
      <MeetingVersandStatus kundeId={kundeId} />
      {termine.map((t) => {
        return (
          <Card key={t.key} className="p-4 border-primary/30">
            <div className="w-8 h-1 bg-primary mb-3" />
            <h3 className="font-bold mb-1">{t.titel}: Ergebnis</h3>
            <p className="text-xs text-muted-foreground mb-2">
              Termin: <strong>{terminText(t.startAt)}</strong>
              {t.gebuchtAm && <> · gebucht am {new Date(t.gebuchtAm).toLocaleDateString("de-DE")}</>}
              {t.dauerMinuten && <> · Dauer: <strong>{t.dauerMinuten} Minuten</strong></>}
              {t.investmentLabel && <> · Investment: <strong>{t.investmentLabel}</strong></>}
              {t.buchung?.begleitung?.name && <> · Begleitung: <strong>{t.buchung.begleitung.name}</strong></>}
              {t.modus === "vor_ort" && t.treffpunkt && <> · Treffpunkt: <strong>{t.treffpunkt}</strong></>}
              {t.modus === "telefon" && <> · Telefontermin</>}
            </p>
            {t.teilnehmer && (
              <p className="text-xs text-muted-foreground mb-1">
                Teilnehmer: <strong>{t.teilnehmer}</strong>
              </p>
            )}
            {(t.gaeste?.length || 0) > 0 && (
              <p className="text-xs text-muted-foreground mb-2">
                Gäste: <strong>{t.gaeste!.join(", ")}</strong>
              </p>
            )}

            {t.raumLink && (
              <div className="mb-3 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-xs">
                  {t.raumLink}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shrink-0 gap-1.5 text-xs"
                  onClick={() => {
                    void navigator.clipboard.writeText(t.raumLink!).then(
                      () => toast({ title: "Link kopiert ✓" }),
                      () => toast({ title: "Der Link konnte nicht kopiert werden", variant: "destructive" }),
                    );
                  }}
                >
                  <Copy className="h-3 w-3" /> Kopieren
                </Button>
              </div>
            )}

            {canSet && (
              /*
               * Umbruch statt fester Spalten: Die Kaesten stehen jetzt im
               * Kopfbereich, und dessen Breite haengt an der mittleren Spalte
               * des Profils, nicht am Fenster. Ein Raster mit
               * Tailwind-Haltepunkten haette dort fuenf Spalten auf 486 Pixel
               * gelegt und die Beschriftungen abgeschnitten.
               */
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-[hsl(var(--success))]/40 hover:bg-[hsl(var(--success))]/10 text-xs h-9"
                  // Seit 01.10.2026 jederzeit, auch vor dem Termin (Wunsch Christian).
                  disabled={beschaeftigt === t.key}
                  onClick={() => void handleErschienen(t)}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--success))]" /> Stattgefunden
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-destructive/40 hover:bg-destructive/10 text-xs h-9"
                  disabled={beschaeftigt === t.key}
                  onClick={() => void handleNoShow(t)}
                >
                  <XCircle className="h-3.5 w-3.5 text-destructive" /> Nicht erschienen
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-[hsl(var(--warning))]/40 hover:bg-[hsl(var(--warning))]/10 text-xs h-9"
                  disabled={beschaeftigt === t.key}
                  onClick={() => setVerschieben(t)}
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[hsl(var(--warning))]" /> Verschoben
                </Button>
                {kundeEmail && t.modus && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-9"
                    disabled={beschaeftigt === t.key}
                    title={`Einladung erneut an ${kundeEmail} senden`}
                    onClick={() => void handleErneutSenden(t)}
                  >
                    <Send className="h-3.5 w-3.5" /> Einladung erneut senden
                  </Button>
                )}
                {kundeEmail && t.modus && <KundenspracheHinweis kontaktId={kundeId} className="self-center" />}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-9 text-muted-foreground hover:text-destructive hover:border-destructive/40"
                  disabled={beschaeftigt === t.key}
                  title="Termin löschen"
                  onClick={() => void handleLoeschen(t)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Löschen
                </Button>
              </div>
            )}
          </Card>
        );
      })}

      {/* Verschieben laeuft ueber denselben Dialog wie in der Aktionsliste. */}
      <TerminErgebnisDialog
        termin={verschieben}
        kontext={kontext}
        startSchritt="verschieben"
        onClose={() => setVerschieben(null)}
      />
    </>
  );
}
