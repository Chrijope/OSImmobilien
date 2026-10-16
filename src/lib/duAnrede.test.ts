import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DU_TEXTE, anredeFuer, gastTexte, istPlatzhalterName, mitWerten } from "@/lib/videoraumAnrede";
import { warteHinweisText, gastFehlerText } from "@/lib/videoraumStore";

/**
 * Der Wächter über die Du-Anrede im Videoraum und im Bewerberprozess.
 *
 * Der Bewerber wird vom Kennenlernen bis zum Vertrag geduzt. Ausgerechnet im
 * Videoraum wurde er gesiezt, denn den Raum teilt er sich mit der Kundschaft,
 * und die Texte gab es nur in einer Fassung. Am 14.09.2026 kam eine zweite
 * dazu, und die Raumart entschied. Seit dem 15.09.2026 spricht das ganze
 * Projekt per Du, auch mit Kunden, und es gibt wieder nur eine Fassung.
 *
 * Diese Datei sorgt dafür, dass das Sie nicht zurückkehrt. Sie prüft zwei
 * Sorten von Stellen, und zwar auf zwei verschiedene Arten:
 *
 *   1. **Die Texte des Videoraums**, Wert für Wert. Die Datei
 *      `videoraumAnrede.ts` nennt in ihren Kommentaren den alten Wortlaut,
 *      also lässt sich der Wächter nicht auf die Datei ansetzen, sondern auf
 *      die Werte.
 *   2. **Die Mailvorlagen des Bewerberprozesses**, als Quelltext. Vorlagen
 *      laden React über eine npm-Angabe und sind für Vitest nicht
 *      importierbar; lesen lässt sich ihr Text aber. Kommentare werden vorher
 *      entfernt, denn dort steht „Sie" oft für „die Mail" und ist dann kein
 *      Anredefehler.
 *
 * Warum überhaupt ein Wächter: Die Anrede ist nichts, was ein Fehler sichtbar
 * macht. Ein zurückgerutschtes „Ihr Termin" fällt niemandem im Testlauf auf,
 * sondern erst dem Bewerber, und dem sagt es: Hier redet eine Maschine.
 *
 * Ausdrücklich gesiezt wird dagegen: die Gruppe F (Verträge, Datenschutz,
 * Selbstauskunft, Notar, Reservierung, Mieterbriefe, bewacht in
 * `mailAnredeRegeln.test.ts`) und seit dem 27.09.2026 die ganze
 * Handbuch-Strecke für Interessenten (Entscheidung Christian, bewacht in
 * `handbuch/handbuchSieAnrede.test.ts` und `mailAnredeRegeln.test.ts`).
 */

/**
 * Die Wörter, die eine Sie-Anrede verraten.
 *
 * Nur großgeschrieben, und nur als ganzes Wort. „sie" klein ist das normale
 * Pronomen der dritten Person und völlig in Ordnung, „Ihr" groß am Satzanfang
 * dagegen nicht. Ein „Sie" am Satzanfang gibt es im Deutschen nicht als
 * Kleinschreibung, deshalb ist die Großschreibung hier das verlässliche
 * Merkmal.
 */
