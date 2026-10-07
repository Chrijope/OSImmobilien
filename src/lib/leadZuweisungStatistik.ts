/**
 * Wie viele Leads hat die Zentrale welchem Partner zugewiesen, was ist heute
 * aus ihnen geworden, und wie viele hat er zurückgegeben?
 *
 * QUELLE
 *
 * Das zentrale Protokoll `activity_log`, Aktion `kontakt_reassigned`. Der
 * Trigger `log_kontakt_changes` schreibt bei jeder Änderung von
 * `kontakte.zustaendig_id` eine Zeile mit alter und neuer Kennung und dem
 * Handelnden (`actor_id`, leer bei Systemläufen). Die Aufzeichnung beginnt
 * am 09.07.2026. Die Verlaufsspur `meta.beraterHistorie` am Kontakt reicht
 * zwar etwas weiter zurück, führt die Partner aber nur mit Namen; zwei
 * Konten können gleich heißen. Sie dient hier nur für den Rückgabegrund.
 *
 * WAS ALS ZUWEISUNG DURCH DIE ZENTRALE ZÄHLT
 *
 * Jeder Wechsel der Zuständigkeit auf einen Partner, außer
 *  - jemand nimmt sich den Lead selbst (Handelnder = neuer Zuständiger),
 *  - ein Partner gibt seinen eigenen Lead an einen Kollegen weiter
 *    (Handelnder = bisheriger Zuständiger und ohne Leitungsrolle).
 * Ein Eigenkontakt, den der Partner selbst anlegt, erzeugt gar kein
 * Umhängen und zählt damit nie.
 *
 * Die Rolle des Handelnden ist die heutige, nicht die damals aktive: Das
 * Protokoll hält die aktive Rolle nicht fest.
 *
 * Jede Zuweisung zählt einzeln. Bekommt ein Partner denselben Lead zweimal,
 * sind das zwei Zuweisungen mit je eigenem Ausgang.
 */
import { findeGrund } from "@/lib/uebergabeGrund";
import { normalizeStufe } from "@/lib/statistikTrichter";

/** Ein Wechsel der Zuständigkeit, aus einer `activity_log`-Zeile gelesen. */
export interface Umhaengung {
  kontaktId: string;
  /** Wer umgehängt hat, `null` bei Systemläufen. */
  actorId: string | null;
  alt: string | null;
  neu: string | null;
  /** ISO-Zeitstempel. */
  am: string;
}

/** Was nach einer Zuweisung mit dem Lead passiert ist. */
export type Verbleib =
  /** Liegt noch beim Partner. */
  | "bei_ihm"
  /** Der Partner hat ihn an die Zentrale zurückgegeben. */
  | "zurueckgegeben"
  /** Der Partner hat ihn selbst an einen Kollegen weitergegeben. */
  | "weitergegeben"
  /** Die Zentrale hat ihn abgezogen, neu vergeben oder in den Pool gelegt. */
  | "abgezogen";

export interface Zuweisung {
  kontaktId: string;
  partnerId: string;
  /** Wer zugewiesen hat, `null` bei Systemläufen. */
  durchId: string | null;
  am: string;
  verbleib: Verbleib;
  /** Wann der Lead den Partner verlassen hat. */
  endeAm?: string;
}

/** Liest eine `activity_log`-Zeile. `null`, wenn es kein Umhängen ist. */
export function umhaengungAusLog(row: Record<string, unknown> | null | undefined): Umhaengung | null {
  if (!row || row.action !== "kontakt_reassigned" || !row.kontakt_id || !row.created_at) return null;
  const changes = row.changes as { zustaendig_id?: { old?: unknown; new?: unknown } } | null | undefined;
  const z = changes?.zustaendig_id;
  if (!z || typeof z !== "object") return null;
  const id = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return {
    kontaktId: String(row.kontakt_id),
    actorId: id(row.actor_id),
    alt: id(z.old),
    neu: id(z.new),
    am: String(row.created_at),
  };
}

/** Gibt ein Partner seinen eigenen Lead selbst an einen Kollegen? */
function istWeitergabeDurchPartner(u: Umhaengung, istLeitung: (id: string) => boolean): boolean {
  return !!u.actorId && u.actorId === u.alt && !istLeitung(u.actorId);
}

/** Ist dieser Wechsel eine Zuweisung durch die Zentrale? */
export function istZentraleZuweisung(u: Umhaengung, istLeitung: (id: string) => boolean): boolean {
  if (!u.neu || u.neu === u.alt) return false;
  if (u.actorId === u.neu) return false; // selbst genommen
  return !istWeitergabeDurchPartner(u, istLeitung);
}

/**
 * Setzt die Umhängungen zu Zuweisungen samt Ausgang zusammen.
 *
 * Der Ausgang ist der erste Wechsel nach der Zuweisung, der den Lead vom
 * Partner wegnimmt. Gibt es keinen, liegt er noch bei ihm.
 */
