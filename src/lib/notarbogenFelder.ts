import type { KaufvertragData } from "@/lib/investmentsStore";

/**
 * Die Pflichtangaben des Notar-Aufnahmebogens, in Schritte geordnet.
 *
 * Der Bogen war bis 09/2026 ein einziges Formular mit elf Karten und
 * fünfundvierzig Feldern untereinander. Wer ihn öffnete, sah eine Wand und
 * wusste nicht, wo er anfangen soll und wann er fertig ist. Jetzt läuft er
 * wie die Objektauswahl in Schritten mit Fortschrittsanzeige.
 *
 * Geschnitten ist nach der Frage, wer die Antwort hat, nicht nach der
 * Reihenfolge im Papierbogen:
 *
 *   1 Verkäufer              kommt aus der Objektauswahl und der Einreichung
 *   2 Käufer                 kommt aus Kontakt, Selbstauskunft, Reservierung
 *   3 Vertragsobjekt         Grundbuchauszug, Adresse, Preis
 *   4 Zahlung                die beiden Banken, wohin und wovon
 *   5 Rücklage und Inventar  von der Hausverwaltung und vom Verkäufer
 *   6 Beteiligte             Vermittler, Hausverwaltung, Notizen
 *
 * Diese Liste ist zugleich die Pflichtfeldliste des Bogens. Sie steht hier
 * und nicht in der Komponente, damit die Lückenanzeige geprüft werden kann,
 * ohne das ganze Formular zu bauen. Genau wie `kennzahlenLuecken` in
 * `objektDatenPflicht.ts` für die Objektauswahl.
 *
 * Pflicht heißt gekennzeichnet und aufgezählt, nicht verriegelt. Gespeichert
 * wird auch unvollständig, sonst erfindet jemand eine IBAN, um weiterzukommen,
 * und eine erfundene IBAN ist schlechter als eine fehlende.
 */

export const NOTARBOGEN_SCHRITTE = [
  "Verkäufer",
  "Käufer",
  "Vertragsobjekt",
  "Zahlung",
  "Rücklage und Inventar",
  "Beteiligte",
];

export interface NotarbogenPflichtfeld {
  feld: keyof KaufvertragData;
  /** So heißt das Feld im Bogen, mit dem Bereich davor, damit es auffindbar ist. */
  label: string;
  /** Index in `NOTARBOGEN_SCHRITTE`. */
  schritt: number;
  /** Wofür die Angabe gebraucht wird. Ohne diesen Satz bleibt ein Feld leer. */
  wofuer: string;
}

