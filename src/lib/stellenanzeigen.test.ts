import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  STELLENANZEIGEN,
  STELLENANZEIGE_KOPF,
  STELLENANZEIGE_WERTE,
  sichtbareTexte,
  stelleZuSlug,
} from "@/lib/stellenanzeigen";
import { KULTUR_WERTE } from "@/lib/kulturContent";
import { KENNENLERN_TOKEN_MUSTER, kennenlernUeberleitung } from "@/lib/partnerBewerbung";
import {
  FINANZDIENSTLEISTER_STELLE_TITEL,
  FINANZPROFI_RENDITE,
  TIPPGEBER_BESTAETIGUNG,
  TIPPGEBER_STELLE_TITEL,
  stellenKennzeichen,
} from "@/lib/stellenanzeigen";
import { wegAusAdresse } from "@/lib/bewerberKennenlernen";
import { waehleKennenlernNachfassEmpfaenger } from "../../supabase/functions/_shared/bewerber-nachfass";

/**
 * Wächter für den Wortlaut der Stellenanzeige.
 *
 * Beide Stellen sind selbstständig. Ein einziges Wort aus dem Arbeitsvertrag
 * reicht, damit die Anzeige als Anstellung gelesen wird, von Bewerbern und im
 * Zweifel von der Rentenversicherung. Und eine Zahl zur Provision oder ein
 * „garantiert" ist ein Werbeversprechen im Sinne des UWG. Beides fällt beim
 * Lesen leicht durch, deshalb prüft es hier eine Maschine.
 */

const ALLE_TEXTE: string[] = [
  ...STELLENANZEIGEN.flatMap(sichtbareTexte),
  ...STELLENANZEIGE_WERTE.flatMap((w) => [w.titel, w.text]),
  ...Object.values(STELLENANZEIGE_KOPF).flatMap((v) => (Array.isArray(v) ? v : [v])),
  TIPPGEBER_BESTAETIGUNG,
];

/*
 * Die Texte, die direkt in der Seite stehen (Knöpfe, Bestätigungen,
 * Rückfall). Gelesen aus der Datei, damit auch sie unter den Wächter fallen.
 */
