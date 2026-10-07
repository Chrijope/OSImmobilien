import { dokumente as investagonDokumente, type MitInvestagonRohdaten } from "@/lib/investagonFelder";
import {
  DOKUMENT_OBERBEGRIFFE, normalisiereTitel, oberbegriffFuer, type Oberbegriff,
} from "../../supabase/functions/_shared/dokument-gruppen.ts";

/*
 * Die Oberbegriffe und ihre Einordnung (Investagon-Kategorie, Stichworte im
 * Titel) liegen seit dem 23.09.2026 in
 * `supabase/functions/_shared/dokument-gruppen.ts`. Die Edge Functions
 * brauchen dieselbe Einordnung für die Dokumenten-Ampel
 * (`_shared/dokument-freigabe.ts`), eine zweite Liste liefe auseinander.
 * Hier werden sie weitergereicht, damit alle bisherigen Importe aus
 * `@/lib/dokumentGruppen` unverändert gelten.
 */
export {
  DOKUMENT_OBERBEGRIFFE, normalisiereTitel, oberbegriffAusKategorie, oberbegriffAusTitel, oberbegriffFuer,
  type Oberbegriff,
} from "../../supabase/functions/_shared/dokument-gruppen.ts";

export interface DokumentGruppe<T> {
  oberbegriff: Oberbegriff;
  eintraege: T[];
}

/**
 * Dokumente nach Oberbegriff gruppieren.
 *
 * Gruppen in der festen Reihenfolge von `DOKUMENT_OBERBEGRIFFE`, leere fallen
 * weg. Innerhalb einer Gruppe nach Namen, Zahlen als Zahlen („WE 2" vor
 * „WE 10"). Die Reihenfolge der Zeilen im Zwischenspeicher ist zufällig, eine
 * sortierte Liste findet man wieder.
 */
export function gruppiereDokumente<T extends { name: string; investagonKategorie?: string }>(eintraege: T[]): DokumentGruppe<T>[] {
  const je = new Map<Oberbegriff, T[]>();
  for (const e of eintraege) {
    const begriff = oberbegriffFuer(e);
    je.set(begriff, [...(je.get(begriff) ?? []), e]);
  }
  return DOKUMENT_OBERBEGRIFFE
    .filter((begriff) => je.has(begriff))
    .map((oberbegriff) => ({
      oberbegriff,
      eintraege: [...(je.get(oberbegriff) ?? [])].sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true, sensitivity: "base" })),
    }));
}

/**
 * Die Investagon-Kategorie einer übernommenen Unterlage wiederfinden.
 *
 * Der Import schreibt die Kategorie nicht in `objekt_dokumente` oder
 * `wohnungs_dokumente`, nur den Namen, und zwar den Titel der Datei oder,
 * wenn keiner da ist, ihren Originalnamen. Beides steht auch im
 * Originaldatensatz unter `meta.investagonRaw.files`, dort samt Kategorie.
 * Über den Namen finden beide wieder zusammen. Was nicht passt (Handanlage,
 * Dokumentenpaket), bekommt nichts und wird über den Titel eingeordnet.
 */
export function investagonKategorieSuche(quelle: MitInvestagonRohdaten | null | undefined): (name: string) => string | undefined {
  const nachName = new Map<string, string>();
  for (const d of investagonDokumente(quelle)) {
    if (!d.kategorie) continue;
    for (const schluessel of [d.titel, d.dateiname]) {
      const n = normalisiereTitel(schluessel);
      if (n && !nachName.has(n)) nachName.set(n, d.kategorie);
    }
  }
  return (name) => (nachName.size === 0 ? undefined : nachName.get(normalisiereTitel(name)));
}

/* ------------------------------------------------------------------ */
/* Dateiart, Herkunft und Dateiname für Vorschau und Herunterladen     */
/* ------------------------------------------------------------------ */

export type DateiArt = "pdf" | "bild" | "andere";

const BILD_ENDUNGEN = ["jpg", "jpeg", "png", "webp", "gif", "avif", "svg"];

/**
 * Die Endung aus einer Adresse oder einem Namen, ohne Abfrageteil, klein.
 * Leer, wenn keine da ist. Reine Ziffern zählen nicht als Endung: In
 * „Mietvertrag WE 09_23.02.2010" ist „2010" das Jahr.
 */
export function dateiEndung(wert: string | null | undefined): string {
  const ohneZusatz = (wert || "").split(/[?#]/)[0];
  const letztes = ohneZusatz.split("/").pop() || "";
  const treffer = letztes.match(/\.([a-z0-9]{2,5})$/i);
  return treffer && /[a-z]/i.test(treffer[1]) ? treffer[1].toLowerCase() : "";
}

/**
 * Was die Vorschau mit der Datei anfangen kann.
 *
 * Die Endung kommt aus dem gespeicherten Wert (der Ablagepfad trägt sie) und
 * erst ersatzweise aus dem Namen. HEIC und Office-Dateien kann der Browser
 * nicht einbetten, eine unbekannte Art würde im Rahmen sogar einen Download
 * auslösen. Beides zählt deshalb als „andere".
 */
export function dateiArt(gespeichert: string, name?: string): DateiArt {
  const endung = dateiEndung(gespeichert) || dateiEndung(name);
  if (endung === "pdf") return "pdf";
  if (BILD_ENDUNGEN.includes(endung)) return "bild";
  return "andere";
}

/**
 * Liegt die Datei auf einem fremden Server?
 *
 * Dieselbe Unterscheidung wie in `resolveUnterlagenUrl`: Eine vollständige
 * Adresse, die nicht in unseren Speicher zeigt, etwa ein Investagon-Link auf
 * tool.investagon.com. Solche Dateien lassen sich nicht zuverlässig
 * einbetten, der fremde Server kann das Einbetten verbieten.
 */
export function liegtAufFremdemServer(gespeichert: string | null | undefined): boolean {
  const wert = (gespeichert || "").trim();
  return /^https?:\/\//i.test(wert) && !wert.includes("/storage/v1/object/");
}

/**
 * Der Name, unter dem eine Datei gespeichert wird.
 *
 * Der Anzeigename trägt oft keine Endung („Teilungserklärung"), der Ablagepfad
 * schon. Ohne Endung wüsste der Rechner nach dem Herunterladen nicht, womit er
 * die Datei öffnen soll. Schrägstriche und Doppelpunkte fallen weg, sie sind
 * in Dateinamen nicht erlaubt.
 */
export function downloadDateiname(name: string, gespeichert: string): string {
  // Ein Punkt am Ende („Friesenstr.") gäbe sonst „Friesenstr..pdf", Windows verbietet ihn ohnehin.
  const sauber = (name || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "") || "Dokument";
  if (dateiEndung(sauber)) return sauber;
  const endung = dateiEndung(gespeichert);
  return endung ? `${sauber}.${endung}` : sauber;
}