export const NOTARBOGEN_PFLICHTFELDER: NotarbogenPflichtfeld[] = [
  /* ── Schritt 1: Verkäufer ── */
  { feld: "vk_art", label: "Verkäufer, Firma oder Privatperson", schritt: 0, wofuer: "Entscheidet, ob der Bogen einen Firmennamen oder einen Vor- und Nachnamen führt" },
  { feld: "vk_name", label: "Verkäufer, Name", schritt: 0, wofuer: "Vertragspartei im Kaufvertrag" },
  { feld: "vk_vorname", label: "Verkäufer, Vorname", schritt: 0, wofuer: "Vertragspartei im Kaufvertrag" },
  { feld: "vk_geburtsdatum", label: "Verkäufer, Geburtsdatum", schritt: 0, wofuer: "Der Notar weist die Person damit aus" },
  { feld: "vk_anschrift", label: "Verkäufer, Anschrift", schritt: 0, wofuer: "Ladungsanschrift des Notariats" },
  { feld: "vk_telefon", label: "Verkäufer, Telefon", schritt: 0, wofuer: "Rückfragen des Notariats zur Beurkundung" },
  { feld: "vk_email", label: "Verkäufer, E-Mail", schritt: 0, wofuer: "Der Vertragsentwurf geht per E-Mail hinaus" },
  { feld: "vk_hrb", label: "Verkäufer, HRB", schritt: 0, wofuer: "Bei einer Gesellschaft prüft der Notar die Vertretung" },

  /* ── Schritt 2: Käufer ── */
  { feld: "k_name", label: "Käufer, Name", schritt: 1, wofuer: "Vertragspartei im Kaufvertrag" },
  { feld: "k_vorname", label: "Käufer, Vorname", schritt: 1, wofuer: "Vertragspartei im Kaufvertrag" },
  { feld: "k_geburtsdatum", label: "Käufer, Geburtsdatum", schritt: 1, wofuer: "Der Notar weist die Person damit aus" },
  { feld: "k_anschrift", label: "Käufer, Anschrift", schritt: 1, wofuer: "Ladungsanschrift des Notariats" },
  { feld: "k_telefon", label: "Käufer, Telefon", schritt: 1, wofuer: "Rückfragen des Notariats zum Termin" },
  { feld: "k_email", label: "Käufer, E-Mail", schritt: 1, wofuer: "Der Vertragsentwurf geht per E-Mail hinaus" },
  { feld: "k_steuerid", label: "Käufer, Steuer-ID", schritt: 1, wofuer: "Das Finanzamt braucht sie für die Grunderwerbsteuer" },

  /* ── Schritt 3: Vertragsobjekt ── */
  { feld: "amtsgericht", label: "Amtsgericht", schritt: 2, wofuer: "Ohne Grundbuchangaben legt der Notar keinen Entwurf an" },
  { feld: "gemarkung", label: "Gemarkung", schritt: 2, wofuer: "Ohne Grundbuchangaben legt der Notar keinen Entwurf an" },
  { feld: "blatt", label: "Blatt", schritt: 2, wofuer: "Ohne Grundbuchangaben legt der Notar keinen Entwurf an" },
  { feld: "flnr", label: "Flurstücknummer", schritt: 2, wofuer: "Ohne Grundbuchangaben legt der Notar keinen Entwurf an" },
  { feld: "obj_adresse", label: "Adresse des Objekts", schritt: 2, wofuer: "Bezeichnung des Vertragsobjekts" },
  { feld: "obj_wohnungsnummer", label: "Wohnungsnummer laut Teilungserklärung", schritt: 2, wofuer: "Ohne sie steht im Bogen das Haus und nicht die Wohnung" },
  { feld: "obj_bebauung", label: "Bebauung", schritt: 2, wofuer: "Steht als Ankreuzfeld im Bogen und im PDF" },
  { feld: "kaufpreis", label: "Kaufpreis", schritt: 2, wofuer: "Geschäftswert für Notarkosten und Grunderwerbsteuer" },

  /* ── Schritt 4: Zahlung ── */
  { feld: "bank_name", label: "Kontoinhaber des Verkäufers", schritt: 3, wofuer: "Wohin der Kaufpreis überwiesen wird" },
  { feld: "bank_institut", label: "Bank des Verkäufers", schritt: 3, wofuer: "Wohin der Kaufpreis überwiesen wird" },
  { feld: "bank_iban", label: "IBAN des Verkäufers", schritt: 3, wofuer: "Ohne IBAN keine Kaufpreisfälligkeit" },
  { feld: "bank_bic", label: "BIC des Verkäufers", schritt: 3, wofuer: "Gehört zur Zahlungsanweisung im Vertrag" },
  { feld: "bank_aktenzeichen", label: "Aktenzeichen der abzulösenden Bank", schritt: 3, wofuer: "Die alte Grundschuld muss gelöscht werden" },
  { feld: "bank_abloesend_anschrift", label: "Anschrift der abzulösenden Bank", schritt: 3, wofuer: "Der Notar fordert dort die Löschungsbewilligung an" },

  /* ── Schritt 5: Rücklage und Inventar ── */
  { feld: "ruecklage_datum", label: "Rücklage, Stichtag", schritt: 4, wofuer: "Zu welchem Tag der Betrag gilt" },
  { feld: "ruecklage_gesamt", label: "Rücklage gesamt", schritt: 4, wofuer: "Kommt aus der Abrechnung der Hausverwaltung" },
  { feld: "ruecklage_anteilig", label: "Rücklage anteilig", schritt: 4, wofuer: "Dieser Teil mindert die Grunderwerbsteuer" },

  /* ── Schritt 6: Beteiligte ── */
  { feld: "makler_name", label: "Vermittler, Firmierung", schritt: 5, wofuer: "Vermittlernachweis im Kaufvertrag" },
  { feld: "makler_anschrift", label: "Vermittler, Anschrift", schritt: 5, wofuer: "Vermittlernachweis im Kaufvertrag" },
  { feld: "hv_name", label: "Hausverwaltung, Name", schritt: 5, wofuer: "Der Notar holt dort die Verwalterzustimmung ein" },
  { feld: "hv_anschrift", label: "Hausverwaltung, Anschrift", schritt: 5, wofuer: "Der Notar holt dort die Verwalterzustimmung ein" },
];

