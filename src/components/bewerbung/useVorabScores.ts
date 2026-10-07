import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type FormularAntworten } from "@/lib/bewerberFormular";
import { berechneVorabScore, type VorabScore } from "@/lib/bewerberVorabScore";
import { istAusgefuellterBogen, istKennenlernZeile } from "@/lib/kennenlernenLink";
import { gemeinsamerLauf, gemerkterStand, letzterStand, merkeStand } from "./nachladeSpeicher";

/**
 * Die Vorab-Scores aller Bewerber der Liste, mit einer Abfrage je Seitenaufbau.
 *
 * Die Antworten liegen in `bewerber_formular`, nicht im Bewerber selbst und
 * damit auch nicht im dataCache. Für die Spalte in der Liste holt dieser Hook
 * die eingereichten Fragebögen aller angezeigten Bewerber auf einmal, statt je
 * Zeile einen eigenen Select zu starten. Gerechnet wird im Browser, gespeichert
 * wird nichts: Der Score ergibt sich immer gleich aus den Antworten.
 *
 * ## Warum die Abfrage auch beim Zurückkommen läuft
 *
 * Bis zum 11.09.2026 hing sie allein an der Menge der angezeigten Bewerber.
 * Das ist genau die falsche Bedingung: Der Bogen wird nicht im CRM ausgefüllt,
 * sondern vom Bewerber in seinem eigenen Fenster. Wer einen Testbewerber
 * anlegt (die Menge ändert sich, es wird gefragt, es gibt noch keinen Bogen),
 * dann in einem zweiten Tab den Kennenlernbogen ausfüllt und zurückwechselt,
 * ändert an der Menge nichts mehr. Der Strich in der Spalte blieb deshalb
 * stehen, bis die ganze Seite neu geladen wurde, obwohl der Bogen längst da
 * war. Genau so sah es aus, als würde der Score gar nicht erst berechnet.
 *
 * Deshalb fragt der Hook zusätzlich, sobald das Fenster wieder im Vordergrund
 * ist. Das kostet einen kleinen Select je Rückkehr und trifft genau den
 * Moment, in dem sich am Bogen etwas geändert haben kann.
 */

/** So viele Ids passen in eine Abfrage, ohne dass die URL zu lang wird. */
const BLOCKGROESSE = 100;

/**
 * Was die eine Abfrage über die eingereichten Bögen hergibt.
 *
 * Zwei Angaben und nicht eine, weil sie Verschiedenes beantworten. Der Score
 * zählt jeden eingereichten Bogen, auch den früheren Vorabbogen: Er sagt, wen
 * man zuerst anrufen sollte, und dafür ist jede Antwort brauchbar. Der Filter
 * „Kennenlernbogen ausgefüllt" darf den Vorabbogen dagegen nicht mitzählen,
 * sonst verschwände genau der Bewerber aus der Liste der Offenen, der den
 * aktuellen Bogen noch braucht. Die Unterscheidung trifft `istKennenlernZeile`
 * aus `kennenlernenLink.ts`, dieselbe Regel wie beim Link in der Akte.
 *
 * Seit dem 16.09.2026 steht der eingereichte Vorabbogen als dritte Angabe
 * daneben. Er darf den Filter nicht verändern, ist aber ein Beleg dafür, dass
 * eine Mail von uns geöffnet wurde: Auch sein Link stand ausschließlich in
 * einer Mail. Siehe `istAusgefuellterBogen` in `kennenlernenLink.ts`.
 */
export type VorabScoreStand = {
  /** Der berechnete Score je Bewerber, aus dem jüngsten eingereichten Bogen. */
  scores: Record<string, VorabScore>;
  /** Wann der Kennenlernbogen eingereicht wurde, ISO. Ohne den alten Vorabbogen. */
  kennenlernEingereichtAm: Record<string, string>;
  /** Wann der frühere Vorabbogen eingereicht wurde, ISO. Ohne den Kennenlernbogen. */
  vorabEingereichtAm: Record<string, string>;
  /**
   * Ob überhaupt schon eine Antwort vorliegt, notfalls eine ältere.
   *
   * Die Liste wartet darauf, bevor sie zum ersten Mal erscheint: Ohne die
   * Scores stünden die Zeilen in einer anderen Reihenfolge, denn ein
   * ausgefüllter Bogen hebt den Bewerber in den oberen Bereich der Tabelle.
   * Eine ältere Antwort genügt dafür, sie kennt alle bisherigen Bewerber.
   * Siehe `BewerberArbeitsplatz` und `nachladeSpeicher.ts`.
   */
  bereit: boolean;
};

