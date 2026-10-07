import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useVersandRunde } from "@/lib/bewerberVersandRunde";
import { gemeinsamerLauf, gemerkterStand, letzterStand, merkeStand } from "./nachladeSpeicher";

/**
 * Wann bei jedem Bewerber der Kennenlernbogen angelegt wurde, für die Liste.
 *
 * ## Warum das nicht im Bewerber steht
 *
 * Die Akte zeigt „Die Einladung ging am 11.9.2026 hinaus" und nimmt dafür zwei
 * Quellen: den Vermerk `meta.kennenlernen.gesendetAm` und, wenn der fehlt, das
 * Anlagedatum des Bogens aus `bewerber_formular`. Der Rückfall ist nicht
 * Zierde, sondern der Regelfall bei allen Bewerbern, deren Mail über einen Weg
 * hinausging, der den Vermerk nicht schreibt.
 *
 * Die Liste hatte nur die erste Quelle. Deshalb stand am 14.09.2026 bei Stefan
 * Garving in der Akte, die Einladung sei am 11.9. hinausgegangen, und in der
 * Übersicht fehlte das Briefsymbol. Zwei Ansichten, zwei Antworten auf
 * dieselbe Frage.
 *
 * ## Warum eine eigene Abfrage
 *
 * `bewerber_formular` liegt nicht im dataCache, die Liste lädt sie nicht. Der
 * Hook holt das Anlagedatum aller angezeigten Bewerber in einem Zug, wie es
 * `useVorabScores` für die Antworten tut. Anders als dort zählt hier jede
 * Bogenzeile, nicht nur die eingereichte: Gefragt ist, ob je eine Mail mit dem
 * Link hinausging, und dafür genügt, dass es den Bogen gibt.
 *
 * ## Warum die Bogenart doch zählt, nur anders
 *
 * Der zweite Anlauf verzichtete ganz auf die Unterscheidung, weil ein Filter
 * die älteren Fälle herauswarf. Die Abfrage vom 14.09.2026 zeigte dann, warum
 * das zu grob war: Von rund 150 Bewerbern im Eingang haben elf den aktuellen
 * Kennenlernbogen, eine Handvoll den alten Vorabbogen, und alle übrigen gar
 * keinen. Ein Symbol, das beide Bögen gleich behandelt, verschweigt genau die
 * Frage, um die es geht, nämlich wer den neuen Bogen noch braucht.
 *
 * Deshalb liefert der Hook jetzt beide Daten getrennt, statt zu filtern.
 *
 * ## Was die alten Zeilen kennzeichnet
 *
 * Ein erster Versuch am 14.09.2026 filterte auf `antworten->>bogen` gleich
 * „kennenlernen" und fand bei Stefan Garving und Dominik Franz weiterhin
 * nichts. Der Grund: Zwei Wege legen Bögen an, und nur der neuere
 * (`send-bewerber-kennenlernen`) schreibt dieses Feld. Der ältere
 * (`send-bewerber-formular`) legt die Zeile ohne Antworten an. Wer seinen Link
 * über den alten Weg bekam, fiel durch den Filter.
 *
 * Die Karte in der Akte filtert deshalb auch nicht, und sie ist hier die
 * Richtschnur: Steht dort „Die Einladung ging am 11.9. hinaus", muss in der
 * Liste das Briefsymbol stehen. Beide nehmen jetzt dieselbe Zeile, nämlich die
 * jüngste, und zeigen damit dasselbe Datum. Ein Vorab-Fragebogen zählt damit
 * mit, und das ist richtig: Auch er ging per Mail hinaus.
 */

/** So viele Ids passen in eine Abfrage, ohne dass die URL zu lang wird. */
const BLOCKGROESSE = 100;

/** Wann welche Art von Bogen an diesen Bewerber hinausging. */
export type BogenVersand = {
  /** Der aktuelle Kennenlernbogen, 21 Ansichten in sieben Kapiteln. */
  kennenlernenAm?: string;
  /** Der frühere Vorabbogen. Ging ebenfalls per Mail hinaus. */
  vorabAm?: string;
};

/** Was der Hook zurueckgibt: die Daten und die Auskunft, ob sie schon da sind. */
export type KennenlernVersandStand = {
  /** Wann welche Art von Bogen hinausging, je Bewerber. */
  versand: Record<string, BogenVersand>;
  /**
   * Ob ueberhaupt schon eine Antwort vorliegt, notfalls eine aeltere.
   *
   * Die Liste wartet darauf, bevor sie zum ersten Mal erscheint: Der Filter
   * „Eingangsmail verschickt" liest diesen Wert, ohne ihn stuenden also andere
   * Bewerber in der Liste als eine Sekunde spaeter. Eine aeltere Antwort
   * genuegt, sie kennt alle bisherigen Bewerber. Siehe `BewerberArbeitsplatz`.
   */
  bereit: boolean;
};

/** Der innere Stand samt Schluessel, fuer den er gilt. */
type Stand = { schluessel: string; versand: Record<string, BogenVersand> };

/** Der Bereich im Gedaechtnis ueber den Seitenwechsel hinweg. */
const SPEICHER = "kennenlernVersand";

const LEER: Stand = { schluessel: "", versand: {} };

/**
 * Den Versand des Bogens fuer diese Bewerber holen.
 *
 * Steht ausserhalb des Hooks, damit das Vorladen nach dem Login dieselbe Frage
 * stellen kann (`bewerberlisteVorladen.ts`). Die Antwort wird gemerkt, eine
 * gleichzeitige zweite Frage tritt der laufenden bei. Wirft nie.
 */
