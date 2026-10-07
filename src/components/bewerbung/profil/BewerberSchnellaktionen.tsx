import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { CalendarClock, Video, BellRing, StickyNote, Phone, PhoneCall, PhoneMissed, PhoneOff } from "lucide-react";
import { cn, formatDatum } from "@/lib/utils";
import type { Bewerber, KontaktversuchErgebnis } from "@/lib/bewerbungStore";
import type { BewerberBuchungZeile } from "@/lib/bewerberTerminStore";
import { ClosingTerminKarte } from "../ClosingTerminKarte";
import { FollowUpCard } from "../FollowUpCard";
import "./bewerberprofil.css";

/**
 * Die fünf runden Knöpfe in der linken Spalte: Erstgespräch, Videocall,
 * Follow-up, Anrufen, Notiz.
 *
 * ## Warum hier kein zweites Terminformular entsteht
 *
 * Christian wollte drei Knöpfe, die je ein Fenster öffnen, „genau wie es heute
 * im Reiter Übersicht schon geht". Genau das steht hier: Die Fenster tragen
 * **die vorhandenen Karten**, `ClosingTerminKarte` und `FollowUpCard`,
 * unverändert. Sie speichern weiter über dieselben Felder, setzen dieselben
 * Stufenwechsel und zeigen dieselben Hinweise wie bisher.
 *
 * Ein eigenes Formular nachzubauen wäre der teure Weg gewesen: Die
 * Videocall-Karte entscheidet zwischen selbst gebuchtem und von Hand
 * gepflegtem Termin, setzt die Erinnerungen zurück und springt bei Bedarf in
 * die Stufe Closing. Ein zweites Formular hätte das alles noch einmal wissen
 * müssen, und beim nächsten Mal hätte jemand nur eines von beiden geändert.
 *
 * Das Erstgespräch hat keine eigene Karte; es war im Reiter Übersicht ein
 * schlichtes Feld für Datum, Uhrzeit und Vertriebspartner. Diese drei Felder
 * stehen deshalb hier, mit demselben Speicherweg (`onFeld`) wie zuvor,
 * einschliesslich des automatischen Sprungs vom Eingang ins Erstgespräch.
 */

/**
 * Ein rundes, farbiges Sinnbild mit seinem Wort darunter.
 *
 * Aufbau und Masse sind dieselben wie in
 * `components/kunden/profil/KundenprofilAktionsleiste.tsx`: 40 Pixel Kreis,
 * gedämpfte Farbfläche mit kräftiger Schrift darin, das Wort in 10 Pixel
 * darunter. Christian hat am 17.09.2026 ausdrücklich diese Darstellung auch
 * hier bestellt.
 *
 * Die Farbe ist nie der einzige Träger der Aussage: Das Wort steht immer
 * daneben, und das `aria-label` nennt die Aktion als ganzen Satz, samt
 * stehendem Termin. Anders als im Kundenprofil bleibt der Tooltip erhalten,
 * denn hier trägt er eine Auskunft, die sonst nirgends steht.
 */
function Schnellaktion({
  titel,
  hilfe,
  gesetzt,
  farbe,
  icon,
  onClick,
}: {
  titel: string;
  hilfe: string;
  gesetzt: boolean;
  /** Farbklassen des Kreises, aus dem Farbvorrat des Projekts. */
  farbe: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <div className="bewerberprofil-schnellaktion" data-gesetzt={gesetzt ? "ja" : "nein"}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" aria-label={hilfe} onClick={onClick}>
            <span aria-hidden="true" className={cn("bewerberprofil-schnellaktion-kreis", farbe)}>
              {icon}
            </span>
            <span className="bewerberprofil-schnellaktion-wort">{titel}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[240px] text-xs">{hilfe}</TooltipContent>
      </Tooltip>
    </div>
  );
}

