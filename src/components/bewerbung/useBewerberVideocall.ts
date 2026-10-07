/**
 * Der Stand des Bewerber-Videocalls, für die Präsentation und für die
 * Moderation.
 *
 * Beide Fenster brauchen dasselbe: die Antworten aus dem Kennenlernen, die
 * daraus gebauten Folien und den Gesprächsstand der HR-Managerin. Deshalb
 * steht das Laden hier an einer Stelle und nicht zweimal.
 *
 * Zwei Quellen, beide vorhanden:
 *   - Die Antworten liegen in `bewerber_formular`, derselben Tabelle wie der
 *     alte Vorabbogen. Erkennungsmerkmal ist der gewählte Weg
 *     (`istKennenlernen`). Ohne Weg gibt es keine Folien, und das ist richtig
 *     so: Ohne ausgefülltes Kennenlernen lässt sich weder die Dauer noch die
 *     Modulauswahl bestimmen.
 *   - Der Gesprächsstand liegt im vorhandenen `erstgespraechSkript` des
 *     Bewerbers, unter dem Schlüssel `bewerberVideocall`. Damit braucht der
 *     neue Ablauf keine Migration und kann am bestehenden nichts verstellen.
 *
 * Gespeichert wird wie im bestehenden Erstgespräch zweistufig: sofort in den
 * LocalStorage als Reload-Schutz, verzögert über `updateBewerber` in die
 * Datenbank.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  changeBewerberStatus,
  updateBewerber,
  type Bewerber,
  type ErstgespraechSkript,
} from "@/lib/bewerbungStore";
import { sendeBewerberAbsageMail } from "@/lib/bewerberAbsageMail";
import { ladeBewerberBuchungen, type BewerberBuchungZeile } from "@/lib/bewerberTerminStore";
import { gemeinsamerLauf, gemerkterStand, merkeStand } from "./nachladeSpeicher";
import { istKennenlernen, type KennenlernenAntworten } from "@/lib/bewerberKennenlernen";
import { followUpStatusZiel } from "@/lib/closingDirektSkript";
import { sendeStartfahrplan } from "@/lib/startfahrplanVersand";
import {
  UNTERLAGEN_NOTIZ_VORGABE,
  abschlussWirkung,
  eingereichteKennenlernZeile,
  kennenlernBefund,
  sendetStartfahrplan,
  videocallFolien,
  zusatzModule,
  type KennenlernBefund,
  type KennenlernZeileRoh,
  type VideocallErfassung,
  type VideocallFolie,
} from "@/lib/bewerberVideocall";

/** Der Schlüssel des LocalStorage-Entwurfs je Bewerber. */
export function videocallDraftKey(bewerberId: string): string {
  return `bewerber_videocall_draft_${bewerberId}`;
}

function leseDraft(key: string): VideocallErfassung | null {
  try {
    const roh = localStorage.getItem(key);
    return roh ? (JSON.parse(roh) as VideocallErfassung) : null;
  } catch {
    return null;
  }
}

/**
 * Wie viele Zeilen aus `bewerber_formular` geholt werden.
 *
 * Nicht mehr nur eine: Zu einem Bewerber kann es mehrere Zeilen geben, eine je
 * verschickter Einladung. Nach einer erneuten Einladung ist die jüngste Zeile
 * eine leere Einladung, und genau daran ist die Prüfung bisher gescheitert.
 * Acht deckt jede realistische Zahl an Einladungen ab und kostet nichts.
 */
const FORMULAR_ZEILEN = 8;

/**
 * Die Antworten des Kennenlernens zu einem Bewerber.
 *
 * Maßgeblich ist die jüngste **eingereichte** Zeile mit gewähltem Weg, nicht
 * die jüngste überhaupt (`eingereichteKennenlernZeile`). Verträgt eine
 * fehlende Tabelle und einen alten Vorabbogen: In beiden Fällen bleibt es bei
 * null, und die Oberfläche sagt, dass kein Kennenlernen vorliegt.
 */
