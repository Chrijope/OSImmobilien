/**
 * Wem man ein Objekt oder eine Einheit exklusiv zuweisen kann (Inhaber,
 * 18.10.2026): nur tatsächlich angelegte, nicht gesperrte Nutzer aus der
 * Nutzerverwaltung mit der Rolle Vertriebspartner, Vertriebsleiter oder Admin. Bis
 * dahin bot der Wizard eine fest eingebaute Beispielliste an.
 *
 * Wer danach was sieht, regelt `supabase/functions/_shared/objekt-zugang.ts`
 * (Objekt über `meta.exklusivPartnerKennung`, Einheit über `exklusivNutzer`).
 */
import { cacheGet } from "@/lib/dataCache";
import { loadAllUsers, type SystemUser } from "@/lib/loadAllUsers";
import { EXKLUSIV_KENNUNG_SCHLUESSEL } from "../../supabase/functions/_shared/objekt-zugang.ts";

export { EXKLUSIV_KENNUNG_SCHLUESSEL };

/** Auch für die Einheiten-Zuweisung der Verwaltungsansicht (ObjektDetail). */
export const EXKLUSIV_ZUWEISBARE_ROLLEN = ["vertriebspartner", "vertriebsleiter", "admin"] as const;

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

export interface ExklusivStand {
  /** Nutzer-IDs, denen das ganze Objekt zugewiesen ist. */
  objekt: string[];
  einheiten: Array<{ weNr: string; nutzer: string[] }>;
}

/**
 * Glocke „exklusiv zugewiesen“ (Inhaber, 18.10.2026): je neu zugewiesenem
 * Nutzer eine Meldung, wie bei der Einheiten-Zuweisung in der
 * Verwaltungsansicht. Wer schon vorher zugewiesen war, bekommt keine zweite.
 */
export function exklusivMeldungen(
  objekt: { id: string; titel: string },
  vorher: ExklusivStand,
  nachher: ExklusivStand,
  rolleVon: (nutzerId: string) => string | undefined,
): Array<{ benutzer_id: string; titel: string; nachricht: string; link: string; ziel_rolle: string }> {
  const link = `/objekte/${objekt.id}`;
  const zeile = (id: string, titel: string, nachricht: string) => ({ benutzer_id: id, titel, nachricht, link, ziel_rolle: rolleVon(id) || "vertriebspartner" });
  const neuIm = (alt: string[], neu: string[]) => [...new Set(neu)].filter((id) => id && !alt.includes(id));
  const vorherEinheit = (weNr: string) => vorher.einheiten.find((e) => e.weNr === weNr)?.nutzer ?? [];
  return [
    ...neuIm(vorher.objekt, nachher.objekt).map((id) =>
      zeile(id, "Objekt exklusiv zugewiesen", `Dir wurde das Objekt „${objekt.titel}“ exklusiv zugewiesen.`)),
    ...nachher.einheiten.flatMap((e) => neuIm(vorherEinheit(e.weNr), e.nutzer).map((id) =>
      zeile(id, "Wohnung exklusiv zugewiesen", `Dir wurde Wohnung ${e.weNr} im Objekt „${objekt.titel}“ exklusiv zugewiesen.`))),
  ];
}

/** Der Stand an einem Objekt, wie er gespeichert ist. */
export function exklusivStand(objekt: { meta?: unknown; wohnungen?: ReadonlyArray<{ weNr?: string; exklusivNutzer?: string[] }> } | undefined): ExklusivStand {
  const kennungen = ((objekt?.meta as Record<string, unknown> | undefined)?.[EXKLUSIV_KENNUNG_SCHLUESSEL] ?? {}) as Record<string, unknown>;
  return {
    objekt: Object.values(kennungen).filter((v): v is string => typeof v === "string" && !!v),
    einheiten: (objekt?.wohnungen ?? []).map((w) => ({ weNr: w.weNr || "", nutzer: w.exklusivNutzer ?? [] })),
  };
}
