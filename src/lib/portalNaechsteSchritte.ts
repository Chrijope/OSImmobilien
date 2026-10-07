/**
 * Die naechsten Schritte im Kundenportal, ueber alle Investments hinweg.
 *
 * Auf der Startseite des Portals stand bisher je Investment ein eigener
 * Kasten "Als Naechstes". Bei zwei Kaeufen las der Kunde damit zwei Listen
 * nebeneinander und musste selbst zusammensuchen, was er heute zu tun hat.
 * Diese Sammlung fuehrt beides zusammen: erst das, was wir vom Kunden
 * brauchen, dann seine Termine, zuletzt der ruhige Statushinweis zu den
 * Kaeufen, bei denen von ihm gerade nichts gebraucht wird.
 *
 * Die Texte sind Kundensprache, nicht Beratersprache. Der Berater liest
 * "Bonitaetsunterlagen anfordern", der Kunde liest "Uns fehlen noch drei
 * Unterlagen". Deshalb wird der Leitfaden der Beraterseite
 * (`nextStepsGuide.ts`) hier bewusst NICHT wiederverwendet.
 *
 * Bewusst ohne Zugriff auf den Datencache (`dataCache`, `investmentsStore`):
 * Die Portalseiten laden ihre Zeilen direkt aus Supabase und haben den Cache
 * nicht gefuellt. Alles, was diese Datei braucht, kommt deshalb aus den
 * uebergebenen Zeilen. Aus demselben Grund ist `istTerminInZukunft` aus
 * `kontaktPipeline.ts` hier nachgebaut statt importiert, denn jener Import
 * zoege den halben Cache mit in das Portal.
 */
import i18n from "@/i18n";
import { applyLegacyDocKeys } from "@/lib/bankpruefungDocs";
import { istSelbststaendig, pflichtBonitaetDocs } from "@/lib/bonitaetDocs";
import { fortschrittsRang } from "@/lib/pipelineStufen";
import { investmentBezeichnung } from "@/lib/portalCopy";
import { portalUnterlagenListe } from "@/lib/portalUnterlagenListe";
import {
  istSaHinterlegtAusMeta,
  istUnterlagenFreigeschaltetAusMeta,
} from "@/lib/unterlagenFreigabe";
import { portalSprache } from "@/i18n/portalSprache";
import { datumText } from "@/lib/sprachFormat";

/** Datum in der Anzeigesprache; Unlesbares bleibt so stehen, wie es gespeichert ist. */
const formatDatum = (datum?: string | null) => datumText(datum, portalSprache()) || datum || "";

/** Der Ausschnitt einer investments-Zeile, den das Portal geladen hat. */
export interface PortalInvestmentEingabe {
  id: string;
  objekt?: string | null;
  wohnung?: string | null;
  meta?: Record<string, any> | null;
}

/** Woran der Punkt haengt. Steuert nur das Symbol, nicht den Text. */
export type PortalSchrittIkone =
  | "upload"
  | "unterschrift"
  | "kalender"
  | "uhr"
  | "pruefung"
  | "erledigt"
  | "objekt"
  | "bank"
  | "notar"
  | "ordner";

export type PortalSchrittArt =
  /** Wir brauchen etwas vom Kunden. */
  | "aufgabe"
  /** Ein Termin steht an. */
  | "termin"
  /** Ruhiger Statushinweis, es liegt gerade nicht beim Kunden. */
  | "hinweis";

export interface PortalSchritt {
  /** Stabiler Schluessel fuer die Liste in React. */
  schluessel: string;
  art: PortalSchrittArt;
  ikone: PortalSchrittIkone;
  titel: string;
  text: string;
  /**
   * Investment, auf das sich der Punkt bezieht. Leer bei Terminen, die am
   * Kontakt haengen und zu keinem einzelnen Kauf gehoeren.
   */
  investmentId: string;
  /** Objektname. Nur gefuellt, wenn der Kunde mehrere Investments hat. */
  investmentLabel: string;
  /**
   * Abschnitt auf der Investmentseite, zu dem der Punkt fuehrt. Leer heisst:
   * kein Ziel, der Punkt bekommt keinen Knopf.
   */
  abschnitt: string;
  aktionLabel: string;
}

