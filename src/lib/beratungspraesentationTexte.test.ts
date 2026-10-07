import { ANLAGE_ZIELE } from "@/lib/anlageZiele";
import { RATE_EINGANG, rateRechenweg } from "@/lib/rateAnteile";
import { ANLAGE_ZIELE_EN, BERATUNG_TEXTE, inAnrede } from "@/lib/beratungspraesentationTexte";
import { REFERENZ_TEXTE } from "@/lib/referenzenTexte";

/*
 * Die Übersetzungen der Beratungspräsentation MOREImmo.
 *
 * Geprüft wird die Form, nicht der Wortlaut: Jeder deutsche Eintrag hat ein
 * englisches Gegenstück und umgekehrt, Listen sind gleich lang, Funktionen
 * nehmen dieselben Werte. Dazu die Hausregel ohne Gedankenstriche und die
 * Zusage, dass beim Übersetzen keine Zahl verloren geht.
 */

type Knoten = unknown;

const istAnredePaar = (w: Knoten): w is { sie: string; du: string } =>
  typeof w === "object" && w !== null && !Array.isArray(w) && Object.keys(w).sort().join() === "du,sie";

/** Alle Pfade bis zu den Blättern. Anrede-Paare und Funktionen gelten als Blatt. */
function pfade(w: Knoten, praefix = ""): string[] {
  if (typeof w === "string" || typeof w === "function" || istAnredePaar(w)) return [praefix];
  if (Array.isArray(w)) return w.flatMap((x, i) => pfade(x, `${praefix}[${i}]`));
  if (typeof w === "object" && w !== null) {
    return Object.entries(w).flatMap(([k, v]) => pfade(v, praefix ? `${praefix}.${k}` : k));
  }
  return [`${praefix}:${typeof w}`];
}

/** Alle sichtbaren Texte, Funktionen mit Beispielwerten aufgerufen, beide Anreden. */
function texte(w: Knoten): string[] {
  if (typeof w === "string") return [w];
  if (typeof w === "function") {
    const beispiel = Array.from({ length: w.length }, (_, i) => (i === 0 ? 12345.5 : 678));
    return texte((w as (...a: unknown[]) => unknown)(...beispiel));
  }
  if (istAnredePaar(w)) return [w.sie, w.du];
  if (Array.isArray(w)) return w.flatMap(texte);
  if (typeof w === "object" && w !== null) return Object.values(w).flatMap(texte);
  return [];
}

/** Ein Blatt an einem Pfad, für den Vergleich der Funktionen. */
function blatt(w: Knoten, pfad: string): Knoten {
  return pfad
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<Knoten>((x, schluessel) => (x as Record<string, Knoten>)[schluessel], w);
}

const { de, en } = BERATUNG_TEXTE;

describe("Übersetzungen der Beratungspräsentation: vollständig", () => {
  it("jeder deutsche Eintrag hat ein englisches Gegenstück und umgekehrt", () => {
    const dePfade = pfade(de).sort();
    const enPfade = pfade(en).sort();
    expect(dePfade.filter((p) => !enPfade.includes(p))).toEqual([]);
    expect(enPfade.filter((p) => !dePfade.includes(p))).toEqual([]);
    expect(dePfade.length).toBeGreaterThan(300);
  });

  it("Funktionen nehmen in beiden Sprachen dieselbe Anzahl Werte", () => {
    const funktionen = pfade(de).filter((p) => typeof blatt(de, p) === "function");
    expect(funktionen.length).toBeGreaterThan(10);
    for (const p of funktionen) {
      expect(typeof blatt(en, p), p).toBe("function");
      expect((blatt(en, p) as () => unknown).length, p).toBe((blatt(de, p) as () => unknown).length);
    }
  });

  it("kein englischer Eintrag ist leer, ausser dort, wo auch der deutsche leer ist", () => {
    for (const p of pfade(de)) {
      const deutsch = texte(blatt(de, p)).join("");
      const englisch = texte(blatt(en, p)).join("");
      if (deutsch.trim()) expect(englisch.trim(), p).not.toBe("");
    }
  });

  it("Englisch kennt keine Anrede-Paare, dort gibt es nur you", () => {
    const paare = pfade(en).filter((p) => istAnredePaar(blatt(en, p)));
    expect(paare).toEqual([]);
  });

  it("jedes Anlageziel hat eine englische Beschriftung", () => {
    for (const ziel of ANLAGE_ZIELE) {
      expect(ANLAGE_ZIELE_EN[ziel.id], ziel.id).toBeTruthy();
      expect(inAnrede(en.zielLabel(ziel.id), "du")).toBe(ANLAGE_ZIELE_EN[ziel.id]);
      expect(inAnrede(de.zielLabel(ziel.id), "du")).toBe(ziel.label);
    }
  });

  it("die Referenzen haben in beiden Sprachen dieselbe Form", () => {
    expect(pfade(REFERENZ_TEXTE.en).sort()).toEqual(pfade(REFERENZ_TEXTE.de).sort());
  });
});

