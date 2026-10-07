import { describe, it, expect } from "vitest";
import { dbRowToKunde } from "@/lib/kundenStore";
import { kontaktQuelleAnzeige } from "./kontaktQuelle";

// Erfundene Datenzeile, wie sie aus der Tabelle `kontakte` kommt.
const zeile = (quelle: string | null, meta: Record<string, unknown>) => ({
  id: "k1",
  vorname: "Testa",
  nachname: "Beispiel",
  quelle,
  meta,
});

describe("Quelle eines Kontakts: Liste und Profil zeigen dasselbe", () => {
  it("Spalte quelle leer, Kanal nur in meta.leadTyp: beide zeigen den Kanal", () => {
    const kunde = dbRowToKunde(zeile(null, { leadTyp: "google" }));
    // Liste „Alle Kontakte“ bekommt den Kontakt so.
    const inListe = kontaktQuelleAnzeige(kunde);
    // Profil im Bearbeiten-Modus: editData.quelle ist die rohe Spalte, leadTyp vom Kontakt.
    const imProfilBearbeiten = kontaktQuelleAnzeige({ quelle: kunde.quelle, leadTyp: kunde.leadTyp });
    expect(inListe).toBe("google");
    expect(imProfilBearbeiten).toBe(inListe);
  });

  it("die Rohdaten bleiben unverändert, abgeleitet wird nur für die Anzeige", () => {
    const kunde = dbRowToKunde(zeile(null, { leadTyp: "google" }));
    kontaktQuelleAnzeige(kunde);
    // Beim Speichern anderer Felder geht genau dieser Wert zurück, also nichts Erfundenes.
    expect(kunde.quelle).toBe("");
    expect(kunde.leadTyp).toBe("google");
  });

  it("eine gepflegte Quelle hat Vorrang vor dem Lead-Typ", () => {
    expect(kontaktQuelleAnzeige(dbRowToKunde(zeile("Empfehlung", { leadTyp: "google" })))).toBe("Empfehlung");
  });

  it("nur Leerzeichen zählen als leer, ganz ohne Angabe bleibt es leer", () => {
    expect(kontaktQuelleAnzeige({ quelle: "  ", leadTyp: "meta" })).toBe("meta");
    expect(kontaktQuelleAnzeige(dbRowToKunde(zeile(null, {})))).toBe("");
  });
});
