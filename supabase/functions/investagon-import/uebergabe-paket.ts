/**
 * Zuordnung fuer den Import aus dem Uebergabe-Paket, ohne Datenbank und ohne
 * Deno-Importe, damit sie sich mit vitest pruefen laesst. Hintergrund in
 * `uebergabe.ts`.
 */
import type { ImportProjekt } from "./daten.ts";
import { einheitAus, projektAus } from "./mapping.ts";

/** Wie `BildQuelle` in `bilder.ts`; der Zugang wird dort nicht gebraucht. */
export interface UebergabeBildQuelle {
  zugang: unknown;
  projektRoh: Record<string, unknown>;
  einheiten: { we: string; roh: Record<string, unknown>; propertyId: string }[];
}

export const UEBERGABE_BUCKET = "investagon-dokumente";
export const UEBERGABE_ORDNER = "uebergabe";
export const LINK_GUELTIG_S = 6 * 3600;

interface PaketFoto { datei: string; art: "projekt" | "einheit"; einheit: string | null; reihenfolge: number }
interface PaketDokument { name: string; datei: string; typ: string; einheit: string | null }
interface PaketProjekt {
  code: string;
  roh: Record<string, unknown>;
  einheiten: Record<string, unknown>[];
  fotos: PaketFoto[];
  dokumente: PaketDokument[];
}
export interface Uebergabepaket { erstellt: string; projekte: PaketProjekt[] }

// Links sind absolut, `ladeVonUrl` braucht keinen Zugang.
const KEIN_ZUGANG = { token: "", orgId: "", basis: "", name: "Investagon-Übergabe", platz: 0, slot: "" };

/** Ohne Datenbank pruefbar: baut Projekte und Bildquellen aus dem Paket. */
export function projekteAusPaket(
  paket: Uebergabepaket,
  link: (pfad: string) => string | undefined,
): { projekte: ImportProjekt[]; bildQuellen: Map<string, UebergabeBildQuelle>; hinweise: string[] } {
  const projekte: ImportProjekt[] = [];
  const bildQuellen = new Map<string, UebergabeBildQuelle>();
  const hinweise: string[] = [];

  for (const pp of paket.projekte) {
    const projektId = String(pp.roh.id);
    const fotosFuer = (einheit: string | null) =>
      pp.fotos
        .filter((f) => (f.einheit ?? null) === einheit)
        .map((f) => ({ f, url: link(`foto__${f.datei}`) }))
        .filter((x) => x.url)
        .map(({ f, url }) => ({ filename: url, original_filename: f.datei, position: f.reihenfolge }));
    const dateienFuer = (einheit: string | null) =>
      pp.dokumente
        .filter((d) => (d.einheit ?? null) === einheit)
        .map((d) => ({ d, url: link(`dok__${d.datei}`) }))
        .filter((x) => x.url)
        .map(({ d, url }) => ({
          id: d.datei,
          filename: url,
          original_filename: d.name || d.datei,
          title: d.name || d.datei,
          updated_at: paket.erstellt,
        }));

    /*
     * Doppelte Wohnungsnummer: Investagon fuehrt manche Wohnung zweimal mit
     * verschiedener ID (Hauffstrasse WE 35). Uebernommen wird die erste, die
     * Fotos und Dokumente der zweiten haengen an derselben Wohnung.
     */
    const nachWe = new Map<string, { roh: Record<string, unknown>; ids: string[] }>();
    for (const roh of pp.einheiten) {
      const we = einheitAus(roh).we;
      const id = String(roh.id);
      const da = nachWe.get(we);
      if (da) {
        da.ids.push(id);
        hinweise.push(`${pp.roh.name}: WE ${we} doppelt in Investagon (${da.ids.join(", ")}), einmal übernommen`);
      } else {
        nachWe.set(we, { roh, ids: [id] });
      }
    }

    const einheiten = [...nachWe.values()].map(({ roh, ids }) =>
      einheitAus({
        ...roh,
        api_property_id: String(roh.id),
        photos: ids.flatMap((id) => fotosFuer(id)),
        files: ids.flatMap((id) => dateienFuer(id)),
      })
    );
    const projektRoh = {
      ...pp.roh,
      api_project_id: projektId,
      photos: fotosFuer(null),
      files: dateienFuer(null),
    };
    const p: ImportProjekt = {
      ...projektAus({ ...(einheiten[0]?.roh || {}), ...projektRoh }, einheiten),
      slug: projektId,
    };
    projekte.push(p);
    bildQuellen.set(projektId, {
      zugang: KEIN_ZUGANG,
      projektRoh,
      einheiten: einheiten.map((e) => ({ we: e.we, roh: e.roh || {}, propertyId: String(e.roh?.id) })),
    });
  }
  return { projekte, bildQuellen, hinweise };
}