/** Dieselbe Liste, nur die Feldnamen. Für die Sternchen an den Beschriftungen. */
export const NOTARBOGEN_PFLICHT_NAMEN: (keyof KaufvertragData)[] =
  NOTARBOGEN_PFLICHTFELDER.map((p) => p.feld);

/** Ob ein Feld Pflicht ist. */
export function istPflichtfeld(feld: keyof KaufvertragData): boolean {
  return NOTARBOGEN_PFLICHT_NAMEN.includes(feld);
}

/**
 * Gilt dieses Pflichtfeld für diesen Bogen?
 *
 * Eine Firma hat keinen Vornamen. Steht die Wahl auf „Firma“, ist der Vorname
 * also kein offener Punkt, sondern gar kein Feld: Er wird nicht angezeigt und
 * darf auch nicht als Lücke gezählt werden, sonst bliebe der Schritt bei einem
 * Bauträger dauerhaft unvollständig.
 *
 * Solange nichts gewählt ist, bleibt der Vorname Pflicht wie bisher. Das ist
 * der Zustand jedes bestehenden Bogens, und dort steht in beiden Feldern etwas.
 */
function giltFuer(feld: keyof KaufvertragData, data: KaufvertragData): boolean {
  if (feld === "vk_vorname") return data.vk_art !== "firma";
  // Beim ganzen Haus gibt es keine Wohnung darin, also auch keine Wohnungsnummer.
  if (feld === "obj_wohnungsnummer") return data.obj_gesamtobjekt !== true;
  return true;
}

/**
 * Was noch fehlt. Ohne `schritt` über den ganzen Bogen, mit `schritt` nur in
 * diesem einen.
 *
 * Leer heißt hier: nichts oder nur Leerzeichen. Eine Null im Kaufpreis wäre
 * ausgefüllt, aber das Feld nimmt ohnehin nur Ziffern an und bleibt sonst leer.
 */
export function notarbogenLuecken(
  data: KaufvertragData,
  schritt?: number,
): NotarbogenPflichtfeld[] {
  return NOTARBOGEN_PFLICHTFELDER.filter(
    (p) =>
      (schritt === undefined || p.schritt === schritt) &&
      giltFuer(p.feld, data) &&
      !String((data as Record<string, unknown>)[p.feld] ?? "").trim(),
  );
}

/**
 * Wie viele Pflichtangaben ein Schritt kennt. Für „3 von 7 offen“.
 *
 * `data` ist freiwillig und wird nur gebraucht, wo die Zahl zum Bogen passen
 * soll: Bei einer Firma zählt der Vorname nicht mit. Ohne `data` kommt die
 * ganze Liste zurück, so wie sie im Verzeichnis steht.
 */
export function pflichtfelderImSchritt(
  schritt: number,
  data?: KaufvertragData,
): NotarbogenPflichtfeld[] {
  return NOTARBOGEN_PFLICHTFELDER.filter(
    (p) => p.schritt === schritt && (!data || giltFuer(p.feld, data)),
  );
}

/**
 * Wie viele Pflichtangaben schon dastanden, als der Bogen geöffnet wurde.
 *
 * Das ist die Arbeit, die Kontakt, Selbstauskunft, Reservierung und
 * Objektauswahl bereits abgenommen haben. Ohne diese Zahl sieht der Bearbeiter
 * nur die Lücken und nicht, dass zwei Drittel schon standen.
 */
export function vorausgefuellt(data: KaufvertragData): number {
  return pflichtfelderGesamt(data) - notarbogenLuecken(data).length;
}

/**
 * Wie viele Pflichtangaben dieser Bogen kennt.
 *
 * Nicht immer dieselbe Zahl: Bei einer Firma entfällt der Vorname des
 * Verkäufers. Ohne diese Stelle stünde im Kopf „12 von 36“, obwohl es nur
 * fünfunddreißig zu füllen gibt.
 */
export function pflichtfelderGesamt(data: KaufvertragData): number {
  return NOTARBOGEN_PFLICHTFELDER.filter((p) => giltFuer(p.feld, data)).length;
}