export interface PortalSchritteEingabe {
  investments: PortalInvestmentEingabe[];
  kontaktMeta?: Record<string, any> | null;
  /** Nur fuer Tests. Ohne Angabe gilt die aktuelle Uhrzeit. */
  jetzt?: Date;
}

/**
 * Die ersten Pflichtunterlagen, die der Kunde schon vor der Freischaltung
 * hochladen kann. Gleiche zwei Namen wie im Kundenprofil und in der
 * Unterlagenliste des Portals.
 */
const ERSTE_PFLICHT_DOCS = ["Personalausweis", "Letzter Gehaltsnachweis"];

/**
 * Selbststaendige haben keine Gehaltsnachweise. Fuer sie bleibt von den
 * ersten Pflichtunterlagen nur der Personalausweis.
 */
function erstePflichtDocs(invMeta: Record<string, any>): string[] {
  const art = (invMeta.saData || invMeta.saSnapshot || {})?.beschaeftigungsart;
  if (istSelbststaendig(art)) return ERSTE_PFLICHT_DOCS.filter((n) => !n.includes("Gehaltsnachweis"));
  return [...ERSTE_PFLICHT_DOCS];
}

/** Die Pflichtunterlagen dieses Investments, abhaengig von der Beschaeftigungsart. */
function pflichtDocs(invMeta: Record<string, any>): string[] {
  return pflichtBonitaetDocs((invMeta.saData || invMeta.saSnapshot || {})?.beschaeftigungsart);
}

/** Endzustaende. Dort steht fuer den Kunden nichts mehr an. */
const ABGESCHLOSSENE_STUFEN = new Set(["archiviert", "verloren"]);

/**
 * Ab hier ist der Kauf beim Notar durch. Unterlagen fuer die Bank braucht
 * dann niemand mehr, und ein Bestandskunde aus dem Import darf auf keinen
 * Fall lesen, es fehlten noch fuenf Nachweise.
 */
const KAUF_DURCH = new Set([
  "faelligkeit",
  "abrechnung",
  "abgeschlossen",
  "bestandsimport",
  "vermoegensaufbau",
]);

/** Ab dem Notartermin fragt niemand mehr nach der Selbstauskunft. */
const SA_NICHT_MEHR_FRAGEN = new Set([...KAUF_DURCH, "notar", "notar_mit_gs", "notar_ohne_gs"]);

const t = (schluessel: string, werte?: Record<string, unknown>): string =>
  String(i18n.t(`portal.stammdaten.naechste.${schluessel}`, werte as never));

/**
 * Liegt der Termin noch vor uns?
 *
 * Datum als "YYYY-MM-DD" oder "DD.MM.YYYY", Uhrzeit als "HH:MM". Ohne
 * Uhrzeit zaehlt der Termin bis zum Tagesende, heute ist also noch
 * bevorstehend. Gleiche Regel wie `istTerminInZukunft` im CRM.
 */
function istInZukunft(datum: string | undefined, uhrzeit: string | undefined, jetzt: Date): boolean {
  const zeitpunkt = alsZeitpunkt(datum, uhrzeit);
  return zeitpunkt !== null && zeitpunkt > jetzt.getTime();
}

function alsZeitpunkt(datum: string | undefined, uhrzeit: string | undefined): number | null {
  if (!datum) return null;
  let iso = String(datum).trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(iso)) {
    const [tag, monat, jahr] = iso.split(".");
    iso = `${jahr}-${monat}-${tag}`;
  }
  const zeit = uhrzeit && /^\d{1,2}:\d{2}$/.test(uhrzeit) ? uhrzeit : "23:59";
  const geparst = new Date(`${iso}T${zeit.length === 4 ? "0" + zeit : zeit}:00`);
  return isNaN(geparst.getTime()) ? null : geparst.getTime();
}

function istHochgeladen(status: unknown): boolean {
  return status === "uploaded" || status === "approved";
}

/** Ist die Selbstauskunft dieses Kaufs unterschrieben zurueck? */
function istSaFertig(invMeta: Record<string, any>): boolean {
  if (istSaHinterlegtAusMeta(invMeta)) return true;
  return !!(
    invMeta.saSigned ||
    invMeta.saData?.unterschrift ||
    invMeta.saSignedPdfUrl ||
    invMeta.saSignedAt ||
    invMeta.docStatuses?.Selbstauskunft === "approved"
  );
}

