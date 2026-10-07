/**
 * Bildübernahme des Investagon-Imports.
 *
 * Foto-URLs aus photos werden geladen; Projekt- und Wohnungspakete werden
 * unabhängig davon importiert. Nur bestätigte Fotos landen öffentlich,
 * sonstige Unterlagen in einem privaten Bucket. Erledigte Pakete werden
 * pro Quellversion gespeichert, damit Folgeläufe fortsetzen können.
 *
 * Idempotenz, das Wichtigste: Jedes Bild bekommt aus seiner Herkunft
 * (Quell-URL oder ZIP-Eintrag) über `stabilerDateiname` einen Speicherpfad,
 * der bei jedem Lauf gleich ist: `investagon/<slug>/<streuwert>-<name>`.
 * Liegt die Datei schon im Bucket, wird sie nicht neu geladen. Liegt die
 * Zeile mit derselben öffentlichen URL schon in `objekt_bilder` bzw.
 * `wohnungs_bilder`, wird sie nicht neu angelegt. Ein zweiter Lauf erzeugt
 * damit keine Dubletten, er zählt sie als übersprungen.
 *
 * Gelöscht wird hier grundsätzlich nichts. Von Hand hochgeladene Bilder
 * (deren URL nicht im Investagon-Ordner liegt) werden nicht einmal
 * angefasst, und auch Investagon-Bilder, die in der Quelle verschwunden
 * sind, werden nur gemeldet.
 */

import { unzipSync } from "https://esm.sh/fflate@0.8.2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { type ApiZugang, holeBytes } from "./api.ts";
import {
  bildRang,
  istBildDatei,
  sammleBildUrls,
  sicherName,
  stabilerDateiname,
} from "../_shared/investagon-bilder.ts";
import { investagonImportKategorie } from "../_shared/dokument-freigabe.ts";

export const BUCKET = "objekt-medien";

const MAX_DATEI_BYTES = 15 * 1024 * 1024;
const MAX_ZIP_BYTES = 40 * 1024 * 1024;

/** Rohdaten einer Einheit, wie die API sie geliefert hat. */
export interface BildEinheitQuelle {
  we: string;
  roh: Record<string, unknown>;
  propertyId: string;
}

/** Was `ausApi` je Projekt für die Bildübernahme aufhebt. */
export interface BildQuelle {
  zugang: ApiZugang;
  projektRoh: Record<string, unknown>;
  einheiten: BildEinheitQuelle[];
}

export interface BildProjektBericht {
  name: string;
  /** Welcher Weg griff: die API-Antwort, das Dokumentenpaket oder keiner. */
  quelle: "antwort" | "zip" | "keine";
  uebernommen: number;
  uebersprungen: number;
}

export interface BildBericht {
  uebernommen: number;
  uebersprungen: number;
  fehlgeschlagen: number;
  projekte: BildProjektBericht[];
}

export function leererBildBericht(): BildBericht {
  return { uebernommen: 0, uebersprungen: 0, fehlgeschlagen: 0, projekte: [] };
}

/** Ein Bild, das übernommen werden soll, egal aus welcher Quelle. */
interface Kandidat {
  /** Quell-URL oder `zip:<einheit>:<eintrag>`, der Schlüssel des stabilen Pfads. */
  herkunft: string;
  dateiname: string;
  ziel: { art: "objekt" } | { art: "wohnung"; we: string };
  lade: () => Promise<Uint8Array>;
  dokument?: boolean;
  name?: string;
  /** Sprechender Quellname, entscheidet über Titelbild und Reihenfolge. */
  anzeige?: string;
  version?: string;
}

