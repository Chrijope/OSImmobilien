/**
 * Erinnerungen an Bewerber für die Inbox.
 *
 * Zwei Quellen, ein Mechanismus:
 *
 *   - Das manuelle Follow-Up (followUpDatum, followUpUhrzeit, followUpNotiz),
 *     wie es die Übersichtskarte und Empfehlung B im Erstgespräch setzen.
 *     Kennung `bw-<bewerberId>`, erscheint am Tag selbst.
 *   - Der Rückruf bei Bedenkzeit aus dem Reiter Closing (bedenkzeitRueckrufAm
 *     mit Uhrzeit, Kanal, Vorbereitung). Kennung `bz-<bewerberId>`, erscheint
 *     mit dem eingestellten Vorlauf (Standard: 1 Tag vorher) und bleibt bis
 *     zum Abhaken. Verschwindet von selbst, sobald nach dem Rückruf eine
 *     Entscheidung erfasst ist.
 *
 * Bedenkzeit und Follow-Up bleiben getrennte Status; hier werden nur die
 * Inbox-Einträge aus beiden Quellen abgeleitet. Inbox, Fokus-Modus,
 * Seitenleiste und Kennzahlen lesen alle diese eine Liste.
 */
import type { Bewerber } from "./bewerbungStore";

export type BedenkzeitKanal = "telefon" | "videocall" | "whatsapp" | "email";

export const BEDENKZEIT_KANAELE: { id: BedenkzeitKanal; label: string }[] = [
  { id: "telefon", label: "Telefon" },
  { id: "videocall", label: "Videocall" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "E-Mail" },
];
export const BEDENKZEIT_KANAL_STANDARD: BedenkzeitKanal = "telefon";

export const BEDENKZEIT_ERINNERUNG_OPTIONEN: { tage: number; label: string }[] = [
  { tage: 0, label: "am Tag des Rückrufs" },
  { tage: 1, label: "1 Tag vorher" },
  { tage: 2, label: "2 Tage vorher" },
  { tage: 7, label: "1 Woche vorher" },
];
export const BEDENKZEIT_ERINNERUNG_STANDARD_TAGE = 1;

export function kanalLabel(kanal?: string): string {
  return BEDENKZEIT_KANAELE.find((k) => k.id === (kanal || BEDENKZEIT_KANAL_STANDARD))?.label
    ?? BEDENKZEIT_KANAELE[0].label;
}

export function erinnerungLabel(tage?: number): string {
  const t = typeof tage === "number" ? tage : BEDENKZEIT_ERINNERUNG_STANDARD_TAGE;
  return BEDENKZEIT_ERINNERUNG_OPTIONEN.find((o) => o.tage === t)?.label ?? `${t} Tage vorher`;
}

/** Vorlauf der Erinnerung, mit Standard, falls nichts gespeichert ist. */
export function bedenkzeitErinnerungTage(b: Pick<Bewerber, "bedenkzeitErinnerungTage">): number {
  return typeof b.bedenkzeitErinnerungTage === "number" ? b.bedenkzeitErinnerungTage : BEDENKZEIT_ERINNERUNG_STANDARD_TAGE;
}

/** TT.MM.JJJJ oder JJJJ-MM-TT als lokales Datum (Tagesbeginn), sonst null. */
export function parseTag(d?: string): Date | null {
  if (!d) return null;
  const german = d.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) return new Date(+german[3], +german[2] - 1, +german[1]);
  const iso = d.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  return null;
}

