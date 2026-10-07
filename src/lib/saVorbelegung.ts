/**
 * Die sichtbare Markierung der vorbelegten Selbstauskunft.
 *
 * Beim zweiten und jedem weiteren Kauf wird das Selbstauskunfts-Formular mit
 * den Angaben des vorherigen Investments vorbelegt, damit niemand alles noch
 * einmal tippen muss. Vorgabe des Geschäftsführers vom 10.09.2026: Das muss
 * sichtbar sein, samt Herkunft, und die Markierung verschwindet, sobald der
 * Wert geprüft oder geändert wurde.
 *
 * Markiert wird auf zwei Ebenen, Abschnitt und Feld. Der Abschnitt sagt, wo
 * etwas zu prüfen ist, das Feld sagt, was genau. Die Abschnittsmarkierung
 * allein reichte nicht: In Investment 4 war nicht mehr zu erkennen, welche
 * Angabe aus Investment 3 stammt und welche selbst eingetippt ist
 * (Rückmeldung des Geschäftsführers vom 14.09.2026).
 *
 * Die Sorge vor einer Wand aus Warnfarbe bleibt berechtigt, das Formular hat
 * weit über hundert Felder. Deshalb zwei Regeln: Markiert wird nur, was
 * wirklich einen Wert aus dem alten Vorgang trägt, nie ein leeres Feld. Und
 * die Markierung ist keine Warnung, sondern ein ruhiger gestrichelter Rahmen
 * in der Akzentfarbe mit dem Wort „Übernommen“. Warnorange und Fehlerrot
 * bleiben den Pflichtfeldern und den Fehlern vorbehalten.
 *
 * Ein Feld wird als Pfad im Formularstand geführt, etwa "einkommen.netto" für
 * Person 1 und "person2Data.einkommen.netto" für Person 2.
 *
 * Bewusst ohne Importe aus dem Formular gehalten, sonst entsteht ein
 * Importkreis. Die leeren Vergleichswerte werden von außen hereingereicht.
 */

/** Was über eine Vorbelegung in der Selbstauskunft mitgeführt wird. */
export interface SaVorbelegung {
  /** Nummer des Investments, aus dem die Angaben stammen. */
  ausInvestment: number;
  /** Wann übernommen wurde, als ISO-Zeitstempel. */
  uebernommenAm: string;
  /** Schritte, die noch als übernommen markiert sind. */
  offeneAbschnitte: number[];
  /**
   * Die einzelnen Angaben, die noch als übernommen markiert sind, als Pfad im
   * Formularstand. Fehlt bei Ständen aus der Zeit vor der Feldmarkierung, das
   * Formular füllt sie dann mit `felderInAbschnitten` nach.
   */
  felder?: string[];
}

/**
 * Welche Felder zu welchem Schritt des Formulars gehören.
 *
 * Die Reihenfolge entspricht STEPS in SelbstauskunftForm.tsx. Schritt 7
 * (Abschluss) trägt keine eigenen Angaben und fehlt deshalb.
 *
 * In Schritt 1 fehlen Name, Anschrift, Geburtsdatum und Erreichbarkeit mit
 * Absicht: Die stehen in den Stammdaten des Kontakts und werden von dort
 * gefüllt, nicht aus einer alten Selbstauskunft. Sie als übernommen zu
 * markieren wäre falsch.
 */
export const SA_ABSCHNITTSFELDER: Record<number, string[]> = {
  0: ["wuenscheZiele"],
  1: [
    "titel", "geburtsname", "staatsangehoerigkeit", "staatsangehoerigkeitAndere",
    // Die Steuer-ID fehlt bewusst: Sie kommt aus den Stammdaten und aus einer
    // vorhandenen Reservierung, ändert sich nie und wäre nur Lärm.
    "familienstand", "wohnhaftSeit", "mobilfunk",
    "steuerklasse", "kirchensteuer", "gueterstand", "kinder",
  ],
  2: [
    "beschaeftigungsart", "anstellung", "selbstaendigkeit", "arbeitsvertragArt",
    "befristetBis", "bruttoJahr", "zvEJahr", "monatsgehaelter", "einkommen",
    "gehalt13", "gehalt14", "bankkonten",
  ],
  3: [
    "mietart", "mieteWarm", "nebenkosten", "lebenshaltungskosten", "privateKV",
    "versicherungsbeitraege", "sonstigeAusgaben", "sonstigeAusgabenWofuer",
    "unterhalt", "kfzAnzahl", "kfzKosten",
    "versBU", "versRiester", "versAV", "versWeitere",
  ],
  4: ["vermoegenswerte", "immobilien"],
  5: ["kredite", "buergschaften"],
  6: ["mahnverfahren", "schufaBekannt", "schufaScore", "hinweise"],
};

