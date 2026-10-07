/**
 * Hat die Sitzung den zweiten Faktor wirklich benutzt?
 *
 * Die Logik liegt in `supabase/functions/_shared/mfa-stufe.ts`, weil
 * `manage-mfa` sie braucht. Geprüft wird sie hier, denn die Edge Functions
 * selbst laufen unter Deno und kommen im Testlauf nicht vor. Dasselbe Muster
 * wie bei `kontaktSignaturZugriff.test.ts`.
 *
 * Anlass: externes Audit vom 15.09.2026, Befund F04. Die Aktion
 * `generate_recovery_codes` löscht alle vorhandenen Wiederherstellungscodes
 * und stellt neue aus. Sie stand jeder angemeldeten Sitzung offen, auch einer
 * übernommenen. Damit ließ sich der echte Besitzer aussperren.
 */

import { describe, it, expect } from "vitest";
import {
  ansprueche,
  hatZweitenFaktor,
  sitzungsStufe,
  ZWEITER_FAKTOR_NOETIG,
} from "../../supabase/functions/_shared/mfa-stufe.ts";

/** Ein Abschnitt in base64url, UTF-8-fest. */
function abschnitt(inhalt: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(inhalt));
  let roh = "";
  for (const b of bytes) roh += String.fromCharCode(b);
  return btoa(roh).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Ein Anmeldetoken mit diesen Ansprüchen. Die Unterschrift ist Beiwerk: Sie
 *  wird hier nie geprüft, das erledigt vorher `auth.getUser()`. */
function kopfMitAnspruechen(inhalt: Record<string, unknown>): string {
  return `Bearer ${abschnitt({ alg: "HS256", typ: "JWT" })}.${abschnitt(inhalt)}.unterschrift`;
}

describe("sitzungsStufe", () => {
  it("liest aal2 aus dem Anspruch", () => {
    expect(sitzungsStufe(kopfMitAnspruechen({ sub: "u1", aal: "aal2" }))).toBe("aal2");
  });

  it("liest aal1 aus dem Anspruch", () => {
    expect(sitzungsStufe(kopfMitAnspruechen({ sub: "u1", aal: "aal1" }))).toBe("aal1");
  });

  it("nimmt den Token auch ohne das Wort Bearer", () => {
    const kopf = kopfMitAnspruechen({ aal: "aal2" }).slice("Bearer ".length);
    expect(sitzungsStufe(kopf)).toBe("aal2");
  });

  it("fällt auf amr zurück, wenn aal fehlt", () => {
    const kopf = kopfMitAnspruechen({
      sub: "u1",
      amr: [{ method: "password" }, { method: "totp" }],
    });
    expect(sitzungsStufe(kopf)).toBe("aal2");
  });

  it("meldet nichts, wenn weder aal noch ein zweiter Faktor in amr steht", () => {
    const kopf = kopfMitAnspruechen({ sub: "u1", amr: [{ method: "password" }] });
    expect(sitzungsStufe(kopf)).toBeNull();
  });

  it("lässt sich von amr nicht überstimmen, wenn aal ausdrücklich aal1 sagt", () => {
    const kopf = kopfMitAnspruechen({ aal: "aal1", amr: [{ method: "totp" }] });
    expect(sitzungsStufe(kopf)).toBe("aal1");
  });

  it("verträgt Umlaute in den Ansprüchen", () => {
    const kopf = kopfMitAnspruechen({ aal: "aal2", name: "Jürgen Groß" });
    expect(sitzungsStufe(kopf)).toBe("aal2");
  });
});

describe("hatZweitenFaktor", () => {
  it("lässt eine Sitzung mit zweitem Faktor durch", () => {
    expect(hatZweitenFaktor(kopfMitAnspruechen({ aal: "aal2" }))).toBe(true);
  });

  // Der Kern des Befunds F04: Genau diese Sitzung hatte vorher freie Bahn.
  it("weist eine Sitzung ohne zweiten Faktor ab", () => {
    expect(hatZweitenFaktor(kopfMitAnspruechen({ aal: "aal1" }))).toBe(false);
  });

  it.each([
    ["kein Kopf", null],
    ["leerer Kopf", ""],
    ["nur Leerzeichen", "   "],
    ["kein Token", "Bearer "],
    ["kein Punktformat", "Bearer irgendwas"],
    ["zu wenige Teile", "Bearer eins.zwei"],
    ["unlesbarer Mittelteil", "Bearer eins.!!!keinbase64!!!.drei"],
  ])("weist ab: %s", (_name, kopf) => {
    expect(hatZweitenFaktor(kopf as string | null)).toBe(false);
  });

  it("weist ab, wenn der Mittelteil kein Objekt ist", () => {
    const kopf = `Bearer ${abschnitt({ alg: "none" })}.${abschnitt([1, 2, 3])}.x`;
    expect(hatZweitenFaktor(kopf)).toBe(false);
  });

  it("weist ab, wenn der Anspruch fehlt", () => {
    expect(hatZweitenFaktor(kopfMitAnspruechen({ sub: "u1" }))).toBe(false);
  });
});

describe("ansprueche", () => {
  it("gibt die Ansprüche als Objekt zurück", () => {
    expect(ansprueche(kopfMitAnspruechen({ sub: "u1", aal: "aal2" }))).toEqual({
      sub: "u1",
      aal: "aal2",
    });
  });

  it("gibt null zurück, wenn kein Kopf da ist", () => {
    expect(ansprueche(null)).toBeNull();
  });
});

describe("Kennung der Ablehnung", () => {
  // Die Oberfläche schaltet an dieser Kennung, nicht am deutschen Wortlaut.
  it("bleibt stabil", () => {
    expect(ZWEITER_FAKTOR_NOETIG).toBe("zweiter_faktor_noetig");
  });
});