/**
 * Der innere Stand samt Schlüssel, für den er gilt.
 *
 * Alles in einem Zustand und nicht in dreien: Nur so lässt sich sagen, ob die
 * angezeigten Werte zu den angezeigten Bewerbern gehören. Drei getrennte
 * Zustände könnten kurzzeitig aus zwei verschiedenen Abfragen stammen.
 */
type Stand = {
  /** Für welche Bewerber die Werte gelten. Leer heißt: noch keine Antwort. */
  schluessel: string;
  scores: Record<string, VorabScore>;
  kennenlernEingereichtAm: Record<string, string>;
  vorabEingereichtAm: Record<string, string>;
};

/** Der Bereich im Gedächtnis über den Seitenwechsel hinweg. */
const SPEICHER = "vorabScores";

const LEER: Stand = { schluessel: "", scores: {}, kennenlernEingereichtAm: {}, vorabEingereichtAm: {} };

/**
 * Die eingereichten Bögen dieser Bewerber holen und daraus die Scores rechnen.
 *
 * Steht außerhalb des Hooks, damit das Vorladen nach dem Login dieselbe Frage
 * stellen kann (`bewerberlisteVorladen.ts`). Die Antwort wird gemerkt, und eine
 * gleichzeitige zweite Frage tritt der laufenden bei. Wirft nie: Auch ein
 * Fehlschlag ist eine Antwort, sonst wartete die Liste ewig.
 */
export function ladeVorabScores(bewerberIds: string[]): Promise<Stand> {
  const idSchluessel = [...bewerberIds].sort().join(",");
  const ids = idSchluessel ? idSchluessel.split(",") : [];
  if (ids.length === 0) return Promise.resolve(LEER);

  return gemeinsamerLauf(SPEICHER, idSchluessel, async () => {
    try {
      const neueste = new Map<string, { am: string; antworten: FormularAntworten }>();
      /*
       * Getrennt mitgeführt und nicht aus `neueste` abgeleitet: Hat jemand
       * beide Bögen eingereicht und den Vorabbogen zuletzt, wäre der
       * Kennenlernbogen sonst unsichtbar, obwohl er vorliegt.
       */
      const kennenlernen = new Map<string, string>();
      /*
       * Und die Gegenstücke, also die eingereichten Zeilen, die kein
       * Kennenlernbogen sind. Das ist der frühere Vorabbogen. Er zählt nicht
       * in den Filter, wohl aber als Beleg für eine geöffnete Mail.
       */
      const vorab = new Map<string, string>();
      for (let i = 0; i < ids.length; i += BLOCKGROESSE) {
        const { data, error } = await supabase
          .from("bewerber_formular")
          .select("bewerbung_id, antworten, eingereicht_am, status")
          .in("bewerbung_id", ids.slice(i, i + BLOCKGROESSE))
          .eq("status", "eingereicht");
        // Fehlt die Tabelle oder das Recht, bleibt die Spalte leer statt rot.
        // Die Meldung gehört trotzdem in die Konsole: Ohne sie sehen ein
        // abgelehnter Zugriff und "es gibt keinen Bogen" gleich aus, und der
        // nächste Fall wäre wieder nicht zu unterscheiden.
        if (error || !data) {
          if (error) console.error("useVorabScores:", error);
          continue;
        }
        for (const zeile of data) {
          // Die Abfrage holt ohnehin nur eingereichte Zeilen. Die Regel steht
          // trotzdem nur an einer Stelle, nämlich in `istAusgefuellterBogen`.
          if (!istAusgefuellterBogen(zeile)) continue;
          const am = zeile.eingereicht_am ?? "";
          const bisher = neueste.get(zeile.bewerbung_id);
          // Wurde das Formular erneut geschickt, zählt die jüngste Einreichung.
          if (!bisher || am > bisher.am) {
            neueste.set(zeile.bewerbung_id, { am, antworten: (zeile.antworten ?? {}) as FormularAntworten });
          }
          if (istKennenlernZeile(zeile.antworten)) {
            const bisherKl = kennenlernen.get(zeile.bewerbung_id) ?? "";
            if (am >= bisherKl) kennenlernen.set(zeile.bewerbung_id, am);
          } else {
            const bisherVorab = vorab.get(zeile.bewerbung_id) ?? "";
            if (am >= bisherVorab) vorab.set(zeile.bewerbung_id, am);
          }
        }
      }
      const ergebnis: Record<string, VorabScore> = {};
      for (const [id, { antworten }] of neueste) {
        const score = berechneVorabScore(antworten);
        if (score) ergebnis[id] = score;
      }
      const neu: Stand = {
        schluessel: idSchluessel,
        scores: ergebnis,
        kennenlernEingereichtAm: Object.fromEntries(kennenlernen),
        vorabEingereichtAm: Object.fromEntries(vorab),
      };
      merkeStand(SPEICHER, idSchluessel, neu);
      return neu;
    } catch (fehler) {
      /*
       * Auch der Fehlschlag ist eine Antwort. Ohne diesen Zweig wartete die
       * Liste ewig auf eine Abfrage, die nie zurueckkommt, und der Nutzer
       * saehe dauerhaft eine Ladeanzeige statt der Bewerber.
       */
      console.error("useVorabScores:", fehler);
      const leerAberBeantwortet: Stand = { ...LEER, schluessel: idSchluessel };
      merkeStand(SPEICHER, idSchluessel, leerAberBeantwortet);
      return leerAberBeantwortet;
    }
  });
}