/**
 * Felder, die es im Datenmodell gibt, aber nirgends im Formular zu sehen.
 *
 * `gehalt13` und `gehalt14` stehen nur noch im Typ und im PDF, ein
 * Eingabefeld dafür gibt es nicht mehr; `versicherungsbeitraege` ebenso. Ein
 * alter Vorgang kann sie trotzdem tragen.
 *
 * Sie sind von der Markierung ausgenommen, und zwar auf beiden Ebenen: Ein
 * Feld, das niemand sieht, kann niemand prüfen. Stünde es in der Liste, hielte
 * es den Streifen „Bitte prüfen“ über dem Abschnitt offen, ohne dass irgendwo
 * etwas markiert wäre. Der Nutzer suchte dann nach einer Stelle, die es nicht
 * gibt, und käme nur über „Angaben geprüft“ wieder heraus.
 *
 * Bekommt eines der drei wieder ein Eingabefeld, gehört es hier heraus.
 */
export const SA_FELDER_OHNE_EINGABE = ["gehalt13", "gehalt14", "versicherungsbeitraege"];

/** Die Schritte, für die es überhaupt eine Markierung geben kann. */
export const SA_ABSCHNITTE = Object.keys(SA_ABSCHNITTSFELDER).map(Number);

/** Zu welchem Schritt gehört ein Feldname? */
const ABSCHNITT_JE_FELD: Record<string, number> = {};
for (const schritt of SA_ABSCHNITTE) {
  for (const feld of SA_ABSCHNITTSFELDER[schritt]) ABSCHNITT_JE_FELD[feld] = schritt;
}

/** Der Vorsatz, an dem ein Feld von Person 2 zu erkennen ist. */
const P2 = "person2Data.";

/**
 * Zu welchem Schritt gehört ein Feldpfad?
 *
 * Der Vorsatz für Person 2 und ein Unterfeld wie ".netto" fallen dabei weg,
 * beide ändern den Schritt nicht. Undefined heißt: gehört zu keinem Schritt,
 * der markiert wird.
 */
export function abschnittZuFeld(pfad: string): number | undefined {
  const ohnePerson = pfad.startsWith(P2) ? pfad.slice(P2.length) : pfad;
  return ABSCHNITT_JE_FELD[ohnePerson.split(".")[0]];
}

/** Welche Schritte sind durch diese Felder betroffen? */
export function abschnitteZuFeldern(felder: string[]): number[] {
  const schritte = new Set<number>();
  for (const pfad of felder) {
    const schritt = abschnittZuFeld(pfad);
    if (schritt !== undefined) schritte.add(schritt);
  }
  return [...schritte].sort((a, b) => a - b);
}

/** Alles außer den Feldern eines Schrittes. Für den Knopf „Angaben geprüft“. */
export function felderOhneAbschnitt(felder: string[], schritt: number): string[] {
  return felder.filter((pfad) => abschnittZuFeld(pfad) !== schritt);
}

/** Der Wert an einem Feldpfad, oder undefined, wenn es ihn nicht gibt. */
export function wertAn(stand: Record<string, unknown> | null | undefined, pfad: string): unknown {
  let wert: unknown = stand;
  for (const teil of pfad.split(".")) {
    if (!wert || typeof wert !== "object") return undefined;
    wert = (wert as Record<string, unknown>)[teil];
  }
  return wert;
}

function gleich(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Fehlender Wert und leerer Text sind derselbe Zustand.
  const leerA = a === undefined || a === null || a === "";
  const leerB = b === undefined || b === null || b === "";
  if (leerA || leerB) return leerA && leerB;
  return JSON.stringify(a) === JSON.stringify(b);
}

function istGruppe(wert: unknown): wert is Record<string, unknown> {
  return !!wert && typeof wert === "object" && !Array.isArray(wert);
}

/**
 * Trägt dieser Wert überhaupt eine Angabe?
 *
 * „Übernommen“ heißt: Aus dem alten Vorgang steht hier etwas. Fehlt der Wert
 * oder ist er leer, ist nichts übernommen worden, und markiert wird nichts.
 *
 * Das ist nicht dasselbe wie der Vergleich gegen den Leerstand, und genau
 * daran hing ein Fehler: Mehrere Felder haben eine Voreinstellung, etwa
 * `mietart` mit „Zur Miete“ (bis zum 29.09.2026 auch `mahnverfahren` und
 * `schufaBekannt` mit „nein“). Ein alter Vorgang, der noch aus der Zeit vor diesen Feldern stammt,
 * trägt dort gar nichts. Ohne diese Prüfung wich sein fehlender Wert von der
 * Voreinstellung ab und wurde als Übernahme markiert, obwohl nichts
 * übernommen wurde.
 *
 * `false` zählt mit als nichts: Ein nicht gesetzter Schalter ist keine Angabe.
 * Kein Feld hat `true` als Voreinstellung, ein `false` kann also nie eine
 * bewusste Abweichung sein.
 */