/**
 * Laeuft der Selbstauskunfts-Vorgang bereits?
 *
 * Gleiche Bedingung wie das Freischalten des Unterlagen-Kaestchens auf der
 * Investmentseite. Vorher fragt niemand nach der Selbstauskunft, dann soll
 * sie auch nicht auf der Startseite stehen.
 */
function laeuftSaVorgang(invMeta: Record<string, any>, pipelineStufe: string): boolean {
  if (verlaufsRang(pipelineStufe) >= fortschrittsRang("selbstauskunft")) return true;
  return !!(invMeta.saData || invMeta.saSigned || invMeta.saSignedPdfUrl || invMeta.saInvitationSentAt);
}

/**
 * Rang der Stufe im Verlauf.
 *
 * "notar_mit_gs" und "notar_ohne_gs" stehen nicht in der Fortschrittsliste
 * und bekaemen sonst den Rang null, also den eines frischen Leads. Gleiche
 * Zuordnung wie `normalizePipelineStufe` im CRM, nur ohne dessen Zugriff auf
 * den Datencache.
 */
function verlaufsRang(pipelineStufe: string): number {
  const key =
    pipelineStufe === "notar_mit_gs" || pipelineStufe === "notar_ohne_gs" ? "notar" : pipelineStufe;
  return fortschrittsRang(key);
}

/**
 * Die Pflichtunterlagen, die zu diesem Kauf noch fehlen.
 *
 * Dieselbe Liste wie auf beiden Portalseiten (portalUnterlagenListe.ts): vor
 * der Freischaltung nur Personalausweis und letzter Gehaltsnachweis, danach
 * die vollstaendige Pflichtliste plus die aus der Selbstauskunft abgeleiteten
 * Banknachweise. Die Selbstauskunft selbst zaehlt hier nicht mit, sie ist
 * ein eigener Punkt.
 */
function fehlendeUnterlagen(
  inv: PortalInvestmentEingabe,
  invMeta: Record<string, any>,
  kontaktMeta: Record<string, any>,
): number {
  const hatPerson2 = !!kontaktMeta.person2;
  const liste = portalUnterlagenListe({ investmentRow: inv, kontaktMeta });
  const pflicht = [...liste.p1.aktiv, ...(hatPerson2 ? liste.p2.aktiv : [])]
    .filter((doc) => doc.required)
    .map((doc) => doc.name);

  const eindeutig = [...new Set(pflicht)];
  const statuses = applyLegacyDocKeys(invMeta.docStatuses, eindeutig);
  return eindeutig.filter((name) => !istHochgeladen(statuses[name])).length;
}

/** Darf der Kunde gerade einen Notartermin aus Vorschlaegen waehlen? */
function notarwahlOffen(invMeta: Record<string, any>): boolean {
  if ((invMeta.notarTerminModus || "gesetzt") !== "vorschlaege") return false;
  // Ohne Aufnahmebogen erscheinen im Portal grundsaetzlich keine Notardaten.
  if (!(invMeta.kaufvertragPdf && String(invMeta.kaufvertragPdf).trim() !== "")) return false;
  if (!invMeta.notarTerminPortalFreigabe) return false;
  if (invMeta.notarTerminBestaetigt) return false;
  return (invMeta.notarTerminVorschlaegeFreigegeben || []).length > 0;
}

/** Der Notartermin dieses Kaufs, sofern er im Portal gezeigt werden darf. */
function notarTermin(invMeta: Record<string, any>): { datum?: string; uhrzeit?: string } | null {
  const hatAufnahmebogen = !!(invMeta.kaufvertragPdf && String(invMeta.kaufvertragPdf).trim() !== "");
  if (!hatAufnahmebogen) return null;
  const bestaetigt = invMeta.notarTerminBestaetigt as { datum?: string; uhrzeit?: string } | undefined;
  if (bestaetigt?.datum) return { datum: bestaetigt.datum, uhrzeit: bestaetigt.uhrzeit };
  if (!invMeta.notarTerminPortalFreigabe) return null;
  if ((invMeta.notarTerminModus || "gesetzt") !== "gesetzt") return null;
  const nd = invMeta.notarData || {};
  const datum = nd.datum || invMeta.notarTermin;
  if (!datum) return null;
  return { datum, uhrzeit: nd.uhrzeit || invMeta.notarUhrzeit };
}