export function useKennenlernenAntworten(bewerberId: string, vorname = ""): {
  antworten: KennenlernenAntworten | null;
  /** Wann der Bogen eingereicht wurde, als ISO-Zeitpunkt. Leer ohne Bogen. */
  eingereichtAm: string;
  /**
   * Das Token der eingereichten Zeile, fuer die Einladung zur Terminbuchung.
   * Leer, solange kein Kennenlernbogen vorliegt; dann fuehrte der Knopf in der
   * Mail auf eine Buchungsseite, die sagt "sobald deine Angaben bei uns sind".
   */
  buchungsToken: string;
  geladen: boolean;
  /**
   * Warum kein Bogen vorliegt, aus denselben Zeilen abgeleitet. Ohne
   * zusätzliche Abfrage: Was hier steht, steht in `data` ohnehin schon.
   */
  befund: KennenlernBefund;
} {
  const [stand, setStand] = useState<{
    antworten: KennenlernenAntworten | null;
    eingereichtAm: string;
    geladen: boolean;
    /** Token der eingereichten Zeile, fuer die Einladung zur Terminbuchung. */
    buchungsToken: string;
    zeilen: KennenlernZeileRoh[];
  }>({ antworten: null, eingereichtAm: "", buchungsToken: "", geladen: false, zeilen: [] });

  useEffect(() => {
    if (!bewerberId) {
      setStand({ antworten: null, eingereichtAm: "", buchungsToken: "", geladen: true, zeilen: [] });
      return;
    }
    let abgebrochen = false;
    void (async () => {
      try {
        const { data } = await supabase
          .from("bewerber_formular")
          .select("status, antworten, created_at, expires_at, token")
          .eq("bewerbung_id", bewerberId)
          .order("created_at", { ascending: false })
          .limit(FORMULAR_ZEILEN);
        if (abgebrochen) return;
        const zeilen = (data ?? []) as KennenlernZeileRoh[];
        const zeile = eingereichteKennenlernZeile(zeilen);
        const antworten = (zeile?.antworten ?? {}) as KennenlernenAntworten;
        const passt = istKennenlernen(antworten);
        setStand({
          antworten: passt ? antworten : null,
          eingereichtAm: passt ? String(zeile?.created_at ?? "") : "",
          buchungsToken: passt ? String(zeile?.token ?? "") : "",
          geladen: true,
          zeilen,
        });
      } catch {
        if (!abgebrochen) setStand({ antworten: null, eingereichtAm: "", buchungsToken: "", geladen: true, zeilen: [] });
      }
    })();
    return () => { abgebrochen = true; };
  }, [bewerberId]);

  const befund = useMemo(
    () => kennenlernBefund(stand.zeilen, vorname, stand.geladen),
    [stand.zeilen, stand.geladen, vorname],
  );

  return {
    antworten: stand.antworten,
    eingereichtAm: stand.eingereichtAm,
    buchungsToken: stand.buchungsToken,
    geladen: stand.geladen,
    befund,
  };
}

/**
 * Der selbst gebuchte Termin dieses Bewerbers, samt Weg in den Videoraum.
 *
 * Er stand bisher nur in der Kennenlernen-Karte der Übersicht. Im Reiter, in
 * dem das Gespräch geführt wird, fehlte er, und das Closing verwies stattdessen
 * auf einen Termin, den in diesem Ablauf niemand von Hand setzt.
 *
 * Ausdrücklich nur der **stehende** Termin: `ladeBewerberBuchungen` liefert
 * seit dem 16.09.2026 auch abgesagte, damit die Liste ein Abzeichen dafür
 * zeigen kann. Hier wäre ein abgesagter Termin falsch, denn an ihm hängen der
 * Knopf in den Videoraum und die Ansage, wann das Gespräch stattfindet.
 */
export function useSelbstGebuchterTermin(bewerberId: string): BewerberBuchungZeile | null {
  const [termin, setTermin] = useState<BewerberBuchungZeile | null>(null);
  useEffect(() => {
    // Zuerst leeren: Sonst trüge die nächste Akte für einen Augenblick den
    // Termin der vorigen, bis die Abfrage zurückkommt.
    setTermin(null);
    if (!bewerberId) return;
    let abgebrochen = false;
    void ladeBewerberBuchungen().then((karte) => {
      const zeile = karte[bewerberId];
      if (!abgebrochen) setTermin(zeile && zeile.status !== "abgesagt" ? zeile : null);
    });
    return () => { abgebrochen = true; };
  }, [bewerberId]);
  return termin;
}