export function BewerberSchnellaktionen({
  b,
  canEdit,
  beraterName,
  beraterEmail,
  autorId,
  gebuchterTermin,
  abgesagterTermin,
  videocallZusatz,
  onFeld,
  onFollowUp,
  onNotiz,
  onAnruf,
  onRefresh,
}: {
  b: Bewerber;
  canEdit: boolean;
  beraterName: string;
  beraterEmail: string;
  autorId: string;
  gebuchterTermin?: BewerberBuchungZeile | null;
  abgesagterTermin?: BewerberBuchungZeile | null;
  /**
   * Was unter dem Videocall-Termin in derselben Karte steht.
   *
   * Heute ist das der Onboarding-Termin. Er stand bisher dort und soll dort
   * bleiben: Wer den Videocall ansieht, will auch wissen, ob der Termin
   * danach schon steht.
   */
  videocallZusatz?: ReactNode;
  /** Speichert ein einzelnes Feld am Bewerber, wie im Reiter Übersicht. */
  onFeld: (feld: keyof Bewerber, wert: string) => void;
  /** Speichert das Follow-up, samt Stufenwechsel. */
  onFollowUp: (patch: Partial<Bewerber>) => void;
  /**
   * Öffnet das Fenster zum Schreiben einer Notiz.
   *
   * Das Fenster selbst steht ausdrücklich **nicht** hier, sondern als
   * `BewerberNotizDialog` beim Aufrufer. Es gibt zwei Wege hinein, diesen
   * Knopf und den Knopf im Reiter „Notizen" rechts, und beide sollen dasselbe
   * Fenster öffnen. Zwei Fenster mit je eigenem Textfeld wären der Anfang
   * zweier verschiedener Antworten auf dieselbe Frage.
   *
   * Fehlt die Funktion, fehlt auch der Knopf.
   */
  onNotiz?: () => void;
  /**
   * Das Ergebnis eines Telefonats festhalten, samt Notiz dazu.
   *
   * Die Wirkung liegt ausdrücklich **nicht** hier, sondern beim Aufrufer in
   * `logKontaktversuch` und `addNotizEntry`. Dieselben beiden Wege hat der
   * Kasten „Telefonischer Kontakt" im Reiter Übersicht schon immer benutzt;
   * ein zweiter Weg hätte bedeutet, dass „nicht erreicht" an zwei Stellen
   * verschieden zählt. Fehlt die Funktion, fehlt auch der Knopf.
   */
  onAnruf?: (ergebnis: KontaktversuchErgebnis, notiz: string) => Promise<void> | void;
  onRefresh: () => void;
}) {
  const [offen, setOffen] = useState<"" | "erstgespraech" | "videocall" | "followup" | "anruf">("");
  const schliessen = () => setOffen("");
  /** Text und Laufzustand des Anruffensters. */
  const [anrufNotiz, setAnrufNotiz] = useState("");
  const [anrufLaeuft, setAnrufLaeuft] = useState(false);

  const erstgespraechSteht = !!b.erstgespraechDatum;
  const videocallSteht = !!gebuchterTermin || !!b.closingTerminDatum;
  const followUpSteht = !!b.followUpDatum;
  const notizenAnzahl = (b.notizenLog || []).length;
  const anrufe = (b.kontaktversuche || []).length;
  const abgeschlossen = b.status === "Abgelehnt" || b.status === "KeinInteresse";

  /** Ein Ergebnis festhalten und das Fenster schliessen. */
  const anrufFesthalten = async (ergebnis: KontaktversuchErgebnis) => {
    if (!onAnruf || anrufLaeuft) return;
    setAnrufLaeuft(true);
    try {
      await onAnruf(ergebnis, anrufNotiz.trim());
      setAnrufNotiz("");
      schliessen();
    } finally {
      setAnrufLaeuft(false);
    }
  };

  return (
    <>
      {/*
        Zwei Zeilen statt einer Reihe: oben die beiden Knoepfe, die man im
        Alltag am haeufigsten braucht, darunter die drei Termine. Christian
        hat die Anordnung so festgelegt. Beide Zeilen stehen linksbuendig an
        derselben Kante, buendig mit den Kontaktdaten darunter.
      */}
      <div className="bewerberprofil-schnellaktionen-block">
        <div className="bewerberprofil-schnellaktionen">
        {onAnruf && (
          <Schnellaktion
            titel="Anrufen"
            hilfe={
              abgeschlossen
                ? "Der Bewerber ist abgeschlossen, weitere Anrufe werden nicht mehr protokolliert"
                : anrufe > 0
                  ? `Ergebnis eines Telefonats festhalten, ${anrufe} bereits notiert`
                  : "Ergebnis eines Telefonats festhalten"
            }
            gesetzt={anrufe > 0}
            farbe="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
            icon={<Phone className="h-4 w-4" />}
            onClick={() => setOffen("anruf")}
          />
        )}
        {onNotiz && (
          <Schnellaktion
            titel="Notiz"
            hilfe={
              notizenAnzahl > 0
                ? `Notiz zu diesem Bewerber schreiben, ${notizenAnzahl} bereits vorhanden`
                : "Notiz zu diesem Bewerber schreiben"
            }
            gesetzt={notizenAnzahl > 0}
            farbe="bg-primary/15 text-primary"
            icon={<StickyNote className="h-4 w-4" />}
            onClick={onNotiz}
          />
        )}
        </div>
        <div className="bewerberprofil-schnellaktionen">
        <Schnellaktion
          titel="Erstgespräch"
          hilfe={
            erstgespraechSteht
              ? `Erstgespräch am ${formatDatum(b.erstgespraechDatum)}${b.erstgespraechUhrzeit ? ` um ${b.erstgespraechUhrzeit} Uhr` : ""}`
              : "Erstgesprächstermin eintragen"
          }
          gesetzt={erstgespraechSteht}
          /*
           * Die vier Farben kommen aus dem Vorrat der Kundenprofil-Leiste.
           * Termine sind blau bis violett, die Notiz trägt wie dort das
           * Projektblau. Der dunklere Ton steht für hellen Grund, der hellere
           * für den Dunkelmodus, sonst reicht der Kontrast nicht für ein
           * Sinnbild, das eine Bedeutung trägt.
           */
          farbe="bg-sky-500/15 text-sky-700 dark:text-sky-400"
          icon={<CalendarClock className="h-4 w-4" />}
          onClick={() => setOffen("erstgespraech")}
        />
        <Schnellaktion
          titel="Videocall"
          hilfe={
            videocallSteht
              ? `Videocall am ${formatDatum(gebuchterTermin ? gebuchterTermin.startAt : b.closingTerminDatum)}`
              : "Videocall-Termin eintragen"
          }
          gesetzt={videocallSteht}
          farbe="bg-indigo-500/15 text-indigo-700 dark:text-indigo-400"
          icon={<Video className="h-4 w-4" />}
          onClick={() => setOffen("videocall")}
        />
        <Schnellaktion
          titel="Follow-up"
          hilfe={
            followUpSteht
              ? `Follow-up am ${formatDatum(b.followUpDatum)}${b.followUpUhrzeit ? ` um ${b.followUpUhrzeit} Uhr` : ""}`
              : "Follow-up setzen"
          }
          gesetzt={followUpSteht}
          farbe="bg-violet-500/15 text-violet-700 dark:text-violet-400"
          icon={<BellRing className="h-4 w-4" />}
          onClick={() => setOffen("followup")}
        />
        </div>
      </div>

      {/* ── Erstgespräch ────────────────────────────────────────────── */}
      <Dialog open={offen === "erstgespraech"} onOpenChange={(o) => { if (!o) schliessen(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Erstgesprächstermin</DialogTitle>
            <DialogDescription>
              Datum und Uhrzeit des Erstgesprächs. Steht der Bewerber noch im Eingang, rückt er mit
              dem gesetzten Termin in die Stufe Erstgespräch.
            </DialogDescription>
          </DialogHeader>
          {canEdit ? (
            <div className="space-y-3">
              <div>
                <Label className="text-[10px]">Datum (TT.MM.JJJJ)</Label>
                <DateInput
                  value={b.erstgespraechDatum || ""}
                  onChange={(v) => onFeld("erstgespraechDatum" as keyof Bewerber, v)}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px]">Uhrzeit</Label>
                  <Input
                    type="time"
                    aria-label="Uhrzeit des Erstgesprächs"
                    value={b.erstgespraechUhrzeit || ""}
                    onChange={(e) => onFeld("erstgespraechUhrzeit" as keyof Bewerber, e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-[10px]">Vertriebspartner</Label>
                  <Input
                    aria-label="Vertriebspartner im Erstgespräch"
                    value={b.erstgespraechBerater || beraterName}
                    onChange={(e) => onFeld("erstgespraechBerater" as keyof Bewerber, e.target.value)}
                    placeholder="Name"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="button" size="sm" onClick={schliessen}>Fertig</Button>
              </div>
            </div>
          ) : (
            <p className="text-sm font-semibold">
              📅 {formatDatum(b.erstgespraechDatum)}
              {b.erstgespraechUhrzeit && ` · ${b.erstgespraechUhrzeit} Uhr`}
              {b.erstgespraechBerater && ` · mit ${b.erstgespraechBerater}`}
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Videocall ───────────────────────────────────────────────── */}
      <Dialog open={offen === "videocall"} onOpenChange={(o) => { if (!o) schliessen(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Videocall-Termin</DialogTitle>
            <DialogDescription>
              Hat der Bewerber selbst gebucht, steht der Termin hier und lässt sich nicht von Hand
              überschreiben. Sonst trägst Du ihn ein.
            </DialogDescription>
          </DialogHeader>
          <ClosingTerminKarte
            b={b}
            canEdit={canEdit}
            beraterName={beraterName}
            beraterEmail={beraterEmail}
            autorId={autorId}
            onRefresh={onRefresh}
            gebuchterTermin={gebuchterTermin}
            abgesagterTermin={abgesagterTermin}
          >
            {videocallZusatz}
          </ClosingTerminKarte>
        </DialogContent>
      </Dialog>

      {/* ── Anrufen ─────────────────────────────────────────────────── */}
      <Dialog open={offen === "anruf"} onOpenChange={(o) => { if (!o) schliessen(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Telefonat festhalten</DialogTitle>
            <DialogDescription>
              Wähle aus, wie das Gespräch ausgegangen ist. Die Notiz ist freiwillig und steht
              anschliessend rechts im Reiter „Notizen".
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Textarea
              aria-label="Notiz zum Telefonat"
              value={anrufNotiz}
              onChange={(e) => setAnrufNotiz(e.target.value)}
              placeholder="Was war das Ergebnis? (freiwillig)"
              className="min-h-[90px] text-sm"
            />

            {abgeschlossen ? (
              <p className="text-xs text-muted-foreground">
                Der Bewerber steht auf „{b.status === "Abgelehnt" ? "Abgelehnt" : "Kein Interesse"}".
                Weitere Kontaktversuche werden nicht mehr protokolliert.
              </p>
            ) : (
              <div className="grid gap-2">
                {/*
                  Drei Ergebnisse, jedes mit dem Satz darunter, der sagt, was der
                  Klick wirklich auslöst. Die Wirkung von „nicht erreicht" und
                  „kein Interesse" ist unverändert die des Kastens im Reiter
                  Übersicht.
                */}
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  disabled={anrufLaeuft}
                  onClick={() => void anrufFesthalten("erreicht")}
                >
                  <PhoneCall className="mr-2 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    <span className="block text-sm font-semibold">Erreicht</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Notiert den Anruf. Keine Mail, keine Stufenänderung. Der Bewerber steht wieder
                      im Eingang, falls er nach einem erfolglosen Versuch ausgeblendet war.
                    </span>
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  disabled={anrufLaeuft}
                  onClick={() => void anrufFesthalten("nicht_erreicht")}
                >
                  <PhoneMissed className="mr-2 h-4 w-4 shrink-0 text-orange-500" />
                  <span>
                    <span className="block text-sm font-semibold">Nicht erreicht</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Zählt den Versuch und schickt die nächste Mail „Wir haben dich nicht erreicht",
                      höchstens fünfmal. Zwischen zwei Versuchen liegen mindestens vier Stunden, ab
                      dem vierten ein Tag. Die Stufe ändert sich nie von allein.
                    </span>
                  </span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-auto justify-start whitespace-normal py-2 text-left"
                  disabled={anrufLaeuft}
                  onClick={() => void anrufFesthalten("kein_interesse")}
                >
                  <PhoneOff className="mr-2 h-4 w-4 shrink-0 text-destructive" />
                  <span>
                    <span className="block text-sm font-semibold">Kein Interesse</span>
                    <span className="block text-[11px] text-muted-foreground">
                      Setzt die Stufe auf „Kein Interesse". Der Bewerber verlässt die laufende
                      Pipeline, weitere Kontaktversuche sind gesperrt. An ihn geht keine Mail.
                    </span>
                  </span>
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Follow-up ───────────────────────────────────────────────── */}
      <Dialog open={offen === "followup"} onOpenChange={(o) => { if (!o) schliessen(); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Follow-up</DialogTitle>
            <DialogDescription>
              Ein gesetztes Follow-up erscheint am gewählten Tag in der Inbox.
            </DialogDescription>
          </DialogHeader>
          <FollowUpCard b={b} canEdit={canEdit} onSave={onFollowUp} />
        </DialogContent>
      </Dialog>
    </>
  );
}