interface TerminRoh {
  datum?: string;
  uhrzeit?: string;
  titel: string;
  ikone: PortalSchrittIkone;
  investmentId: string;
  investmentLabel: string;
  abschnitt: string;
}

/**
 * Wie das Gespraech beim Kunden heisst.
 *
 * Ab der Beratungsstufe ist das Erstgespraech gelaufen, der eingetragene
 * Termin ist dann das Beratungsgespraech. Gleiche Unterscheidung wie
 * `setterTerminName` im CRM, nur ohne dessen Zugriff auf den Datencache.
 */
function gespraechTitel(pipelineStufe: string): string {
  return verlaufsRang(pipelineStufe) >= fortschrittsRang("beratungsgespraech")
    ? t("termin_beratung_titel")
    : t("termin_erst_titel");
}

/** Der Statushinweis zur laufenden Phase, in Kundensprache. */
function phasenHinweis(
  pipelineStufe: string,
  invMeta: Record<string, any>,
  kontaktMeta: Record<string, any>,
): { ikone: PortalSchrittIkone; titel: string; text: string; abschnitt: string; aktionLabel: string } | null {
  const hint = (schluessel: string): string =>
    i18n.t(`portal.stammdaten.hints.${schluessel}`) as string;

  switch (pipelineStufe) {
    // Beide Schreibweisen, solange Altdaten die alte Stufe tragen.
    case "erstgespraech_geplant":
    case "erstgespraech":
      return {
        ikone: "uhr",
        titel: hint("erstgespraech_title"),
        text: hint("erstgespraech_text"),
        abschnitt: "erstgespraech",
        aktionLabel: hint("show_details"),
      };

    case "bonitaetsunterlagen": {
      const statuses = invMeta.docStatuses || {};
      const freigeschaltet = istUnterlagenFreigeschaltetAusMeta(invMeta, kontaktMeta);
      const relevant = freigeschaltet ? pflichtDocs(invMeta) : erstePflichtDocs(invMeta);
      const alleFreigegeben = relevant.every((name) => statuses[name] === "approved");
      // Hierher kommt nur, wer keine Unterlage mehr offen hat. Entweder ist
      // alles freigegeben oder die Pruefung laeuft noch.
      if (alleFreigegeben) {
        return {
          ikone: "erledigt",
          titel: hint("bon_approved_title"),
          text: hint("bon_approved_text"),
          abschnitt: "bonitaetsunterlagen",
          aktionLabel: hint("show_details"),
        };
      }
      return {
        ikone: "pruefung",
        titel: hint("bon_review_title"),
        text: hint("bon_review_text"),
        abschnitt: "bonitaetsunterlagen",
        aktionLabel: hint("show_status"),
      };
    }

    // "follow_up_objekt" ist die manuelle Follow-Up-Stufe nach der
    // Objektvorstellung, fuer den Kunden gilt derselbe Hinweis.
    case "follow_up_objekt":
    case "objektauswahl":
      return {
        ikone: "objekt",
        titel: hint("objektauswahl_title"),
        text: hint("objektauswahl_text"),
        abschnitt: "objektauswahl",
        aktionLabel: hint("objektauswahl_action"),
      };

    case "reservierung":
      return {
        ikone: "unterschrift",
        titel: hint("reservierung_title"),
        text: hint("reservierung_text"),
        abschnitt: "reservierung",
        aktionLabel: hint("reservierung_action"),
      };

    case "finanzierung": {
      const hatAngebote = invMeta.finanzierungsStatus || invMeta.finanzierungsBank;
      return hatAngebote
        ? {
            ikone: "bank",
            titel: hint("fin_offers_title"),
            text: hint("fin_offers_text"),
            abschnitt: "finanzierung",
            aktionLabel: hint("fin_offers_action"),
          }
        : {
            ikone: "bank",
            titel: hint("fin_waiting_title"),
            text: hint("fin_waiting_text"),
            abschnitt: "finanzierung",
            aktionLabel: hint("show_status"),
          };
    }

    case "notar_ohne_gs":
      return {
        ikone: "notar",
        titel: hint("notar_arrange_title"),
        text: hint("notar_arrange_text"),
        abschnitt: "notar",
        aktionLabel: hint("show_details"),
      };

    case "notar_mit_gs":
      return {
        ikone: "ordner",
        titel: hint("folder_title"),
        text: hint("folder_text"),
        abschnitt: "faelligkeit",
        aktionLabel: hint("folder_action"),
      };

    default:
      return null;
  }
}

