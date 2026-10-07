import { useEffect, useState } from "react";
import { CalendarClock, Check, Loader2, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { toast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { changeBewerberStatus, updateBewerber, type Bewerber } from "@/lib/bewerbungStore";
import { TERMIN_ZEITZONE } from "@/lib/bewerberTermine";
import {
  leseKooperationsEinladung,
  sendeKooperationsEinladung,
  vermerkeKooperationsEinladung,
} from "@/lib/bewerberEinladung";
import { MailOeffnungBadge } from "@/components/bewerbung/MailOeffnungBadge";
import { MAIL_KOOPERATION } from "@/lib/bewerberMailTracking";

/**
 * Die Einladung zur Terminbuchung, im Reiter Videocall.
 *
 * ## Welche Mail das ist, und welche nicht
 *
 * Im Bewerberprozess gehen zwei verschiedene Mails hinaus, und sie werden
 * leicht verwechselt:
 *
 *   1. Die **Eingangsmail** mit dem Kennenlernbogen. Sie geht automatisch
 *      hinaus, sobald eine Bewerbung eingeht, und lässt sich in der Übersicht
 *      erneut verschicken.
 *   2. Die **Einladung zur Terminbuchung**, um die es hier geht. Sie geht
 *      erst hinaus, wenn wir den ausgefüllten Bogen gelesen und uns für ein
 *      Gespräch entschieden haben. Der Bewerber sucht sich darin Tag und
 *      Uhrzeit selbst aus.
 *
 * Diese Karte verschickt ausschließlich die zweite.
 *
 * ## Warum sie an zwei Stellen steht
 *
 * Dieselbe Einladung gibt es auch in der Kennenlernen-Karte der Übersicht,
 * dort neben den Antworten, auf die sich die Entscheidung stützt. Gearbeitet
 * wird aber im Reiter Videocall, und dort fehlte sie. Beide Stellen rufen
 * dieselbe Funktion `sendeKooperationsEinladung` auf und lesen denselben
 * Vermerk am Bewerber; ein zweiter Versandweg entsteht dadurch nicht, und der
 * Stand kann zwischen beiden nicht auseinanderlaufen.
 */

/** Datum und Uhrzeit in deutscher Zeit, wie überall im Bewerberprozess. */
function zeitpunkt(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const tag = d.toLocaleDateString("de-DE", { timeZone: TERMIN_ZEITZONE });
  const zeit = d.toLocaleTimeString("de-DE", {
    timeZone: TERMIN_ZEITZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${tag} um ${zeit} Uhr`;
}

export function GespraechEinladung({
  bewerber,
  buchungsToken,
  canEdit,
  terminAm,
  onRefresh,
}: {
  bewerber: Bewerber;
  /**
   * Token der eingereichten Kennenlernzeile. Ohne es führt der Knopf in der
   * Mail auf eine Buchungsseite, die sagt „sobald deine Angaben bei uns sind".
   */
  buchungsToken: string;
  canEdit: boolean;
  /** Wann der Bewerber gebucht hat, falls er es schon getan hat. */
  terminAm?: string | null;
  /** Nach dem Speichern des Termins die Akte neu lesen. */
  onRefresh?: () => void;
}) {
  const [laedt, setLaedt] = useState(false);
  const [eingeladenAm, setEingeladenAm] = useState(() => leseKooperationsEinladung(bewerber.id));
  // Nach einem Versand die Öffnungen neu holen, sonst steht dort der Stand von
  // davor. Ein Zähler genügt, die Komponente daneben hört darauf.
  const [versandRunde, setVersandRunde] = useState(0);
  const gebucht = zeitpunkt(terminAm);

  /*
    Der Termin von Hand, seit dem 21.09.2026.

    Vereinbart wird über Calendly, und Calendly meldet uns nichts zurück. Die
    HR-Managerin trägt Datum und Uhrzeit deshalb hier ein, an derselben Stelle,
    an der sie eingeladen hat.

    Lokal gehalten und erst auf Knopfdruck gespeichert, nicht bei jedem
    Tastendruck: Ein halb getipptes Datum wäre ein Termin, der im Profil
    auftaucht und in den Erinnerungen an den Bewerber landet.
  */
  const [datum, setDatum] = useState(bewerber.erstgespraechDatum || "");
  const [uhrzeit, setUhrzeit] = useState(bewerber.erstgespraechUhrzeit || "");
  const [speichert, setSpeichert] = useState(false);

  // Kommt der Stand von außen neu herein, etwa nach einem Neuladen der Akte,
  // gewinnt er. Sonst stünde hier der Stand vom Öffnen der Seite.
  useEffect(() => {
    setDatum(bewerber.erstgespraechDatum || "");
    setUhrzeit(bewerber.erstgespraechUhrzeit || "");
  }, [bewerber.erstgespraechDatum, bewerber.erstgespraechUhrzeit]);

  const vomBewerber = bewerber.erstgespraechQuelle === "bewerber" && !!bewerber.erstgespraechDatum;
  const bestaetigtAm = bewerber.erstgespraechBestaetigtAm || "";

  const terminGeaendert =
    datum !== (bewerber.erstgespraechDatum || "") || uhrzeit !== (bewerber.erstgespraechUhrzeit || "");

  const terminSpeichern = async () => {
    if (!canEdit || speichert) return;
    if (datum && !uhrzeit) {
      toast({
        title: "Uhrzeit fehlt",
        description: "Ohne Uhrzeit steht der Termin im Profil ohne Zeit, und die Erinnerungen gehen zur falschen Stunde hinaus.",
        variant: "destructive",
      });
      return;
    }
    setSpeichert(true);
    try {
      /*
        Beide Werte in einem Aufruf. Zwei einzelne Aufrufe wären zwei
        Speichervorgänge, und zwischen ihnen stünde am Bewerber ein Datum ohne
        Uhrzeit.
      */
      await updateBewerber(bewerber.id, {
        erstgespraechDatum: datum,
        erstgespraechUhrzeit: uhrzeit,
      });
      // Dieselbe Automatik wie in den Schnellaktionen: Mit gesetztem Termin
      // gehört der Bewerber nicht mehr in den Eingang.
      if (datum && uhrzeit && bewerber.status === "Eingang") {
        changeBewerberStatus(bewerber.id, "Erstgespraech");
      }
      onRefresh?.();
      toast({
        title: datum ? "Termin gespeichert" : "Termin entfernt",
        description: datum
          ? "Er steht jetzt oben im Profil unter Nächster Termin."
          : "Im Profil steht wieder kein Termin.",
      });
    } catch (e) {
      toast({
        title: "Termin nicht gespeichert",
        description: e instanceof Error ? e.message : "Ohne nähere Meldung.",
        variant: "destructive",
      });
    } finally {
      setSpeichert(false);
    }
  };

  const einladen = async () => {
    if (!canEdit || laedt) return;
    if (!bewerber.email) {
      toast({
        title: "Keine Mailadresse",
        description: "Ohne Adresse geht nichts hinaus.",
        variant: "destructive",
      });
      return;
    }
    if (!buchungsToken) {
      toast({
        title: "Kein Buchungslink möglich",
        description:
          "Zu diesem Bewerber liegt kein eingereichter Kennenlernbogen vor. Eingeladen wird, " +
          "wessen Antworten uns gefallen haben. Zuerst das Kennenlernen verschicken und abwarten.",
        variant: "destructive",
      });
      return;
    }

    const ok = await confirmDialog({
      title: eingeladenAm ? "Einladung noch einmal schicken?" : "Zum persönlichen Gespräch einladen?",
      description:
        `${bewerber.vorname || "Der Bewerber"} bekommt eine Mail mit dem Buchungslink. ` +
        (eingeladenAm
          ? "Der Knopf führt nach Calendly. Ein dort bereits gebuchter Termin bleibt bestehen."
          : "Er sucht sich Tag und Uhrzeit in Calendly selbst aus."),
      confirmText: eingeladenAm ? "Noch einmal einladen" : "Jetzt einladen",
      cancelText: "Nicht einladen",
    });
    if (!ok) return;

    setLaedt(true);
    try {
      const ergebnis = await sendeKooperationsEinladung(bewerber, buchungsToken);
      if (!ergebnis.ok) {
        toast({
          title: "Einladung nicht verschickt",
          description: ergebnis.grund || "Ohne nähere Meldung.",
          variant: "destructive",
        });
        return;
      }
      const jetzt = new Date().toISOString();
      // Der Vermerk darf den Versand nicht nachträglich verderben: Die Mail
      // ist hinaus, ob wir sie notieren können oder nicht.
      try {
        await vermerkeKooperationsEinladung(bewerber.id, jetzt);
      } catch (e) {
        console.error("[bewerberprozess] Einladung konnte nicht vermerkt werden", e);
      }
      setEingeladenAm(jetzt);
      setVersandRunde((r) => r + 1);
      toast({
        title: "Einladung ist raus",
        description: `${bewerber.vorname || "Der Bewerber"} kann sich jetzt seine Zeit aussuchen.`,
      });
    } finally {
      setLaedt(false);
    }
  };

  return (
    <Card className="p-4 space-y-2.5" data-testid="gespraech-einladung">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold">Einladung zur Terminbuchung</p>
        {gebucht ? (
          <Badge className="bg-green-600 text-white text-[10px] hover:bg-green-600">Termin steht</Badge>
        ) : eingeladenAm ? (
          <Badge variant="outline" className="text-[10px]">Eingeladen, noch kein Termin</Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] text-muted-foreground">Noch nicht eingeladen</Badge>
        )}
        {/*
          Ob die Einladung geöffnet wurde. Steht neben dem Stand und nicht
          darunter, denn es beantwortet dieselbe Frage: Ist bei ihm etwas
          angekommen? Vor dem Versand zeigt die Anzeige nichts.
        */}
        <MailOeffnungBadge
          bewerberId={bewerber.id}
          kind={MAIL_KOOPERATION}
          gesendetAm={eingeladenAm}
          neuLaden={versandRunde}
        />
      </div>

      {/*
        Die beiden Zeitstempel stehen bewusst untereinander und nicht als
        Fließtext: Wer die Akte öffnet, will auf einen Blick sehen, ob die
        Einladung hinaus ist und ob daraufhin etwas passiert ist.
      */}
      <div className="space-y-1 text-[11px] leading-relaxed text-muted-foreground">
        <p>
          {eingeladenAm
            ? `Einladung verschickt am ${zeitpunkt(eingeladenAm)}.`
            : "Noch keine Einladung verschickt. Sie geht erst hinaus, wenn ihr euch nach dem Bogen für ein Gespräch entschieden habt."}
        </p>
        {gebucht ? (
          <p className="font-medium text-foreground">Termin gebucht am {gebucht}.</p>
        ) : eingeladenAm ? (
          <p>Er hat sich noch keine Zeit ausgesucht.</p>
        ) : null}
      </div>

      {canEdit && (
        <Button size="sm" variant="brand" onClick={einladen} disabled={laedt || !bewerber.email}>
          {laedt ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Mail className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          )}
          {eingeladenAm ? "Einladung noch einmal schicken" : "Zum persönlichen Gespräch einladen"}
        </Button>
      )}

      {canEdit && !bewerber.email && (
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Ohne Mailadresse lässt sich nicht einladen.
        </p>
      )}

      {/*
        Der Termin von Hand. Er steht hier und nicht in den Schnellaktionen,
        weil hier eingeladen wird: Wer die Einladung verschickt hat, trägt kurz
        darauf den Termin ein, den der Bewerber sich ausgesucht hat.
      */}
      {canEdit && (
        <div className="space-y-2 rounded-lg border bg-muted/30 p-3" data-testid="kennenlerntermin-eingabe">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold">
            <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            Gebuchten Termin eintragen
          </p>
          {/*
            Der Normalfall ist seit dem 21.09.2026, dass der Bewerber die Zeit
            nach seiner Buchung selbst bestätigt. Sarah sieht hier, ob er das
            getan hat, und muss nur eingreifen, wenn er es vergessen hat.
          */}
          {vomBewerber ? (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-[hsl(var(--success))]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>
                Vom Bewerber selbst bestätigt
                {bestaetigtAm ? `, am ${zeitpunkt(bestaetigtAm)}` : ""}. Du musst nichts eintragen.
                Stimmt die Zeit nicht, kannst du sie hier überschreiben.
              </span>
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Der Bewerber sucht sich die Zeit im Kalender aus und bestätigt sie danach selbst. Hat
              er das nicht getan, trag sie hier ein. Dann steht sie oben im Profil unter Nächste
              Aktion und Nächster Termin.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">Datum</Label>
              <DateInput ariaLabel="Datum des Kennenlerngesprächs" value={datum} onChange={setDatum} />
            </div>
            <div>
              <Label className="text-[10px]">Uhrzeit</Label>
              <Input
                type="time"
                aria-label="Uhrzeit des Kennenlerngesprächs"
                value={uhrzeit}
                onChange={(e) => setUhrzeit(e.target.value)}
              />
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={terminSpeichern}
            disabled={speichert || !terminGeaendert}
          >
            {speichert && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />}
            Termin speichern
          </Button>
        </div>
      )}
    </Card>
  );
}
