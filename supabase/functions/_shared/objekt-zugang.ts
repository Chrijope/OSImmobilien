/**
 * Wer ein Objekt und eine Einheit zu sehen bekommt. Eine Regel für
 * Oberfläche (`src/lib/objektZugang.ts`) und Functions (seit 05.10.2026).
 *
 *   - Ausgeblendete Objekte (`sichtbar = false`) und fremde Exklusivobjekte
 *     sieht nur, wer Objekte pflegt (Admin, Inhaber, Objektpartner).
 *   - Exklusivpartner stehen am Objekt seit jeher als Namen
 *     (`objekte.exklusiv_partner`). Seit dem 05.10.2026 speichert das CRM beim
 *     Speichern zusätzlich die Kennung je Name in
 *     `objekte.meta.exklusivPartnerKennung` ({ Name: Kennung }). Wo eine
 *     Kennung steht, zählt nur sie; der Name ist nur noch Rückfall für
 *     Einträge ohne Kennung. Bestandswerte bleiben unverändert.
 *   - Exklusive Einheiten tragen seit jeher Kennungen (`meta.exklusivNutzer`).
 *
 * Investagon-Objekte liegen in denselben Spalten, die Regel gilt für sie
 * genauso; der Import führt `meta` zusammen und lässt die Kennungen stehen.
 */

export const EXKLUSIV_ALLE_SEHEN_ROLLEN = ["admin", "inhaber", "objektpartner"] as const;

export const EXKLUSIV_KENNUNG_SCHLUESSEL = "exklusivPartnerKennung";

export interface ObjektBetrachter {
  /** Die Rollen. Im Browser die aktive Rolle, im Server alle zugewiesenen. */
  rollen: readonly unknown[];
  benutzerId?: string | null;
  name?: string | null;
}

export interface ObjektSicht {
  sichtbar?: boolean | null;
  exklusivPartner?: readonly string[] | null;
  meta?: unknown;
}

function alsObjekt(wert: unknown): Record<string, unknown> {
  return wert && typeof wert === "object" && !Array.isArray(wert) ? (wert as Record<string, unknown>) : {};
}

export function siehtAlleObjekte(rollen: readonly unknown[] | null | undefined): boolean {
  return (rollen ?? []).some((r) => typeof r === "string" && (EXKLUSIV_ALLE_SEHEN_ROLLEN as readonly string[]).includes(r));
}

/** Die gespeicherten Kennungen je Name, nur gültige Paare. */
export function exklusivKennungenLesen(meta: unknown): Record<string, string> {
  const roh = alsObjekt(alsObjekt(meta)[EXKLUSIV_KENNUNG_SCHLUESSEL]);
  const aus: Record<string, string> = {};
  for (const [name, id] of Object.entries(roh)) {
    if (typeof id === "string" && id.trim()) aus[name.trim()] = id.trim();
  }
  return aus;
}

/** Ist das Objekt für diesen Betrachter nicht fremd-exklusiv? */
export function objektExklusivFrei(objekt: ObjektSicht, b: ObjektBetrachter): boolean {
  const partner = (objekt.exklusivPartner ?? []).map((n) => String(n ?? "").trim()).filter(Boolean);
  if (partner.length === 0) return true;
  if (siehtAlleObjekte(b.rollen)) return true;
  const kennungen = exklusivKennungenLesen(objekt.meta);
  const id = String(b.benutzerId ?? "").trim();
  const name = String(b.name ?? "").trim();
  return partner.some((p) => (kennungen[p] ? !!id && kennungen[p] === id : !!name && p === name));
}

/** Sichtbar und nicht fremd-exklusiv. `sichtbar` fehlt oder `null` gilt wie im CRM als sichtbar. */
export function objektFuerBetrachter(objekt: ObjektSicht, b: ObjektBetrachter): boolean {
  if (siehtAlleObjekte(b.rollen)) return true;
  if (objekt.sichtbar === false) return false;
  return objektExklusivFrei(objekt, b);
}

/** Ist die Einheit für diesen Betrachter frei gegeben? */
export function einheitExklusivFrei(exklusivNutzer: readonly string[] | null | undefined, b: ObjektBetrachter): boolean {
  const zugewiesen = (exklusivNutzer ?? []).filter((x) => typeof x === "string" && x);
  if (zugewiesen.length === 0) return true;
  if (siehtAlleObjekte(b.rollen)) return true;
  return !!b.benutzerId && zugewiesen.includes(b.benutzerId);
}

/** Datenbankzeile `objekte` in die Sicht oben. */
export function objektSichtAusZeile(zeile: Record<string, unknown>): ObjektSicht {
  return {
    sichtbar: typeof zeile.sichtbar === "boolean" ? zeile.sichtbar : null,
    exklusivPartner: Array.isArray(zeile.exklusiv_partner) ? (zeile.exklusiv_partner as string[]) : [],
    meta: zeile.meta,
  };
}

/** `meta.exklusivNutzer` einer Zeile `wohnungen`. */
export function exklusivNutzerAusZeile(zeile: Record<string, unknown>): string[] {
  const e = alsObjekt(zeile.meta).exklusivNutzer;
  return Array.isArray(e) ? e.filter((x): x is string => typeof x === "string") : [];
}

/**
 * Die Einheiten, die keiner der Betrachter sehen darf (fremd-exklusiv).
 * Beim Kundenlink sind das Ersteller, Absender und Zuständiger des Kunden,
 * in der Vorschau der Angemeldete. Ohne Betrachter ist nichts ausgeschlossen.
 */
export function ausgeschlosseneEinheiten(
  wohnungen: ReadonlyArray<Record<string, unknown>>,
  betrachter: readonly ObjektBetrachter[],
): Set<string> {
  const aus = new Set<string>();
  if (betrachter.length === 0) return aus;
  for (const w of wohnungen) {
    const nutzer = exklusivNutzerAusZeile(w);
    if (typeof w.id === "string" && !betrachter.some((b) => einheitExklusivFrei(nutzer, b))) aus.add(w.id);
  }
  return aus;
}

/**
 * Beim Speichern: Kennungen zu den Namen ergänzen. Bestehende Paare bleiben,
 * solange der Name noch eingetragen ist. Neu kommt eine Kennung nur, wenn
 * genau ein Nutzer diesen Namen trägt; sonst bleibt der Name Rückfall.
 */
export function exklusivKennungenFuerNamen(
  namen: readonly string[] | null | undefined,
  bisher: Record<string, string>,
  nutzer: ReadonlyArray<{ id?: unknown; name?: unknown }>,
): Record<string, string> {
  const aus: Record<string, string> = {};
  for (const roh of namen ?? []) {
    const name = String(roh ?? "").trim();
    if (!name) continue;
    if (bisher[name]) {
      aus[name] = bisher[name];
      continue;
    }
    const treffer = nutzer.filter((n) => typeof n.id === "string" && n.id && String(n.name ?? "").trim() === name);
    if (treffer.length === 1) aus[name] = treffer[0].id as string;
  }
  return aus;
}