function contentType(dateiname: string): string {
  const endung = dateiname.split(".").pop()?.toLowerCase() || "";
  if (endung === "pdf") return "application/pdf";
  if (endung === "docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (endung === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (endung === "png") return "image/png";
  if (endung === "webp") return "image/webp";
  if (["jpg", "jpeg"].includes(endung)) return "image/jpeg";
  return "application/octet-stream";
}

/** Ein Bild von seiner Adresse laden, notfalls mit Investagon-Anmeldung. */
async function ladeVonUrl(
  zugang: ApiZugang,
  url: string,
  foto = true,
): Promise<Uint8Array> {
  // Relative Adressen kann nur die API selbst auflösen.
  if (!/^https?:\/\//i.test(url)) {
    return holeBytes(zugang, url, MAX_DATEI_BYTES);
  }
  const antwort = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (antwort.ok) {
    const typ = antwort.headers.get("content-type") || "";
    if (foto && !typ.startsWith("image/")) {
      throw new Error("Fotoantwort enthält kein Bild.");
    }
    if (!foto && typ.includes("text/html")) {
      throw new Error("Dokumentantwort ist eine HTML-Seite.");
    }
    // Wie in `holeBytes`: Eine angekuendigt zu grosse Datei gar nicht erst
    // laden. Sie wird bei jedem Abgleich erneut geprueft, weil zu ihr keine
    // Zeile entsteht, und soll dabei nicht jedes Mal ganz durchlaufen.
    const angekuendigt = Number(antwort.headers.get("content-length") || 0);
    if (angekuendigt > MAX_DATEI_BYTES) {
      await antwort.body?.cancel();
      throw new Error(
        `Datei zu groß (${angekuendigt} Bytes, erlaubt ${MAX_DATEI_BYTES})`,
      );
    }
    const bytes = new Uint8Array(await antwort.arrayBuffer());
    if (bytes.byteLength > MAX_DATEI_BYTES) {
      throw new Error(
        `Datei zu groß (${bytes.byteLength} Bytes, erlaubt ${MAX_DATEI_BYTES})`,
      );
    }
    return bytes;
  }
  // Ein geschütztes CDN der API lehnt ohne Anmeldung ab, dann noch einmal mit.
  if (antwort.status === 401 || antwort.status === 403) {
    return holeBytes(zugang, url, MAX_DATEI_BYTES);
  }
  throw new Error(`HTTP ${antwort.status} beim Laden von ${url}`);
}

/**
 * Kandidaten aus den API-Antworten sammeln. Einheiten zuerst, damit eine
 * Adresse, die sowohl in der Einheit als auch im eingebetteten Projektobjekt
 * steht, nur einmal genommen wird und zwar an der Einheit.
 */
function fotoQuellen(
  photos: unknown,
): { url: string; version: string; anzeige: string }[] {
  if (!Array.isArray(photos)) return [];
  return [...photos].sort((a, b) =>
    Number(a?.position || 0) - Number(b?.position || 0)
  ).flatMap((foto) =>
    sammleBildUrls(foto).map((url) => ({
      url,
      // Der sprechende Name entscheidet spaeter ueber Titelbild und
      // Reihenfolge. Investagon liefert ihn nur manchmal mit.
      anzeige: String(foto?.original_filename || foto?.title || url),
      version: JSON.stringify([
        new Date().toISOString().slice(0, 10),
        foto?.updated_at,
        url,
      ]),
    }))
  );
}

function kandidatenAusAntwort(quelle: BildQuelle): Kandidat[] {
  const kandidaten: Kandidat[] = [];
  const unterlagen: Kandidat[] = [];
  const vergeben = new Set<string>();

  for (const einheit of quelle.einheiten) {
    for (const foto of fotoQuellen(einheit.roh.photos)) {
      const url = foto.url;
      if (vergeben.has(`${einheit.propertyId}:${url}`)) continue;
      vergeben.add(`${einheit.propertyId}:${url}`);
      kandidaten.push({
        herkunft: url,
        version: foto.version,
        anzeige: foto.anzeige,
        dateiname: stabilerDateiname(url, url),
        ziel: { art: "wohnung", we: einheit.we },
        lade: () => ladeVonUrl(quelle.zugang, url),
      });
    }
  }
  for (const foto of fotoQuellen(quelle.projektRoh.photos)) {
    const url = foto.url;
    if (vergeben.has(url)) continue;
    vergeben.add(url);
    kandidaten.push({
      herkunft: url,
      version: foto.version,
      anzeige: foto.anzeige,
      dateiname: stabilerDateiname(url, url),
      ziel: { art: "objekt" },
      lade: () => ladeVonUrl(quelle.zugang, url),
    });
  }

  const quellen = [
    {
      roh: quelle.projektRoh,
      ziel: { art: "objekt" as const },
      id: String(quelle.projektRoh.api_project_id || "projekt"),
    },
    ...quelle.einheiten.map((e) => ({
      roh: e.roh,
      ziel: { art: "wohnung" as const, we: e.we },
      id: e.propertyId,
    })),
  ];
  for (const q of quellen) {
    for (const datei of Array.isArray(q.roh.files) ? q.roh.files : []) {
      if (!datei || typeof datei !== "object") continue;
      const url = String(datei.filename || "");
      if (!/^https?:\/\//i.test(url) && !/^\/(?!\/)/.test(url)) continue;
      const herkunft = `file:${q.id}:${datei.id ?? url}`;
      const original = String(
        datei.original_filename || url.split("/").pop() || "dokument",
      );
      unterlagen.push({
        herkunft,
        ziel: q.ziel,
        dokument: true,
        dateiname: stabilerDateiname(herkunft, original),
        name: String(datei.title || original),
        /*
         * Ohne Tagesdatum, anders als bei den Fotos. Mit Datum galt jede
         * Unterlage an jedem neuen Tag als unbekannt und wurde samt Upload
         * neu geladen, obwohl sie laengst im Speicher lag. Ob die Zeile
         * noch da ist, prueft `uebernimmBilder` ohnehin in jedem Lauf.
         */
        version: JSON.stringify([datei.updated_at, url]),
        lade: () => ladeVonUrl(quelle.zugang, url, false),
      });
    }
  }
  /*
   * Unterlagen zuerst, Fotos danach.
   *
   * Bis zum 23.09.2026 standen die Unterlagen hinter allen Fotos. Reichte
   * das Zeitbudget nicht fuer die ganze Bildstrecke, kamen sie in diesem
   * Lauf gar nicht an die Reihe, und weil jedes Foto am naechsten Tag neu
   * geladen wird, konnte sich das Tag fuer Tag wiederholen. Unterlagen sind
   * wenige und kosten nach dem ersten Laden nur noch eine Abfrage, Fotos
   * sind viele.
   */
  return [...unterlagen, ...kandidaten];
}

/**
 * Kandidaten aus den Dokumentenpaketen der Einheiten. Je Einheit ein ZIP;
 * ein fehlendes oder kaputtes Paket bricht nur diese Einheit ab.
 */
async function* kandidatenAusZip(
  quelle: BildQuelle,
  fehler: string[],
  projektName: string,
  frist: number,
  erledigt: Record<string, string>,
): AsyncGenerator<
  { kandidaten: Kandidat[]; schluessel: string; version: string }
> {
  const projektId = String(quelle.projektRoh.api_project_id || "");
  const pakete = [
    ...(projektId
      ? [{
        id: projektId,
        art: "objekt" as const,
        we: "",
        pfad: `/api/api_projects/${
          encodeURIComponent(projektId)
        }/documents.zip`,
      }]
      : []),
    ...quelle.einheiten.map((e) => ({
      id: e.propertyId,
      art: "wohnung" as const,
      we: e.we,
      pfad: `/api/api_properties/${
        encodeURIComponent(e.propertyId)
      }/documents.zip`,
    })),
  ];
  for (const paket of pakete) {
    if (Date.now() > frist - 30_000) return;
    try {
      const roh = paket.art === "objekt"
        ? quelle.projektRoh
        : quelle.einheiten.find((e) => e.propertyId === paket.id)?.roh;
      if (
        Array.isArray(roh?.files) &&
        roh.files.every((f: Record<string, unknown>) =>
          typeof f?.filename === "string" &&
          (/^https?:\/\//i.test(f.filename) || /^\/(?!\/)/.test(f.filename))
        )
      ) continue;
      const version = JSON.stringify([
        new Date().toISOString().slice(0, 10),
        roh?.updated,
        roh?.updated_at,
        roh?.photos,
        roh?.files,
      ]);
      const schluessel = `${paket.art}:${paket.id}`;
      if (erledigt[schluessel] === version) continue;
      const zipBytes = await holeBytes(
        quelle.zugang,
        paket.pfad,
        MAX_ZIP_BYTES,
      );
      let groesse = 0;
      const eintraege = unzipSync(zipBytes, {
        filter: (datei) => {
          if (
            datei.name.endsWith("/") ||
            datei.name.split("/").some((teil) =>
              teil.startsWith(".") || teil.startsWith("__")
            )
          ) return false;
          groesse += datei.originalSize;
          if (
            groesse > MAX_ZIP_BYTES * 2 || datei.originalSize > MAX_DATEI_BYTES
          ) {
            throw new Error(
              "Dokumentenpaket überschreitet die zulässige entpackte Größe.",
            );
          }
          return true;
        },
      });
      const fotos = new Set(
        (Array.isArray(roh?.photos) ? roh.photos : []).flatMap((
          f: Record<string, unknown>,
        ) => [f.filename, f.original_filename]).filter((f): f is string =>
          typeof f === "string"
        ),
      );
      const kandidaten = Object.entries(eintraege).map(([name, bytes]) => {
        const herkunft = `zip:${paket.id}:${name}`;
        return {
          herkunft,
          dateiname: `${
            paket.art === "wohnung"
              ? `we-${sicherName(paket.we) || "einheit"}-`
              : ""
          }${stabilerDateiname(herkunft, name)}`,
          ziel: paket.art === "objekt"
            ? { art: "objekt" as const }
            : { art: "wohnung" as const, we: paket.we },
          dokument: !istBildDatei(name) ||
            !fotos.has(name.split("/").pop() || name),
          name: name.split("/").pop() || name,
          lade: () => Promise.resolve(bytes),
        };
      });
      if (
        fotos.size && !kandidaten.some((k) => !k.dokument) &&
        !sammleBildUrls(roh?.photos).length
      ) {
        fehler.push(
          `${projektName} ${paket.we}: Investagon meldet Fotos nur als Dateinamen; im Dokumentenpaket sind sie nicht enthalten. Bild-Downloadadresse fehlt.`,
        );
      }
      yield { kandidaten, schluessel, version };
    } catch (e) {
      fehler.push(
        `${projektName} ${paket.we}: Dokumentenpaket nicht nutzbar (${
          e instanceof Error ? e.message : String(e)
        })`,
      );
    }
  }
}

/**
 * Die Bilder eines Projekts übernehmen. Zählt in `bericht`, meldet Einzelnes
 * in `fehler` und wirft selbst nie: Ein Bildproblem darf den Import der
 * Objektdaten nicht rückgängig machen.
 *
 * Liefert `false`, wenn die Frist erreicht wurde und der Gesamtlauf
 * abbrechen soll.
 */
export async function uebernimmBilder(opts: {
  db: SupabaseClient;
  objektId: string;
  slug: string;
  projektName: string;
  quelle: BildQuelle | undefined;
  /** Zeitpunkt (ms), ab dem der Lauf ehrlich abbricht statt weiterzuladen. */
  frist: number;
  fehler: string[];
  bericht: BildBericht;
}): Promise<boolean> {
  const { db, objektId, slug, projektName, quelle, frist, fehler, bericht } =
    opts;
  const eintrag: BildProjektBericht = {
    name: projektName,
    quelle: "keine",
    uebernommen: 0,
    uebersprungen: 0,
  };
  bericht.projekte.push(eintrag);

  if (!quelle) {
    fehler.push(
      `${projektName}: keine Bildquelle, der Lauf kam aus der hinterlegten Liste statt aus der API`,
    );
    return true;
  }

  try {
    const { data: standObjekt, error: standLesefehler } = await db.from(
      "objekte",
    ).select("meta, bild_url").eq("id", objektId).single();
    if (standLesefehler) throw standLesefehler;
    let titelbild = standObjekt.bild_url;
    /**
     * Güte des aktuellen Titelbilds. Kleiner ist besser.
     * -1 heißt: von Hand gesetzt, das bleibt unangetastet. 99 heißt: noch
     * keins. Bilder einer einzelnen Einheit bekommen 9, damit sie nur dann
     * Titelbild werden, wenn das Objekt gar keine eigenen Außenaufnahmen hat.
     */
    let titelGuete = standObjekt.meta?.titelbildManuell === true
      ? -1
      : !titelbild
      ? 99
      : String(titelbild).includes("/investagon/")
      ? 8
      : -1;

    const erledigt: Record<string, string> =
      standObjekt.meta?.investagonMedienPakete || {};
    const antwortKandidaten = kandidatenAusAntwort(quelle);
    async function* gruppen(): AsyncGenerator<{
      kandidaten: Kandidat[];
      schluessel: string;
      version: string;
      /** Diese Quellversion wurde schon einmal vollstaendig uebernommen. */
      bekannt?: boolean;
    }> {
      for (const kandidat of antwortKandidaten) {
        const schluessel = `antwort:${kandidat.ziel.art}:${
          kandidat.ziel.art === "wohnung" ? kandidat.ziel.we : ""
        }:${kandidat.herkunft}`;
        const version = kandidat.version ||
          new Date().toISOString().slice(0, 10);
        const bekannt = erledigt[schluessel] === version;
        /*
         * Ein erledigtes Foto bleibt liegen. Eine erledigte Unterlage wird
         * trotzdem gegen ihre Tabelle geprueft: Fehlt die Zeile, etwa weil
         * das Speichern im Objektassistenten die Unterlagen neu geschrieben
         * hat, kommt sie im selben Lauf wieder. Das kostet eine Abfrage,
         * geladen wird nur, was fehlt oder sich geaendert hat.
         */
        if (bekannt && !kandidat.dokument) continue;
        eintrag.quelle = "antwort";
        yield { kandidaten: [kandidat], schluessel, version, bekannt };
      }
      for await (
        const gruppe of kandidatenAusZip(
          quelle!,
          fehler,
          projektName,
          frist,
          erledigt,
        )
      ) {
        eintrag.quelle = "zip";
        yield gruppe;
      }
    }

    // ── Bestand einlesen, um Vorhandenes zu erkennen statt zu verdoppeln ──
    const ordner = `investagon/${slug}`;
    const { data: dateien } = await db.storage.from(BUCKET).list(ordner, {
      limit: 1000,
    });
    const vorhandeneDateien = new Set(
      (dateien || []).map((d: { name: string }) => d.name),
    );

    const { data: objektBilder } = await db
      .from("objekt_bilder").select("url, reihenfolge").eq(
        "objekt_id",
        objektId,
      );
    const objektUrls = new Set(
      (objektBilder || []).map((b: { url: string }) => b.url),
    );
    /**
     * Laufende Nummer innerhalb einer Ranggruppe. Sie zählt nur die Bilder
     * dieses Laufs; die Gruppe (Rang mal 1000) bestimmt die grobe Reihenfolge,
     * diese Zahl nur die Reihenfolge innerhalb der Gruppe.
     */
    let objektReihenfolge = (objektBilder || []).reduce(
      (max: number, b: { reihenfolge: number | null }) =>
        Math.max(max, (b.reihenfolge ?? 0) % 1000),
      -1,
    );

    const { data: wohnungen } = await db
      .from("wohnungen").select("id, we_nr").eq("objekt_id", objektId);
    const wohnungNachWe = new Map(
      (wohnungen || []).map((
        w: { id: string; we_nr: string },
      ) => [w.we_nr, w.id]),
    );
    const wohnungIds = (wohnungen || []).map((w: { id: string }) => w.id);
    const wohnungsUrls = new Map<string, Set<string>>();
    const wohnungsReihenfolge = new Map<string, number>();
    if (wohnungIds.length > 0) {
      const { data: wBilder } = await db
        .from("wohnungs_bilder").select("wohnung_id, url, reihenfolge").in(
          "wohnung_id",
          wohnungIds,
        );
      for (
        const b of (wBilder || []) as {
          wohnung_id: string;
          url: string;
          reihenfolge: number | null;
        }[]
      ) {
        if (!wohnungsUrls.has(b.wohnung_id)) {
          wohnungsUrls.set(b.wohnung_id, new Set());
        }
        wohnungsUrls.get(b.wohnung_id)!.add(b.url);
        wohnungsReihenfolge.set(
          b.wohnung_id,
          Math.max(
            wohnungsReihenfolge.get(b.wohnung_id) ?? -1,
            b.reihenfolge ?? 0,
          ),
        );
      }
    }

    for await (const gruppe of gruppen()) {
      const fehlerVorher = bericht.fehlgeschlagen;
      const kandidaten = gruppe.kandidaten;
      // ── Übernehmen ──
      for (const kandidat of kandidaten) {
        if (Date.now() > frist) {
          fehler.push(
            `${projektName}: Zeitgrenze erreicht, Bildübernahme abgebrochen. Der nächste Lauf macht weiter.`,
          );
          return false;
        }
        try {
          if (
            kandidat.ziel.art === "wohnung" &&
            !wohnungNachWe.has(kandidat.ziel.we)
          ) throw new Error("Zugehörige Wohnung fehlt im CRM.");

          const pfad = `${ordner}/${kandidat.dateiname}`;
          if (kandidat.dokument) {
            const dokumentPfad = `${objektId}/${kandidat.dateiname}`;
            const url = `/investagon-dokument/${dokumentPfad}`;
            const tabelle = kandidat.ziel.art === "objekt"
              ? "objekt_dokumente"
              : "wohnungs_dokumente";
            const fremdschluessel = kandidat.ziel.art === "objekt"
              ? { objekt_id: objektId }
              : { wohnung_id: wohnungNachWe.get(kandidat.ziel.we)! };
            const { data: vorhanden, error: leseFehler } = await db.from(
              tabelle,
            ).select("id").eq("url", url).match(fremdschluessel).limit(1);
            if (leseFehler) throw leseFehler;
            // Zeile da und Quelle seit dem letzten Laden unveraendert: Die
            // Datei liegt schon im Speicher, erneutes Laden kostet nur Zeit.
            if (vorhanden?.length && gruppe.bekannt) {
              bericht.uebersprungen++;
              eintrag.uebersprungen++;
              continue;
            }

            const { error: uploadFehler } = await db.storage.from(
              "investagon-dokumente",
            ).upload(dokumentPfad, await kandidat.lade(), {
              contentType: contentType(kandidat.dateiname),
              upsert: true,
            });
            if (uploadFehler) throw uploadFehler;
            if (vorhanden?.length) {
              bericht.uebersprungen++;
              eintrag.uebersprungen++;
              continue;
            }
            const { error: schreibFehler } = await db.from(tabelle).insert({
              ...fremdschluessel,
              url,
              name: kandidat.name || kandidat.dateiname,
              // Objekt- beziehungsweise Wohnungsunterlage, nur Vergütung und
              // Vertriebsabsprachen sind intern. Die Ampel für Kunden hängt
              // nicht daran (`_shared/dokument-freigabe.ts`).
              kategorie: investagonImportKategorie(
                kandidat.ziel.art,
                kandidat.name,
                kandidat.dateiname,
              ),
              ...(kandidat.ziel.art === "objekt" ? { sichtbar: false } : {}),
            });
            if (schreibFehler) throw schreibFehler;
            bericht.uebernommen++;
            eintrag.uebernommen++;
            continue;
          }
          if (gruppe.schluessel || !vorhandeneDateien.has(kandidat.dateiname)) {
            const bytes = await kandidat.lade();
            const { error } = await db.storage.from(BUCKET).upload(
              pfad,
              bytes,
              {
                contentType: contentType(kandidat.dateiname),
                upsert: true,
              },
            );
            if (error) throw new Error(error.message);
            vorhandeneDateien.add(kandidat.dateiname);
          }
          const url = db.storage.from(BUCKET).getPublicUrl(pfad).data.publicUrl;

          // Die Einordnung des Bildes: Außenansichten zuerst, Innenaufnahmen
          // und Pläne zuletzt. Bilder einer Einheit sind nie das Gesicht des
          // Objekts, solange es eigene Aufnahmen gibt.
          const rang = kandidat.ziel.art === "objekt"
            ? bildRang(kandidat.anzeige || kandidat.name || kandidat.dateiname)
            : 9;

          if (titelGuete >= 0 && rang < titelGuete) {
            const { error: titelFehler } = await db.from("objekte").update({
              bild_url: url,
            }).eq("id", objektId);
            if (titelFehler) throw titelFehler;
            titelbild = url;
            titelGuete = rang;
          }
          if (kandidat.ziel.art === "objekt") {
            if (objektUrls.has(url)) {
              eintrag.uebersprungen++;
              bericht.uebersprungen++;
              continue;
            }
            objektReihenfolge++;
            const { error } = await db.from("objekt_bilder").insert({
              objekt_id: objektId,
              url,
              alt: projektName,
              // Der Rang steht vorn, damit die Fassade auch dann oben bleibt,
              // wenn sie in der Quelle weiter hinten liegt.
              reihenfolge: rang * 1000 + objektReihenfolge,
            });
            if (error) throw new Error(error.message);
            objektUrls.add(url);
          } else {
            const wohnungId = wohnungNachWe.get(kandidat.ziel.we)!;
            const urls = wohnungsUrls.get(wohnungId) || new Set<string>();
            if (urls.has(url)) {
              eintrag.uebersprungen++;
              bericht.uebersprungen++;
              continue;
            }
            const reihenfolge = (wohnungsReihenfolge.get(wohnungId) ?? -1) + 1;
            const { error } = await db.from("wohnungs_bilder").insert({
              wohnung_id: wohnungId,
              url,
              alt: `${projektName} ${kandidat.ziel.we}`,
              reihenfolge,
            });
            if (error) throw new Error(error.message);
            urls.add(url);
            wohnungsUrls.set(wohnungId, urls);
            wohnungsReihenfolge.set(wohnungId, reihenfolge);
          }
          eintrag.uebernommen++;
          bericht.uebernommen++;
        } catch (e) {
          const meldung = e instanceof Error ? e.message : String(e);
          // Zu grosse Dateien sind kein behebbarer Fehler. Wenn sie als
          // Fehlschlag zaehlen, gilt das Projekt nie als fertig und jeder
          // naechste Lauf laedt dessen gesamte Bildstrecke erneut. Deshalb
          // gelten sie als uebersprungen und werden nur vermerkt.
          if (meldung.includes("Datei zu groß")) {
            eintrag.uebersprungen++;
            bericht.uebersprungen++;
            continue;
          }
          bericht.fehlgeschlagen++;
          fehler.push(
            `${projektName}: Bild nicht übernommen (${
              kandidat.herkunft.slice(0, 120)
            }): ${meldung}`,
          );
        }
      }

      // Schon vermerkt, etwa bei einer unveraendert vorhandenen Unterlage:
      // kein zweites Schreiben in `meta`.
      if (
        gruppe.schluessel && bericht.fehlgeschlagen === fehlerVorher &&
        erledigt[gruppe.schluessel] !== gruppe.version
      ) {
        erledigt[gruppe.schluessel] = gruppe.version;
        const { data: stand, error: lesen } = await db.from("objekte").select(
          "meta",
        ).eq("id", objektId).single();
        if (lesen) throw lesen;
        const { error: schreiben } = await db.from("objekte").update({
          meta: { ...stand.meta, investagonMedienPakete: erledigt },
        }).eq("id", objektId);
        if (schreiben) throw schreiben;
      }
    }
    if (Date.now() > frist - 30_000) return false;
  } catch (e) {
    const meldung = e instanceof Error ? e.message : String(e);
    bericht.fehlgeschlagen++;
    fehler.push(`${projektName}: Bildübernahme fehlgeschlagen: ${meldung}`);
  }
  return true;
}
