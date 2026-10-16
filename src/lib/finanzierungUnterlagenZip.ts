import type { ZipDatei } from "@/lib/unterlagenZip";

/**
 * Was in die ZIP „Kundenunterlagen“ im Abschnitt Finanzierung gehört.
 *
 * Reservierungs-PDF, Selbstauskunft, Bonitätsunterlagen und der Kundenordner
 * dieses Investments. Dieselbe Datei steht oft an zwei Stellen (die
 * Reservierung etwa auch in `docFileUrls`), sie kommt nur einmal hinein.
 * Alles liegt im Eimer `unterlagen`; geladen wird über `ladeUnterlageFuerZip`,
 * also mit den Leserechten des Betrachters.
 */

export interface KundenordnerZeile {
  id: string;
  parent_id: string | null;
  typ: string;
  name: string;
  storage_path: string | null;
}

/** Pfad im Eimer, egal ob als Pfad oder als (abgelaufene) Adresse gespeichert. */
function ablagePfad(wert: string): string {
  const ohneAbfrage = wert.split("?")[0];
  const marke = "/unterlagen/";
  const i = ohneAbfrage.indexOf(marke);
  return decodeURIComponent(i >= 0 ? ohneAbfrage.slice(i + marke.length) : ohneAbfrage).replace(/^\/+/, "");
}

export function kundenUnterlagenDateien(args: {
  docFileUrls?: Record<string, string> | null;
  saPdfPath?: string | null;
  saPdf?: string | null;
  rvPdfPath?: string | null;
  kundenordner?: KundenordnerZeile[];
}): ZipDatei[] {
  const dateien: ZipDatei[] = [];
  const gesehen = new Set<string>();
  const dazu = (name: string, url: string | null | undefined, ordner: string) => {
    const wert = (url || "").trim();
    if (!wert) return;
    const schluessel = ablagePfad(wert);
    if (gesehen.has(schluessel)) return;
    gesehen.add(schluessel);
    dateien.push({ name, url: wert, ordner });
  };

  dazu("Reservierungsvereinbarung", args.rvPdfPath, "Reservierung");
  dazu((args.saPdf || "").trim() || "Selbstauskunft", args.saPdfPath, "Selbstauskunft");
  for (const [name, url] of Object.entries(args.docFileUrls || {})) dazu(name, url, "Bonitätsunterlagen");

  // Unterordner als „Kundenordner › Steuer › 2025“: Schrägstriche nimmt der Packer heraus.
  const zeilen = args.kundenordner || [];
  const nachId = new Map(zeilen.map((z) => [z.id, z]));
  const ordnerKette = (parentId: string | null): string[] => {
    const kette: string[] = [];
    const besucht = new Set<string>();
    for (let p = parentId; p && !besucht.has(p); p = nachId.get(p)?.parent_id ?? null) {
      besucht.add(p);
      const o = nachId.get(p);
      if (!o) break;
      kette.unshift(o.name);
    }
    return kette;
  };
  for (const z of zeilen) {
    if (z.typ !== "datei" || !z.storage_path) continue;
    dazu(z.name, z.storage_path, ["Kundenordner", ...ordnerKette(z.parent_id)].join(" › "));
  }
  return dateien;
}
