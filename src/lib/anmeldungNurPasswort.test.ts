import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Entscheidung Christian vom 05.10.2026: Interne melden sich nur mit Passwort
 * an, nachts werden alle abgemeldet. Kein Code aus der Authenticator-App,
 * keine Pflicht-Einrichtung, kein Einrichtungshinweis. Die freiwillige
 * Zwei-Faktor-Anmeldung der Kunden (KundenMfaGuard) bleibt.
 */

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const flach = (pfad: string) => lies(pfad).replace(/\s+/g, " ");

describe("Interne Anmeldung nur mit Passwort", () => {
  it("Selbstauskunft und Mobil-Scan fragen nur Kunden mit Faktor nach dem Code", () => {
    const app = flach("src/App.tsx");
    expect(app).toContain('path="/selbstauskunft" element={<KundenMfaGuard nurCode><SelbstauskunftPage /></KundenMfaGuard>}');
    expect(app).toContain('path="/mobile-scan/:token" element={<KundenMfaGuard nurCode><MobileScan /></KundenMfaGuard>}');
  });

  it("App-Rahmen: Kundenwächter vor dem Unterlagenstand, kein Zwei-Faktor-Hinweis für Interne", () => {
    const rahmen = lies("src/components/DashboardLayout.tsx");
    const waechter = rahmen.lastIndexOf("<KundenMfaGuard>");
    expect(waechter).toBeGreaterThan(-1);
    expect(waechter).toBeLessThan(rahmen.indexOf("<UnterlagenBanner />"));
    expect(waechter).toBeLessThan(rahmen.indexOf("<UnterlagenGuard>"));
    expect(rahmen).not.toContain("TwoFactorBanner");
  });

  it("Einstellungen bieten Internen keine Zwei-Faktor-Einrichtung mehr an", () => {
    expect(lies("src/pages/Einstellungen.tsx")).not.toContain("TwoFactorSection");
  });

  it("Admin setzt fremde Faktoren ohne eigene Codesitzung zurück, das eigene Konto nie", () => {
    const quelle = lies("supabase/functions/manage-mfa/index.ts");
    const reset = quelle.slice(quelle.indexOf('if (action === "admin_reset")'));
    expect(reset).not.toContain("hatZweitenFaktor");
    expect(reset).toContain("if (zielUserId === user.id) {");
  });

  it("Die Admin-Vorschau der Kundenansicht verlangt keinen Code", () => {
    expect(lies("supabase/functions/get-kundenansicht/index.ts")).not.toContain("zweiter_faktor");
  });
});
