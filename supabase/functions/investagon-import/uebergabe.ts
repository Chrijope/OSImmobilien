/**
 * Import aus einem Uebergabe-Paket statt aus der Investagon-API.
 *
 * WARUM: OS Immobilien hat (Stand 07.10.2026) keinen API-Schluessel. Die
 * Daten wurden deshalb aus der eingeloggten Investagon-Oberflaeche geholt:
 * Projekttabelle, Einheitentabelle je Projekt (dieselben Feldnamen wie die
 * API) und die Foto- und Dokumentlisten. Das Paket und alle Dateien liegen im
 * privaten Bucket unter `uebergabe/`. Fotos und Dokumente bekommen hier
 * kurzlebige Links, damit `uebernimmBilder` sie wie API-Adressen laedt.
 *
 * Kennungen wie bei der API (Projekt- und Einheiten-ID aus Investagon). Kommt
 * spaeter doch ein API-Schluessel, erkennt der normale Import dieselben
 * Objekte wieder, statt sie zu verdoppeln.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import type { BildQuelle } from "./bilder.ts";
import {
  LINK_GUELTIG_S,
  projekteAusPaket,
  UEBERGABE_BUCKET,
  UEBERGABE_ORDNER,
  type Uebergabepaket,
} from "./uebergabe-paket.ts";

/** Liest das Paket aus dem Bucket und erzeugt die Links fuer alle Dateien. */
export async function ausUebergabe(db: SupabaseClient) {
  const speicher = db.storage.from(UEBERGABE_BUCKET);
  const { data: datei, error } = await speicher.download(`${UEBERGABE_ORDNER}/investagon-import.json`);
  if (error || !datei) throw new Error(`Übergabepaket nicht lesbar: ${error?.message || "fehlt"}`);
  const paket = JSON.parse(await datei.text()) as Uebergabepaket;

  const namen = new Set<string>();
  for (const pp of paket.projekte) {
    for (const f of pp.fotos) namen.add(`foto__${f.datei}`);
    for (const d of pp.dokumente) namen.add(`dok__${d.datei}`);
  }
  const links = new Map<string, string>();
  const liste = [...namen];
  for (let i = 0; i < liste.length; i += 100) {
    const teil = liste.slice(i, i + 100);
    const { data, error: linkFehler } = await speicher.createSignedUrls(
      teil.map((n) => `${UEBERGABE_ORDNER}/${n}`),
      LINK_GUELTIG_S,
    );
    if (linkFehler) throw linkFehler;
    for (const eintrag of data || []) {
      if (eintrag.signedUrl && eintrag.path) {
        links.set(eintrag.path.slice(UEBERGABE_ORDNER.length + 1), eintrag.signedUrl);
      }
    }
  }
  const ergebnis = projekteAusPaket(paket, (n) => links.get(n));
  const bildQuellen = ergebnis.bildQuellen as unknown as Map<string, BildQuelle>;
  const fehlend = liste.filter((n) => !links.has(n)).length;
  if (fehlend) ergebnis.hinweise.push(`${fehlend} Dateien fehlen im Übergabeordner und wurden übersprungen`);
  return { ...ergebnis, bildQuellen };
}
