/**
 * Wem man ein Objekt oder eine Einheit exklusiv zuweisen kann (Inhaber,
 * 18.10.2026): nur tatsächlich angelegte, nicht gesperrte Nutzer aus der
 * Nutzerverwaltung mit der Rolle Vertriebspartner oder Vertriebsleiter. Bis
 * dahin bot der Wizard eine fest eingebaute Beispielliste an.
 *
 * Wer danach was sieht, regelt `supabase/functions/_shared/objekt-zugang.ts`
 * (Objekt über `meta.exklusivPartnerKennung`, Einheit über `exklusivNutzer`).
 */
import { cacheGet } from "@/lib/dataCache";
import { loadAllUsers, type SystemUser } from "@/lib/loadAllUsers";
import { EXKLUSIV_KENNUNG_SCHLUESSEL } from "../../supabase/functions/_shared/objekt-zugang.ts";

export { EXKLUSIV_KENNUNG_SCHLUESSEL };

/** Dieselben Rollen wie die Einheiten-Zuweisung der Verwaltungsansicht (ObjektDetail). */
export const EXKLUSIV_ZUWEISBARE_ROLLEN = ["vertriebspartner", "vertriebsleiter"] as const;

export interface ExklusivKandidat {
  id: string;
  name: string;
  rolle: string;
}

export function exklusivKandidaten(nutzer: readonly SystemUser[], gesperrt: ReadonlySet<string> = new Set()): ExklusivKandidat[] {
  return nutzer
    .flatMap((n) => {
      const rolle = (n.rollen?.length ? n.rollen : [n.rolle ?? ""]).find((r) =>
        (EXKLUSIV_ZUWEISBARE_ROLLEN as readonly string[]).includes(r),
      );
      const name = (n.name || "").trim();
      return rolle && n.id && name && !gesperrt.has(n.id) ? [{ id: n.id, name, rolle }] : [];
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

/** Aus dem Zwischenspeicher: Profile und Rollen, gesperrte Profile fallen weg. */
export function ladeExklusivKandidaten(): ExklusivKandidat[] {
  const gesperrt = new Set(
    ((cacheGet("profiles") || []) as Array<{ id?: string; gesperrt?: boolean }>)
      .filter((p) => p.gesperrt === true && p.id)
      .map((p) => p.id as string),
  );
  return exklusivKandidaten(loadAllUsers(), gesperrt);
}

/**
 * Die Kennungen der Exklusivpartner ins `meta`: nur für Namen, die noch
 * eingetragen sind. Fehlt eine, ergänzt `saveObjekt` sie über den Namen.
 */
export function exklusivKennungenInMeta(
  meta: Record<string, unknown>,
  namen: readonly string[],
  kennungen: Readonly<Record<string, string>>,
): Record<string, unknown> {
  const passend = Object.fromEntries(Object.entries(kennungen).filter(([name, id]) => id && namen.includes(name)));
  const { [EXKLUSIV_KENNUNG_SCHLUESSEL]: _alt, ...rest } = meta;
  return Object.keys(passend).length ? { ...rest, [EXKLUSIV_KENNUNG_SCHLUESSEL]: passend } : rest;
}
