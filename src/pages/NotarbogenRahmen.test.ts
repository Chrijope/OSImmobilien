import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * Waechter fuer den Rahmen des Notar-Aufnahmebogens im Kundenprofil.
 *
 * Christian am 22.09.2026: Beim Oeffnen des Aufnahmebogens verschwand die
 * Navigationsleiste samt Logo, der Bogen nahm den ganzen Bildschirm ein.
 * Ursache war `fixed inset-0`, also eine Schicht ueber dem gesamten Fenster.
 * Die Leiste steht ausserhalb der Seite, eine solche Schicht deckt sie mit zu.
 *
 * Seitdem sitzt der Bogen im normalen Inhaltsbereich, so wie Reservierung und
 * Selbstauskunft. Damit bleibt die Leiste von selbst stehen, ohne dass hier
 * irgendetwas ueber sie wissen muesste.
 *
 * Die zweite Haelfte des Waechters gilt der Hoehenkette vom selben Tag: feste
 * Knopfleiste unten, scrollender Inhalt dazwischen. Sie haengt daran, dass der
 * Rahmen eine feste Hoehe hat. Faellt `h-full` weg, waechst das Formular mit
 * seinem Inhalt, und die Knopfleiste wandert beim Scrollen mit nach unten aus
 * dem Bild.
 */
const wurzel = process.cwd();
const profil = readFileSync(resolve(wurzel, "src/pages/KundenDetail.tsx"), "utf8");
const layout = readFileSync(resolve(wurzel, "src/components/DashboardLayout.tsx"), "utf8");
const bogen = readFileSync(resolve(wurzel, "src/components/notar/KaufvertragForm.tsx"), "utf8");

/** Der Rahmen des Aufnahmebogens, von seiner Bedingung bis zum Formular. */
const rahmen = profil.slice(
  profil.indexOf("{showKaufvertragForm && ("),
  profil.indexOf("<KaufvertragForm"),
);

describe("Der Aufnahmebogen deckt die Navigationsleiste nicht mehr zu", () => {
  it("oeffnet nicht mehr als Schicht ueber dem ganzen Fenster", () => {
    expect(rahmen).not.toContain("fixed inset-0");
    expect(rahmen.length).toBeGreaterThan(100);
  });

  it("steht im Inhaltsbereich, nicht im Profil-Kasten darueber", () => {
    // Der Bogen ist ein Geschwister des Profils, nicht dessen Kind. Sonst
    // stuende das ganze Kundenprofil ueber ihm.
    const profilKasten = profil.indexOf('className={showKaufvertragForm ? "kundenprofil space-y-6 hidden"');
    expect(profilKasten).toBeGreaterThan(-1);
    expect(profil.indexOf("{showKaufvertragForm && (")).toBeGreaterThan(profilKasten);
  });

  it("tritt das Profil zur Seite, solange der Bogen offen ist", () => {
    expect(profil).toContain('"kundenprofil space-y-6 hidden"');
  });

  it("laesst die Leiste im Geruest unangetastet", () => {
    // Die Leiste haengt im Geruest, eine Ebene ueber jeder Seite. Wer sie von
    // einer Seite aus ausblendbar macht, baut sich die naechste Luecke.
    expect(layout).toContain("<AppSidebar />");
  });
});

describe("Die Hoehenkette bleibt erhalten", () => {
  it("der Rahmen nimmt die Hoehe des Inhaltsbereichs", () => {
    expect(rahmen).toContain("h-full");
    expect(rahmen).toContain("min-h-0");
    expect(rahmen).toContain("overflow-hidden");
  });

  it("der Inhaltsbereich hat dafuer eine feste Hoehe", () => {
    // `h-full` rechnet in Prozent und braucht deshalb einen Elternbereich mit
    // fester Hoehe. Die gibt `main` im Geruest vor.
    expect(layout).toContain('<main className="flex-1 min-h-0 overflow-auto');
  });

  it("gescrollt wird nur die Karte, die Knopfleiste bleibt unten", () => {
    expect(bogen).toContain('<div className="apple-form flex h-full min-h-0 flex-col">');
    expect(bogen).toContain('<Card className="flex min-h-0 flex-1 flex-col overflow-y-auto p-0">');
    // Die Knopfleiste steht ausserhalb der Karte und schrumpft nicht mit.
    expect(bogen).toContain("z-30 mt-4 flex shrink-0 flex-wrap items-center justify-between");
  });

  it("der Zurueckweg oben faellt aus der Hoehenrechnung heraus", () => {
    // Ohne `shrink-0` gaebe die Zeile nach, sobald es eng wird, und der Knopf
    // wuerde flachgedrueckt.
    expect(bogen).toContain('<div className="mb-3 shrink-0">');
  });
});

/**
 * Der Seitenaufbau nach dem Vorbild der Reservierungsvereinbarung.
 *
 * Christian am 22.09.2026: Der Bogen soll ueber die gesamte Seitenbreite
 * gehen und aussehen wie die Reservierung. Vorher stand er in `max-w-4xl`,
 * also 896 Pixel breit in der Mitte, waehrend die Reservierung die volle
 * Breite des Inhaltsbereichs nutzt.
 */
const reservierungSeite = readFileSync(resolve(wurzel, "src/pages/Reservierung.tsx"), "utf8");

