import { describe, it, expect, vi } from "vitest";
import {
  BEWERBERPROZESS_FREIGABEN,
  BEWERBERPROZESS_ROLLEN,
  BEWERBERPROZESS_ROUTE,
  darfBewerberprozess,
  darfVideocallBereich,
} from "@/lib/bewerberprozessFreigabe";
import { CHRISTIAN_PEETZ_ID } from "@/lib/leadPool";

// Der Supabase-Client wird beim Import von sidebarPermissions angezogen und
// wuerde im Test einen Realtime-Kanal oeffnen. Fuer die reine Regellogik
// reicht eine Attrappe, genau wie in sidebarPermissions.test.ts.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { isUrlAllowedForRole, istRouteGesperrt } = await import("@/lib/sidebarPermissions");

const CHRISTIAN = { userId: CHRISTIAN_PEETZ_ID };

/**
 * Rollen, die es im CRM gibt und die den neuen Bereich nicht sehen duerfen.
 *
 * Seit dem 07.09.2026 (Punkt S1) sehen ihn hr, admin und inhaber, seit dem
 * 27.09.2026 auch backoffice. Sie stehen deshalb nicht mehr in dieser Liste,
 * sondern in `BEWERBERPROZESS_ROLLEN`.
 */
const FREMDE_ROLLEN = [
  "marketing",
  "vertriebsleiter",
  "vertriebspartner",
  "setterin",
  "buchhaltung",
  "objektpartner",
  "finanzierungspartner",
  "hausverwaltung",
  "versicherungsexperte",
  "testaccount",
  "individuell",
  "kunde",
  "tippgeber",
] as const;

describe("Bewerberprozess, die Freigabeliste", () => {
  /*
   * Seit dem 08.09.2026 stehen drei Personen in der Liste: der
   * Geschäftsführer, die HR-Managerin und die Geschäftsleitung. Seit dem
   * 21.09.2026 öffnet die Liste nur noch den Videocall-Bereich. Den
   * Bewerberprozess öffnet allein die Rolle.
   */
  it("kennt die drei Personen der Liste", () => {
    expect(BEWERBERPROZESS_FREIGABEN).toHaveLength(3);
    const namen = BEWERBERPROZESS_FREIGABEN.map((f) => f.name);
    expect(namen).toContain("Christian Peetz");
    expect(namen).toContain("Sarah Kaiser-Thom");
    expect(namen).toContain("Christian Kurz");
    expect(BEWERBERPROZESS_FREIGABEN[0].userIds).toContain(CHRISTIAN_PEETZ_ID);
  });

  /*
   * Die Umkehrung vom 21.09.2026. Vorher stachen diese beiden Merkmale die
   * Rolle, und genau das soll nicht mehr sein: Ein Name oeffnet den
   * Bewerberprozess nicht, eine Kennung auch nicht.
   */
  it("oeffnet den Bewerberprozess nicht mehr ueber Adresse oder Kennung", () => {
    expect(darfBewerberprozess({ email: "s.kaiser-thom@more.immo" })).toBe(false);
    expect(darfBewerberprozess(CHRISTIAN)).toBe(false);
    expect(darfBewerberprozess({ email: "c.peetz@more.immo" })).toBe(false);
    expect(darfBewerberprozess({ email: "C.Peetz@MORE.immo" })).toBe(false);
  });

  it("laesst niemanden hinein, solange keine Rolle mitkommt", () => {
    expect(darfBewerberprozess()).toBe(false);
    expect(darfBewerberprozess({ email: "irgendwer@more.immo" })).toBe(false);
    expect(darfBewerberprozess({ userId: "00000000-0000-0000-0000-000000000000" })).toBe(false);
  });

  it("oeffnet den Bereich fuer hr, admin, inhaber und backoffice, und nur fuer sie", () => {
    expect(BEWERBERPROZESS_ROLLEN).toEqual(["hr", "admin", "inhaber", "backoffice"]);
    for (const rolle of BEWERBERPROZESS_ROLLEN) {
      expect(darfBewerberprozess({ rolle }), rolle).toBe(true);
    }
    // Gross- und Kleinschreibung darf nicht entscheiden.
    expect(darfBewerberprozess({ rolle: "HR" })).toBe(true);
  });

  it("laesst jede andere Rolle draussen", () => {
    for (const rolle of FREMDE_ROLLEN) {
      expect(darfBewerberprozess({ rolle }), rolle).toBe(false);
    }
  });
});

