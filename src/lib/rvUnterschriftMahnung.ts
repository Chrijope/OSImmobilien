/**
 * Die Eskalation, wenn die Reservierungsvereinbarung ohne Unterschrift liegen
 * bleibt.
 *
 * Die ganze Kette fuer den zustaendigen Partner:
 *
 *   Tag 2, 5, 10   hier, im Browser (`useInvestmentInboxTriggers`), je eine
 *                  Aufgabe in der Inbox; Tag 10 zusaetzlich als Glocke an die
 *                  Vertriebsleitung. Freigabe Christian, 23.09.2026.
 *   Tag 14         serverseitig in `supabase/functions/send-reservierung-eskalation`
 *                  (taeglich ueber pg_cron), Aufgabe und Glocke fuer den
 *                  Berater. Bleibt bestehen, Entscheidung Christian vom
 *                  24.09.2026.
 *
 * Vorgeschichte: In `useInvestmentInboxTriggers` standen zwei Erinnerungen
 * ("RV-Gegenzeichnung Kunde", "RV noch nicht unterschrieben"), die nie
 * ausgeloest haben. Ihre Bedingung war "ein Reservierungs-PDF liegt vor und
 * ist noch nicht unterschrieben". Das PDF entsteht aber erst mit der
 * Unterschrift (`finalize-reservierung`), die Bedingung konnte also nie
 * zutreffen.
 *
 * Massgeblich ist stattdessen `rvSignaturePending`: Das setzt die Edge
 * Function `send-reservation-signature` in dem Moment, in dem die Mail zur
 * Unterschrift hinausgeht. Denselben Moment haelt `rvSignatureSentAt` fest,
 * und daraus rechnet sich die Frist.
 *
 * Hier steht ausschliesslich Rechnerei, damit sie ohne React und ohne
 * Datenbank pruefbar ist. Das Anlegen der Aufgaben bleibt im Hook.
 *
 * An den Kunden geht bewusst keine automatische Erinnerung, siehe den Kopf
 * von `supabase/functions/signatur-erinnerung/index.ts`. Es geht hier
 * ausschliesslich um den zustaendigen Vertriebspartner.
 */

export interface RvMahnStufe {
  /**
   * Grundschluessel der Sperre. Gesperrt wird je Versand, siehe
   * `rvSperrSchluessel`.
   */
  schluessel: string;
  /** Ab wie vielen Tagen seit dem Versand die Stufe faellig wird. */
  tage: number;
  prioritaet: "mittel" | "hoch" | "dringend";
  typ: "anruf" | "follow_up" | "aufgabe";
  /** Die letzte Stufe geht zusaetzlich an die Vertriebsleitung. */
  anVertriebsleitung: boolean;
}

/**
 * Zwei, fuenf, zehn Tage. Freigabe Christian, 23.09.2026. Die vierte Stufe
 * an Tag 14 laeuft serverseitig, siehe Dateikopf.
 */
export const RV_MAHN_STUFEN: RvMahnStufe[] = [
  { schluessel: "rv_unterschrift_2d", tage: 2, prioritaet: "mittel", typ: "follow_up", anVertriebsleitung: false },
  { schluessel: "rv_unterschrift_5d", tage: 5, prioritaet: "dringend", typ: "anruf", anVertriebsleitung: false },
  { schluessel: "rv_unterschrift_10d", tage: 10, prioritaet: "dringend", typ: "aufgabe", anVertriebsleitung: true },
];

/**
 * Nur Versaende ab diesem Zeitpunkt durchlaufen die drei Stufen:
 * 25.09.2026, 00:00 Uhr deutscher Zeit (Sommerzeit, also 24.09., 22:00 UTC).
 *
 * Entscheidung Christian vom 24.09.2026: Altfaelle starten ruhig. Eine
 * Vereinbarung, die vorher verschickt wurde, bekommt keine Stufe und keine
 * Glocke an die Vertriebsleitung, auch nicht verspaetet. Sonst loeste der
 * erste Lauf nach dem Ausrollen fuer jede liegengebliebene Vereinbarung
 * sofort die Eskalation aus. Dasselbe gilt fuer Vorgaenge ganz ohne
 * `rvSignatureSentAt`, sie zaehlen als alt.
 *
 * Die Anzeige "wartet auf Unterschrift" im Kundenprofil betrifft das nicht,
 * sie gilt fuer alle offenen Vereinbarungen.
 */
export const RV_ERINNERUNG_AB = new Date("2026-09-24T22:00:00.000Z");