export type BewerberBuchungenStand = {
  /** Die massgebliche Buchung je Bewerber, abgesagte eingeschlossen. */
  buchungen: Record<string, BewerberBuchungZeile>;
  /** Ob die Abfrage beantwortet ist. */
  bereit: boolean;
};

/** Der innere Stand: die Antwort und ob sie schon vorliegt. */
type Stand = { geladen: boolean; buchungen: Record<string, BewerberBuchungZeile> };

/** Der Bereich im Gedaechtnis ueber den Seitenwechsel hinweg. */
const BUCHUNGEN_SPEICHER = "bewerberBuchungen";
/** Die Abfrage gilt fuer alle Bewerber zugleich, ein fester Schluessel reicht. */
const BUCHUNGEN_SCHLUESSEL = "alle";

const BUCHUNGEN_LEER: Stand = { geladen: false, buchungen: {} };

/**
 * Die Buchungen aller Bewerber holen und merken.
 *
 * Steht ausserhalb des Hooks, damit das Vorladen nach dem Login dieselbe Frage
 * stellen kann (`bewerberlisteVorladen.ts`). Eine gleichzeitige zweite Frage
 * tritt der laufenden bei.
 */
export function ladeBuchungenStand(): Promise<Stand> {
  return gemeinsamerLauf(BUCHUNGEN_SPEICHER, BUCHUNGEN_SCHLUESSEL, async () => {
    const neu: Stand = { geladen: true, buchungen: await ladeBewerberBuchungen() };
    merkeStand(BUCHUNGEN_SPEICHER, BUCHUNGEN_SCHLUESSEL, neu);
    return neu;
  });
}

/**
 * Die maßgebliche Buchung **aller** Bewerber auf einmal, abgesagte
 * eingeschlossen.
 *
 * Für die Liste im Bewerberarbeitsplatz. Ein Haken je Tabellenzeile wäre bei
 * über hundert Bewerbern hundert Abfragen; dasselbe Muster wie `useVorabScores`
 * lädt einmal und verteilt. Die Liste selbst ruft `closingGespraechTermin` mit
 * der Zeile auf, siehe dort zur Rangfolge der Quellen.
 *
 * `neuLaden` stößt eine erneute Abfrage an: Ändert sich der Wert, wird neu
 * geladen. Die Liste gibt dafür die geöffnete Akte mit, damit jedes Öffnen und
 * Schließen den Stand auffrischt. Gebucht wird ausserhalb des CRM, ein
 * ständiges Nachfragen wäre trotzdem verschwendet.
 *
 * `bereit` sagt, ob die Antwort schon da ist. Die Bewerberliste wartet darauf,
 * bevor sie erscheint: Der Abschnitt „Closing" ist nach diesem Termin
 * sortiert, ohne ihn stuenden die Zeilen also erst in einer Reihenfolge und
 * eine Sekunde spaeter in einer anderen. Siehe `BewerberArbeitsplatz`.
 */
export function useBewerberBuchungen(neuLaden: string | number = 0): BewerberBuchungenStand {
  /*
   * Startwert ist die zuletzt gemerkte Antwort. Sie gilt fuer alle Bewerber
   * zugleich, deshalb genuegt ein fester Schluessel. So steht die Liste beim
   * zweiten Oeffnen der Seite sofort richtig, statt erneut zu warten;
   * nachgefragt wird trotzdem, nur im Hintergrund.
   */
  const [stand, setStand] = useState<Stand>(
    () => gemerkterStand<Stand>(BUCHUNGEN_SPEICHER, BUCHUNGEN_SCHLUESSEL) ?? BUCHUNGEN_LEER,
  );
  useEffect(() => {
    let abgebrochen = false;
    // Auch beim Abbruch gemerkt (in `ladeBuchungenStand`): Die Antwort ist
    // gueltig, nur diese Ansicht ist weg.
    void ladeBuchungenStand().then((neu) => {
      if (!abgebrochen) setStand(neu);
    });
    return () => { abgebrochen = true; };
  }, [neuLaden]);
  return useMemo(
    () => ({ buchungen: stand.buchungen, bereit: stand.geladen }),
    [stand],
  );
}

