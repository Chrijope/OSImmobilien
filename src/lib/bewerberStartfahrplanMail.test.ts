import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  STARTFAHRPLAN_AUGENBRAUE,
  STARTFAHRPLAN_BETREFF,
  STARTFAHRPLAN_EINLEITUNG,
  STARTFAHRPLAN_HERKUNFT,
  STARTFAHRPLAN_HINWEIS,
  STARTFAHRPLAN_KNOPF,
  STARTFAHRPLAN_KNOPF_HINWEIS,
  STARTFAHRPLAN_KOSTEN,
  STARTFAHRPLAN_SCHLUSS,
  STARTFAHRPLAN_TITEL,
  STARTFAHRPLAN_VORSCHAU,
  STARTFAHRPLAN_WEGE,
  STARTFAHRPLAN_WEGE_VORSATZ,
} from "../../supabase/functions/_shared/bewerber-startfahrplan-mail";
import { LIZENZ_PAKETE, WAEHLBARE_LIZENZ_PAKETE, getLizenzPaket } from "@/lib/lizenzPakete";

/**
 * Die Startfahrplan-Mail (Vorlage `paket-uebersicht`).
 *
 * Bewacht wird das, woran die alte Fassung gescheitert ist: Sie siezte als
 * einzige Mail des Bewerberwegs, sie versprach „alle vier Startmöglichkeiten",
 * die es seit dem Wegfall der Servicevereinbarung nicht mehr gibt, und sie
 * benutzte das Wort „Quereinsteiger", das der übrige Prozess bewusst vermeidet.
 *
 * Dazu zwei Prüfungen, die verhindern, dass der Text mit dem Code
 * auseinanderläuft: Der genannte Provisionssatz kommt aus `lizenzPakete.ts`,
 * und kein Paket, das dort `waehlbar: false` trägt, darf in der Mail stehen.
 */

/** Die Mail als ein durchgehender Text, so wie der Bewerber sie liest. */
const GANZ = [
  STARTFAHRPLAN_BETREFF,
  STARTFAHRPLAN_AUGENBRAUE,
  STARTFAHRPLAN_TITEL,
  STARTFAHRPLAN_VORSCHAU,
  STARTFAHRPLAN_EINLEITUNG,
  STARTFAHRPLAN_WEGE_VORSATZ,
  ...STARTFAHRPLAN_WEGE,
  STARTFAHRPLAN_KOSTEN,
  STARTFAHRPLAN_HERKUNFT,
  STARTFAHRPLAN_KNOPF,
  STARTFAHRPLAN_KNOPF_HINWEIS,
  STARTFAHRPLAN_SCHLUSS,
  STARTFAHRPLAN_HINWEIS,
].join(" ");

/**
 * Die Vorlage selbst, ohne ihre Kommentare.
 *
 * Die Kommentare erklären ausdrücklich, was an der alten Fassung falsch war,
 * und nennen dabei die Wörter, die im sichtbaren Text nichts zu suchen haben.
 * Geprüft wird deshalb nur, was der Bewerber am Ende liest.
 */
const ohneKommentare = (quelle: string): string =>
  quelle.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");

const VORLAGE = readFileSync(
  join(
    __dirname,
    "..",
    "..",
    "supabase",
    "functions",
    "_shared",
    "transactional-email-templates",
    "paket-uebersicht.tsx",
  ),
  "utf8",
);

/** Nur der Teil der Vorlage, aus dem am Ende sichtbarer Text wird. */
const VORLAGE_SICHTBAR = ohneKommentare(VORLAGE);

describe("Die Startfahrplan-Mail duzt", () => {
  it("duzt durchgehend und siezt an keiner Stelle", () => {
    expect(GANZ).toMatch(/\bdu\b|\bdir\b|\bdein/i);
    expect(GANZ).not.toMatch(/\bSie\b|\bIhnen\b|\bIhre[rnms]?\b/);
  });

  it("grüßt mit Hallo und nicht mit Guten Tag", () => {
    // „Guten Tag" war die Anrede der siezenden Fassung. Alle anderen Mails des
    // Bewerberwegs beginnen mit „Hallo".
    expect(VORLAGE_SICHTBAR).toContain("`Hallo ${vorname},`");
    expect(VORLAGE_SICHTBAR).not.toMatch(/Guten Tag/);
  });
});