function traegtAngabe(wert: unknown): boolean {
  if (wert === undefined || wert === null || wert === false) return false;
  if (typeof wert === "string") return wert.trim() !== "";
  if (Array.isArray(wert)) return wert.length > 0;
  return true;
}

/**
 * Die Pfade eines einzelnen Feldes, die einen übernommenen Wert tragen.
 *
 * Eine Gruppe wie `einkommen` wird aufgeschlüsselt, sonst würde die Markierung
 * auch an den leeren Feldern der Gruppe hängen. Eine Liste wie `kredite` bleibt
 * dagegen als Ganzes stehen: Ihre Zeilen sind ohnehin nur zusammen sinnvoll,
 * und eine Markierung an jeder Zelle wäre genau die Wand aus Farbe, die
 * niemand mehr liest.
 */
function feldPfade(feld: string, wert: unknown, leerWert: unknown, vorsatz: string): string[] {
  if (istGruppe(wert)) {
    const leerGruppe = istGruppe(leerWert) ? leerWert : {};
    return Object.keys(wert)
      .filter((unterfeld) => traegtAngabe(wert[unterfeld]) && !gleich(wert[unterfeld], leerGruppe[unterfeld]))
      .map((unterfeld) => `${vorsatz}${feld}.${unterfeld}`);
  }
  if (!traegtAngabe(wert)) return [];
  return gleich(wert, leerWert) ? [] : [`${vorsatz}${feld}`];
}

/**
 * Welche einzelnen Angaben sind tatsächlich übernommen?
 *
 * Verglichen wird gegen den leeren Formularstand. Alles, was dort schon so
 * steht (Anrede „Herr", Mietart „Zur Miete", Kindergeld „0", die
 * Voreinstellung „nein"), ist keine Übernahme, sondern die Voreinstellung des
 * Formulars und wird nicht markiert. Ein leeres Feld ebenso wenig: Es hat
 * nichts aus dem alten Vorgang mitbekommen.
 *
 * Person 2 zählt mit denselben Feldnamen mit, ihre Angaben stehen im selben
 * Schritt wie die von Person 1 und tragen den Vorsatz `person2Data.`. Ein Feld
 * gilt für Person 2, wenn es im leeren Personenstand vorkommt oder im alten
 * Vorgang bei Person 2 steht. Ohne den zweiten Fall blieben die
 * Bank-Ergänzungen von Person 2 unerkannt, die es im leeren Personenstand
 * nicht gibt.
 */
export function uebernommeneFelder(
  saData: Record<string, unknown> | null | undefined,
  leerData: Record<string, unknown>,
  leerPerson: Record<string, unknown>,
): string[] {
  if (!saData || typeof saData !== "object") return [];
  const p2 = (saData.person2Data as Record<string, unknown> | undefined) || {};
  const p2Aktiv = !!saData.person2;

  const felder: string[] = [];
  for (const schritt of SA_ABSCHNITTE) {
    for (const feld of SA_ABSCHNITTSFELDER[schritt] || []) {
      // Was das Formular nicht zeigt, darf es auch nicht zu prüfen geben.
      if (SA_FELDER_OHNE_EINGABE.includes(feld)) continue;
      felder.push(...feldPfade(feld, saData[feld], leerData[feld], ""));
      if (p2Aktiv && (feld in leerPerson || feld in p2)) {
        felder.push(...feldPfade(feld, p2[feld], leerPerson[feld], P2));
      }
    }
  }
  return felder;
}

/** Nur die übernommenen Felder aus bestimmten Schritten. */
export function felderInAbschnitten(
  saData: Record<string, unknown> | null | undefined,
  leerData: Record<string, unknown>,
  leerPerson: Record<string, unknown>,
  abschnitte: number[],
): string[] {
  return uebernommeneFelder(saData, leerData, leerPerson).filter((pfad) => {
    const schritt = abschnittZuFeld(pfad);
    return schritt !== undefined && abschnitte.includes(schritt);
  });
}

/**
 * In welchen Schritten stehen tatsächlich übernommene Angaben?
 *
 * Dieselbe Prüfung wie bei den Feldern, nur eine Ebene höher zusammengefasst.
 */
export function abschnitteMitUebernahme(
  saData: Record<string, unknown> | null | undefined,
  leerData: Record<string, unknown>,
  leerPerson: Record<string, unknown>,
): number[] {
  return abschnitteZuFeldern(uebernommeneFelder(saData, leerData, leerPerson));
}