export function useVorabScores(bewerberIds: string[]): VorabScoreStand {
  // Die Liste entsteht bei jedem Render neu, der Schlüssel bleibt gleich und
  // löst die Abfrage nur aus, wenn sich die Bewerber wirklich ändern.
  const idSchluessel = [...bewerberIds].sort().join(",");
  /*
   * Startwert ist die zuletzt gemerkte Antwort: zuerst die zu genau diesen
   * Bewerbern, sonst die letzte überhaupt. Damit steht die Liste beim
   * erneuten Öffnen der Seite sofort da, auch wenn inzwischen ein Bewerber
   * dazugekommen ist. Gefragt wird trotzdem noch einmal, im Hintergrund.
   */
  const [stand, setStand] = useState<Stand>(
    () => gemerkterStand<Stand>(SPEICHER, idSchluessel) ?? letzterStand<Stand>(SPEICHER) ?? LEER,
  );
  /** Zählt jede Rückkehr ins Fenster und löst damit eine frische Abfrage aus. */
  const [runde, setRunde] = useState(0);

  useEffect(() => {
    const wiederDa = () => {
      // `focus` feuert auch beim Wechsel zwischen Fenstern desselben Rechners,
      // die Sichtbarkeitsprüfung hält das auf einen wirklich sichtbaren Tab.
      if (typeof document === "undefined" || document.visibilityState === "visible") {
        setRunde((r) => r + 1);
      }
    };
    window.addEventListener("focus", wiederDa);
    document.addEventListener("visibilitychange", wiederDa);
    return () => {
      window.removeEventListener("focus", wiederDa);
      document.removeEventListener("visibilitychange", wiederDa);
    };
  }, []);

  useEffect(() => {
    let abgebrochen = false;
    if (!idSchluessel) {
      // Dieselbe Konstante und nicht ein neues leeres Objekt: React erkennt den
      // unveraenderten Wert und rendert nicht noch einmal.
      setStand(LEER);
      return;
    }
    // Die Antwort wird auch beim Abbruch gemerkt (in `ladeVorabScores`): Sie
    // ist gueltig, nur diese Ansicht ist weg.
    void ladeVorabScores(idSchluessel.split(",")).then((neu) => {
      if (!abgebrochen) setStand(neu);
    });
    return () => { abgebrochen = true; };
  }, [idSchluessel, runde]);

  // Ein stabiles Ergebnis, damit ein Aufruf in einer Abhängigkeitsliste nicht
  // bei jedem Rendern für neu gehalten wird.
  return useMemo(
    () => ({
      scores: stand.scores,
      kennenlernEingereichtAm: stand.kennenlernEingereichtAm,
      vorabEingereichtAm: stand.vorabEingereichtAm,
      // Ein leerer Schluessel heisst: noch keine Antwort. Jede andere, auch
      // eine aeltere zu weniger Bewerbern, genuegt fuer die Anzeige.
      bereit: stand.schluessel !== "" || idSchluessel === "",
    }),
    [stand, idSchluessel],
  );
}
