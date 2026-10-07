import { ExternalLink } from "lucide-react";

/**
 * Belege unter Standort- und Marktargumenten, mit anklickbaren Quellen.
 *
 * Ein Beleg ist eine Textzeile aus der Tatsachenliste der Function
 * `objekt-texte-ki`, etwa „Markt Leipzig, Einwohner: 601.866 (Destatis,
 * Stand 12/2024)“. Eine URL liefert die Function nicht mit. Verlinkt wird
 * deshalb nur, was eindeutig ist:
 *
 *   - eine echte http(s)-Adresse, die wörtlich im Beleg steht,
 *   - eine der festen Quellen aus `QUELLEN_NAMEN` in
 *     `supabase/functions/_shared/objekt-texte-markt.ts`, mit der Startseite
 *     aus `marktanalyse_quellen.url`. Für OpenStreetMap die Kartenseite statt
 *     der Overpass-Schnittstelle, die für Menschen nichts zeigt.
 *
 * Belege ohne erkennbare Quelle (Unterlagen, Umgebungszeilen ohne Namen)
 * bleiben reiner Text. Keine Adresse wird geraten.
 */
const QUELLEN_STARTSEITEN: ReadonlyArray<{ name: string; url: string }> = [
  { name: "Destatis", url: "https://www-genesis.destatis.de/" },
  { name: "BORIS-D", url: "https://www.bodenrichtwerte-boris.de/" },
  { name: "Bundesagentur für Arbeit", url: "https://statistik.arbeitsagentur.de/" },
  { name: "BBSR", url: "https://www.bbsr.bund.de/" },
  { name: "OpenStreetMap", url: "https://www.openstreetmap.org/" },
  { name: "Unternehmensregister", url: "https://www.unternehmensregister.de/" },
  { name: "BMDV", url: "https://bmdv.bund.de/" },
];

/** Die Adresse, wenn sie http oder https ist, sonst null. Schützt vor `javascript:` und Ähnlichem. */
export function sichereUrl(roh: string): string | null {
  try {
    const url = new URL(roh.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export interface BelegQuelle {
  name: string;
  url: string;
}

/** Die verlinkbaren Quellen eines Belegs, ohne Doppelte. */
export function belegQuellen(beleg: string): BelegQuelle[] {
  const gefunden: BelegQuelle[] = [];
  const schonDa = new Set<string>();
  const dazu = (name: string, url: string | null) => {
    if (!url || schonDa.has(url)) return;
    schonDa.add(url);
    gefunden.push({ name, url });
  };
  for (const treffer of beleg.match(/https?:\/\/[^\s)<>"]+/gi) ?? []) {
    const url = sichereUrl(treffer.replace(/[.,;:]+$/, ""));
    if (url) dazu(new URL(url).hostname.replace(/^www\./, ""), url);
  }
  for (const q of QUELLEN_STARTSEITEN) {
    // Ganzes Wort, damit „BBSR“ nicht in einem längeren Wort anschlägt.
    if (new RegExp(`(^|[^\\p{L}])${q.name}($|[^\\p{L}])`, "u").test(beleg)) dazu(q.name, q.url);
  }
  return gefunden;
}

/** „Beleg: …“ in kleiner Schrift, dahinter die Quellen als Links. */
export function BelegZeile({ beleg, ohneVorsilbe = false }: { beleg: string; ohneVorsilbe?: boolean }) {
  const quellen = belegQuellen(beleg);
  return (
    <>
      {ohneVorsilbe ? "" : "Beleg: "}
      {beleg}
      {quellen.map((q) => (
        <a
          key={q.url}
          href={q.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-1.5 inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
          title={`Quelle öffnen: ${q.name}`}
        >
          {q.name}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      ))}
    </>
  );
}
