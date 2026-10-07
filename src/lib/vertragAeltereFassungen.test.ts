import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VERTRAGS_FASSUNG_ALT,
  erstelleVertragsKontext,
  renderAnlageNachNummer,
  renderHauptvertrag,
  vertragsAnlagenAusKontext,
  type KlauselTools,
} from "@/lib/vertragKlauseln";
import { getLizenzPaket } from "@/lib/lizenzPakete";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Volltextvergleich: Verträge älterer Kennungen bleiben Wort für Wort, wie
 * main sie vor der Fassung 2026-09-29 erzeugt hat.
 *
 * Die Referenz `__fixtures__/vertragstext-aeltere-fassungen.json` ist am
 * 29.09.2026 mit genau dieser Datei aus origin/main (Stand 8bccc354, vor
 * der Paketpreis-Regel) erzeugt worden: VERTRAGSTEXT_REFERENZ_SCHREIBEN=1
 * setzen und diese Datei dort laufen lassen. Neu erzeugen nur, wenn sich ein
 * älterer Vertragstext bewusst ändern soll.
 */
const REFERENZ = resolve(process.cwd(), "src/lib/__fixtures__/vertragstext-aeltere-fassungen.json");

function text(bewerber: Bewerber, paketId: string): Record<string, string> {
  const paket = getLizenzPaket(paketId)!;
  const ctx = erstelleVertragsKontext({ bewerber, paket });
  const erfasse = (zeichne: (t: KlauselTools) => void) => {
    const texte: string[] = [];
    const t: KlauselTools = {
      h1: (x) => { texte.push(x); },
      p: (x) => { texte.push(x); },
      bullet: (items) => { texte.push(...items.map((i) => `• ${i}`)); },
      spacer: () => {},
      ensure: () => {},
      infoBox: (a, b) => { texte.push(a, b); },
      zeile: (l, w) => { texte.push(`${l}: ${w}`); },
    };
    zeichne(t);
    return texte.join("\n");
  };
  const teile: Record<string, string> = { hauptvertrag: erfasse((t) => renderHauptvertrag(t, ctx)) };
  for (const a of vertragsAnlagenAusKontext(ctx)) {
    teile[`anlage ${a.nummer}`] = erfasse((t) => renderAnlageNachNummer(a.nummer, t, ctx));
  }
  return teile;
}

const stub = (extra: Record<string, unknown>) =>
  ({ vorname: "Max", nachname: "Mustermann", ...extra }) as unknown as Bewerber;

const FAELLE: Record<string, () => Record<string, string>> = {};
for (const kennung of ["2026-09-26", VERTRAGS_FASSUNG_ALT]) {
  const basis = { vertragFassung: kennung, vertragStatus: "gesendet" };
  FAELLE[`${kennung} ohne Leadkauf`] = () => text(stub({ ...basis, paketwahl: "junior" }), "junior");
  FAELLE[`${kennung} mit Leadpaket`] = () => text(stub({ ...basis, paketwahl: "junior", leadPaket: { betrag: 2500, anzahl: 20 } }), "junior");
  FAELLE[`${kennung} Leads einzeln`] = () => text(stub({ ...basis, paketwahl: "junior", leadEinzelkauf: true }), "junior");
  FAELLE[`${kennung} Lead-Berater`] = () => text(stub({ ...basis, paketwahl: "lead_berater" }), "lead_berater");
  FAELLE[`${kennung} alles individuell`] = () => text(stub({
    ...basis, paketwahl: "junior", individuelleVertragsFassung: true, andereVertriebe: "Beispiel Vertrieb GmbH",
    satzLead: "3", satzEigen: "5", leadPaket: { betrag: 5000, anzahl: 40 },
  }), "junior");
}

describe("ältere Vertragsfassungen bleiben unverändert (Volltext gegen main)", () => {
  const ist = Object.fromEntries(Object.entries(FAELLE).map(([name, f]) => [name, f()]));

  if (process.env.VERTRAGSTEXT_REFERENZ_SCHREIBEN) {
    it("schreibt die Referenz", () => {
      writeFileSync(REFERENZ, JSON.stringify(ist, null, 2) + "\n", "utf-8");
    });
    return;
  }

  const soll = JSON.parse(readFileSync(REFERENZ, "utf-8")) as Record<string, Record<string, string>>;
  for (const name of Object.keys(FAELLE)) {
    it(name, () => {
      expect(ist[name]).toEqual(soll[name]);
    });
  }
});