describe("Der Aufnahmebogen sieht aus wie die Reservierungsvereinbarung", () => {
  it("nimmt die gesamte Seitenbreite ein", () => {
    // Keine Breitenbegrenzung mehr in den Klassen des Rahmens. Die
    // Reservierung hat auch keine. Im Kommentar darf `max-w-4xl` stehen
    // bleiben, er erklaert ja gerade, warum es weg ist.
    expect(rahmen).not.toMatch(/className="[^"]*max-w-/);
    expect(rahmen).toContain("w-full");
  });

  it("traegt dieselbe Kopfzeile wie die Reservierung", () => {
    // `PageHeader` bringt Ueberschrift, blauen Strich und Unterzeile mit.
    expect(reservierungSeite).toContain("<PageHeader");
    expect(rahmen).toContain("<PageHeader");
    expect(rahmen).toContain('title="Aufnahmebogen Notar"');
    expect(rahmen).toContain("subtitle=");
  });

  it("nennt in der Unterzeile Kunde und Objekt, wie die Reservierung", () => {
    // Nur Angaben, die der Bogen wirklich hat: Name des Kunden und Objekt
    // samt Wohneinheit aus dem Investment.
    expect(rahmen).toContain("kunde?.vorname");
    expect(rahmen).toContain("objektTitel");
  });

  it("steht der Zurueckweg unter der Kopfzeile, nicht darueber", () => {
    // Reihenfolge wie bei der Reservierung: Ueberschrift, Unterzeile,
    // „Zurueck zum Kundenprofil", dann die Karte.
    expect(bogen).toContain("Zurück zum Kundenprofil");
    expect(bogen.indexOf("Zurück zum Kundenprofil")).toBeLessThan(bogen.indexOf("<FormProgress"));
  });

  it("zeigt Schrittanzeige und Fortschrittsleiste in der Karte", () => {
    const karte = bogen.slice(bogen.indexOf("<Card className=\"flex min-h-0"));
    expect(karte).toContain("<FormProgress");
    expect(karte).toContain('eyebrow="Aufnahmebogen Notar"');
  });

  it("die Fortschrittsleiste kommt mit allen sechs Schritten zurecht", () => {
    const fortschritt = readFileSync(resolve(wurzel, "src/components/ui/form-progress.tsx"), "utf8");
    // Jeder Schritt teilt sich die Breite (`flex-1 min-w-0`), die Beschriftung
    // wird gekuerzt statt umzubrechen, und auf schmalen Bildschirmen faellt
    // sie ganz weg. Damit laeuft die Leiste auch bei sechs Schritten nicht ueber.
    expect(fortschritt).toContain("min-w-0 flex-1");
    expect(fortschritt).toContain("truncate w-full hidden sm:block");
    expect(fortschritt).toContain("overflow-x-auto");
  });

  it("traegt kein Impressum und keinen Datenschutzhinweis", () => {
    // Die Reservierung hat beides, weil der Kunde sie zu sehen bekommt. Der
    // Aufnahmebogen ist ein internes Formular: Er wird nur im Kundenprofil
    // ausgefuellt und geht als PDF ans Notariat, nie an den Kunden.
    expect(bogen).not.toContain('href="/impressum"');
    expect(bogen).not.toContain('href="/datenschutz"');
  });
});

describe("Keine Browser-Dialoge im Aufnahmebogen", () => {
  it("weder confirm noch alert noch prompt", () => {
    for (const verboten of [/\bwindow\.confirm\b/, /\bwindow\.alert\b/, /\bwindow\.prompt\b/]) {
      expect(bogen).not.toMatch(verboten);
    }
    // Auch ohne das vorangestellte `window.`.
    expect(bogen).not.toMatch(/(^|[^.\w])confirm\s*\(/);
    expect(bogen).not.toMatch(/(^|[^.\w])alert\s*\(/);
    expect(bogen).not.toMatch(/(^|[^.\w])prompt\s*\(/);
  });
});

/**
 * Der Rahmen setzt keinen eigenen Hintergrund.
 *
 * Christian am 22.09.2026: „Warum ist oberhalb von Aufnahmebogen Notar auch
 * noch so ein weisser eckiger Rahmen? Diesen bitte rausloeschen, der wird ja
 * auf keiner anderen Seite angezeigt."
 *
 * Der Kasten trug `bg-background`. Derselbe Farbwert steht auch am
 * Inhaltsbereich, es sah deshalb nach einer Doppelung ohne Wirkung aus. Die
 * Glasschicht nimmt dem Inhaltsbereich seinen Hintergrund aber wieder weg,
 * damit die getoente Flaeche des Fensters durchscheint. Wer den Farbwert
 * selbst setzt, malt dadurch als Einziger eine deckende Flaeche auf die Seite,
 * und ihre Oberkante ist der Streifen, den Christian gesehen hat.
 */
const glasschicht = readFileSync(resolve(wurzel, "src/styles/design-glas.css"), "utf8");

/** Die Klassen des aeusseren Kastens, ohne die Kommentare drumherum. */
const aeussereKlassen = (() => {
  const anfang = rahmen.indexOf('<div className="flex h-full min-h-0');
  return anfang < 0 ? "" : rahmen.slice(anfang).match(/className="([^"]*)"/)?.[1] ?? "";
})();

describe("Der Rahmen des Aufnahmebogens malt keine eigene Flaeche", () => {
  it("der aeussere Kasten traegt keine Hintergrundklasse", () => {
    expect(aeussereKlassen).toContain("h-full");
    expect(aeussereKlassen).not.toMatch(/\bbg-/);
  });

  it("die Reservierungsvereinbarung macht es genauso", () => {
    // Ihr Rahmen um Kopfzeile und Formular traegt nur den Abstand.
    expect(reservierungSeite).toContain('<div className="space-y-6">');
  });

  it("die Glasschicht raeumt den Hintergrund des Inhaltsbereichs weg", () => {
    // Genau deshalb faellt ein eigener Hintergrund hier auf. Faellt diese
    // Regel weg, ist auch die Begruendung oben hinfaellig.
    const regel = glasschicht.slice(glasschicht.indexOf('[data-glas="an"] main.flex-1'));
    expect(regel.slice(0, 120)).toContain("background-color: transparent");
  });
});