/** Den Gesprächsstand aus dem Skript-Meta lesen, ohne ihn zu erfinden. */
export function erfassungAus(skript: ErstgespraechSkript | undefined | null): VideocallErfassung {
  return skript?.bewerberVideocall ?? {};
}

/**
 * Der Gesprächsstand samt Autosave.
 *
 * `canEdit` false heißt: lesen ja, schreiben nein. Die Präsentation läuft
 * damit, sie soll den Stand nur spiegeln.
 */
export function useVideocallErfassung(bewerber: Bewerber | null, canEdit: boolean) {
  const draftKey = bewerber ? videocallDraftKey(bewerber.id) : "";
  const [erfassung, setErfassung] = useState<VideocallErfassung>({});

  useEffect(() => {
    if (!bewerber) return;
    const key = videocallDraftKey(bewerber.id);
    setErfassung(leseDraft(key) ?? erfassungAus(bewerber.erstgespraechSkript));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bewerber?.id]);

  // Autosave: sofort in den LocalStorage, verzögert in die Datenbank.
  useEffect(() => {
    if (!bewerber || !draftKey) return;
    try { localStorage.setItem(draftKey, JSON.stringify(erfassung)); } catch { /* Quota: egal */ }
    if (!canEdit) return;
    const t = setTimeout(() => {
      try {
        updateBewerber(bewerber.id, {
          erstgespraechSkript: { ...bewerber.erstgespraechSkript, bewerberVideocall: erfassung },
        });
      } catch (e) {
        console.warn("Videocall-Autosave fehlgeschlagen", e);
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey, canEdit, bewerber?.id, erfassung]);

  const aendern = useCallback((patch: Partial<VideocallErfassung>) => {
    setErfassung((p) => ({ ...p, ...patch }));
  }, []);

  return { erfassung, setErfassung, aendern };
}

/**
 * Der Abschluss des persönlichen Gesprächs, für den Reiter und die Moderation.
 *
 * **Ein Klick, ein Zug.** Bis zum 07.09.2026 setzte der Klick im Videocall nur
 * `bewerberVideocall.entscheidung`; das Closing las diesen Wert nicht und
 * behauptete weiterhin, die Präsentation sei nicht gehalten. Jetzt setzt
 * derselbe Klick alles, was daran hängt:
 *
 *   1. `erstgespraechSkript.durchgefuehrtAm` und `durchgefuehrtVon`
 *   2. `erstgespraechSkript.bewerberVideocall` mit der Entscheidung
 *   3. `closingEntscheidung` und den Bewerberstatus
 *
 * **Was er setzt, hängt an beiden Wahlen**, an unserer Einschätzung und am
 * Wunsch des Bewerbers. Die Tabelle dazu steht bei `abschlussWirkung` in
 * `bewerberVideocall.ts`, die vier Wege sind:
 *
 *   - **Closing.** `closingEntscheidung` „ja", Status Closing.
 *   - **Unterlagen.** Der Startfahrplan geht per Mail hinaus, das Nachfassen
 *     kommt in dieselben drei Follow-up-Felder, Status über
 *     `followUpStatusZiel`. Verschickt wird über `sendeStartfahrplan`, denselben
 *     Weg wie der Service-Knopf im Closing und die Weiche in Teil 2. Ein
 *     zweiter Versandweg würde bedeuten, dass zwei Stellen die Fassung des PDFs
 *     wählen.
 *   - **Follow-Up.** Klärungsbedarf und Folgetermin in die drei Follow-up-
 *     Felder, Status über `followUpStatusZiel`. Denselben Weg nimmt die
 *     Unterlagen-Weiche im Closing, damit der Termin in der Übersicht des
 *     Profils und am Fälligkeitstag in der Inbox steht. Wollte er dabei die
 *     Unterlagen, geht der Startfahrplan zusätzlich hinaus.
 *   - **Absage und Kein Interesse.** Beide über denselben Dialog wie die
 *     Knöpfe darunter, mit Grund und wertschätzender Mail.
 *
 * Ohne Entscheidung wird nur gespeichert. Ein Zwischenspeichern soll niemanden
 * durch die Pipeline schieben.
 *
 * Der Abschluss steht hier und nicht in den beiden Oberflächen, aus demselben
 * Grund wie `useErstgespraechAbschluss`: Wer die Wirkung ändert, ändert sie an
 * einer Stelle für beide Fenster.
 */
export function useKooperationsgespraechAbschluss({
  bewerber,
  beraterName,
  erfassung,
  onRefresh,
  onAbsageNoetig,
}: {
  bewerber: Bewerber | null;
  beraterName: string;
  erfassung: VideocallErfassung;
  onRefresh?: () => void;
  /**
   * Der Abschluss endet in einer Absage: Die Oberfläche öffnet den
   * Absage-Dialog, denselben wie die beiden Knöpfe darunter. Der Grund wird
   * dort erfasst, deshalb schreibt der Abschluss hier nichts.
   */
  onAbsageNoetig?: (modus: "kein_interesse" | "abgelehnt", grundVorschlag: string) => void;
}) {
  /** Den Gesprächsstand speichern, ohne Status und ohne Entscheidung. */
  const zwischenspeichern = useCallback(() => {
    if (!bewerber) return;
    updateBewerber(bewerber.id, {
      erstgespraechSkript: { ...bewerber.erstgespraechSkript, bewerberVideocall: erfassung },
    });
    onRefresh?.();
    toast({
      title: "Zwischenstand gespeichert",
      description: "Status und Entscheidung bleiben unverändert.",
    });
  }, [bewerber, erfassung, onRefresh]);

  /** Vertragsanschrift und Rechnungsadresse, sofort und ohne Abschluss. */
  const adressenSpeichern = useCallback(
    (vertragsAdresse: string, rechnungsAdresse: string) => {
      if (!bewerber) return;
      updateBewerber(bewerber.id, { vertragsAdresse, rechnungsAdresse });
      onRefresh?.();
    },
    [bewerber, onRefresh],
  );

  const abschliessen = useCallback(async () => {
    if (!bewerber) return;
    const entscheidung = erfassung.entscheidung ?? "";
    const wirkung = abschlussWirkung(entscheidung, erfassung.wunsch);
    const grund = (erfassung.entscheidungGrund ?? "").trim();

    // Beide Absagewege laufen über denselben Dialog wie die Knöpfe darunter:
    // ein Grund, eine Absage-Mail, ein Statuswechsel. Zwei Wege mit
    // verschiedener Wirkung wären genau die Uneinheitlichkeit, die hier weg
    // soll.
    if (wirkung.art === "absage" || wirkung.art === "keinInteresse") {
      if (wirkung.art === "absage" && !grund) {
        toast({
          title: "Grund fehlt",
          description: "Ohne Grund lässt sich „Nicht möglich“ nicht abschließen.",
          variant: "destructive",
        });
        return;
      }
      onAbsageNoetig?.(wirkung.art === "absage" ? "abgelehnt" : "kein_interesse", grund);
      return;
    }

    const klaerung = (erfassung.klaerungBedarf ?? "").trim();
    const klaerungDatum = (erfassung.klaerungDatum ?? "").trim();
    if (wirkung.art === "followup" && (!klaerung || !klaerungDatum)) {
      toast({
        title: klaerung ? "Folgetermin fehlt" : "Klärungspunkt fehlt",
        description: klaerung
          ? "Ohne Datum geht die Klärung unter. Trag den Folgetermin ein."
          : "Halte fest, was noch zu klären ist. Der Text wird die Notiz des Follow-ups.",
        variant: "destructive",
      });
      return;
    }

    // Der Startfahrplan allein reicht nicht: Ohne Termin wartet das Haus
    // darauf, dass er sich von selbst meldet. Genau das soll die eigene Tür
    // verhindern.
    const unterlagenDatum = (erfassung.unterlagenDatum ?? "").trim();
    if (wirkung.art === "unterlagen" && !unterlagenDatum) {
      toast({
        title: "Termin zum Nachfassen fehlt",
        description: "Ohne Datum bleibt seine Entscheidung liegen. Trag ein, wann wir nachfassen.",
        variant: "destructive",
      });
      return;
    }

    const jetzt = new Date().toISOString();
    const skript: ErstgespraechSkript = {
      ...bewerber.erstgespraechSkript,
      bewerberVideocall: erfassung,
      durchgefuehrtAm: bewerber.erstgespraechSkript?.durchgefuehrtAm || jetzt,
      durchgefuehrtVon: bewerber.erstgespraechSkript?.durchgefuehrtVon || beraterName,
    };

    /*
     * Die Klärung setzt `closingEntscheidung` bewusst auf leer und nicht auf
     * „bedenkzeit". `closingFortschritt.ts` baut aus „bedenkzeit" die Zeile
     * „Bedenkzeit, Rückruf …" aus `bedenkzeitRueckrufAm`; dieses Feld füllt
     * der Rückruf im Reiter Closing, nicht der Videocall. Der Balken zeigte
     * damit ein Datum, das nirgends steht. Leer ist zugleich die richtige
     * Aussage: Solange etwas zu klären ist, hat das Haus noch nicht
     * entschieden. Schritt 1 bleibt trotzdem erledigt, den erkennt
     * `closingFortschritt` an `bewerberVideocall.entscheidung`.
     */
    /*
     * Beide Wege legen ein Follow-up an und benutzen dafür dieselben drei
     * Felder wie die FollowUpCard. Sie unterscheiden sich nur darin, woher der
     * Termin kommt: aus der Klärung oder aus dem Nachfassen zum Startfahrplan.
     */
    const followUp = wirkung.art === "followup" || wirkung.art === "unterlagen";
    const unterlagen = wirkung.art === "unterlagen";
    const fuDatum = unterlagen ? unterlagenDatum : klaerungDatum;
    const fuUhrzeit = ((unterlagen ? erfassung.unterlagenUhrzeit : erfassung.klaerungUhrzeit) ?? "").trim();
    const fuNotiz = unterlagen
      ? (erfassung.unterlagenNotiz ?? "").trim() || UNTERLAGEN_NOTIZ_VORGABE
      : klaerung;
    const statusZiel = followUp ? followUpStatusZiel(bewerber.status) : wirkung.status;

    updateBewerber(bewerber.id, {
      erstgespraechSkript: skript,
      ...(wirkung.art === "closing" ? { closingEntscheidung: "ja" as const } : {}),
      ...(followUp
        ? {
            closingEntscheidung: "" as const,
            followUpDatum: fuDatum,
            followUpUhrzeit: fuUhrzeit,
            followUpNotiz: fuNotiz,
          }
        : {}),
    });
    if (statusZiel && bewerber.status !== statusZiel) changeBewerberStatus(bewerber.id, statusZiel);

    try { localStorage.removeItem(videocallDraftKey(bewerber.id)); } catch { /* egal */ }
    onRefresh?.();
    const terminText = `${fuDatum}${fuUhrzeit ? ` um ${fuUhrzeit} Uhr` : ""}`;
    toast({
      title: "Persönliches Gespräch abgeschlossen",
      description: unterlagen
        ? `Nachfassen am ${terminText}. Status: Follow-Up. Der Startfahrplan geht gleich raus.`
        : followUp
          ? `Follow-up am ${terminText}. Status: Follow-Up.`
          : wirkung.art === "closing"
            ? "Entscheidung im Closing: Ja, will starten. Status: Closing."
            : "Ohne Entscheidung. Status und Closing bleiben unverändert.",
    });

    /*
     * Der Versand kommt zuletzt und darf nichts von dem oben Gesetzten
     * gefährden: Status und Follow-up stehen schon, wenn die Mail scheitert,
     * genau wie bei der Absage-Mail in `ablehnen`. Sonst stünde ein
     * abgeschlossenes Gespräch offen, nur weil der Postausgang klemmt.
     */
    if (sendetStartfahrplan(entscheidung, erfassung.wunsch)) {
      try {
        /*
         * Der frisch geschriebene Stand, nicht `bewerber`. `updateBewerber`
         * legt eine neue Fassung im Zwischenspeicher ab und fasst das hier
         * gehaltene Objekt nicht an; es trägt also weder `durchgefuehrtAm`
         * noch die Einschätzung aus diesem Klick. `sendeStartfahrplan` wählt
         * daran aber die Fassung des PDFs (waehleStartfahrplanFassung), und
         * die soll nicht davon abhängen, ob vorher zufällig einmal
         * zwischengespeichert wurde.
         */
        const aktuellerStand = { ...bewerber, erstgespraechSkript: skript };
        const ergebnis = await sendeStartfahrplan(aktuellerStand, {
          hrName: beraterName,
          paketId: bewerber.paketwahl || "",
        });
        toast({
          title: ergebnis?.fassung === "erweitert"
            ? "Startfahrplan (erweiterte Fassung) versendet"
            : "Startfahrplan versendet",
          description: `Die Unterlagen (PDF) gingen an ${bewerber.email}.`,
        });
      } catch (e) {
        toast({
          title: "Startfahrplan nicht versendet",
          description: `${e instanceof Error ? e.message : "Bitte erneut versuchen."} Das Gespräch ist abgeschlossen, das Nachfassen steht. Der Versand lässt sich im Reiter Closing wiederholen.`,
          variant: "destructive",
        });
      }
      onRefresh?.();
    }
  }, [bewerber, beraterName, erfassung, onRefresh, onAbsageNoetig]);

  /**
   * Kein Interesse oder Absage, mit Grund und optionaler Absage-Mail.
   *
   * Bewusst dieselben zwei Wege wie im bestehenden Erstgespräch, damit die
   * HR-Managerin nicht zwei Bedienungen lernt. Der Statuswechsel ist vor dem
   * Mailversand erledigt und darf an ihm nicht scheitern.
   */
  const ablehnen = useCallback(
    async (grund: string, modus: "kein_interesse" | "abgelehnt", mailSenden: boolean): Promise<boolean> => {
      if (!bewerber) return false;
      if (!grund.trim()) {
        toast({
          title: "Bitte Grund angeben",
          description: "Ohne Grund lässt sich das Gespräch nicht abschließen.",
          variant: "destructive",
        });
        return false;
      }
      const jetzt = new Date().toISOString();
      updateBewerber(bewerber.id, {
        erstgespraechSkript: {
          ...bewerber.erstgespraechSkript,
          bewerberVideocall: erfassung,
          durchgefuehrtAm: bewerber.erstgespraechSkript?.durchgefuehrtAm || jetzt,
          durchgefuehrtVon: bewerber.erstgespraechSkript?.durchgefuehrtVon || beraterName,
          absageGrund: grund,
          abgelehntAm: jetzt,
          abgelehntVon: beraterName,
        },
        // Der Grund steht damit auch dort, wo das Closing ihn liest. Vorher
        // schrieb ihn nur der Abschluss mit „Nicht möglich"; der ging jetzt
        // in diesen Weg auf, und ohne diese beiden Zeilen wäre er verloren.
        closingEntscheidung: "nein",
        closingAbgelehntGrund: grund.trim(),
        // Die Erinnerungskette anhalten: Der Rückruf aus der Bedenkzeit endet
        // schon am Status (`bedenkzeitRueckrufAktiv`), das manuelle Follow-up
        // nicht. Ohne diese drei Zeilen stünde ein ausgeschiedener Bewerber
        // am Fälligkeitstag weiter in der Inbox.
        followUpDatum: "",
        followUpUhrzeit: "",
        followUpNotiz: "",
      });
      changeBewerberStatus(bewerber.id, modus === "kein_interesse" ? "KeinInteresse" : "Abgelehnt");

      let mailHinweis = "Es wurde keine Mail an den Bewerber gesendet.";
      if (mailSenden) {
        const mail = await sendeBewerberAbsageMail(bewerber);
        mailHinweis = mail.ok
          ? `Die Absage-Mail wurde an ${bewerber.email} gesendet.`
          : `Die Absage-Mail konnte nicht gesendet werden (${mail.grund}).`;
      }
      onRefresh?.();
      toast({
        title: modus === "kein_interesse"
          ? "Bewerber als „Kein Interesse“ markiert"
          : "Bewerber als „Abgelehnt“ markiert",
        description: `Status aktualisiert. ${mailHinweis}`,
      });
      return true;
    },
    [bewerber, beraterName, erfassung, onRefresh],
  );

  return { abschliessen, zwischenspeichern, adressenSpeichern, ablehnen };
}

/** Die Folien dieses Termins, aus den Antworten und den gewählten Modulen. */
export function useVideocallFolien(
  antworten: KennenlernenAntworten | null,
  erfassung: VideocallErfassung,
): VideocallFolie[] {
  const module = useMemo(() => zusatzModule(erfassung), [erfassung]);
  return useMemo(() => (antworten ? videocallFolien(antworten, module) : []), [antworten, module]);
}