describe("Die Startfahrplan-Mail nennt nur aktuelle Modelle", () => {
  it("verspricht keine vier Startmöglichkeiten mehr", () => {
    expect(GANZ).not.toMatch(/vier Start|alle vier/i);
    // Auch nicht in Ziffern, und auch nicht als „Paket zur Wahl".
    expect(GANZ).not.toMatch(/4 (Start|Pakete)/);
  });

  it("nennt genau die beiden Wege, die neuen Bewerbern offenstehen", () => {
    expect(STARTFAHRPLAN_WEGE).toHaveLength(2);
    expect(STARTFAHRPLAN_WEGE[0]).toMatch(/Vertriebspartner/);
    expect(STARTFAHRPLAN_WEGE[1]).toMatch(/Tippgeber/);
    // Beide gibt es im Code wirklich, und beide sind dort wählbar.
    const wahl = WAEHLBARE_LIZENZ_PAKETE.map((p) => p.id);
    expect(wahl).toContain("junior");
    expect(wahl).toContain("tippgeber");
  });

  it("nennt kein Paket, das nur noch für Bestandspartner existiert", () => {
    const nurBestand = LIZENZ_PAKETE.filter((p) => p.waehlbar === false);
    // Die Sicherung ist nur etwas wert, solange es solche Pakete gibt.
    expect(nurBestand.length).toBeGreaterThan(0);
    for (const paket of nurBestand) {
      expect(GANZ, `Altpaket „${paket.titel}" steht in der Mail`).not.toContain(paket.titel);
    }
  });

  it("nennt keine Servicevereinbarung und keine Grundgebühr mehr", () => {
    // Am 07.09.2026 aus dem Vertragswerk entfernt. Was es nicht mehr gibt,
    // darf eine Mail an einen neuen Bewerber nicht anbieten.
    for (const wort of [/Servicevereinbarung/i, /Grundgeb[üu]hr/i, /Systemgeb[üu]hr/i, /Setup-Investition/i]) {
      expect(GANZ).not.toMatch(wort);
    }
  });

  it("nennt den Provisionssatz, der in lizenzPakete.ts steht", () => {
    const satz = getLizenzPaket("junior")?.provisionssatz;
    expect(satz).toBe(4);
    expect(STARTFAHRPLAN_WEGE[0]).toContain(`${satz} Prozent`);
  });

  it("sagt beim Kostenpunkt dasselbe wie die beiden Pakete", () => {
    for (const id of ["junior", "tippgeber"]) {
      const paket = getLizenzPaket(id);
      expect(paket?.monatlich).toBe(0);
      expect(paket?.preis).toBe(0);
      expect(paket?.laufzeitMonate).toBe(0);
    }
    expect(STARTFAHRPLAN_KOSTEN).toMatch(/kein laufendes Entgelt/);
    expect(STARTFAHRPLAN_KOSTEN).toMatch(/kein Einmalbetrag/);
    expect(STARTFAHRPLAN_KOSTEN).toMatch(/keine Mindestlaufzeit/);
  });
});

describe("Die Startfahrplan-Mail spricht wie der übrige Prozess", () => {
  it("kommt ohne das Wort Quereinsteiger aus", () => {
    // Die Regieanweisung zu Weg 5 in `bewerberVideocall.ts` sagt es wörtlich:
    // kein Wort „Quereinsteiger". Der Bogen nennt dieselbe Gruppe „Vertrieb
    // ist für mich neu, ich will es lernen".
    expect(GANZ).not.toMatch(/Quereinstei/i);
    expect(VORLAGE_SICHTBAR).not.toMatch(/Quereinstei/i);
    expect(STARTFAHRPLAN_HERKUNFT).toMatch(/neu anf[äa]ngst/);
  });

  it("kommt ohne Gedankenstriche und ohne Werbesprache aus", () => {
    expect(GANZ).not.toMatch(/[–—]/);
    for (const wort of [/einmalig/i, /Chance deines Lebens/i, /jetzt zuschlagen/i, /!/]) {
      expect(GANZ).not.toMatch(wort);
    }
  });

  it("hält die Entscheidung offen und sagt, was als Nächstes kommt", () => {
    expect(STARTFAHRPLAN_SCHLUSS).toMatch(/Entschieden ist damit nichts/);
    expect(STARTFAHRPLAN_SCHLUSS).toMatch(/melden uns wieder/);
    // Kein Datum und keine Frist: Der Termin zum Nachfassen wird im Gespräch
    // gesetzt und ist der Vorlage nicht bekannt.
    expect(GANZ).not.toMatch(/\d+\s*(Tage|Wochen|Stunden)(?!\s*g[üu]ltig)/);
  });

  it("verspricht beim Knopf nur, was die signierte Adresse hergibt", () => {
    // 90 Tage stehen so in `uploadPaketUebersichtPdf` (60 * 60 * 24 * 90).
    expect(STARTFAHRPLAN_KNOPF_HINWEIS).toContain("90 Tage");
  });

  it("verweist auf den Vertrag, ohne eine Anlage zu nummerieren", () => {
    // Die Nummern haben sich schon einmal verschoben: „Anlage 2" war die
    // Konditionenanlage der Altfassung, heute ist es die AVV.
    expect(STARTFAHRPLAN_HINWEIS).toMatch(/unverbindlich/i);
    expect(STARTFAHRPLAN_HINWEIS).toMatch(/mit seinen Anlagen/);
    expect(GANZ).not.toMatch(/Anlage \d/);
  });
});