describe("Bewerberprozess, die Route", () => {
  it("bleibt fuer jede uebrige Rolle gesperrt, auch ohne Identitaet", () => {
    for (const rolle of FREMDE_ROLLEN) {
      expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never)).toBe(false);
      expect(istRouteGesperrt(BEWERBERPROZESS_ROUTE, rolle as never)).toBe(true);
    }
  });

  it("oeffnet sich fuer hr, admin und inhaber, auch ohne Eintrag in der Liste", () => {
    // Technisch erzwungen: nicht nur der Menueeintrag, sondern auch der
    // Route-Guard. Beides haengt an denselben beiden Funktionen.
    for (const rolle of BEWERBERPROZESS_ROLLEN) {
      expect(istRouteGesperrt(BEWERBERPROZESS_ROUTE, rolle as never), rolle).toBe(false);
      expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never), rolle).toBe(true);
      expect(
        isUrlAllowedForRole(`${BEWERBERPROZESS_ROUTE}/max-mustermann`, rolle as never),
        rolle,
      ).toBe(true);
    }
  });

  it("bleibt gesperrt, auch wenn jemand die Route als eigene Berechtigung traegt", () => {
    // Individuelle Berechtigungen kommen aus der Datenbank. Sie duerfen die
    // persoenliche Freigabe nicht aushebeln, sonst waere die Sicherung nur
    // eine Empfehlung.
    expect(
      isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, "vertriebsleiter", [BEWERBERPROZESS_ROUTE]),
    ).toBe(false);
  });

  it("oeffnet sich fuer die drei Rollen samt Unterseiten, mit und ohne Identitaet", () => {
    expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, "inhaber", undefined, null, CHRISTIAN)).toBe(true);
    expect(
      isUrlAllowedForRole(`${BEWERBERPROZESS_ROUTE}/max-mustermann`, "inhaber", undefined, null, CHRISTIAN),
    ).toBe(true);
    expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, "hr", undefined, null, CHRISTIAN)).toBe(true);
    expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, "admin")).toBe(true);
  });

  it("bleibt fuer jede uebrige Rolle zu, auch mit namentlicher Identitaet", () => {
    // Der Kern der Regel vom 21.09.2026: Die Liste sticht die Rolle nicht
    // mehr. Geprueft mit der Kennung, die frueher jede Tuer geoeffnet hat.
    for (const rolle of FREMDE_ROLLEN) {
      expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never, undefined, null, CHRISTIAN), rolle).toBe(false);
      expect(istRouteGesperrt(BEWERBERPROZESS_ROUTE, rolle as never, CHRISTIAN), rolle).toBe(true);
    }
  });
});