export interface RvUnterschriftStand {
  /** Die Vereinbarung ist versendet und noch nicht unterschrieben. */
  wartet: boolean;
  /** Zeitpunkt des Versands. Ohne `rvSignatureSentAt`: null. */
  seit: Date | null;
  /** Volle Tage seit dem Versand. Ohne Zeitpunkt: null. */
  tage: number | null;
}

/** Nur die Felder, auf die es ankommt. So bleibt der Test frei vom Store. */
export interface RvMeta {
  rvSignaturePending?: unknown;
  rvSigned?: unknown;
  rvSignatureSentAt?: unknown;
  /** Der Vermerk "Reservierung entfaellt" (Zeitstempel), falls gesetzt. */
  rvReservierungEntfallenAm?: unknown;
  /**
   * Dateiname der unterschriebenen Vereinbarung. Sie entsteht erst mit der
   * Unterschrift; liegt sie vor, wartet nichts mehr, auch wenn ein Altdatensatz
   * `rvSigned` nie gesetzt hat.
   */
  rvPdf?: unknown;
}

function istGefuellt(wert: unknown): boolean {
  return typeof wert === "string" && !!wert.trim();
}

function alsDatum(wert: unknown): Date | null {
  if (typeof wert !== "string" || !wert.trim()) return null;
  const d = new Date(wert);
  return Number.isNaN(d.getTime()) ? null : d;
}

function volleTage(von: Date, bis: Date): number {
  return Math.floor((bis.getTime() - von.getTime()) / 86_400_000);
}

/** Wartet diese Reservierung auf die Unterschrift, und seit wann? */
export function rvUnterschriftStand(
  meta: RvMeta | null | undefined,
  optionen: { jetzt?: Date } = {},
): RvUnterschriftStand {
  const jetzt = optionen.jetzt ?? new Date();
  const m = meta || {};
  const wartet =
    m.rvSignaturePending === true &&
    m.rvSigned !== true &&
    !istGefuellt(m.rvReservierungEntfallenAm) &&
    !istGefuellt(m.rvPdf);
  if (!wartet) return { wartet: false, seit: null, tage: null };

  const versendet = alsDatum(m.rvSignatureSentAt);
  if (!versendet) return { wartet: true, seit: null, tage: null };
  return { wartet: true, seit: versendet, tage: Math.max(0, volleTage(versendet, jetzt)) };
}

/**
 * Laeuft fuer diesen Versand die Erinnerungskette? Nur ab `RV_ERINNERUNG_AB`,
 * und nur mit bekanntem Versandzeitpunkt.
 */
export function rvErinnerungLaeuft(stand: RvUnterschriftStand): boolean {
  return stand.wartet && !!stand.seit && stand.seit.getTime() >= RV_ERINNERUNG_AB.getTime();
}

/**
 * Der Sperrschluessel einer Stufe fuer genau diesen Versand.
 *
 * Gesperrt wird je Versand, nicht je Investment: Nach einem Einheitswechsel
 * oder einer aufgehobenen Reservierung loescht `clearRvSignatureData` den
 * Versandzeitpunkt, und die neue Vereinbarung geht mit einem neuen hinaus.
 * Mit einem Schluessel je Investment bekaeme sie nie wieder eine Erinnerung,
 * die alte Sperre stuende ja noch.
 */
export function rvSperrSchluessel(stufe: RvMahnStufe, versendet: Date): string {
  return `${stufe.schluessel}@${versendet.toISOString()}`;
}

export interface RvMahnung {
  /** Die Stufe, zu der jetzt eine Aufgabe entsteht. */
  stufe: RvMahnStufe;
  /** Alle Sperrschluessel, die danach gesetzt werden, die angelegte Stufe eingeschlossen. */
  sperren: string[];
}

/**
 * Welche Erinnerung jetzt entsteht, oder keine.
 *
 * Immer hoechstens eine: die hoechste faellige Stufe, die noch offen ist.
 * Niedrigere, noch offene Stufen werden dabei mitgesperrt. Der Hook laeuft
 * nur im geoeffneten Dashboard; wer nach zwei Wochen wiederkommt, bekaeme
 * sonst drei Aufgaben zum selben Vorgang auf einmal, von "schreib ihm heute"
 * bis "Eskalation". Gebraucht wird aber nur der Stand von heute.
 *
 * Vor `RV_ERINNERUNG_AB` versendete oder zeitlose Vorgaenge bekommen nichts.
 */
