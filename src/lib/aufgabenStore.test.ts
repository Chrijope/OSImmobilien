import { describe, it, expect, vi, beforeEach } from "vitest";

// Gemeinsamer In-Memory-Speicher, den der gemockte dataCache bedient. Über
// vi.hoisted, damit die vi.mock-Factory ihn referenzieren darf.
const state = vi.hoisted(() => ({
  rows: [] as Record<string, string | null>[],
}));

vi.mock("@/lib/dataCache", () => ({
  isTableLoaded: () => true,
  cacheGet: () => state.rows,
  cacheUpdate: async (_table: string, id: string, patch: Record<string, unknown>) => {
    const row = state.rows.find((r) => r.id === id);
    if (row) Object.assign(row, patch);
  },
  cacheInsert: async () => {},
}));

// Der Store importiert beim Laden den Supabase-Client. Gebraucht wird nur
// auth.getUser, mit dem updateAufgabe "Mir selbst" in eine Nutzer-ID auflöst.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "u-selbst" } } }) },
  },
}));

import {
  schliesseErledigteAutomatikAufgaben,
  getAufgaben,
  updateAufgabe,
  findeAufgabeZuAktivitaet,
  aufgabenSchluessel,
  offeneAufgabenOhneAktivitaet,
  bewerbungIdAusAusloeser,
} from "@/lib/aufgabenStore";

function zeile(id: string, schluessel: string): Record<string, string | null> {
  return { id, ausloeser_schluessel: schluessel, status: "offen", titel: "x", benutzer_id: "u1" };
}

function offeneIds(): string[] {
  return getAufgaben()
    .filter((a) => a.status !== "erledigt" && a.status !== "abgesagt")
    .map((a) => a.id)
    .sort();
}

describe("schliesseErledigteAutomatikAufgaben – Duplikate zusammenfassen", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("lässt pro aktivem Auslöser genau eine offen und schließt die Duplikate", async () => {
    // Der Otto-Hans-Fall: acht identische Aufgaben mit demselben Auslöser.
    for (let i = 0; i < 8; i++) state.rows.push(zeile(`otto-${i}`, "kaufpreis:2w:inv1"));

    const geschlossen = await schliesseErledigteAutomatikAufgaben(
      "kaufpreis:",
      new Set(["kaufpreis:2w:inv1"]),
    );

    expect(geschlossen).toBe(7);
    expect(offeneIds()).toEqual(["otto-0"]);
  });

  it("schließt Aufgaben, deren Auslöser nicht mehr gilt", async () => {
    state.rows.push(zeile("a", "kaufpreis:2w:inv1"));
    state.rows.push(zeile("b", "kaufpreis:2w:inv2")); // Investment nicht mehr aktiv

    const geschlossen = await schliesseErledigteAutomatikAufgaben(
      "kaufpreis:",
      new Set(["kaufpreis:2w:inv1"]),
    );

    expect(geschlossen).toBe(1);
    expect(offeneIds()).toEqual(["a"]);
  });

  it("fasst nur den passenden Präfix an", async () => {
    state.rows.push(zeile("k1", "kaufpreis:2w:inv1"));
    state.rows.push(zeile("k2", "kaufpreis:2w:inv1")); // Duplikat, wird geschlossen
    state.rows.push(zeile("n1", "notarfoto:inv1")); // anderer Präfix, bleibt unberührt

    const geschlossen = await schliesseErledigteAutomatikAufgaben(
      "kaufpreis:",
      new Set(["kaufpreis:2w:inv1"]),
    );

    expect(geschlossen).toBe(1);
    expect(offeneIds()).toEqual(["k1", "n1"]);
  });
});

describe("updateAufgabe – Aufgabe nachträglich ändern", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("ändert nur die übergebenen Felder und setzt Fälligkeit samt Uhrzeit", async () => {
    state.rows.push({
      id: "a1", benutzer_id: "u1", kontakt_id: "k1", status: "offen",
      titel: "Unterlagen nachfassen", prioritaet: "mittel",
      faellig_am: new Date("2026-09-14T10:00:00").toISOString(), uhrzeit: "10:00",
    });

    const ok = await updateAufgabe("a1", {
      titel: "Unterlagen erneut nachfassen",
      prioritaet: "hoch",
      faelligAm: "2026-09-17",
      uhrzeit: "11:30",
    });

    expect(ok).toBe(true);
    const zeile = state.rows[0];
    expect(zeile.titel).toBe("Unterlagen erneut nachfassen");
    expect(zeile.prioritaet).toBe("hoch");
    expect(zeile.faellig_am).toBe(new Date("2026-09-17T11:30:00").toISOString());
    expect(zeile.uhrzeit).toBe("11:30");
    // Unangetastet bleibt, was nicht übergeben wurde.
    expect(zeile.status).toBe("offen");
    expect(zeile.benutzer_id).toBe("u1");
  });

  it("löst einen leeren Empfänger in den aktuellen Nutzer auf", async () => {
    state.rows.push({
      id: "a2", benutzer_id: "u1", kontakt_id: "k1", status: "offen",
      titel: "x", zugewiesen_an: "u-anderer",
    });

    const ok = await updateAufgabe("a2", { zugewiesenAn: "" });

    expect(ok).toBe(true);
    expect(state.rows[0].zugewiesen_an).toBe("u-selbst");
  });
});

