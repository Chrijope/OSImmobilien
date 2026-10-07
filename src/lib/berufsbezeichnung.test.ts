import { describe, it, expect } from "vitest";
import {
  berufsbezeichnung as imCrm,
  istRollenkennung as istRollenkennungImCrm,
  BERUF_IMMOBILIENBERATER,
  BERUF_HR,
} from "@/lib/berufsbezeichnung";
import {
  berufsbezeichnung as inDerMail,
  istRollenkennung as istRollenkennungInDerMail,
} from "../../supabase/functions/_shared/berufsbezeichnung";
import { ROLES } from "@/types/user";
import { rollenLabel, LEAD_BERATER_LABEL } from "@/lib/rollenLabel";

/**
 * Die Berufsbezeichnung steht zweimal im Projekt.
 *
 * Massgeblich ist `src/lib/berufsbezeichnung.ts`. Die zweite Fassung liegt
 * unter `supabase/functions/_shared/`, weil die Mails aus Edge Functions
 * kommen und die in Deno laufen: Sie koennen `src` nicht erreichen.
 *
 * Zwei Fassungen derselben Zuordnung laufen auseinander, und bemerkt wird es
 * erst, wenn in der Mail eine andere Bezeichnung steht als im Warteraum.
 * Genau das faengt dieser Test: Er rechnet beide Fassungen ueber jede
 * einzelne Rolle, jede Zweierkombination und ueber die Faelle mit eigener
 * Bezeichnung gegeneinander.
 */

const ALLE_ROLLEN = ROLES.map((r) => r.id as string);

/** Jede Rolle einzeln, dazu die leeren und krummen Faelle. */
const EINZELFAELLE: Array<string | string[] | null | undefined> = [
  ...ALLE_ROLLEN,
  ...ALLE_ROLLEN.map((r) => [r]),
  ...ALLE_ROLLEN.map((r) => r.toUpperCase()),
  ...ALLE_ROLLEN.map((r) => `  ${r}  `),
  null,
  undefined,
  "",
  "   ",
  [],
  ["unbekannte_rolle"],
];

/** Alle Zweierkombinationen. Genau hier entscheidet sich der Vorrang. */
const KOMBINATIONEN: string[][] = ALLE_ROLLEN.flatMap((a) =>
  ALLE_ROLLEN.filter((b) => b !== a).map((b) => [a, b]),
);

/** Eigene Bezeichnungen, echte wie vorgetaeuschte. */
const EIGENE_BEZEICHNUNGEN: Array<string | null | undefined> = [
  null,
  undefined,
  "",
  "   ",
  "Immobilienberater",
  "Senior Immobilienberater",
  "Geschäftsführer",
  "Admin",
  "admin",
  "  Vertriebspartner  ",
  "HR",
  "Lead-Berater",
  "Human Resources Managerin",
];

describe("Berufsbezeichnung, beide Fassungen", () => {
  it("liefert fuer jede einzelne Rolle dasselbe", () => {
    for (const fall of EINZELFAELLE) {
      expect(inDerMail(fall as never), JSON.stringify(fall)).toBe(imCrm(fall as never));
    }
  });

  it("liefert fuer jede Zweierkombination dasselbe", () => {
    for (const fall of KOMBINATIONEN) {
      expect(inDerMail(fall), fall.join("+")).toBe(imCrm(fall));
    }
  });

  it("behandelt eine eigene Bezeichnung gleich", () => {
    for (const rollen of [...ALLE_ROLLEN.map((r) => [r]), ["admin", "hr"], []]) {
      for (const eigene of EIGENE_BEZEICHNUNGEN) {
        expect(inDerMail(rollen, eigene), `${rollen.join("+")} / ${eigene}`).toBe(
          imCrm(rollen, eigene),
        );
      }
    }
  });

  it("erkennt Rollenkennungen gleich", () => {
    for (const text of [...ALLE_ROLLEN, ...EIGENE_BEZEICHNUNGEN, LEAD_BERATER_LABEL]) {
      expect(istRollenkennungInDerMail(text), String(text)).toBe(istRollenkennungImCrm(text));
    }
  });
});