export function zuweisungenAuswerten(
  umhaengungen: Umhaengung[],
  istLeitung: (id: string) => boolean,
): Zuweisung[] {
  const jeKontakt = new Map<string, Umhaengung[]>();
  for (const u of umhaengungen) {
    const liste = jeKontakt.get(u.kontaktId) || [];
    liste.push(u);
    jeKontakt.set(u.kontaktId, liste);
  }
  const ergebnis: Zuweisung[] = [];
  for (const liste of jeKontakt.values()) {
    liste.sort((a, b) => a.am.localeCompare(b.am));
    liste.forEach((u, i) => {
      if (!istZentraleZuweisung(u, istLeitung)) return;
      const partnerId = u.neu!;
      const ende = liste.slice(i + 1).find((w) => w.alt === partnerId);
      let verbleib: Verbleib = "bei_ihm";
      if (ende) {
        const durchIhn = ende.actorId === partnerId;
        verbleib = !ende.neu && durchIhn
          ? "zurueckgegeben"
          : ende.neu && istWeitergabeDurchPartner(ende, istLeitung)
            ? "weitergegeben"
            : "abgezogen";
      }
      ergebnis.push({
        kontaktId: u.kontaktId,
        partnerId,
        durchId: u.actorId,
        am: u.am,
        verbleib,
        ...(ende ? { endeAm: ende.am } : {}),
      });
    });
  }
  return ergebnis.sort((a, b) => b.am.localeCompare(a.am));
}

/** Die Statusgruppen für die Tabelle, in Pipeline-Reihenfolge. */
export const STATUS_GRUPPEN = [
  { id: "neu", label: "Neu" },
  { id: "bearbeitung", label: "In Bearbeitung" },
  { id: "termin", label: "Termin" },
  { id: "objektauswahl", label: "Objektauswahl" },
  { id: "kaufphase", label: "Kaufphase" },
  { id: "abgeschlossen", label: "Abgeschlossen" },
  { id: "verloren", label: "Verloren" },
] as const;
export type StatusGruppe = (typeof STATUS_GRUPPEN)[number]["id"];

/** Ordnet eine Pipeline-Stufe ihrer Gruppe zu. Unbekanntes gilt als neu. */
export function statusGruppe(stufe: string | null | undefined): StatusGruppe {
  const s = normalizeStufe(stufe);
  if (["erreicht", "follow_up"].includes(s)) return "bearbeitung";
  if (["erstgespraech_geplant", "eg_noshow", "beratungsgespraech", "bg_noshow"].includes(s)) return "termin";
  if (["selbstauskunft", "objektauswahl", "follow_up_objekt"].includes(s)) return "objektauswahl";
  if (["reservierung", "bonitaetsunterlagen", "finanzierung", "notar"].includes(s)) return "kaufphase";
  if (["faelligkeit", "abrechnung", "abgeschlossen", "bestandsimport"].includes(s)) return "abgeschlossen";
  if (["verloren", "archiviert"].includes(s)) return "verloren";
  return "neu";
}

export interface PartnerZeile {
  partnerId: string;
  zuweisungen: Zuweisung[];
  /** Nur die Leads, die heute noch beim Partner liegen, je Statusgruppe. */
  jeStatus: Record<StatusGruppe, number>;
  zurueckgegeben: number;
  weitergegeben: number;
  abgezogen: number;
}

/**
 * Fasst die Zuweisungen je Partner zusammen, meiste zuerst.
 *
 * `stufeVon` liefert die heutige Stufe eines Kontakts oder `undefined`, wenn
 * er nicht mehr sichtbar ist (gelöscht). Solche Zuweisungen fallen heraus,
 * damit Summe und Aufschlüsselung zusammenpassen.
 */
export function partnerUebersicht(
  zuweisungen: Zuweisung[],
  stufeVon: (kontaktId: string) => string | undefined,
): PartnerZeile[] {
  const zeilen = new Map<string, PartnerZeile>();
  for (const z of zuweisungen) {
    const stufe = stufeVon(z.kontaktId);
    if (stufe === undefined) continue;
    let zeile = zeilen.get(z.partnerId);
    if (!zeile) {
      zeile = {
        partnerId: z.partnerId,
        zuweisungen: [],
        jeStatus: Object.fromEntries(STATUS_GRUPPEN.map((g) => [g.id, 0])) as Record<StatusGruppe, number>,
        zurueckgegeben: 0,
        weitergegeben: 0,
        abgezogen: 0,
      };
      zeilen.set(z.partnerId, zeile);
    }
    zeile.zuweisungen.push(z);
    if (z.verbleib === "bei_ihm") zeile.jeStatus[statusGruppe(stufe)]++;
    else zeile[z.verbleib]++;
  }
  return [...zeilen.values()].sort((a, b) => b.zuweisungen.length - a.zuweisungen.length);
}

/**
 * Der Grund einer Rückgabe aus der Verlaufsspur des Kontakts.
 *
 * Gesucht wird der abgeschlossene Eintrag, dessen Ende am nächsten am
 * Zeitpunkt der Rückgabe liegt, höchstens zehn Minuten daneben. Die Spur
 * schreibt die Uhr des Browsers, das Protokoll die der Datenbank.
 */
export function rueckgabeGrund(historie: unknown, am: string): string {
  if (!Array.isArray(historie)) return "";
  const ziel = Date.parse(am);
  if (!Number.isFinite(ziel)) return "";
  let bester: { abstand: number; text: string } | null = null;
  for (const e of historie) {
    if (!e || typeof e !== "object" || !e.bis || !(e.grund || e.grundText)) continue;
    const abstand = Math.abs(Date.parse(e.bis) - ziel);
    if (!(abstand <= 10 * 60 * 1000)) continue;
    const option = findeGrund(e.grund);
    const zusatz = String(e.grundText || "").trim();
    const text = option ? (zusatz ? `${option.label}: ${zusatz}` : option.label) : zusatz;
    if (!bester || abstand < bester.abstand) bester = { abstand, text };
  }
  return bester?.text || "";
}
