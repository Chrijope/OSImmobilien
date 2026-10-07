import { describe, it, expect, beforeEach } from "vitest";
import {
  betreffAusFehler,
  fehlerAlsText,
  fingerabdruckFuer,
  istAuthLockKonflikt,
  merkeFehler,
  ruhefingerabdruckFuer,
} from "@/lib/fehlerKontext";
import { _setzeRuhepauseZurueck, darfFehlerHinweisZeigen } from "@/lib/fehlerMelden";

describe("fehlerAlsText", () => {
  it("laesst eine Zeichenkette unveraendert", () => {
    expect(fehlerAlsText("Netzwerk nicht erreichbar")).toBe("Netzwerk nicht erreichbar");
  });

  it("nimmt bei einem Error die Meldung", () => {
    expect(fehlerAlsText(new TypeError("x ist nicht definiert"))).toBe("x ist nicht definiert");
  });

  it("nimmt bei einem Supabase-Fehler die Meldung statt [object Object]", () => {
    const supabaseFehler = {
      code: "42501",
      details: null,
      hint: null,
      message: 'new row violates row-level security policy for table "app_config"',
    };
    expect(fehlerAlsText(supabaseFehler)).toBe(
      'new row violates row-level security policy for table "app_config"',
    );
  });

  it("zeigt ein Objekt ohne Meldung als JSON", () => {
    expect(fehlerAlsText({ status: 500, pfad: "/unterlagen" })).toBe(
      '{"status":500,"pfad":"/unterlagen"}',
    );
  });

  it("erzeugt nie den Text [object Object]", () => {
    expect(fehlerAlsText({})).not.toContain("[object Object]");
    expect(fehlerAlsText(null)).toBe("null");
    expect(fehlerAlsText(undefined)).toBe("undefined");
  });
});

describe("istAuthLockKonflikt", () => {
  it("erkennt die gestohlene Sperre (Meldung vom 31.08., Login)", () => {
    expect(istAuthLockKonflikt("Lock was stolen by another request")).toBe(true);
  });

  it("erkennt die gebrochene Sperre (Meldung vom 28.08., Julian Meier)", () => {
    expect(istAuthLockKonflikt("Lock broken by another request with the 'steal' option")).toBe(true);
  });

  it("erkennt den Sperren-Timeout von Supabase Auth", () => {
    expect(
      istAuthLockKonflikt(
        'Acquiring an exclusive Navigator LockManager lock "lock:sb-DEIN-SUPABASE-PROJEKT-auth-token" immediately failed',
      ),
    ).toBe(true);
    expect(istAuthLockKonflikt("NavigatorLockAcquireTimeoutError: acquire timeout")).toBe(true);
  });

  it("erkennt die Sperre auch nur im Stack", () => {
    expect(istAuthLockKonflikt("AbortError", 'at _acquireLock (lock:sb-abc-auth-token)')).toBe(true);
  });

  it("laesst echte Fehler durch", () => {
    expect(istAuthLockKonflikt("x ist nicht definiert")).toBe(false);
    expect(istAuthLockKonflikt("row-level security policy verletzt")).toBe(false);
    expect(istAuthLockKonflikt("Deadlock detected in database")).toBe(false);
  });
});

describe("betreffAusFehler", () => {
  it("macht aus mehreren Zeilen eine", () => {
    expect(betreffAusFehler("Fehler\n  beim Speichern")).toBe("Fehler beim Speichern");
  });

  it("kuerzt auf die Laenge des Betrefffeldes", () => {
    const betreff = betreffAusFehler("a".repeat(300));
    expect(betreff.length).toBe(120);
    expect(betreff.endsWith("…")).toBe(true);
  });
});

/**
 * Seitenunabhaengige Ruhepause.
 *
 * Am 16.09.2026 meldete ein Vertriebspartner, er bekomme "die ganze Zeit
 * Fehlercodes, egal wo ich rumklicke". Einer der Verstaerker: Der
 * Fingerabdruck enthaelt die Route, also galt derselbe Fehler auf /pipeline,
 * /kontakte und /reservierung als drei verschiedene Fehler. Die Ruhepause
 * liess ihn dreimal durch. Der Abdruck fuer die Ticket-Buendelung behaelt die
 * Route, fuer die Ruhepause gibt es das groebere Merkmal ohne Route.
 */
describe("ruhefingerabdruckFuer", () => {
  it("ist auf verschiedenen Seiten derselbe, anders als der Ticket-Abdruck", () => {
    const meldung = "Cannot read properties of undefined (reading 'name')";
    expect(ruhefingerabdruckFuer(meldung)).toBe(ruhefingerabdruckFuer(meldung));
    expect(fingerabdruckFuer(meldung, "/pipeline")).not.toBe(
      fingerabdruckFuer(meldung, "/kontakte"),
    );
  });

  it("uebergeht Zahlen und IDs wie der Ticket-Abdruck", () => {
    expect(ruhefingerabdruckFuer("Zeile 12 fehlt")).toBe(ruhefingerabdruckFuer("Zeile 4711 fehlt"));
    expect(
      ruhefingerabdruckFuer("Kontakt 3f2a9b1c-1111-2222-3333-444455556666 fehlt"),
    ).toBe(ruhefingerabdruckFuer("Kontakt 99887766-aaaa-bbbb-cccc-ddddeeeeffff fehlt"));
  });

  it("unterscheidet verschiedene Meldungen weiterhin", () => {
    expect(ruhefingerabdruckFuer("Netzwerk weg")).not.toBe(ruhefingerabdruckFuer("Rechte fehlen"));
  });

  it("legt beide Abdruecke an den gemerkten Fehler", () => {
    const meldung = "Speichern fehlgeschlagen";
    const aufPipeline = merkeFehler({ meldung, quelle: "window", route: "/pipeline" });
    const aufKontakte = merkeFehler({ meldung, quelle: "window", route: "/kontakte" });
    expect(aufPipeline.fingerabdruck).not.toBe(aufKontakte.fingerabdruck);
    expect(aufPipeline.ruhefingerabdruck).toBe(aufKontakte.ruhefingerabdruck);
  });
});

describe("darfFehlerHinweisZeigen", () => {
  beforeEach(() => {
    _setzeRuhepauseZurueck();
  });

  it("laesst denselben Fehler nur einmal durch", () => {
    const abdruck = ruhefingerabdruckFuer("Cannot read properties of undefined");
    expect(darfFehlerHinweisZeigen(abdruck)).toBe(true);
    expect(darfFehlerHinweisZeigen(abdruck)).toBe(false);
    expect(darfFehlerHinweisZeigen(abdruck)).toBe(false);
  });

  it("laesst denselben Fehler auf drei Seiten nur einmal durch", () => {
    const meldung = "Cannot read properties of undefined (reading 'name')";
    const durchgelassen = ["/pipeline", "/kontakte", "/reservierung"]
      .map((route) => merkeFehler({ meldung, quelle: "window", route }))
      .filter((f) => darfFehlerHinweisZeigen(f.ruhefingerabdruck));
    expect(durchgelassen).toHaveLength(1);
  });

  it("laesst einen anderen Fehler weiterhin durch", () => {
    expect(darfFehlerHinweisZeigen(ruhefingerabdruckFuer("Netzwerk weg"))).toBe(true);
    expect(darfFehlerHinweisZeigen(ruhefingerabdruckFuer("Rechte fehlen"))).toBe(true);
  });
});
