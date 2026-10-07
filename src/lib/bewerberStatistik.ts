/**
 * Die Bewerberauswertung der Statistikseite.
 *
 * Sie lag als privater Block in `Statistiken.tsx` und rechnete seit jeher
 * falsch. Der Grund war eine zweite, von Hand gepflegte Stufenliste:
 * "Eingang, Screening, 16P-Test, Interview, Entscheidung, Onboarding". Der
 * echte Bewerberprozess hat andere Stufen, die einzige Überschneidung war
 * "Eingang". Da die Zuordnung "passende Stufe, sonst Eingang" lautete und nie
 * eine passte, stand jeder Bewerber im Balken Eingang und die übrigen fünf
 * standen dauerhaft auf null.
 *
 * Deshalb steht hier keine eigene Liste mehr, sondern nur eine andere Sicht
 * auf `bewerbungStore`. Dasselbe Muster hat im Haus schon mehrfach Schaden
 * angerichtet, siehe den Kopf von `statistikTrichter.ts`.
 */
import {
  PIPELINE_STUFEN,
  STATUS_LABELS,
  migrateStatus,
  isRejectedStatus,
  type BewerberStatus,
} from "./bewerbungStore";

/**
 * Eine Zeile der Tabelle `bewerbungen`, so wie sie im Zwischenspeicher liegt.
 *
 * Bewusst so schmal wie möglich: Die Auswertung braucht nur den Status und
 * zwei Felder aus `meta`, und ein Test soll nicht einen vollständigen
 * Bewerber bauen müssen, um eine Zählung zu prüfen.
 */
export type BewerberZeile = {
  status?: string | null;
  meta?: Record<string, unknown> | null;
};

/** Ein Balken der Pipeline-Verteilung. */
export type BewerberStufenAnteil = {
  stufe: BewerberStatus;
  /** Anzeigename aus `STATUS_LABELS`, damit "Erstgespraech" nicht so dasteht. */
  label: string;
  count: number;
};

export type BewerberKennzahlen = {
  gesamt: number;
  /** Weder aktiv geworden noch abgesprungen. */
  imProzess: number;
  aktiv: number;
  /** Abgelehnt und Kein Interesse zusammen. */
  ausgeschieden: number;
};

/**
 * Nur echte Bewerberzeilen.
 *
 * Stellen und Onboarding-Termine liegen in derselben Tabelle und tragen dafür
 * einen Vermerk in `meta._type`. Die Statistik filterte auf `meta.type` ohne
 * Unterstrich, traf damit nichts und zählte die Sonderzeilen mit.
 */
export function istBewerberZeile(zeile: BewerberZeile): boolean {
  const typ = (zeile.meta as { _type?: unknown } | null | undefined)?._type;
  return !typ || typ === "bewerber";
}

/**
 * Die Stufe, in der eine Zeile gezählt wird.
 *
 * Läuft über dieselbe Umschreibung wie `bewerberFromDb`, damit Altbestände
 * hier und im Bewerbermanagement in derselben Stufe stehen.
 */
export function bewerberStufe(zeile: BewerberZeile): BewerberStatus {
  return migrateStatus(String(zeile.status || "Eingang"));
}

/**
 * Die Balken der Pipeline-Verteilung, in der Reihenfolge des Prozesses.
 *
 * "Abgelehnt" und "Kein Interesse" bekommen keinen Balken: Sie sind keine
 * Stufe, sondern das Ende des Weges, und stehen deshalb in den Kennzahlen.
 */
export function bewerberPipelineVerteilung(zeilen: BewerberZeile[]): BewerberStufenAnteil[] {
  const proStufe = new Map<BewerberStatus, number>();
  for (const zeile of zeilen.filter(istBewerberZeile)) {
    const stufe = bewerberStufe(zeile);
    proStufe.set(stufe, (proStufe.get(stufe) || 0) + 1);
  }
  return PIPELINE_STUFEN.map((stufe) => ({
    stufe,
    label: STATUS_LABELS[stufe],
    count: proStufe.get(stufe) || 0,
  }));
}

/**
 * Die vier Kacheln über der Verteilung.
 *
 * "Im Prozess" zog früher `statusMap["abgelehnt"]` und `statusMap["onboarding"]`
 * ab, beides klein geschrieben. Die Daten schreiben "Abgelehnt" groß, und
 * "Onboarding" gibt es im Bewerberprozess gar nicht. Damit zählte jeder
 * Absager weiter als laufender Bewerber. Die Prüfung läuft jetzt über
 * `isRejectedStatus` aus dem Store, dieselbe Stelle, die auch das
 * Bewerbermanagement fragt.
 */
export function bewerberKennzahlen(zeilen: BewerberZeile[]): BewerberKennzahlen {
  const bewerber = zeilen.filter(istBewerberZeile);
  let aktiv = 0;
  let ausgeschieden = 0;
  for (const zeile of bewerber) {
    const stufe = bewerberStufe(zeile);
    if (stufe === "Aktiv") aktiv += 1;
    else if (isRejectedStatus(stufe)) ausgeschieden += 1;
  }
  return {
    gesamt: bewerber.length,
    // Wer aktiv geworden ist, ist am Ziel und nicht mehr im Prozess. Damit
    // ergeben die vier Zahlen zusammen wieder die Gesamtzahl.
    imProzess: bewerber.length - aktiv - ausgeschieden,
    aktiv,
    ausgeschieden,
  };
}