describe("findeAufgabeZuAktivitaet – Eintrag der Aktivitätsliste wiederfinden", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("findet die offene Aufgabe über Kunde, Titel und Tag", async () => {
    state.rows.push({
      id: "a1", benutzer_id: "u1", kontakt_id: "k1", status: "offen",
      titel: "Unterlagen nachfassen",
      faellig_am: new Date("2026-09-14T10:00:00").toISOString(),
    });

    // Die Aktivitätsliste führt das Datum als YYYY-MM-DD, die Aufgabe als
    // vollen Zeitstempel. Der Vergleich läuft über den Tagesanteil.
    const tag = String(state.rows[0].faellig_am).slice(0, 10);
    const treffer = findeAufgabeZuAktivitaet("k1", "  unterlagen NACHFASSEN ", tag);

    expect(treffer?.id).toBe("a1");
  });

  it("übergeht erledigte Aufgaben und fremde Kunden", async () => {
    const faellig = new Date("2026-09-14T10:00:00").toISOString();
    state.rows.push({
      id: "erledigt", benutzer_id: "u1", kontakt_id: "k1", status: "erledigt",
      titel: "Unterlagen nachfassen", faellig_am: faellig,
    });
    state.rows.push({
      id: "fremd", benutzer_id: "u1", kontakt_id: "k2", status: "offen",
      titel: "Unterlagen nachfassen", faellig_am: faellig,
    });

    expect(findeAufgabeZuAktivitaet("k1", "Unterlagen nachfassen", faellig.slice(0, 10))).toBeNull();
  });
});

describe("offeneAufgabenOhneAktivitaet – verwaiste Aufgaben finden", () => {
  beforeEach(() => {
    state.rows = [];
  });

  const faellig14 = new Date("2026-09-14T10:00:00").toISOString();
  const faellig17 = new Date("2026-09-17T10:00:00").toISOString();

  it("liefert die offene Aufgabe, deren Aktivitätseintrag fehlt", async () => {
    // Der Ayce-Fall: Der Eintrag zum 14.09. wurde aus der Zeitleiste
    // gelöscht, die echte Aufgabe blieb offen. Der 17.09. steht noch drin.
    state.rows.push({
      id: "alt", benutzer_id: "u1", kontakt_id: "k1", status: "offen",
      titel: "Nachfassen", faellig_am: faellig14,
    });
    state.rows.push({
      id: "neu", benutzer_id: "u1", kontakt_id: "k1", status: "offen",
      titel: "Nachfassen", faellig_am: faellig17,
    });

    const vorhandene = new Set([aufgabenSchluessel("Nachfassen", faellig17)]);
    const waisen = offeneAufgabenOhneAktivitaet("k1", vorhandene);

    expect(waisen.map((a) => a.id)).toEqual(["alt"]);
  });

  it("übergeht Erledigte, Automatikaufgaben und fremde Kunden", async () => {
    state.rows.push({
      id: "erledigt", benutzer_id: "u1", kontakt_id: "k1", status: "erledigt",
      titel: "Alt", faellig_am: faellig14,
    });
    state.rows.push({
      id: "automatik", benutzer_id: "u1", kontakt_id: "k1", status: "offen",
      titel: "Nachfassen: Ayce", faellig_am: faellig14,
      ausloeser_schluessel: "nicht_erreicht:k1",
    });
    state.rows.push({
      id: "fremd", benutzer_id: "u1", kontakt_id: "k2", status: "offen",
      titel: "Anders", faellig_am: faellig14,
    });

    expect(offeneAufgabenOhneAktivitaet("k1", new Set())).toEqual([]);
  });

  it("erzeugt beim normalen Anlegen keine Dublette (Eintrag vorhanden)", async () => {
    // Die Schnellaktion schreibt Aufgabe und Aktivitätseintrag gemeinsam.
    // Steht der Eintrag in der Liste, darf dieselbe Aufgabe nicht zusätzlich
    // als Waise auftauchen, auch bei anderer Schreibweise des Titels.
    state.rows.push({
      id: "a1", benutzer_id: "u1", kontakt_id: "k1", status: "offen",
      titel: "Unterlagen nachfassen", faellig_am: faellig14,
    });

    const vorhandene = new Set([
      aufgabenSchluessel("  UNTERLAGEN nachfassen ", faellig14.slice(0, 10)),
    ]);

    expect(offeneAufgabenOhneAktivitaet("k1", vorhandene)).toEqual([]);
  });
});