export function naechsteRvMahnung(
  stand: RvUnterschriftStand,
  wurdeGesendet: (schluessel: string) => boolean,
): RvMahnung | null {
  if (!rvErinnerungLaeuft(stand) || stand.tage === null) return null;
  const versendet = stand.seit!;
  const offen = RV_MAHN_STUFEN.filter(
    (s) => stand.tage! >= s.tage && !wurdeGesendet(rvSperrSchluessel(s, versendet)),
  );
  if (offen.length === 0) return null;
  return {
    stufe: offen[offen.length - 1],
    sperren: offen.map((s) => rvSperrSchluessel(s, versendet)),
  };
}

/** "1 Tag", "3 Tagen". Die Zahl traegt die Aussage, deshalb steht sie in jedem Text. */
export function tageText(tage: number): string {
  return tage === 1 ? "1 Tag" : `${tage} Tagen`;
}

export interface RvMahnTexte {
  titel: string;
  beschreibung: string;
}

/**
 * Die Texte der drei Stufen. Sie sagen, was zu tun ist, nicht nur, was fehlt.
 * Du-Form, keine Gedankenstriche.
 */
export function rvMahnTexte(
  stufe: RvMahnStufe,
  angaben: { kundeName: string; investmentLabel: string; tage: number },
): RvMahnTexte {
  const { kundeName, investmentLabel, tage } = angaben;
  const seit = tageText(tage);
  const objekt = `${kundeName} (${investmentLabel})`;

  if (stufe.schluessel === "rv_unterschrift_2d") {
    return {
      titel: `Reservierung unterschreiben lassen: ${kundeName}`,
      beschreibung:
        `Die Reservierungsvereinbarung für ${objekt} ist seit ${seit} zur Unterschrift versendet und noch nicht zurück. ` +
        `Schreib oder ruf den Kunden heute an, frag nach offenen Fragen zur Vereinbarung und halte fest, bis wann er unterschreibt.`,
    };
  }

  if (stufe.schluessel === "rv_unterschrift_5d") {
    return {
      titel: `Reservierung seit ${seit} offen: ${kundeName}`,
      beschreibung:
        `Die Reservierungsvereinbarung für ${objekt} wartet seit ${seit} auf die Unterschrift. Eine Mail reicht jetzt nicht mehr. ` +
        `Ruf den Kunden heute an, kläre was ihn aufhält, und vereinbare einen festen Tag für die Unterschrift.`,
    };
  }

  return {
    titel: `Eskalation Reservierung ohne Unterschrift: ${kundeName}`,
    beschreibung:
      `Die Reservierungsvereinbarung für ${objekt} ist seit ${seit} versendet und weiterhin ohne Unterschrift. ` +
      `Nimm heute Kontakt auf, halte das Ergebnis schriftlich im Investment fest und stimme mit der Vertriebsleitung ab, ` +
      `ob die Einheit weiter für den Kunden gebunden bleibt. Die Vertriebsleitung ist bereits informiert.`,
  };
}

/**
 * Die Glocke an die Vertriebsleitung zur letzten Stufe.
 *
 * Eigener Text, denn die Aufgabe spricht den Partner an ("Nimm heute Kontakt
 * auf"). Die Vertriebsleitung soll dagegen lesen, um wen es geht und wer
 * zustaendig ist.
 */
export function rvVertriebsleitungTexte(angaben: {
  kundeName: string;
  investmentLabel: string;
  tage: number;
  partnerName?: string;
}): RvMahnTexte {
  const { kundeName, investmentLabel, tage, partnerName } = angaben;
  const zustaendig = partnerName?.trim() ? ` Zuständig ist ${partnerName.trim()}, die Aufgabe dazu liegt seit heute in der Inbox.` : "";
  return {
    titel: `Reservierung ohne Unterschrift: ${kundeName}`,
    beschreibung:
      `Die Reservierungsvereinbarung für ${kundeName} (${investmentLabel}) ist seit ${tageText(tage)} versendet und weiterhin ohne Unterschrift.` +
      zustaendig,
  };
}

/**
 * Der Satz für die Kachel "Nächste Aktion" im Kundenprofil.
 *
 * Ohne Versandzeitpunkt (`tage` null) ohne Tagesangabe: Eine geratene Dauer
 * wäre schlechter als keine.
 */
export function rvWartetKachelText(tage: number | null, bezeichnung = "Reservierungsvereinbarung"): string {
  if (tage === null) return `${bezeichnung} versendet, wartet auf Unterschrift`;
  return `${bezeichnung} wartet seit ${tageText(tage)} auf Unterschrift`;
}