describe("Berufsbezeichnung, die Regel", () => {
  it("macht aus der Vertriebsrolle den Immobilienberater", () => {
    expect(imCrm("vertriebspartner")).toBe(BERUF_IMMOBILIENBERATER);
  });

  it("laesst die Vertriebsrolle die Verwaltungsrolle stechen", () => {
    // Christians eigener Fall: Inhaber, Admin und Vertriebspartner zugleich.
    expect(imCrm(["inhaber", "admin", "vertriebspartner"])).toBe(BERUF_IMMOBILIENBERATER);
    expect(imCrm(["admin", "hr", "vertriebspartner"])).toBe(BERUF_IMMOBILIENBERATER);
  });

  it("zeigt Admin und Inhaber nie als technische Rolle", () => {
    expect(imCrm("admin")).toBe(BERUF_IMMOBILIENBERATER);
    expect(imCrm("inhaber")).toBe(BERUF_IMMOBILIENBERATER);
    expect(imCrm("vertriebsleiter")).toBe(BERUF_IMMOBILIENBERATER);
  });

  it("laesst der reinen Personalrolle ihre eigene Bezeichnung", () => {
    expect(imCrm("hr")).toBe(BERUF_HR);
    expect(imCrm(["hr"])).toBe(BERUF_HR);
  });

  it("laesst das Feld leer, wo es keine Berufsbezeichnung gibt", () => {
    for (const rolle of ["backoffice", "buchhaltung", "marketing", "setterin", "kunde"]) {
      expect(imCrm(rolle), rolle).toBe("");
    }
  });

  it("gibt einer wirklich eigenen Bezeichnung den Vorrang", () => {
    expect(imCrm(["admin", "vertriebspartner"], "Senior Immobilienberater")).toBe(
      "Senior Immobilienberater",
    );
    expect(imCrm("backoffice", "Abwicklung und Notarwesen")).toBe("Abwicklung und Notarwesen");
  });

  it("faellt nicht auf eine Rollenkennung im Positionsfeld herein", () => {
    // Genau dieser Wert steht heute in den gespeicherten Einstellungen.
    expect(imCrm(["inhaber", "admin", "vertriebspartner"], "Admin")).toBe(
      BERUF_IMMOBILIENBERATER,
    );
    expect(imCrm("hr", "HR")).toBe(BERUF_HR);
    expect(imCrm("hr", "Human Resources Managerin")).toBe(BERUF_HR);
    expect(imCrm("backoffice", "Backoffice")).toBe("");
  });

  it("haengt an der Rolle und nie an einem Namen", () => {
    // Wer morgen die Personalrolle uebernimmt, bekommt dieselbe Bezeichnung.
    expect(imCrm("hr")).toBe(imCrm(["hr"]));
    expect(imCrm("vertriebspartner")).toBe(imCrm(["vertriebspartner"]));
  });
});

describe("Berufsbezeichnung, Vollstaendigkeit", () => {
  it("kennt jede Rolle aus ROLES als Rollenkennung", () => {
    // Faengt eine neue Rolle ab: Ohne Eintrag wuerde ihr Name aus dem
    // Positionsfeld als eigene Bezeichnung durchgehen.
    for (const rolle of ROLES) {
      expect(istRollenkennungImCrm(rolle.id), rolle.id).toBe(true);
      expect(istRollenkennungImCrm(rolle.label), rolle.label).toBe(true);
    }
  });

  it("kennt auch den Anzeigenamen der Lead-Berater", () => {
    expect(istRollenkennungImCrm(rollenLabel("vertriebspartner", "lead_berater"))).toBe(true);
  });

  it("gibt nie eine Rollenkennung als Berufsbezeichnung zurueck", () => {
    for (const rolle of ALLE_ROLLEN) {
      const bezeichnung = imCrm(rolle);
      if (bezeichnung) expect(istRollenkennungImCrm(bezeichnung), rolle).toBe(false);
    }
  });
});