/**
 * Stellt die Liste zusammen, die der Kunde auf der Portal-Startseite liest.
 *
 * Reihenfolge:
 *   1. was wir vom Kunden brauchen (Selbstauskunft, Unterlagen, Terminwahl),
 *   2. seine anstehenden Termine, der naechste zuerst,
 *   3. der ruhige Statushinweis zu jedem Kauf, bei dem nichts bei ihm liegt.
 *
 * Eine leere Rueckgabe heisst: es steht nichts an. Die Seite zeigt dann einen
 * ruhigen Satz statt einer leeren Karte.
 */
export function sammleNaechsteSchritte(eingabe: PortalSchritteEingabe): PortalSchritt[] {
  const jetzt = eingabe.jetzt || new Date();
  const kontaktMeta = (eingabe.kontaktMeta || {}) as Record<string, any>;
  const alle = eingabe.investments || [];
  const mehrere = alle.length > 1;

  const aufgaben: PortalSchritt[] = [];
  const hinweise: PortalSchritt[] = [];
  const termineRoh: TerminRoh[] = [];

  for (const inv of alle) {
    const invMeta = (inv.meta || {}) as Record<string, any>;
    const pipelineStufe = invMeta.pipelineStufe || kontaktMeta.pipelineStufe || "erstgespraech_geplant";
    if (ABGESCHLOSSENE_STUFEN.has(pipelineStufe)) continue;

    const label = mehrere
      ? investmentBezeichnung(inv.objekt, inv.wohnung) ||
        (i18n.t("portal.stammdaten.investment_fallback") as string)
      : "";

    let hatAufgabe = false;

    // Vermerk „Kunde finanziert selbst“ (im CRM gesetzt): Selbstauskunft und
    // Bonitäts- samt Bankunterlagen werden nicht gebraucht, also fordert die
    // Startseite auch nichts davon an.
    const unterlagenEntfallen = !!invMeta.selbstauskunftEntfaellt?.aktiv;

    // 1. Selbstauskunft
    if (
      !unterlagenEntfallen &&
      laeuftSaVorgang(invMeta, pipelineStufe) &&
      !SA_NICHT_MEHR_FRAGEN.has(pipelineStufe) &&
      !istSaFertig(invMeta)
    ) {
      hatAufgabe = true;
      aufgaben.push({
        schluessel: `sa-${inv.id}`,
        art: "aufgabe",
        ikone: "unterschrift",
        titel: t("sa_titel"),
        text: t("sa_text"),
        investmentId: inv.id,
        investmentLabel: label,
        abschnitt: "bonitaetsunterlagen",
        aktionLabel: t("sa_aktion"),
      });
    }

    // 2. Fehlende Unterlagen
    const fehlen = KAUF_DURCH.has(pipelineStufe) || unterlagenEntfallen ? 0 : fehlendeUnterlagen(inv, invMeta, kontaktMeta);
    if (fehlen > 0 && laeuftSaVorgang(invMeta, pipelineStufe)) {
      hatAufgabe = true;
      aufgaben.push({
        schluessel: `docs-${inv.id}`,
        art: "aufgabe",
        ikone: "upload",
        titel: t("unterlagen_titel", { count: fehlen }),
        text: t("unterlagen_text", { count: fehlen }),
        investmentId: inv.id,
        investmentLabel: label,
        abschnitt: "bonitaetsunterlagen",
        aktionLabel: t("unterlagen_aktion"),
      });
    }

    // 3. Notartermin auswaehlen
    if (notarwahlOffen(invMeta)) {
      hatAufgabe = true;
      aufgaben.push({
        schluessel: `notarwahl-${inv.id}`,
        art: "aufgabe",
        ikone: "kalender",
        titel: t("notarwahl_titel"),
        text: t("notarwahl_text"),
        investmentId: inv.id,
        investmentLabel: label,
        abschnitt: "notar",
        aktionLabel: t("notarwahl_aktion"),
      });
    }

    // Termine am Investment
    for (const [datum, uhrzeit] of [
      [invMeta.setterTerminDatum, invMeta.setterTerminUhrzeit],
      [invMeta.beratungsgespraechAm, invMeta.beratungsgespraechUhrzeit],
    ] as [string | undefined, string | undefined][]) {
      if (istInZukunft(datum, uhrzeit, jetzt)) {
        termineRoh.push({
          datum,
          uhrzeit,
          titel: gespraechTitel(pipelineStufe),
          ikone: "kalender",
          investmentId: inv.id,
          investmentLabel: label,
          abschnitt: "",
        });
      }
    }
    const notar = notarTermin(invMeta);
    if (notar && istInZukunft(notar.datum, notar.uhrzeit, jetzt)) {
      termineRoh.push({
        datum: notar.datum,
        uhrzeit: notar.uhrzeit,
        titel: t("termin_notar_titel"),
        ikone: "notar",
        investmentId: inv.id,
        investmentLabel: label,
        abschnitt: "notar",
      });
    }

    // 4. Ruhiger Statushinweis, nur ohne offene Aufgabe an diesem Kauf
    if (!hatAufgabe) {
      const hinweis = phasenHinweis(pipelineStufe, invMeta, kontaktMeta);
      if (hinweis) {
        hinweise.push({
          schluessel: `phase-${inv.id}`,
          art: "hinweis",
          ikone: hinweis.ikone,
          titel: hinweis.titel,
          text: hinweis.text,
          investmentId: inv.id,
          investmentLabel: label,
          abschnitt: hinweis.abschnitt,
          aktionLabel: hinweis.aktionLabel,
        });
      }
    }
  }

  // Termine, die am Kontakt haengen und zu keinem einzelnen Kauf gehoeren.
  const kontaktStufe = kontaktMeta.pipelineStufe || "erstgespraech_geplant";
  for (const [datum, uhrzeit, titel] of [
    [kontaktMeta.setterTerminDatum, kontaktMeta.setterTerminUhrzeit, gespraechTitel(kontaktStufe)],
    [kontaktMeta.erstgespraechAm, kontaktMeta.erstgespraechUhrzeit, t("termin_erst_titel")],
    [kontaktMeta.beratungsgespraechAm, kontaktMeta.beratungsgespraechUhrzeit, t("termin_beratung_titel")],
  ] as [string | undefined, string | undefined, string][]) {
    if (istInZukunft(datum, uhrzeit, jetzt)) {
      termineRoh.push({
        datum,
        uhrzeit,
        titel,
        ikone: "kalender",
        investmentId: "",
        investmentLabel: "",
        abschnitt: "",
      });
    }
  }

  // Denselben Termin gibt es oft an Kontakt und Investment. Einmal reicht.
  const gesehen = new Set<string>();
  const termine: PortalSchritt[] = termineRoh
    .sort((a, b) => (alsZeitpunkt(a.datum, a.uhrzeit) || 0) - (alsZeitpunkt(b.datum, b.uhrzeit) || 0))
    .filter((termin) => {
      const schluessel = `${termin.titel}|${termin.datum}|${termin.uhrzeit || ""}`;
      if (gesehen.has(schluessel)) return false;
      gesehen.add(schluessel);
      return true;
    })
    .map((termin, i) => ({
      schluessel: `termin-${i}-${termin.datum}`,
      art: "termin" as const,
      ikone: termin.ikone,
      titel: termin.titel,
      text: termin.uhrzeit
        ? t("termin_text_mit_uhrzeit", { datum: formatDatum(termin.datum), uhrzeit: termin.uhrzeit })
        : t("termin_text_ohne_uhrzeit", { datum: formatDatum(termin.datum) }),
      investmentId: termin.investmentId,
      investmentLabel: termin.investmentLabel,
      abschnitt: termin.abschnitt,
      aktionLabel: t("termin_aktion"),
    }));

  return [...aufgaben, ...termine, ...hinweise];
}
