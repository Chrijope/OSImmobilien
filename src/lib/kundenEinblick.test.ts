import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SystemUser } from "@/lib/loadAllUsers";
import { kundenEinblick, uplineIds, VOLLZUGRIFF_ANZEIGE, type EinblickKunde } from "@/lib/kundenEinblick";

// Beispielnamen, keine echten Personen. Alphabetisch so gewählt, dass die
// Reihenfolge bei gleicher Rolle eindeutig ist.
const u = (id: string, name: string, ...rollen: string[]): SystemUser => ({ id, name, rolle: rollen[0], rollen });
const NUTZER: SystemUser[] = [
  u("vp1", "Vera Partner", "vertriebspartner"),
  u("vp2", "Victor Zweit", "vertriebspartner"),
  u("vp3", "Viola Dritt", "vertriebspartner"),
  u("ad1", "Anton Admin", "admin", "inhaber"),
  u("vl1", "Lena Leitung", "vertriebsleiter"),
  u("bo1", "Bodo Backoffice", "backoffice"),
  u("fin1", "Fritz Finanz", "finanzierungspartner"),
  u("fin2", "Berta Doppel", "finanzierungspartner", "backoffice"),
  u("obj1", "Otto Objekt", "objektpartner"),
  u("set1", "Sina Setter", "setterin"),
  u("mk1", "Mia Marketing", "marketing"),
];

const ids = (kunde: EinblickKunde, rolle: string, nutzer = NUTZER, teamleiter?: ReadonlyMap<string, string>) =>
  kundenEinblick({ stufe: "finanzierung", finanzierer: ["fin1", "fin2"], ...kunde }, nutzer, rolle, teamleiter).map((p) => p.id);

describe("kundenEinblick: Sichtmatrix", () => {
  const kunde = { zustaendig_id: "vp1" };

  it("Admin sieht alle der Grundmenge, Zuständiger vorn", () => {
    expect(ids(kunde, "admin")).toEqual(["vp1", "ad1", "vl1", "fin2", "bo1", "fin1"]);
  });

  it("Vertriebspartner sieht Vertriebsleitung und Backoffice, Doppelrolle als Backoffice", () => {
    expect(ids(kunde, "vertriebspartner")).toEqual(["vp1", "vl1", "fin2", "bo1"]);
    const doppel = kundenEinblick({ zustaendig_id: "vp1", stufe: "finanzierung" }, NUTZER, "vertriebspartner").find((p) => p.id === "fin2");
    expect(doppel?.rolle).toBe("Backoffice");
  });

  it("Vertriebsleiter sieht Admin, aber nicht den Inhaber als Bezeichnung", () => {
    expect(ids(kunde, "vertriebsleiter")).toEqual(["vp1", "ad1", "fin2", "bo1", "fin1"]);
    const admin = kundenEinblick({ zustaendig_id: "vp1" }, NUTZER, "vertriebsleiter").find((p) => p.id === "ad1");
    expect(admin?.rolle).toBe("Admin");
  });

  it("Finanzierungspartner sieht Vertriebspartner, Vertriebsleitung, Backoffice", () => {
    expect(ids(kunde, "finanzierungspartner")).toEqual(["vp1", "vl1", "fin2", "bo1"]);
  });

  it("nie: fremde Vertriebspartner, Objektpartner, Setter, Marketing", () => {
    const alle = ids(kunde, "admin");
    for (const fremd of ["vp2", "vp3", "obj1", "set1", "mk1"]) expect(alle).not.toContain(fremd);
  });
});

describe("kundenEinblick: Finanzierungspartner", () => {
  it("erst ab der Stufe Finanzierung, Doppelrolle bleibt als Backoffice", () => {
    const vorher = ids({ zustaendig_id: "vp1", stufe: "reservierung" }, "admin");
    expect(vorher).not.toContain("fin1");
    expect(vorher).toContain("fin2");
    expect(ids({ zustaendig_id: "vp1", stufe: "notar" }, "admin")).toContain("fin1");
    expect(ids({ zustaendig_id: "vp1", stufe: "verloren" }, "admin")).not.toContain("fin1");
  });

  it("nur mit laufender Einreichung zum Vorgang", () => {
    expect(ids({ zustaendig_id: "vp1", finanzierer: [] }, "admin")).not.toContain("fin1");
  });
});