describe("Videocall, nur Christian Peetz als admin", () => {
  /*
   * Entscheidung vom 27.09.2026: Den Videocall-Bereich sieht und nutzt nur
   * Christian Peetz, und nur in der aktiven Rolle admin. Geprueft wird die
   * Funktion, an der Seitenleiste und Routenschutz haengen, und die Regel
   * selbst, die auch `useVideocallFreigabe` fragt.
   */
  const KURZ = { email: "c.kurz@more.immo" };
  const VOGL = { email: "h.vogl@vundp24.de", userId: "7a0e03f6-6614-4f47-830a-5ed454e4979d" };
  const ANDERER_ADMIN = { email: "irgendwer@more.immo", userId: "00000000-0000-0000-0000-000000000001" };
  const ROUTEN = ["/videocall", "/videocall/buchungen", "/videocall/einstellungen", "/videocall/raum/abc", "/videoraum"];

  it("ist fuer Christian in der Rolle admin offen", () => {
    expect(darfVideocallBereich({ ...CHRISTIAN, rolle: "admin" })).toBe(true);
    expect(darfVideocallBereich({ email: "C.Peetz@more.immo", rolle: "admin" })).toBe(true);
    for (const url of ROUTEN) {
      expect(isUrlAllowedForRole(url, "admin", undefined, null, CHRISTIAN), url).toBe(true);
    }
  });

  it("bleibt fuer Christian in jeder anderen Rolle zu", () => {
    for (const rolle of ["vertriebspartner", "inhaber", "hr", "vertriebsleiter", "testaccount"] as const) {
      expect(darfVideocallBereich({ ...CHRISTIAN, rolle }), rolle).toBe(false);
      expect(isUrlAllowedForRole("/videocall", rolle, undefined, null, CHRISTIAN), rolle).toBe(false);
      expect(istRouteGesperrt("/videocall/buchungen", rolle, CHRISTIAN), rolle).toBe(true);
    }
  });

  it("bleibt fuer Kurz und Vogl zu, in jeder Rolle", () => {
    for (const person of [KURZ, VOGL]) {
      for (const rolle of ["admin", "inhaber", "vertriebspartner", "vertriebsleiter"] as const) {
        expect(darfVideocallBereich({ ...person, rolle }), `${person.email} ${rolle}`).toBe(false);
        expect(isUrlAllowedForRole("/videocall", rolle, undefined, null, person), `${person.email} ${rolle}`).toBe(false);
      }
    }
  });

  it("bleibt fuer einen anderen Admin und fuer hr zu", () => {
    expect(isUrlAllowedForRole("/videocall", "admin", undefined, null, ANDERER_ADMIN)).toBe(false);
    expect(isUrlAllowedForRole("/videocall", "admin")).toBe(false);
    expect(isUrlAllowedForRole("/videocall", "inhaber")).toBe(false);
    expect(isUrlAllowedForRole("/videocall/buchungen", "hr")).toBe(false);
    expect(isUrlAllowedForRole("/videocall", "hr", undefined, null, { email: "sarah.kaiser-thom@more.immo" })).toBe(false);
  });

  it("laesst sich durch keine individuelle Berechtigung oeffnen", () => {
    expect(isUrlAllowedForRole("/videocall", "vertriebspartner", ["/videocall"], null, CHRISTIAN)).toBe(false);
    expect(isUrlAllowedForRole("/videocall", "admin", ["/videocall"], null, ANDERER_ADMIN)).toBe(false);
    expect(isUrlAllowedForRole("/videocall", "individuell", ["/videocall"], null, KURZ)).toBe(false);
  });

  it("fuehrt nur Christian mit dem Bereich videocall in der Liste", () => {
    const mitVideocall = BEWERBERPROZESS_FREIGABEN.filter((f) => f.bereiche.includes("videocall")).map((f) => f.name);
    expect(mitVideocall).toEqual(["Christian Peetz"]);
  });
});


