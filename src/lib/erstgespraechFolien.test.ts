import { describe, it, expect } from "vitest";
import {
  ERSTGESPRAECH_FOLIEN,
  einwandStichworte,
  getErstgespraechFolie,
  pfadKarten,
  zerlegeAkzente,
  zerlegeTitel,
} from "./erstgespraechFolien";
import {
  ASSESSMENT_EINWAENDE,
  ASSESSMENT_PFADE,
  ASSESSMENT_STATIONEN,
  getStation,
} from "./assessmentSkript";

describe("erstgespraechFolien: Ableitung aus dem Skript", () => {
  it("liefert genau sieben Folien in Stationsreihenfolge", () => {
    expect(ERSTGESPRAECH_FOLIEN.map((f) => f.id)).toEqual([
      "einstieg", "ausgangslage", "profil", "ziele", "motivation", "machbarkeit", "einwaende",
    ]);
    expect(ERSTGESPRAECH_FOLIEN.map((f) => f.stationNummer)).toEqual([1, 2, 3, 4, 5, 7, 8]);
  });

  it("jede Folie gehört zu einer Station mit folie-Feld und trägt deren Id", () => {
    for (const f of ERSTGESPRAECH_FOLIEN) {
      const station = ASSESSMENT_STATIONEN.find((s) => s.key === f.stationKey);
      expect(station?.folie?.id).toBe(f.id);
      expect(f.folie.kopfzeile.length).toBeGreaterThan(0);
      expect(f.folie.titel).toContain(f.folie.glanz);
    }
  });

  it("Station 6 (Wer wir sind), 9 (Einschätzung) und 10 (Terminbuchung) haben keine Folie", () => {
    for (const nummer of [6, 9, 10]) {
      expect(getStation(nummer).folie).toBeUndefined();
    }
    expect(ERSTGESPRAECH_FOLIEN.map((f) => f.stationKey)).not.toContain("einschaetzung");
    expect(ERSTGESPRAECH_FOLIEN.map((f) => f.stationKey)).not.toContain("naechsterSchritt");
  });

  it("Folie 1 ist das Deckblatt des Gesamtdecks mit beiden Teilen", () => {
    const f = getErstgespraechFolie("einstieg")!;
    expect(f.folie.deckblatt).toBe(true);
    expect(f.folie.kicker).toBe("Dein Gespräch mit MOREImmo");
    expect(f.folie.karten?.map((k) => k.ueber)).toEqual(["Teil 1 · Über dich", "Teil 2 · Über uns"]);
  });

  it("die Profil-Folie zeigt die vier Pfade aus ASSESSMENT_PFADE", () => {
    const karten = getErstgespraechFolie("profil")!.folie.karten!;
    expect(karten).toEqual(pfadKarten());
    expect(karten.map((k) => k.ueber)).toEqual(["Pfad A", "Pfad B", "Pfad C", "Pfad D"]);
    expect(karten.map((k) => k.titel)).toEqual(ASSESSMENT_PFADE.map((p) => p.label));
    expect(karten[3].text).toBe("Noch keine Vertriebserfahrung.");
  });

  it("die Fragen-Folie zeigt die Einwände aus ASSESSMENT_EINWAENDE und die Überleitung", () => {
    const f = getErstgespraechFolie("einwaende")!.folie;
    expect(f.stichworte).toEqual(einwandStichworte());
    expect(f.stichworte).toEqual(ASSESSMENT_EINWAENDE.map((e) => e.einwand));
    expect(f.ueberleitung?.satz).toBe("Jetzt zeige ich dir, wie das bei uns konkret aussieht.");
  });

  it("die Machbarkeits-Folie nennt Handelsvertreter, Gewerbe und 34c, aber keine Provision", () => {
    const f = getErstgespraechFolie("machbarkeit")!.folie;
    expect(f.karten?.map((k) => k.titel)).toEqual([
      "Freier Handelsvertreter", "Eigenes Gewerbe", "Erlaubnis nach Paragraf 34c",
    ]);
    expect(f.optionen).not.toContain("Lehnt ab");
    const text = JSON.stringify(f);
    expect(text).not.toContain("Prozent");
    expect(text).not.toContain("Euro");
  });

  it("Teil 1 zeigt nichts über Firma, System oder Preis", () => {
    const text = JSON.stringify(ERSTGESPRAECH_FOLIEN.map((f) => f.folie));
    expect(text).not.toContain("Systemgebühr");
    expect(text).not.toContain("150");
    expect(text).not.toMatch(/\d\s*Prozent/);
  });

  it("Folientexte enthalten keine Gedankenstriche", () => {
    expect(JSON.stringify(ERSTGESPRAECH_FOLIEN)).not.toMatch(/[–—]/);
  });
});

describe("erstgespraechFolien: Helfer", () => {
  it("zerlegeTitel setzt den Vornamen vor das Satzzeichen und trennt das Glanzwort", () => {
    expect(zerlegeTitel("Hol mich mal ab.", "ab", "Max", true))
      .toEqual({ vor: "Hol mich mal ", glanz: "ab", nach: ", Max." });
    expect(zerlegeTitel("Was willst du jetzt wissen?", "wissen", "Max", true))
      .toEqual({ vor: "Was willst du jetzt ", glanz: "wissen", nach: ", Max?" });
  });

  it("zerlegeTitel lässt den Titel ohne Vornamen oder ohne Anrede unverändert", () => {
    expect(zerlegeTitel("Hol mich mal ab.", "ab", "", true))
      .toEqual({ vor: "Hol mich mal ", glanz: "ab", nach: "." });
    expect(zerlegeTitel("Wo kommst du her?", "her", "Max"))
      .toEqual({ vor: "Wo kommst du ", glanz: "her", nach: "?" });
  });

  it("zerlegeTitel bleibt lesbar, wenn das Glanzwort fehlt", () => {
    expect(zerlegeTitel("Ohne Glanz.", "fehlt")).toEqual({ vor: "Ohne Glanz.", glanz: "", nach: "" });
  });

  it("zerlegeAkzente markiert Sterntext und lässt den Rest stehen", () => {
    expect(zerlegeAkzente("Beruflich. Finanziell. *Konkret.*")).toEqual([
      { text: "Beruflich. Finanziell. ", akzent: false },
      { text: "Konkret.", akzent: true },
    ]);
    expect(zerlegeAkzente("vor: *a* oder *b*?")).toEqual([
      { text: "vor: ", akzent: false },
      { text: "a", akzent: true },
      { text: " oder ", akzent: false },
      { text: "b", akzent: true },
      { text: "?", akzent: false },
    ]);
    expect(zerlegeAkzente("kein Stern")).toEqual([{ text: "kein Stern", akzent: false }]);
    expect(zerlegeAkzente("ein * allein")).toEqual([{ text: "ein * allein", akzent: false }]);
  });
});