export function formatTag(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

/** Der Tag, an dem die Erinnerung zum Rückruf fällig wird (TT.MM.JJJJ). */
export function bedenkzeitErinnerungsTag(rueckrufAm: string, tageVorher: number): string {
  const tag = parseTag(rueckrufAm);
  if (!tag) return "";
  tag.setDate(tag.getDate() - Math.max(0, tageVorher));
  return formatTag(tag);
}

/** Ganze Tage zwischen zwei Tagen (Rückruf minus Erinnerungstag), nie negativ. */
export function tageVorher(rueckrufAm: string, erinnerungsTag: Date): number {
  const r = parseTag(rueckrufAm);
  if (!r) return BEDENKZEIT_ERINNERUNG_STANDARD_TAGE;
  const e = new Date(erinnerungsTag.getFullYear(), erinnerungsTag.getMonth(), erinnerungsTag.getDate());
  return Math.max(0, Math.round((r.getTime() - e.getTime()) / 86_400_000));
}

const AUSGESCHIEDEN = new Set(["Abgelehnt", "KeinInteresse"]);

/** Gibt es einen offenen Rückruf aus der Bedenkzeit? */
export function bedenkzeitRueckrufAktiv(
  b: Pick<Bewerber, "closingEntscheidung" | "bedenkzeitRueckrufAm" | "status">,
): boolean {
  return b.closingEntscheidung === "bedenkzeit"
    && !!(b.bedenkzeitRueckrufAm || "").trim()
    && !AUSGESCHIEDEN.has(b.status);
}

export type BewerberErinnerung = {
  /** `bw-<id>` für das Follow-Up, `bz-<id>` für den Bedenkzeit-Rückruf */
  id: string;
  bewerberId: string;
  name: string;
  quelle: "followUp" | "bedenkzeit";
  /** Fälligkeit in der Inbox, TT.MM.JJJJ */
  faelligAm: string;
  /** HH:MM oder leer */
  uhrzeit: string;
  titel: string;
  beschreibung: string;
};

export const BEWERBER_ERINNERUNG_PRAEFIXE = ["bw-", "bz-"] as const;

export function istBewerberErinnerungId(id: string): boolean {
  return BEWERBER_ERINNERUNG_PRAEFIXE.some((p) => id.startsWith(p));
}

export function bewerberIdAusErinnerungId(id: string): string {
  return id.slice(3);
}

function name(b: Pick<Bewerber, "vorname" | "nachname">): string {
  return `${b.vorname ?? ""} ${b.nachname ?? ""}`.trim();
}

/** Beschreibung des Bedenkzeit-Rückrufs, wie sie Inbox und Übersicht zeigen. */
export function bedenkzeitRueckrufText(b: Bewerber): string {
  const tag = parseTag(b.bedenkzeitRueckrufAm);
  const wann = tag ? formatTag(tag) : (b.bedenkzeitRueckrufAm || "");
  const uhrzeit = (b.bedenkzeitRueckrufUhrzeit || "").trim();
  return `Rückruf (Bedenkzeit) am ${wann}${uhrzeit ? ` um ${uhrzeit} Uhr` : ""} per ${kanalLabel(b.bedenkzeitKanal)}.`;
}

/** Alle Inbox-Erinnerungen eines Bewerbers (0 bis 2 Einträge). */
export function bewerberErinnerungen(b: Bewerber): BewerberErinnerung[] {
  const liste: BewerberErinnerung[] = [];
  const n = name(b);

  if (b.followUpDatum) {
    const notiz = (b.followUpNotiz || "").trim();
    liste.push({
      id: `bw-${b.id}`,
      bewerberId: b.id,
      name: n,
      quelle: "followUp",
      faelligAm: b.followUpDatum,
      uhrzeit: b.followUpUhrzeit || "",
      titel: `Follow-Up Bewerber: ${n}`,
      beschreibung: notiz
        ? `📝 ${notiz}`
        : `Manueller Follow-Up-Termin${b.followUpUhrzeit ? ` um ${b.followUpUhrzeit} Uhr` : ""}.`,
    });
  }

  if (bedenkzeitRueckrufAktiv(b)) {
    const faelligAm = bedenkzeitErinnerungsTag(b.bedenkzeitRueckrufAm || "", bedenkzeitErinnerungTage(b));
    if (faelligAm) {
      const vorbereitung = (b.bedenkzeitVorbereitung || "").trim();
      liste.push({
        id: `bz-${b.id}`,
        bewerberId: b.id,
        name: n,
        quelle: "bedenkzeit",
        faelligAm,
        uhrzeit: b.bedenkzeitRueckrufUhrzeit || "",
        titel: `Rückruf Bedenkzeit: ${n}`,
        beschreibung: `${bedenkzeitRueckrufText(b)}${vorbereitung ? ` 📝 ${vorbereitung}` : ""}`,
      });
    }
  }

  return liste;
}