describe("kundenEinblick: Ersteller und Empfehler", () => {
  const kunde = { zustaendig_id: "vp1", erstelltVonId: "vp2", empfehlungsgeberVpId: "vp3" };

  it("stehen beim Admin am Ende", () => {
    expect(ids(kunde, "admin").slice(-2)).toEqual(["vp2", "vp3"]);
  });

  it("fehlen beim Vertriebspartner als Betrachter", () => {
    expect(ids(kunde, "vertriebspartner")).not.toContain("vp2");
  });
});

describe("kundenEinblick: Zuständiger ohne Kennung", () => {
  it("wird über den eindeutigen Namen gefunden", () => {
    const personen = kundenEinblick({ berater: "Vera Partner", stufe: "neuer_lead" }, NUTZER, "admin");
    expect(personen[0]).toMatchObject({ id: "vp1", zustaendig: true, rolle: "Vertriebspartner" });
  });
});

describe("kundenEinblick: Teamkette (nur OS)", () => {
  // A (vp3) über B (vp2) über C (vp1)
  const kette = new Map([["vp1", "vp2"], ["vp2", "vp3"]]);

  it("Kunde von C: Vertriebspartner sieht C, B, A vor Leitung und Backoffice", () => {
    expect(ids({ zustaendig_id: "vp1" }, "vertriebspartner", NUTZER, kette)).toEqual(["vp1", "vp2", "vp3", "vl1", "fin2", "bo1"]);
    const b = kundenEinblick({ zustaendig_id: "vp1" }, NUTZER, "vertriebspartner", kette).find((p) => p.id === "vp2");
    expect(b).toMatchObject({ team: true, rolle: "Vertriebspartner, Team über Vera Partner" });
  });

  it("Kunde von B: die Downline C erscheint nicht", () => {
    expect(ids({ zustaendig_id: "vp2" }, "vertriebspartner", NUTZER, kette)).not.toContain("vp1");
  });

  it("nur über den Zuständigen, nicht über den Ersteller", () => {
    expect(ids({ zustaendig_id: "vp3", erstelltVonId: "vp1" }, "vertriebspartner", NUTZER, kette)).toEqual(["vp3", "vl1", "fin2", "bo1"]);
  });

  it("gesperrte Partner fallen aus der Kette", () => {
    const nutzer = NUTZER.map((n) => (n.id === "vp2" ? { ...n, gesperrt: true } : n));
    expect(ids({ zustaendig_id: "vp1" }, "vertriebspartner", nutzer, kette)).toEqual(["vp1", "vp3", "vl1", "fin2", "bo1"]);
  });

  it("ein Kreis bricht ab", () => {
    expect(uplineIds("vp1", new Map([["vp1", "vp2"], ["vp2", "vp1"]]))).toEqual(["vp2"]);
  });
});

describe("Rollenliste gegen die Datenbank", () => {
  it("jede Vollzugriffsrolle steht in der letzten Fassung von darf_alle_kunden_sehen", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const letzte = readdirSync(dir).sort().filter((f) => readFileSync(join(dir, f), "utf8").includes("CREATE OR REPLACE FUNCTION public.darf_alle_kunden_sehen")).pop()!;
    const sql = readFileSync(join(dir, letzte), "utf8");
    const rumpf = sql.slice(sql.lastIndexOf("CREATE OR REPLACE FUNCTION public.darf_alle_kunden_sehen"));
    const block = rumpf.slice(0, rumpf.indexOf("$$;"));
    // Der Finanzierer sieht seit dem 27.10.2026 nur eingereichte Kunden (finanzierer_aktiv).
    for (const rolle of VOLLZUGRIFF_ANZEIGE.filter((r) => r !== "finanzierungspartner")) expect(block).toContain(`'${rolle}'`);
    expect(block).not.toContain("'finanzierungspartner'");
  });
});