export function ladeKennenlernVersand(bewerberIds: string[]): Promise<Stand> {
  const idSchluessel = [...bewerberIds].sort().join(",");
  const ids = idSchluessel ? idSchluessel.split(",") : [];
  if (ids.length === 0) return Promise.resolve(LEER);

  /*
   * Ein Block Kennungen, mit Fehler statt Ausnahme. Wirft die Abfrage, etwa
   * weil das Netz weg ist, waere das sonst ein abgebrochenes Versprechen:
   * Die Liste wartet auf diese Antwort und bliebe dann dauerhaft im
   * Ladezustand.
   */
  const blockHolen = async (block: string[]): Promise<{ data: unknown[] | null; error: unknown }> => {
    try {
      return await supabase
        .from("bewerber_formular")
        .select("bewerbung_id, created_at, antworten")
        .in("bewerbung_id", block);
    } catch (fehler) {
      return { data: null, error: fehler };
    }
  };

  return gemeinsamerLauf(SPEICHER, idSchluessel, async () => {
    const gefunden: Record<string, BogenVersand> = {};
    for (let i = 0; i < ids.length; i += BLOCKGROESSE) {
      const { data, error } = await blockHolen(ids.slice(i, i + BLOCKGROESSE));
      /*
       * Fehlt das Recht oder die Tabelle, bleibt die Spalte leer statt rot.
       * Die Meldung gehört trotzdem in die Konsole: Ohne sie sehen ein
       * abgelehnter Zugriff und "es gibt keinen Bogen" gleich aus, und der
       * nächste Fall wäre wieder nicht zu unterscheiden.
       */
      if (error || !data) {
        if (error) console.error("useKennenlernVersand:", error);
        continue;
      }
      type Zeile = { bewerbung_id?: string; created_at?: string; antworten?: unknown };
      for (const zeile of data as Zeile[]) {
        const id = zeile.bewerbung_id;
        const am = zeile.created_at;
        if (!id || !am) continue;
        /*
         * Nur der neuere Weg (`send-bewerber-kennenlernen`) schreibt dieses
         * Merkmal. Der ältere legt die Zeile ohne Antworten an, deshalb ist
         * alles ohne Merkmal ein Vorabbogen.
         */
        const antworten = (zeile.antworten || {}) as { bogen?: unknown; ohneMail?: unknown };
        /*
         * „Link kopieren" und „So sieht es aus" in der Akte legen bei Bedarf
         * eine Zeile an, ohne dass eine Mail hinausgeht. Sie trägt das
         * Kennzeichen `ohneMail` und zählt hier nicht: Sonst stünde in der
         * Liste ein Briefsymbol, und die Eingangsmail würde nie verschickt.
         */
        if (antworten.ohneMail === true) continue;
        const art = antworten.bogen === "kennenlernen" ? "kennenlernenAm" : "vorabAm";
        const bisher = gefunden[id] || {};
        // Je Art die jüngste Zeile: Nur deren Link gilt noch.
        if (!bisher[art] || am > (bisher[art] as string)) {
          gefunden[id] = { ...bisher, [art]: am };
        } else if (!gefunden[id]) {
          gefunden[id] = bisher;
        }
      }
    }
    const neu: Stand = { schluessel: idSchluessel, versand: gefunden };
    merkeStand(SPEICHER, idSchluessel, neu);
    return neu;
  });
}

export function useKennenlernVersand(bewerberIds: string[]): KennenlernVersandStand {
  // Die Liste entsteht bei jedem Render neu, der Schlüssel bleibt gleich und
  // löst die Abfrage nur aus, wenn sich die Bewerber wirklich ändern.
  const idSchluessel = [...bewerberIds].sort().join(",");
  /*
   * Startwert ist die zuletzt gemerkte Antwort: zuerst die zu genau diesen
   * Bewerbern, sonst die letzte ueberhaupt. So erscheint beim erneuten Oeffnen
   * der Seite keine Ladeanzeige mehr, gefragt wird trotzdem noch einmal im
   * Hintergrund.
   */
  const [stand, setStand] = useState<Stand>(
    () => gemerkterStand<Stand>(SPEICHER, idSchluessel) ?? letzterStand<Stand>(SPEICHER) ?? LEER,
  );
  // Nach einem Versand neu fragen, sonst steht hier der Stand von davor.
  const runde = useVersandRunde();

  useEffect(() => {
    let abgebrochen = false;
    if (!idSchluessel) {
      // Dieselbe Konstante und nicht ein neues leeres Objekt: React erkennt den
      // unveraenderten Wert und rendert nicht noch einmal.
      setStand(LEER);
      return;
    }
    // Die Antwort wird auch beim Abbruch gemerkt (in `ladeKennenlernVersand`):
    // Sie ist gueltig, nur diese Ansicht ist weg.
    void ladeKennenlernVersand(idSchluessel.split(",")).then((neu) => {
      if (!abgebrochen) setStand(neu);
    });
    return () => {
      abgebrochen = true;
    };
  }, [idSchluessel, runde]);

  return useMemo(
    // Ein leerer Schluessel heisst: noch keine Antwort. Jede andere, auch eine
    // aeltere zu weniger Bewerbern, genuegt fuer die Anzeige.
    () => ({ versand: stand.versand, bereit: stand.schluessel !== "" || idSchluessel === "" }),
    [stand, idSchluessel],
  );
}