describe("bewerbungIdAusAusloeser – Bewerberbezug aus dem Auslöser", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("liest die Bewerbungs-ID aus einem Bewerber-Auslöser", () => {
    expect(bewerbungIdAusAusloeser("bewerber_vertrag_unterschrieben:bw-42")).toBe("bw-42");
  });

  it("liefert nichts für Kunden-Auslöser, manuelle Aufgaben und leere IDs", () => {
    expect(bewerbungIdAusAusloeser("kaufpreis:2w:inv1")).toBeUndefined();
    expect(bewerbungIdAusAusloeser("selbstauskunft_offen:inv1")).toBeUndefined();
    expect(bewerbungIdAusAusloeser("bewerber_vertrag_unterschrieben:")).toBeUndefined();
    expect(bewerbungIdAusAusloeser("bewerber_ohne_trenner")).toBeUndefined();
    expect(bewerbungIdAusAusloeser(undefined)).toBeUndefined();
    expect(bewerbungIdAusAusloeser(null)).toBeUndefined();
  });

  it("hängt die Bewerbungs-ID beim Lesen an die Aufgabe", () => {
    // Genau die Aufgabe aus Sarahs Inbox: kein kontakt_id, der Bezug liegt im
    // Auslöser. Die Inbox braucht bewerbungId, um die Akte zu verlinken.
    state.rows.push({
      ...zeile("hr-1", "bewerber_vertrag_unterschrieben:bw-42"),
      kontakt_id: null,
      zugewiesen_an: "u-hr",
    });
    state.rows.push(zeile("k-1", "kaufpreis:2w:inv1"));

    const [hr, kunde] = getAufgaben();
    expect(hr.bewerbungId).toBe("bw-42");
    expect(hr.kontaktId).toBeUndefined();
    expect(kunde.bewerbungId).toBeUndefined();
  });
});

describe("Kopplung über meeting_aktivitaet_id", () => {
  beforeEach(() => {
    state.rows = [];
  });

  // Terminseite: Meeting "Erstgespräch", Aufgabe "Erstgespräch mit <Kunde>".
  const gekoppelt = () => ({
    id: "a1", benutzer_id: "u1", kontakt_id: "k1", status: "offen", typ: "meeting",
    titel: "Erstgespräch mit Kunde", faellig_am: "2026-09-30T08:00:00+00:00",
    meeting_aktivitaet_id: "m1",
  });

  it("findet die Aufgabe zum Meeting trotz anderem Titel", () => {
    state.rows.push(gekoppelt());
    expect(getAufgaben()[0].meetingAktivitaetId).toBe("m1");
    expect(findeAufgabeZuAktivitaet("k1", "Erstgespräch", "2026-09-30", "m1")?.id).toBe("a1");
    // Ohne Kennung bleibt es beim Titel, und der passt nicht.
    expect(findeAufgabeZuAktivitaet("k1", "Erstgespräch", "2026-09-30")).toBeNull();
  });

  it("zeigt die Aufgabe nicht als Waise, wenn ihr Meeting im Verlauf steht", () => {
    state.rows.push(gekoppelt());
    const titel = new Set([aufgabenSchluessel("Erstgespräch", "2026-09-30")]);
    expect(offeneAufgabenOhneAktivitaet("k1", titel, new Set(["m1"]))).toEqual([]);
    // Fehlt das Meeting wirklich, bleibt sie sichtbar.
    expect(offeneAufgabenOhneAktivitaet("k1", titel, new Set()).map((a) => a.id)).toEqual(["a1"]);
  });

  it("erkennt über einen leeren Titel keine titellose Aufgabe wieder", () => {
    state.rows.push({ id: "leer", benutzer_id: "u1", kontakt_id: "k1", status: "offen", titel: "" });
    expect(findeAufgabeZuAktivitaet("k1", undefined, undefined, "m9")).toBeNull();
  });
});