const SIE_WOERTER = /\b(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\b/;

/** Alle Treffer, damit die Fehlermeldung sagt, welches Wort es war. */
function sieTreffer(text: string): string[] {
  return text.match(new RegExp(SIE_WOERTER, "g")) ?? [];
}

describe("Die Du-Fassung des Videoraums", () => {
  it("enthält in keinem einzigen Text eine Sie-Anrede", () => {
    for (const [schluessel, text] of Object.entries(DU_TEXTE)) {
      expect(sieTreffer(text), `DU_TEXTE.${schluessel}: „${text}“`).toEqual([]);
    }
  });

  it("duzt bei jedem Anlass, auch den Kunden", () => {
    // Seit dem 15.09.2026 gibt es keine Sie-Fassung mehr. Die Raumart darf
    // die Anrede nicht mehr umschalten, auch nicht ohne Raum auf der
    // Fehlerseite eines abgelaufenen Links.
    for (const art of ["bewerbergespraech", "beratung", "objektvorstellung", "erstgespraech", "sonstiges"] as const) {
      expect(anredeFuer(art), art).toBe("du");
      for (const [schluessel, text] of Object.entries(gastTexte(art))) {
        expect(sieTreffer(text), `${art}.${schluessel}: „${text}“`).toEqual([]);
      }
    }
    expect(anredeFuer(null)).toBe("du");
    expect(anredeFuer(undefined)).toBe("du");
    expect(gastTexte("beratung")).toBe(DU_TEXTE);
    expect(gastTexte(null)).toBe(DU_TEXTE);
  });

  it("nennt das Gespräch je nach Anlass anders, sonst bleibt alles gleich", () => {
    // Ein Bewerber führt kein Beratungsgespräch. Das ist die einzige Stelle,
    // an der die Raumart den Wortlaut noch bestimmt.
    expect(gastTexte("bewerbergespraech").gespraechTitel).toBe("Kennenlerngespräch");
    expect(gastTexte("beratung").gespraechTitel).toBe("Beratungsgespräch");
    const { gespraechTitel: _b, ...bewerber } = gastTexte("bewerbergespraech");
    const { gespraechTitel: _k, ...kunde } = gastTexte("beratung");
    expect(bewerber).toEqual(kunde);
  });

  it("erkennt den Platzhalter, auch den alten, damit aus keinem ein Vorname wird", () => {
    // Sonst begrüßt der Warteraum mit „Dein ist gleich für dich da“. Der alte
    // Platzhalter kann in Räumen stehen, die vor der Umstellung angelegt wurden.
    expect(istPlatzhalterName("Dein Ansprechpartner")).toBe(true);
    expect(istPlatzhalterName("Ihr Ansprechpartner")).toBe(true);
    expect(istPlatzhalterName("")).toBe(true);
    expect(istPlatzhalterName("Oliver Skowrnowski")).toBe(false);
  });

  it("setzt Platzhalter ein, ohne einen stehen zu lassen", () => {
    expect(mitWerten(DU_TEXTE.gleichDa, { name: "Christian" })).toBe("Christian ist gleich für dich da");
    expect(mitWerten(DU_TEXTE.wartenPosition, { position: 3 })).not.toContain("{position}");
  });
});

describe("Die Texte, die der Store ausgibt", () => {
  it("duzt beim Warten, bei jedem Anlass und auch ohne Raumart", () => {
    for (const art of ["bewerbergespraech", "beratung", undefined] as const) {
      expect(sieTreffer(warteHinweisText(1, false, art)), String(art)).toEqual([]);
      expect(sieTreffer(warteHinweisText(1, true, art)), String(art)).toEqual([]);
      expect(sieTreffer(warteHinweisText(3, true, art)), String(art)).toEqual([]);
    }
    expect(warteHinweisText(3, true, "bewerbergespraech")).toContain("Position 3");
  });

  it("duzt auch in den Fehlermeldungen, bei jedem Anlass", () => {
    const meldungen = [
      new Error("Raum nicht gefunden"),
      new Error("Link abgelaufen"),
      new Error("Gespraech bereits beendet"),
      new Error("Bitte Namen angeben"),
      new Error("zu viele Anfragen"),
      new Error("irgendetwas anderes"),
    ];
    for (const art of ["bewerbergespraech", "beratung", null] as const) {
      for (const fehler of meldungen) {
        const text = gastFehlerText(fehler, art);
        expect(sieTreffer(text), `${art}: „${text}“`).toEqual([]);
      }
    }
  });
});

/**
 * Die Mailvorlagen des Bewerberprozesses.
 *
 * Zwei davon siezten bis zum 14.09.2026 als einzige: die Erinnerung an das
 * telefonische Erstgespräch und die an den Video-Call. Beide sind jetzt auf Du
 * umgestellt, und dieser Wächter hält sie dort.
 */
describe("Die Bewerbermails sind durchgehend im Du", () => {
  const wurzel = join(__dirname, "..", "..");
  const vorlagen = join(wurzel, "supabase", "functions", "_shared", "transactional-email-templates");

  /**
   * Kommentare heraus, dann bleibt der sichtbare Text übrig.
   *
   * In den Kommentaren dieses Projekts steht „Sie" regelmäßig für „die Mail"
   * oder „die Vorlage", und einige zitieren ausdrücklich den alten Wortlaut,
   * damit nachvollziehbar bleibt, was geändert wurde. Das ist keine Anrede und
   * darf den Wächter nicht auslösen.
   */
  function ohneKommentare(quelle: string): string {
    return quelle
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  const dateien = [
    "bewerber-erstgespraech-erinnerung.tsx",
    "bewerber-closing-erinnerung.tsx",
    "bewerber-videocall-erinnerung.tsx",
    // Die Bestätigung zur Terminbuchung. Sie ist die erste Mail, in der ein
    // Bewerber den Weg in den Videoraum findet, und stand bis zum 14.09.2026
    // als einzige Bewerbermail nicht unter diesem Wächter.
    "bewerber-termin-bestaetigung.tsx",
    "bewerber-kennenlernen-erinnerung-1.tsx",
    "bewerber-kennenlernen-erinnerung-3.tsx",
  ];

  for (const datei of dateien) {
    it(`${datei} enthält keine Sie-Anrede`, () => {
      const text = ohneKommentare(readFileSync(join(vorlagen, datei), "utf8"));
      expect(sieTreffer(text), `in ${datei}`).toEqual([]);
    });
  }

  it("grüßt mit Hallo und Vorname statt mit Guten Tag", () => {
    for (const datei of dateien) {
      const quelle = readFileSync(join(vorlagen, datei), "utf8");
      expect(quelle, datei).toContain("`Hallo ${vorname},`");
      expect(quelle, datei).not.toContain("Guten Tag");
    }
  });

  /**
   * Der Wortlaut der Terminbestätigung liegt nicht in der Vorlage.
   *
   * Betreff, Einleitung, Knopfbeschriftung und Schlusssatz stehen in
   * `bewerber-termin-mail.ts`, damit Vitest sie lesen kann. Die Vorlage selbst
   * enthält deshalb kaum Text, und ein Wächter, der nur sie prüft, prüfte fast
   * nichts.
   */
  it("bewerber-termin-mail.ts enthält keine Sie-Anrede", () => {
    const quelle = readFileSync(
      join(wurzel, "supabase", "functions", "_shared", "bewerber-termin-mail.ts"),
      "utf8",
    );
    expect(sieTreffer(ohneKommentare(quelle))).toEqual([]);
  });

  /**
   * Das gemeinsame Layout bleibt ohne Anrede.
   *
   * `_layout.tsx` trägt jede Mail des Hauses, die an den Kunden ebenso wie die
   * an den Bewerber, und weiß beim Bauen nicht, welche von beiden es gerade
   * ist. Jede Anrede darin trifft deshalb zwangsläufig auch die falsche Seite.
   * Bis zum 14.09.2026 standen zwei darin: der Ersatzsatz, wenn einem Knopf
   * der Link fehlt, und die Rollenzeile unter dem Namen, wenn zur Person keine
   * Bezeichnung hinterlegt ist. Beide sind jetzt anredefrei.
   *
   * Wer hier Text ergänzt, formuliert ihn ohne Anrede. Steht die Anrede fest,
   * gehört der Satz in die Vorlage, nicht hierher.
   */
  it("_layout.tsx kommt ohne jede Anrede aus", () => {
    const quelle = readFileSync(join(vorlagen, "_layout.tsx"), "utf8");
    expect(sieTreffer(ohneKommentare(quelle))).toEqual([]);
  });
});

/**
 * Präsentation, Erstgesprächsskript, Partner-Mikroseite, Einwandleitfaden und
 * die Mails aus Strategie Vertrieb Abschnitt 8.
 *
 * Am 16.10.2026 waren genau diese Stellen in Sie-Form entstanden, obwohl die
 * Hausregel seit dem 15.09.2026 Du sagt. Christian am selben Tag: „bitte
 * immer und überall duzen“. Präsentation und Skript hatten dafür einen
 * Du/Sie-Schalter; die Sie-Fassung ist entfallen, und dieser Wächter hält sie
 * draußen. Geprüft wird der Quelltext ohne Kommentare, wie oben bei den
 * Bewerbermails. Ein „Sie“ in der dritten Person am Satzanfang („Sie steht
 * …“) löst ihn ebenfalls aus; solche Sätze sind hier umformuliert.
 *
 * Englische Texte stehen in denselben Dateien, enthalten aber kein Sie.
 */
describe("Präsentation, Skript, Mikroseite und Vertriebsmails duzen", () => {
  const wurzel = join(__dirname, "..", "..");
  const vorlagen = join("supabase", "functions", "_shared", "transactional-email-templates");

  function ohneKommentare(quelle: string): string {
    return quelle
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:])\/\/.*$/gm, "$1");
  }

  const dateien = [
    "src/pages/BeratungspraesentationHV.tsx",
    "src/lib/beratungOsDaten.ts",
    "src/lib/beratungspraesentationTexte.ts",
    "src/lib/beratungSprechskripte.ts",
    "src/components/setter/SetterErstgespraechsSkript.tsx",
    "src/components/landing/BeraterMicrositeContent.tsx",
    "src/components/landing/mikroseiteOsTexte.ts",
    "src/components/landing/mikroseiteTexte.ts",
    "src/components/landing/mikroseiteAbschlussTexte.ts",
    "src/lib/osEinwaende.ts",
    ...[
      "termin-beratungspraesentation.tsx",
      "einladung-objektvorstellung.tsx",
      "erinnerung-unterlagen-objektvorstellung.tsx",
      "nachfass-zusammenfassung.tsx",
      "letzte-nachricht.tsx",
      "finanzierung-starten.tsx",
    ].map((d) => join(vorlagen, d)),
  ];

  for (const datei of dateien) {
    it(`${datei} enthält keine Sie-Anrede`, () => {
      const text = ohneKommentare(readFileSync(join(wurzel, datei), "utf8"));
      expect(sieTreffer(text), `in ${datei}`).toEqual([]);
    });
  }

  it("die Mails grüßen mit Hallo und Vorname, nicht förmlich", () => {
    for (const datei of dateien.filter((d) => d.startsWith(vorlagen))) {
      const text = ohneKommentare(readFileSync(join(wurzel, datei), "utf8"));
      expect(text, datei).toMatch(/anrede=\{hallo\(/);
      expect(text, datei).not.toMatch(/foermlich|Guten Tag/);
    }
  });

  it("das Erstgesprächsskript bietet keine Sie-Form mehr an", () => {
    const text = ohneKommentare(readFileSync(join(wurzel, "src/components/setter/SetterErstgespraechsSkript.tsx"), "utf8"));
    expect(text).not.toMatch(/Sie-Form|"sie"\s*\?|setAnrede/);
  });
});

/**
 * Die Beratungspräsentationen A und B (`BeratungspraesentationHV.tsx`).
 *
 * Bis zum 16.10.2026 gab es dort Du und Sie, gewählt im Erstgespräch. Seit
 * der Hausregel „immer und überall duzen“ gibt es nur noch die Du-Fassung,
 * auch wenn im Erstgespräch früher „Sie“ gespeichert wurde. Geprüft werden
 * die Texte als Werte (A, B, Plan, Grafik, Dokumente), die gemeinsamen
 * Texte, die die Seite liest, die Sprechskripte des Trainer-Modus und der
 * sichtbare Text der Seite selbst.
 */
describe("Die Beratungspräsentationen A und B duzen durchgehend", () => {
  /** Alle Texte eines Objekts, mit Pfad. Ein Paar { sie, du } ist schon ein Fehler. */
  function texte(wert: unknown, pfad: string, aus: Array<[string, string]> = []): Array<[string, string]> {
    if (typeof wert === "string") aus.push([pfad, wert]);
    else if (typeof wert === "function") aus.push([pfad, String((wert as (p: string) => unknown)("2 %"))]);
    else if (Array.isArray(wert)) wert.forEach((w, i) => texte(w, `${pfad}[${i}]`, aus));
    else if (wert && typeof wert === "object") {
      expect(Object.keys(wert), `${pfad} ist noch ein Paar aus Sie und Du`).not.toEqual(["sie", "du"]);
      for (const [k, w] of Object.entries(wert)) texte(w, `${pfad}.${k}`, aus);
    }
    return aus;
  }

  it("enthält in den Texten von A und B keine Sie-Anrede und kein Sie-Paar mehr", async () => {
    const a = await import("@/lib/beratungOsDaten");
    const b = await import("@/lib/beratungOsDatenB");
    const k = await import("@/lib/beratungKonzeptDaten");
    const alle = [
      ...texte(a.OS_TEXTE, "OS_TEXTE"),
      ...texte(a.OBJEKTE, "OBJEKTE"),
      ...texte(k.KONZEPT_STEUER, "KONZEPT_STEUER"),
      ...texte(k.KONZEPT_ALTER, "KONZEPT_ALTER"),
      ...texte(k.WAS_WENN, "WAS_WENN"),
      ...texte(b.OS_TEXTE_B, "OS_TEXTE_B"),
      ...texte(b.KAUFKRAFT_B, "KAUFKRAFT_B"),
      ...texte(b.DOKUMENTE_B, "DOKUMENTE_B"),
    ];
    expect(alle.length).toBeGreaterThan(100);
    for (const [pfad, text] of alle) expect(sieTreffer(text), `${pfad}: „${text}“`).toEqual([]);
  });

  it("liest auch die gemeinsamen Texte nur in der Du-Fassung", async () => {
    const { BERATUNG_TEXTE, inAnrede } = await import("@/lib/beratungspraesentationTexte");
    const quelle = readFileSync(join(__dirname, "..", "pages", "BeratungspraesentationHV.tsx"), "utf8");
    const genutzt = [...new Set([...quelle.matchAll(/\btx\.(arbeitsweise|rueckblick|schritt)\.(\w+)/g)].map((m) => `${m[1]}.${m[2]}`))];
    expect(genutzt.length).toBeGreaterThan(10);
    for (const schluessel of genutzt) {
      const [gruppe, feld] = schluessel.split(".");
      const roh = (BERATUNG_TEXTE.de as unknown as Record<string, Record<string, unknown>>)[gruppe][feld];
      const wert = typeof roh === "function" ? (roh as (n: number) => unknown)(100_000) : roh;
      const text = inAnrede(wert as Parameters<typeof inAnrede>[0], "du");
      expect(sieTreffer(text), `tx.${schluessel}: „${text}“`).toEqual([]);
    }
  });

  it("spricht im Trainer-Modus per Du", async () => {
    const { SPRECHSKRIPT_NACH_ID, sprechskriptFuerAnrede } = await import("@/lib/beratungSprechskripte");
    const quelle = readFileSync(join(__dirname, "..", "pages", "BeratungspraesentationHV.tsx"), "utf8");
    const ids = [...new Set([...quelle.matchAll(/<Trainer id="([\w-]+)"/g)].map((m) => m[1]))];
    expect(ids.length).toBeGreaterThan(3);
    for (const id of ids) {
      const s = sprechskriptFuerAnrede(SPRECHSKRIPT_NACH_ID[id], "du");
      for (const text of [s.skript, s.ueberleitung ?? ""]) expect(sieTreffer(text), `${id}: „${text}“`).toEqual([]);
    }
  });

  it.each(["pages/BeratungspraesentationHV.tsx", "components/beratung/KonzeptFolien.tsx", "components/beratung/folienBausteine.tsx"])(
    "hat im sichtbaren Text von %s keine Sie-Anrede",
    (datei) => {
      const quelle = readFileSync(join(__dirname, "..", datei), "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/.*$/gm, "$1");
      expect(sieTreffer(quelle)).toEqual([]);
    },
  );
});
