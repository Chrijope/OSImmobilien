import { hatStatistikEinwilligung } from "@/lib/cookieEinwilligung";

/**
 * Soll dieser Besuch über einen Tippgeber-Link (`/vp/:slug?tg=...`) als Klick
 * zählen? Gezählt wird einmal je Browsersitzung und Tippgeber.
 *
 * Sich den Klick im Browser zu merken ist Reichweitenmessung und nach § 25
 * TDDDG nicht unbedingt nötig. Deshalb liegt die Merkung nur mit
 * Statistik-Einwilligung im sessionStorage, ohne sie nur im Arbeitsspeicher.
 * Der Speicher wird ohne Einwilligung auch nicht gelesen, das Lesen fällt
 * ebenso unter § 25.
 *
 * ponytail: Ohne Einwilligung zählt ein Neuladen der Seite erneut. Die Zahl
 * ist dann etwas zu hoch; genauer ginge es nur serverseitig.
 */
const imArbeitsspeicher = new Set<string>();

export function tippgeberKlickErstmals(tg: string): boolean {
  const schluessel = `tg_klick_${tg}`;
  if (imArbeitsspeicher.has(schluessel)) return false;
  imArbeitsspeicher.add(schluessel);
  if (!hatStatistikEinwilligung()) return true;
  try {
    if (sessionStorage.getItem(schluessel)) return false;
    sessionStorage.setItem(schluessel, "1");
  } catch {
    // Gesperrter Speicher: dann gilt eben nur der Arbeitsspeicher.
  }
  return true;
}

/** Nur für Tests. */
export function _tippgeberKlicksVergessen(): void {
  imArbeitsspeicher.clear();
}

type RpcAufruf = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ error: { code?: string; message?: string } | null }>;

/**
 * Meldet den Klick an den Server. Seit dem 26.09.2026 mit Partner- UND
 * Tippgeberkürzel (`tippgeber_klick_zaehlen`), denn ein Tippgeberkürzel ist
 * nur je Partner eindeutig. Fehlt die Funktion, weil die Migration
 * 20260926235000 noch nicht lief, geht es über den alten Weg.
 */
export async function tippgeberKlickMelden(rpc: RpcAufruf, vpSlug: string, tg: string): Promise<void> {
  const { error } = await rpc("tippgeber_klick_zaehlen", { _vp_slug: vpSlug, _tg: tg });
  if (!error) return;
  const fehlt =
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|function .* does not exist/i.test(error.message || "");
  if (fehlt) await rpc("increment_tippgeber_klick", { _tippgeber: tg });
}
