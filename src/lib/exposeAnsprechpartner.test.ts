import { describe, expect, it } from "vitest";
import { profilZuPerson, vertriebspartnerFuerExpose } from "./exposeAnsprechpartner";

/**
 * Wer als „Dein Ansprechpartner“ im Exposé steht: mit Kunde dessen
 * zuständiger Vertriebspartner, sonst der angemeldete Nutzer. Einen
 * Objektpartner gibt es dort nicht mehr.
 */
const ich = { name: "Max Mustermann", rolle: "Vertriebspartner", email: "max@example.com" };
const profile = [
  { id: "u2", name: "Paula Partner", telefon: " +49 89 1 ", email: "paula@example.com", avatar_url: "" },
  { id: "u3", name: "" },
];

describe("vertriebspartnerFuerExpose", () => {
  it("nimmt ohne Kunden oder bei eigener Zuständigkeit dich selbst", () => {
    expect(vertriebspartnerFuerExpose({ eigeneId: "u1", eigenePerson: ich, profile, rollen: [] })).toBe(ich);
    expect(vertriebspartnerFuerExpose({ kundeZustaendigId: "u1", eigeneId: "u1", eigenePerson: ich, profile, rollen: [] })).toBe(ich);
  });

  it("nimmt mit Kunde den zuständigen Partner samt Berufsbezeichnung", () => {
    const p = vertriebspartnerFuerExpose({ kundeZustaendigId: "u2", eigeneId: "u1", eigenePerson: ich, profile, rollen: [{ user_id: "u2", role: "vertriebspartner" }] });
    expect(p).toMatchObject({ name: "Paula Partner", telefon: "+49 89 1", email: "paula@example.com" });
    expect(p.avatarUrl).toBeUndefined();
    expect(p.rolle).not.toBe("vertriebspartner");
  });

  it("fällt auf dich zurück, wenn der Zuständige kein brauchbares Profil hat", () => {
    expect(vertriebspartnerFuerExpose({ kundeZustaendigId: "u3", eigeneId: "u1", eigenePerson: ich, profile, rollen: [] })).toBe(ich);
    expect(vertriebspartnerFuerExpose({ kundeZustaendigId: "u9", eigeneId: "u1", eigenePerson: ich, profile, rollen: [] })).toBe(ich);
    expect(profilZuPerson(undefined, "x")).toBeUndefined();
  });
});