describe("Bewerberprozess, die Positivliste vom 21.09.2026", () => {
  /*
   * Die Regel: Den Eintrag "Bewerberprozess" und die Adresse dahinter sehen
   * admin, inhaber und hr, sonst niemand. Kein Name in der Freigabeliste, kein
   * Eintrag in `role_permissions` und keine eigene Berechtigung oeffnen ihn
   * fuer eine andere Rolle.
   *
   * Geprueft wird die Funktion, an der beides haengt: die Sichtbarkeit in der
   * Seitenleiste (`AppSidebar.tsx`, Filter ueber `isUrlAllowedForRole`) und
   * der Routenschutz (`DashboardLayout.tsx`, dieselbe Funktion).
   */
  const DRAUSSEN = ["vertriebspartner", "vertriebsleiter", "setterin", "buchhaltung", "marketing", "testaccount"] as const;

  it("sperrt jede uebrige Rolle, auch mit Eintrag in der Freigabeliste", () => {
    for (const rolle of DRAUSSEN) {
      expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never, undefined, null, CHRISTIAN), rolle).toBe(false);
      expect(
        isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never, undefined, null, { email: "c.peetz@more.immo" }),
        rolle,
      ).toBe(false);
      expect(istRouteGesperrt(BEWERBERPROZESS_ROUTE, rolle as never, CHRISTIAN), rolle).toBe(true);
    }
  });

  it("sperrt auch die Unterseiten und die abgeloeste Adresse", () => {
    for (const rolle of DRAUSSEN) {
      expect(
        isUrlAllowedForRole(`${BEWERBERPROZESS_ROUTE}/max-mustermann`, rolle as never, undefined, null, CHRISTIAN),
        rolle,
      ).toBe(false);
      expect(
        isUrlAllowedForRole("/bewerbungsmanagement", rolle as never, undefined, null, CHRISTIAN),
        rolle,
      ).toBe(false);
    }
  });

  it("sperrt auch dann, wenn die Route als eigene Berechtigung eingetragen ist", () => {
    for (const rolle of DRAUSSEN) {
      expect(
        isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never, [BEWERBERPROZESS_ROUTE], null, CHRISTIAN),
        rolle,
      ).toBe(false);
      expect(
        isUrlAllowedForRole("/bewerbungsmanagement", rolle as never, ["/bewerbungsmanagement"], null, CHRISTIAN),
        rolle,
      ).toBe(false);
    }
  });

  it("laesst admin, inhaber und hr unveraendert hinein, auch ohne Identitaet", () => {
    for (const rolle of BEWERBERPROZESS_ROLLEN) {
      expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never, undefined, null, CHRISTIAN), rolle).toBe(true);
      expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never), rolle).toBe(true);
      expect(isUrlAllowedForRole("/bewerbungsmanagement", rolle as never), rolle).toBe(true);
    }
  });
});



describe("Bewerberprozess, die Rolle vertriebspartner", () => {
  /*
   * Die Regel vom 21.09.2026: Den Eintrag "Bewerberprozess" sehen nur
   * admin, inhaber und hr. Die Rolle vertriebspartner sieht ihn nicht, und
   * zwar auch dann nicht, wenn das angemeldete Konto namentlich in der
   * Freigabeliste steht. Genau das war vorher der Fall: Wer zum Pruefen auf
   * die Rolle vertriebspartner umschaltete, behielt den Eintrag und den
   * Zugang zur Adresse, weil die Liste an der Rolle vorbei entschied.
   *
   * Geprueft wird die Funktion, an der beides haengt: die Sichtbarkeit in der
   * Seitenleiste (`AppSidebar.tsx`, Filter ueber `isUrlAllowedForRole`) und
   * der Route-Guard (`DashboardLayout.tsx`, dieselbe Funktion).
   */
  it("sperrt den Bereich fuer vertriebspartner, auch mit Eintrag in der Liste", () => {
    expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, "vertriebspartner", undefined, null, CHRISTIAN)).toBe(false);
    expect(
      isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, "vertriebspartner", undefined, null, {
        email: "c.peetz@more.immo",
      }),
    ).toBe(false);
    expect(istRouteGesperrt(BEWERBERPROZESS_ROUTE, "vertriebspartner", CHRISTIAN)).toBe(true);
  });

  it("sperrt auch die Unterseiten und die abgeloeste Adresse", () => {
    expect(
      isUrlAllowedForRole(`${BEWERBERPROZESS_ROUTE}/max-mustermann`, "vertriebspartner", undefined, null, CHRISTIAN),
    ).toBe(false);
    expect(isUrlAllowedForRole("/bewerbungsmanagement", "vertriebspartner", undefined, null, CHRISTIAN)).toBe(false);
  });

  it("sperrt ihn auch dann, wenn die Route als eigene Berechtigung eingetragen ist", () => {
    expect(
      isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, "vertriebspartner", [BEWERBERPROZESS_ROUTE], null, CHRISTIAN),
    ).toBe(false);
  });

  it("laesst hr, admin und inhaber unveraendert hinein, auch mit Identitaet", () => {
    for (const rolle of BEWERBERPROZESS_ROLLEN) {
      expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never, undefined, null, CHRISTIAN), rolle).toBe(true);
      expect(isUrlAllowedForRole(BEWERBERPROZESS_ROUTE, rolle as never), rolle).toBe(true);
    }
  });
});
