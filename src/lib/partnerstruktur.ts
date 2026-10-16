import { cacheGet } from "./dataCache";

/*
 * Partnerstruktur und Differenzprovision (Christian, 16.10.2026).
 *
 * Wer unter wem steht, sagt allein `user_settings.einstellungen.teamleader_id`.
 * Jede Ebene bekommt die Differenz zur Ebene darunter: A 10 %, darunter B mit
 * 8 %, darunter C mit 5 %. Bei einem Abschluss von C bekommt C 5 %, B 3 % und
 * A 2 %. Liegt ein Satz oben niedriger als unten, gibt es für diese Ebene
 * nichts, nie einen negativen Betrag, und insgesamt nie mehr als der höchste
 * Satz in der Kette.
 *
 * Die Kette samt Sätzen schreibt die Datenbank ab der Reservierung fest
 * (`investments.meta.lockedProvisionKette`, Migration 20261016100000). Für
 * Vorgänge, die vorher reserviert wurden, gibt es keine Kette und damit keine
 * Differenz.
 */

export interface KettenGlied {
  /** 1 = direkter Teamleiter. */
  ebene: number;
  partner: string;
  /** Satz des Teamleiters für diesen Vorgang, `null` ohne Satz. */
  satz: number | null;
}

export interface Differenz {
  leiterId: string;
  ebene: number;
  leiterSatz: number;
  /** Prozentpunkte, die diese Ebene bekommt. */
  differenzSatz: number;
}

/** Die festgeschriebene Kette aus dem Investment, sonst `null`. */
export function festgeschriebeneKette(meta: Record<string, unknown> | null | undefined): KettenGlied[] | null {
  const roh = meta?.lockedProvisionKette;
  if (!Array.isArray(roh)) return null;
  return roh
    .map((g: any) => ({
      ebene: Number(g?.ebene),
      partner: typeof g?.partner === "string" ? g.partner : "",
      satz: typeof g?.satz === "number" && g.satz > 0 ? g.satz : null,
    }))
    .filter((g) => g.partner && Number.isFinite(g.ebene))
    .sort((a, b) => a.ebene - b.ebene);
}

const rund = (v: number) => Math.round(v * 10000) / 10000;

/** Die Differenz je Ebene über dem Partner mit dem Satz `partnerSatz`. */
export function differenzenAusKette(partnerSatz: number, kette: readonly KettenGlied[]): Differenz[] {
  const ergebnis: Differenz[] = [];
  let bisher = partnerSatz;
  for (const g of [...kette].sort((a, b) => a.ebene - b.ebene)) {
    if (g.satz === null) continue;
    const differenz = rund(g.satz - bisher);
    if (differenz > 0) {
      ergebnis.push({ leiterId: g.partner, ebene: g.ebene, leiterSatz: g.satz, differenzSatz: differenz });
    }
    bisher = Math.max(bisher, g.satz);
  }
  return ergebnis;
}

/** Teamleiter eines Nutzers aus seinen Einstellungen, sonst `null`. */
export function teamleiterVon(einstellungen: unknown, selbst: string): string | null {
  const id = (einstellungen as Record<string, unknown> | null)?.teamleader_id;
  return typeof id === "string" && id && id !== selbst ? id : null;
}

/**
 * Alle Nutzer unter `leiterId`, über alle Ebenen, mit Ebene und direktem
 * Teamleiter. Liest den Zwischenspeicher `user_settings`; was die Datenbank
 * dem Nutzer nicht zeigt (fremde Strukturen), fehlt dort auch hier.
 */
export function strukturUnter(
  leiterId: string,
  zeilen: Array<{ user_id: string; einstellungen: unknown }> = cacheGet<any>("user_settings"),
): Array<{ userId: string; ebene: number; teamleiterId: string }> {
  const kinder = new Map<string, string[]>();
  for (const z of zeilen) {
    const tl = teamleiterVon(z.einstellungen, z.user_id);
    if (tl) kinder.set(tl, [...(kinder.get(tl) ?? []), z.user_id]);
  }
  const ergebnis: Array<{ userId: string; ebene: number; teamleiterId: string }> = [];
  const gesehen = new Set<string>([leiterId]);
  let ebene = [leiterId];
  // Höchstens 20 Ebenen, wie in der Datenbank; `gesehen` schützt vor Kreisen.
  for (let tiefe = 1; tiefe <= 20 && ebene.length > 0; tiefe++) {
    const naechste: string[] = [];
    for (const tl of ebene) {
      for (const kind of kinder.get(tl) ?? []) {
        if (gesehen.has(kind)) continue;
        gesehen.add(kind);
        ergebnis.push({ userId: kind, ebene: tiefe, teamleiterId: tl });
        naechste.push(kind);
      }
    }
    ebene = naechste;
  }
  return ergebnis;
}