describe("Übersetzungen der Beratungspräsentation: Hausregeln", () => {
  it("kein Gedankenstrich in den englischen Texten", () => {
    const mitStrich = [...texte(en), ...texte(REFERENZ_TEXTE.en)].filter((t) => /[—–]/.test(t));
    expect(mitStrich).toEqual([]);
  });

  it("auch die deutschen Texte kommen ohne Gedankenstrich aus", () => {
    const mitStrich = [...texte(de), ...texte(REFERENZ_TEXTE.de)].filter((t) => /[—–]/.test(t));
    expect(mitStrich).toEqual([]);
  });

  it("Englisch spricht niemanden mit Sie oder Du an", () => {
    const deutscheAnrede = texte(en).filter((t) => /\b(Sie|Ihr|Ihnen|Ihre|du|dein|deine|dir|dich)\b/.test(t));
    expect(deutscheAnrede).toEqual([]);
  });
});

describe("Übersetzungen der Beratungspräsentation: Zahlen", () => {
  /** Nur die Ziffern, in ihrer Reihenfolge. "4.600 €" und "€4,600" ergeben beide 4600. */
  const ziffern = (t: string) => t.replace(/[^0-9]/g, "");

  it("in den Musterrechnungen stehen auf Englisch dieselben Zahlen in derselben Reihenfolge", () => {
    for (const p of pfade(de.rechnungen)) {
      const deutsch = texte(blatt(de.rechnungen, p)).map(ziffern);
      const englisch = texte(blatt(en.rechnungen, p)).map(ziffern);
      // Bei Anrede-Paaren genügt die Sie-Fassung, Du hat dieselben Zahlen.
      expect(englisch[0], p).toBe(deutsch[0]);
    }
  });

  it("die Beträge folgen der Sprache: 1.400 € auf Deutsch, €1,400 auf Englisch", () => {
    expect(de.rechnungen.bestand.zeilen[0].betrag).toBe("+1.400 €");
    expect(en.rechnungen.bestand.zeilen[0].betrag).toBe("+€1,400");
    expect(inAnrede(en.rueckblick.rund(350000), "du")).toBe("around €350,000");
    expect(inAnrede(de.rueckblick.rund(350000), "du")).toBe("rund 350.000 €");
  });

  it("der deutsche Rechenweg ist wörtlich der aus rateAnteile.ts", () => {
    const e = RATE_EINGANG.bestand;
    const deutsch = de.funktion.rechenweg(
      e.kaltmiete,
      e.nichtUmlagefaehig,
      e.rate,
      e.entlastungAbJahrZwei,
      e.eigenbeitragAbJahrZwei,
    );
    expect(deutsch).toBe(rateRechenweg(e));
  });

  it("der englische Rechenweg nennt dieselben Beträge", () => {
    const e = RATE_EINGANG.bestand;
    const englisch = inAnrede(
      en.funktion.rechenweg(e.kaltmiete, e.nichtUmlagefaehig, e.rate, e.entlastungAbJahrZwei, e.eigenbeitragAbJahrZwei),
      "du",
    );
    for (const betrag of ["€1,400", "€150", "€1,250", "€126", "€228", "€1,604"]) {
      expect(englisch).toContain(betrag);
    }
  });
});