const SEITE = readFileSync(resolve(__dirname, "../pages/StellenanzeigePage.tsx"), "utf8");
const SEITEN_TEXTE = Array.from(SEITE.matchAll(/"([^"\n]{12,})"/g))
  .map((m) => m[1])
  // Nur Sätze: Klassenlisten und CSS-Werte (Farbverläufe) bleiben draußen.
  .filter((t) => /\s/.test(t) && !/^[a-z-]+(\s[a-z0-9:/[\]().%=_&-]+)*$/.test(t) && !/gradient\(|hsl\(/.test(t))
  // Dazu der Text zwischen den Tags, etwa „Klingt nach dir?".
  .concat(
    Array.from(SEITE.matchAll(/>\s*([A-ZÄÖÜ][^<>{}\n]{3,})\s*</g)).map((m) => m[1].trim()),
  );

/** Wörter, die nach Anstellung klingen, versprechen oder garantieren. */
const VERBOTEN: RegExp[] = [
  /gehalt/i,
  /fixum/i,
  /festgehalt/i,
  /urlaub/i,
  /einstell/i,
  /\bangestellt/i,
  /anstellung/i,
  /mitarbeiter/i,
  /arbeitnehmer/i,
  /arbeitszeiten/i,
  /arbeitsplatz/i,
  /\bbüro/i,
  /weisung/i,
  /vorgesetzt/i,
  /anwesenheit/i,
  /dienstwagen|firmenwagen|fahrtkosten/i,
  /einarbeitung/i,
  /\bteam\b/i,
  /karriere/i,
  /garant/i,
  /risikofrei|risikolos/i,
  /sicheres einkommen|einkommen/i,
  /verdien/i,
  /steuerfrei/i,
  // Der Name des zweiten Produkts darf nirgends erscheinen (Christian, 24.09.2026).
  /police/i,
  /netto-?police/i,
  // Keine Prozentzahl, auch nicht ausgeschrieben.
  /\d\s*(%|prozent)/i,
  /\bprozent\b|%|€|\beuro\b/i,
];

/** Gedankenstriche: Halbgeviert, Geviert und der freistehende Bindestrich. */
const GEDANKENSTRICH = /[–—]|\s-\s/;

describe("Der Wortlaut der Stellenanzeige", () => {
  it("findet überhaupt Texte, sonst wäre jeder weitere Test grün", () => {
    expect(ALLE_TEXTE.length).toBeGreaterThan(40);
    expect(SEITEN_TEXTE.some((t) => t.includes("Postfach"))).toBe(true);
    expect(SEITEN_TEXTE).toContain("Klingt nach dir?");
  });

  it("enthält keinen Gedankenstrich, auch nicht im Titel", () => {
    const treffer = [...ALLE_TEXTE, ...SEITEN_TEXTE].filter((t) => GEDANKENSTRICH.test(t));
    expect(treffer).toEqual([]);
  });

  it("enthält keine Sprache aus dem Arbeitsvertrag und kein Versprechen", () => {
    const treffer: string[] = [];
    for (const text of [...ALLE_TEXTE, ...SEITEN_TEXTE]) {
      for (const muster of VERBOTEN) if (muster.test(text)) treffer.push(`${muster}: ${text}`);
    }
    expect(treffer).toEqual([]);
  });

  it("der Wächter schlägt wirklich an", () => {
    const probe = ["Festes Gehalt und 30 Tage Urlaub", "Garantiert 4 % Provision", "Vertrieb – Remote"];
    expect(probe.filter((t) => VERBOTEN.some((m) => m.test(t)) || GEDANKENSTRICH.test(t))).toHaveLength(3);
  });

  it("nennt keine Zahl zur Provision", () => {
    const zahlNahProvision = /\d[^.]{0,40}provision|provision[^.]{0,40}\d/i;
    expect(ALLE_TEXTE.filter((t) => zahlNahProvision.test(t))).toEqual([]);
  });

  it("spricht per du, nie per Sie", () => {
    expect(ALLE_TEXTE.filter((t) => /\b(Sie|Ihnen|Ihr|Ihre)\b/.test(t))).toEqual([]);
  });
});

describe("Die beiden Stellen", () => {
  it("sind genau die zwei beauftragten, mit ihrem Weg", () => {
    expect(STELLENANZEIGEN.map((s) => s.weg)).toEqual(["vertriebspartner", "tippgeber", "finanzdienstleister"]);
    expect(STELLENANZEIGEN[0].titel).toContain("Immobilienberater");
    expect(STELLENANZEIGEN[0].titel).toContain("(m/w/d)");
    expect(STELLENANZEIGEN[1].titel).toContain("Tippgeber");
    expect(STELLENANZEIGEN[1].titel).toContain("(m/w/d)");
  });

  it("haben alle vier Merkmale und alle fünf Abschnitte", () => {
    for (const s of STELLENANZEIGEN) {
      expect(s.merkmale.map((m) => m.wert)).toEqual(["Remote", "Freie Zeiteinteilung", "Vertrieb", "Ab sofort"]);
      expect(s.werWirSind.length).toBeGreaterThan(80);
      expect(s.deineRolle.length).toBeGreaterThan(80);
      expect(s.aufgaben.length).toBeGreaterThanOrEqual(4);
      expect(s.mitbringen.length).toBeGreaterThanOrEqual(3);
      expect(s.bieten.length).toBeGreaterThanOrEqual(4);
    }
  });

  it("passen in die Felder von submit-bewerbung", () => {
    for (const s of STELLENANZEIGEN) {
      expect(s.stelleId.length).toBeLessThanOrEqual(80);
      expect(s.titel.length).toBeLessThanOrEqual(200);
      expect(s.taetigkeit.length).toBeLessThanOrEqual(80);
    }
    expect(new Set(STELLENANZEIGEN.map((s) => s.stelleId)).size).toBe(STELLENANZEIGEN.length);
  });

  it("beschreibt den Tippgeber so, dass er erlaubnisfrei bleibt", () => {
    const tg = STELLENANZEIGEN.find((s) => s.weg === "tippgeber")!;
    expect(tg.deineRolle).toContain("nur den Kontakt");
    expect(tg.deineRolle).toContain("Du berätst nicht");
    expect(tg.deineRolle).toContain("keine Objekte vor");
    expect(tg.deineRolle).toContain("keine Preise");
    // Keine Aufgabe darf ihn beraten, Objekte zeigen oder Preise nennen lassen.
    for (const a of tg.aufgaben.slice(0, -1)) {
      expect(a).not.toMatch(/berätst|stellst .*objekt|nennst .*preis|rechnest/i);
    }
  });

  it("nennt beim Berater die Erlaubnis nach § 34c GewO und die Unterstützung", () => {
    const vp = STELLENANZEIGEN.find((s) => s.weg === "vertriebspartner")!;
    const text = vp.mitbringen.join(" ");
    expect(text).toContain("§ 34c GewO");
    expect(text).toContain("unterstützen wir dich beim Antrag");
    expect(vp.deineRolle).toContain("§§ 84 ff. HGB");
    expect(vp.deineRolle).toContain("erfolgsabhängig");
  });

  it("öffnet eine Stelle über ihren Adresszusatz", () => {
    expect(stelleZuSlug("#tippgeber")?.weg).toBe("tippgeber");
    expect(stelleZuSlug("immobilienberater")?.weg).toBe("vertriebspartner");
    expect(stelleZuSlug("#gibtsnicht")).toBeUndefined();
    expect(stelleZuSlug("")).toBeUndefined();
  });
});

describe("Die Werte im Kopf", () => {
  it("tragen dieselben Titel wie die Kulturseite", () => {
    expect(STELLENANZEIGE_WERTE.map((w) => w.titel)).toEqual(KULTUR_WERTE.map((w) => w.titel));
  });
});

describe("Die Überleitung in den Kennenlernbogen", () => {
  const token = "a".repeat(64);

  it("führt mit einem gültigen Schlüssel in den eigenen Bogen", () => {
    expect(kennenlernUeberleitung({ kennenlernenToken: token })).toBe(`/kennenlernen/${token}`);
  });

  it("fällt ohne Schlüssel auf den Rückfall zurück", () => {
    expect(kennenlernUeberleitung({ kennenlernenToken: "" })).toBeNull();
    expect(kennenlernUeberleitung(null)).toBeNull();
    expect(kennenlernUeberleitung(undefined)).toBeNull();
  });

  it("nimmt nichts an, was nicht genau wie ein Schlüssel aussieht", () => {
    for (const falsch of ["A".repeat(64), "a".repeat(63), `${"a".repeat(64)}/../x`, "../admin", "g".repeat(64)]) {
      expect(kennenlernUeberleitung({ kennenlernenToken: falsch })).toBeNull();
    }
  });

  it("prüft mit demselben Muster wie submit-bewerbung", () => {
    const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/submit-bewerbung/index.ts"), "utf8");
    expect(quelle).toContain(`const KENNENLERN_TOKEN_MUSTER = ${KENNENLERN_TOKEN_MUSTER.toString()};`);
  });
});

describe("submit-bewerbung gibt den Schlüssel nur auf Anforderung heraus", () => {
  const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/submit-bewerbung/index.ts"), "utf8");

  it("nur wenn die Stellenanzeige ihn anfordert und er das Muster trifft", () => {
    expect(quelle).toContain("kennenlernLink: z.boolean().optional().default(false)");
    expect(quelle).toMatch(/data\.kennenlernLink && KENNENLERN_TOKEN_MUSTER\.test\(kennenlernToken\)/);
  });

  it("protokolliert ihn nie", () => {
    const protokollZeilen = quelle.split("\n").filter((z) => /console\.(log|warn|error|info)/.test(z));
    expect(protokollZeilen.length).toBeGreaterThan(0);
    expect(protokollZeilen.filter((z) => /token/i.test(z) && !/recaptcha/i.test(z))).toEqual([]);
  });

  it("verschickt die Einladungsmail weiterhin, als Rückweg", () => {
    expect(quelle).toContain("versendeKennenlernen(admin, { bewerbungId })");
  });
});

describe("Der Tippgeber-Weg in submit-bewerbung (Christian, 24.09.2026)", () => {
  const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/submit-bewerbung/index.ts"), "utf8");

  it("erkennt den Tippgeber an einem festen Feld, nicht am Titeltext", () => {
    expect(quelle).toContain('stelle: z.enum(["tippgeber", "finanzdienstleister"]).optional()');
    expect(quelle).toContain('const istTippgeber = data.stelle === "tippgeber";');
    expect(quelle).not.toMatch(/stelleTitel[^\n]*includes\(["']tippgeber/i);
  });

  it("setzt den Titel für HR selbst, gleichlautend mit der Stellenanzeige", () => {
    expect(quelle).toContain(`const TIPPGEBER_STELLE_TITEL = "${TIPPGEBER_STELLE_TITEL}";`);
    const tg = STELLENANZEIGEN.find((s) => s.weg === "tippgeber")!;
    expect(tg.titel).toBe(TIPPGEBER_STELLE_TITEL);
    expect(quelle).toMatch(/const stelleTitel = istTippgeber\s*\?\s*TIPPGEBER_STELLE_TITEL/);
    expect(quelle).toContain("...(istTippgeber ? { tippgeber: true } : {}),");
  });

  it("löst für Tippgeber keine Kennenlern-Mail und keine Bewerberseite aus", () => {
    expect(quelle).toContain("if (data.email && !istTippgeber) {");
    expect(quelle).toContain('istTippgeber ? "" : await sorgeFuerBewerberSeite(admin as never, id)');
    // Die Einladung steht nur an dieser einen, bedingten Stelle.
    expect(quelle.match(/await stosseEingangsmailAn\(/g)).toHaveLength(1);
  });

  it("speichert keinen Lebenslauf und verlangt die Handynummer am Server", () => {
    expect(quelle).toContain('lebenslaufUrl: istTippgeber ? "" : data.lebenslaufUrl,');
    expect(quelle).toContain('istTippgeber && data.telefon.replace(/\\D/g, "").length < 6');
  });

  it("meldet HR jeden neuen Bewerber weiterhin, auch den Tippgeber", () => {
    const meldung = quelle.indexOf("await meldeNeuenBewerber(admin, {");
    expect(meldung).toBeGreaterThan(-1);
    // Die Meldung steht nicht hinter einer Tippgeber-Bedingung.
    expect(quelle.slice(Math.max(0, meldung - 200), meldung)).not.toContain("istTippgeber");
  });

  it("verlangt den Lebenslauf am Server für niemanden, auch vorher nicht", () => {
    // Pflicht ist er nur in der Oberfläche (Landingpage, Berater der Stellenanzeige).
    expect(quelle).toContain('lebenslaufUrl: z.string().max(11_000_000).optional().default("")');
  });
});

describe("Die Nachfass-Welle schreibt Tippgeber nicht an", () => {
  const zeile = (id: string, meta: Record<string, unknown> = {}) => ({
    id,
    vorname: id,
    nachname: "Muster",
    email: `${id}@example.org`,
    status: "Eingang",
    meta: { _type: "bewerber", ...meta },
  });

  it("nimmt den Tippgeber aus der Empfängerliste, mit Grund", () => {
    const auswahl = waehleKennenlernNachfassEmpfaenger(
      [zeile("berater"), zeile("tippgeber", { tippgeber: true })],
      new Set(),
    );
    expect(auswahl.empfaenger.map((k) => k.id)).toEqual(["berater"]);
    expect(auswahl.ausgeschlossen).toEqual([
      { id: "tippgeber", name: "tippgeber Muster", grund: "Tippgeber, wird angerufen" },
    ]);
  });

  it("lässt Bewerber ohne das Kennzeichen unverändert", () => {
    const auswahl = waehleKennenlernNachfassEmpfaenger([zeile("a"), zeile("b", { tippgeber: "ja" })], new Set());
    expect(auswahl.empfaenger.map((k) => k.id)).toEqual(["a", "b"]);
  });
});

describe("Die Stelle für Finanzdienstleister (Christian, 24.09.2026)", () => {
  const fd = STELLENANZEIGEN.find((s) => s.weg === "finanzdienstleister")!;
  const produkt = fd.zweitesProdukt!;

  it("ist als eigene Zielgruppe gekennzeichnet und hat dieselben Merkmale", () => {
    expect(fd.marke).toBe("Für Finanzprofis");
    expect(fd.titel).toContain("Finanzdienstleistung");
    expect(fd.titel).toContain("(m/w/d)");
    expect(fd.merkmale.map((m) => m.wert)).toEqual(["Remote", "Freie Zeiteinteilung", "Vertrieb", "Ab sofort"]);
    expect(fd.titel).toBe(FINANZDIENSTLEISTER_STELLE_TITEL);
  });

  it("nennt § 34c wie Stelle 1 und grenzt § 34d und § 34f ab", () => {
    const text = fd.mitbringen.join(" ");
    expect(text).toContain("§ 34c GewO");
    expect(text).toContain("unterstützen wir dich beim Antrag");
    expect(text).toContain("§ 34d oder § 34f ersetzt sie nicht");
  });

  it("nennt die drei Vorteile des zweiten Produkts, ohne seinen Namen", () => {
    const titel = [...produkt.punkte, produkt.rendite!.punkt].map((p) => p.titel);
    expect(titel).toEqual(["Stornofreie Provision", "Sehr gute Bestandsprovision", "Renditechancen für deine Kunden"]);
    expect(produkt.rendite!.punkt.text).toBe("Mit Renditechancen im zweistelligen Bereich pro Jahr.");
    expect(produkt.fuss).toContain("besprechen wir persönlich");
  });

  it("sagt nichts über die Erlaubnis für das zweite Produkt", () => {
    const texte = [produkt.titel, produkt.einleitung, produkt.fuss, ...produkt.punkte.map((p) => p.text)];
    expect(texte.filter((t) => /§|34d|34f|erlaubnis/i.test(t))).toEqual([]);
  });

  it("setzt den Risikohinweis direkt unter die Renditezeile, ohne Zahl", () => {
    const hinweis = FINANZPROFI_RENDITE.risikohinweis;
    expect(hinweis).toContain("Renditen sind nicht garantiert.");
    expect(hinweis).toContain("kein verlässlicher Indikator für die Zukunft");
    expect(hinweis).toContain("Einzelheiten nur im persönlichen Gespräch");
    expect(hinweis).not.toMatch(/\d|[–—]|\s-\s|police/i);
    // „garantiert" nur verneint.
    expect(hinweis.match(/garant\w*/gi)).toEqual(["garantiert"]);
    expect(hinweis).toMatch(/nicht garantiert/);
  });

  it("lässt sich mit einer Zeile entfernen", () => {
    const quelle = readFileSync(resolve(__dirname, "stellenanzeigen.ts"), "utf8");
    // Genau eine Codezeile (Kommentare zählen nicht).
    expect(quelle.match(/^\s+rendite: FINANZPROFI_RENDITE,$/gm)).toHaveLength(1);
  });

  it("schickt das feste Feld finanzdienstleister, Stelle 1 schickt keins", () => {
    expect(stellenKennzeichen(fd)).toBe("finanzdienstleister");
    expect(stellenKennzeichen(STELLENANZEIGEN[0])).toBeUndefined();
    expect(stellenKennzeichen(STELLENANZEIGEN[1])).toBe("tippgeber");
  });

  it("führt in den Kennenlernbogen mit Weg 2 vorausgewählt", () => {
    const token = "b".repeat(64);
    expect(kennenlernUeberleitung({ kennenlernenToken: token }, "weg2")).toBe(`/kennenlernen/${token}?weg=weg2`);
    expect(kennenlernUeberleitung({ kennenlernenToken: token }, "weg2&x=1")).toBe(`/kennenlernen/${token}`);
    expect(wegAusAdresse("?weg=weg2")).toBe("weg2");
    expect(wegAusAdresse("?weg=unbekannt")).toBeUndefined();
    expect(wegAusAdresse("")).toBeUndefined();
  });
});

describe("Der Name des zweiten Produkts geht nicht an die Stellenanzeige", () => {
  const dateien = [
    "stellenanzeigen.ts",
    "partnerBewerbung.ts",
    "../pages/StellenanzeigePage.tsx",
    "../components/landing/PartnerBewerbungFormular.tsx",
    "../../supabase/functions/submit-bewerbung/index.ts",
  ];
  for (const datei of dateien) {
    it(`steht nicht in ${datei}`, () => {
      const text = readFileSync(resolve(__dirname, datei), "utf8");
      expect(text).not.toMatch(/police/i);
      expect(text).not.toContain("ZWEITES_PRODUKT_NAME");
      // Kein Import des Videocall-Moduls, dort steht der Name. Kommentare gehen nicht in den Bau.
      expect(text).not.toMatch(/from\s+["'][^"']*bewerberVideocall/);
    });
  }
});

describe("submit-bewerbung merkt Finanzdienstleister vor", () => {
  const quelle = readFileSync(resolve(__dirname, "../../supabase/functions/submit-bewerbung/index.ts"), "utf8");

  it("setzt Kennzeichen und Titel selbst", () => {
    expect(quelle).toContain('const istFinanzdienstleister = data.stelle === "finanzdienstleister";');
    expect(quelle).toContain("...(istFinanzdienstleister ? { finanzdienstleister: true } : {}),");
    expect(quelle).toContain(`"${FINANZDIENSTLEISTER_STELLE_TITEL}"`);
  });

  it("lässt die Kennenlern-Einladung für sie laufen, nur Tippgeber sind ausgenommen", () => {
    expect(quelle).toContain("if (data.email && !istTippgeber) {");
    expect(quelle).not.toMatch(/istFinanzdienstleister[^\n]*stosseEingangsmailAn|!istFinanzdienstleister/);
  });
});
