/**
 * Muster des Exposé-PDFs (Design H3 „Nachtblau“) erzeugen.
 *
 *   npx vite-node scripts/expose-muster.tsx <antwort.json> <zielordner> [wohnungId] [de|en] [dateiname]
 *
 * <antwort.json> ist die öffentliche Antwort von `get-expose` zu einem
 * freigegebenen Objekt (ohne Token, also nur, was ein Fremder sehen darf).
 * Sie bleibt außerhalb des Repos. Der Ansprechpartner ist ein Beispielname.
 * Kartenkacheln kommen von OpenStreetMap, zwölf Stück je Lauf.
 */
import { readFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { renderToFile } from "@react-pdf/renderer";
import { exposePayloadZuObjekt } from "@/lib/exposePublicDaten";
import { annahmenVorbelegen, baueExposeInhalt, sichtbareZeilen, type Person } from "@/lib/exposeInhalt";
import { berechneExpose } from "@/lib/exposeRechner";
import { STANDORTE } from "@/data/marktanalyseSeed";
import { investagonErgaenzung, ohneWidersprueche, zeilenErgaenzen } from "@/components/expose/exposeInvestagon";
import { umgebungsKartenbild } from "@/lib/umgebungKartenbild";
import { ladeDruckBilder, logoPixel, LOGO_ADRESSE, type BildLader } from "@/lib/exposeDruck/bilder";
import { baueDruckDaten, type DruckBild } from "@/lib/exposeDruck/daten";
import { registriereHausschrift } from "@/lib/exposeDruck/baukasten";
import { H3Nachtblau } from "@/lib/exposeDruck/H3Nachtblau";

const [antwortPfad, ziel, wohnungWahl, spracheArg, dateiArg] = process.argv.slice(2);
if (!antwortPfad || !ziel) throw new Error("Aufruf: expose-muster.tsx <antwort.json> <zielordner> [wohnungId] [de|en] [dateiname]");
const sprache = spracheArg === "en" ? "en" : "de";
const PUBLIC = resolve(process.cwd(), "public");
// Canvas für Node: kommt mit pdf.js ins Projekt, deshalb über pdf.js aufgelöst statt als eigene Abhängigkeit.
const vonPdfjs = createRequire(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const { createCanvas, loadImage } = vonPdfjs("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
const KENNUNG = "MOREImmo-Expose-Muster/1.0 (einmalige Mustererzeugung)";

async function holen(url: string): Promise<Buffer | null> {
  if (url.startsWith("/")) return readFileSync(resolve(PUBLIC, `.${url}`));
  const antwort = await fetch(url, { headers: { "User-Agent": KENNUNG } });
  return antwort.ok ? Buffer.from(await antwort.arrayBuffer()) : null;
}

const nodeLader: BildLader = {
  async bild(url, maxKante, alsPng = false) {
    try {
      const daten = await holen(url);
      if (!daten) return null;
      const img = await loadImage(daten);
      const f = Math.min(1, maxKante / Math.max(img.width, img.height));
      const c = createCanvas(Math.round(img.width * f), Math.round(img.height * f));
      const ctx = c.getContext("2d");
      if (!alsPng) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const puffer = alsPng ? c.toBuffer("image/png") : c.toBuffer("image/jpeg", 88);
      return { src: `data:image/${alsPng ? "png" : "jpeg"};base64,${puffer.toString("base64")}`, breite: c.width, hoehe: c.height };
    } catch (e) {
      console.warn("Bild nicht geladen", url, e);
      return null;
    }
  },
  async pdfSeite() {
    return null;
  },
  async karte(umgebung) {
    const k = await umgebungsKartenbild(umgebung, {
      skala: 3,
      zeitlimitMs: 20000,
      erzeugeCanvas: () => createCanvas(1, 1) as unknown as HTMLCanvasElement,
      ladeKachel: async (url) => loadImage((await holen(url)) as Buffer) as unknown as CanvasImageSource,
    });
    return k ? { src: k.daten, breite: k.breite, hoehe: k.hoehe } : null;
  },
  async logo(hell) {
    const img = await loadImage(readFileSync(resolve(PUBLIC, `.${LOGO_ADRESSE}`)));
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const r = logoPixel(ctx as unknown as Parameters<typeof logoPixel>[0], c.width, c.height, hell);
    const z = createCanvas(r.w, r.h);
    z.getContext("2d").drawImage(c, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    return { src: `data:image/png;base64,${z.toBuffer("image/png").toString("base64")}`, breite: r.w, hoehe: r.h } satisfies DruckBild;
  },
};

const payload = JSON.parse(readFileSync(antwortPfad, "utf8"));
const objekt = exposePayloadZuObjekt(payload);
const wohnung = objekt.wohnungen.find((w) => w.id === wohnungWahl) ?? objekt.wohnungen.find((w) => w.status === "frei") ?? objekt.wohnungen[0];
const standort = STANDORTE.find((s) => s.name === objekt.ort);
const standortArbeitgeber = (standort?.top_arbeitgeber ?? []).map((a) => ({ name: a.name, branche: a.branche ?? null, mitarbeiter: a.mitarbeiter ?? null, hauptsitz: null, quelle: null }));
// Beispielperson, keine echte Person.
const ansprechpartner: Person = { name: "Anna Beispiel", rolle: "Vertriebspartnerin", email: "anna.beispiel@example.com", telefon: "+49 89 1234 5678" };
const heute = new Date();

const roh = baueExposeInhalt({ objekt, wohnung, standort, standortArbeitgeber, ersteller: ansprechpartner, sprache, heute });
const einheitRoh = (payload.wohnungen as Array<Record<string, unknown>>).find((r) => r.id === wohnung.id) ?? null;
const zusatz = investagonErgaenzung({ objekt, einheit: einheitRoh, ebene: "einheit", sprache });
// Musterplan aus `public/muster`, weil der Kundenlink ohne Token keine Pläne herausgibt.
const inhalt = {
  ...roh,
  objektdaten: { ...roh.objektdaten, zeilen: sichtbareZeilen(zeilenErgaenzen(roh.objektdaten.zeilen, ohneWidersprueche(zusatz.zeilen, roh.objektdaten.energie))) },
  grundriss: { dokumente: roh.grundriss.dokumente.length ? roh.grundriss.dokumente : [{ id: "muster", name: "Grundriss WE 03", url: "/muster/objekt/grundriss-we-03.jpg", istBild: true }] },
};
const vorbelegung = annahmenVorbelegen(objekt, wohnung, null, heute);
const ergebnis = berechneExpose(inhalt.wirtschaftlichkeit.objektdaten, vorbelegung.annahmen);

registriereHausschrift(PUBLIC);
const bilder = await ladeDruckBilder(inhalt, nodeLader);
console.log(`Fotos ${bilder.fotos.length}, Karte ${bilder.karte ? "ja" : "nein"}, Pläne ${bilder.plaene.filter(Boolean).length}`);
const daten = baueDruckDaten(inhalt, vorbelegung.annahmen, ergebnis, bilder, {
  sprache,
  herkunft: Object.fromEntries(vorbelegung.ausObjekt.map((k) => [k, "objekt" as const])),
  erstelltAm: heute,
  zusatz: { beschreibungen: zusatz.beschreibungen, merkmale: zusatz.merkmale },
});

mkdirSync(ziel, { recursive: true });
const datei = resolve(ziel, dateiArg || `Expose_H3_Muster${sprache === "en" ? "_EN" : ""}.pdf`);
await renderToFile(<H3Nachtblau d={daten} />, datei);
console.log("geschrieben", datei);