/**
 * Welche Felder gelten nach einer Änderung noch als übernommen?
 *
 * Wer eine Angabe anfasst, hat sie geprüft, und zwar genau diese. Die
 * Markierung der übrigen Felder bleibt stehen, sonst verschwände mit der
 * ersten Eingabe die Herkunft des ganzen Abschnitts.
 */
export function verbleibendeFelder(
  vorher: Record<string, unknown> | null | undefined,
  nachher: Record<string, unknown> | null | undefined,
  felder: string[],
): string[] {
  if (!vorher || !nachher) return felder;
  return felder.filter((pfad) => gleich(wertAn(vorher, pfad), wertAn(nachher, pfad)));
}

/**
 * Der fertige Startstand einer vorbelegten Selbstauskunft, samt Herkunft.
 *
 * Aus dem alten Vorgang wird alles entfernt, was nur dort gilt: der Abschluss
 * und eine Herkunft aus einer noch früheren Übernahme. Übrig bleiben die
 * Angaben plus der Vermerk, aus welchem Investment sie stammen und welche
 * Abschnitte noch zu prüfen sind.
 *
 * Gibt es nichts zu übernehmen, kommt null zurück und der Aufrufer startet
 * mit einem leeren Formular. Die leeren Vergleichswerte kommen von außen,
 * damit dieses Modul nicht auf das Formular zugreifen muss.
 */
export function vorbelegterSaStand(
  quelle: { data: unknown; ausInvestment: number } | null | undefined,
  leerData: Record<string, unknown>,
  leerPerson: Record<string, unknown>,
): (Record<string, unknown> & { vorbelegung: SaVorbelegung }) | null {
  const roh = quelle?.data as Record<string, unknown> | undefined;
  if (!quelle || !roh || typeof roh !== "object" || !roh.vorname) return null;

  const uebernommen: Record<string, unknown> = { ...leerData, ...roh };
  uebernommen.abgeschlossen = false;
  delete uebernommen.vorbelegung;

  const felder = uebernommeneFelder(uebernommen, leerData, leerPerson);
  if (felder.length === 0) return null;

  return {
    ...uebernommen,
    vorbelegung: {
      ausInvestment: quelle.ausInvestment,
      uebernommenAm: new Date().toISOString(),
      offeneAbschnitte: abschnitteZuFeldern(felder),
      felder,
    },
  };
}

// ── Wortlaut ────────────────────────────────────────────────────────────────
//
// Der Kunde liest dieselben Sätze im Portal wie der Vertriebspartner im CRM.
// Deshalb ist alles an den Kunden gerichtet und ohne Fachsprache.

/** Überschrift des Hinweises oben im Formular. */
export const SA_VORBELEGUNG_TITEL = "Wir haben Angaben für Sie übernommen";

/** Der erklärende Satz oben im Formular. */
export function saVorbelegungText(ausInvestment: number): string {
  return (
    `Damit Sie nicht alles noch einmal eintippen müssen, haben wir Angaben aus Ihrer ` +
    `Selbstauskunft zu Investment ${ausInvestment} übernommen. Jede übernommene Angabe ist mit ` +
    `„${SA_FELD_MARKE}“ gekennzeichnet und gestrichelt umrandet. Bitte gehen Sie diese Angaben ` +
    `durch und ändern Sie, was heute nicht mehr stimmt. Erst Ihre Bestätigung am Ende macht ` +
    `die Angaben zu Ihrer Selbstauskunft für diesen Kauf.`
  );
}

/** Die Beschriftung an einem einzelnen übernommenen Feld. */
export const SA_FELD_MARKE = "Übernommen";

/**
 * Was am Feld zusätzlich vorgelesen wird.
 *
 * Eine Farbe allein sagt einem Vorleseprogramm nichts, deshalb steht die
 * Herkunft als Text daneben, auch wenn sie am Bildschirm knapp bleibt.
 */
export function saFeldMarkeErklaerung(ausInvestment: number): string {
  return `Übernommen aus Investment ${ausInvestment}, bitte prüfen.`;
}

/**
 * Der Satz in der Legende über dem Schritt. Er steht dort hinter der Marke
 * selbst, neben den beiden vorhandenen Erklärungen zu Orange und Rot.
 */
export const SA_LEGENDE_UEBERNOMMEN =
  "stammt aus dem vorherigen Investment, gestrichelt umrandet, bitte prüfen.";

/** Der schmale Streifen über einem einzelnen Abschnitt. */
export function saAbschnittText(ausInvestment: number): string {
  return `Übernommen aus Investment ${ausInvestment}. Bitte prüfen.`;
}

/** Beschriftung des Knopfes, mit dem ein Abschnitt bestätigt wird. */
export const SA_ABSCHNITT_BESTAETIGEN = "Angaben geprüft";
