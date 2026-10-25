/**
 * Regeln des Vergleichslinks ohne Netz.
 * Ausführen: deno test supabase/functions/kunden-vergleich/regeln_test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { pruefeExposesFuerVergleich, pruefeVergleichAuftrag, vergleichLink } from "./regeln.ts";

const K = "11111111-1111-1111-1111-111111111111";
const I = "22222222-2222-2222-2222-222222222222";
const E1 = "33333333-3333-3333-3333-333333333333";
const E2 = "44444444-4444-4444-4444-444444444444";
const E3 = "55555555-5555-5555-5555-555555555555";
const E4 = "66666666-6666-6666-6666-666666666666";
const JETZT = Date.parse("2026-10-25T10:00:00Z");

Deno.test("Auftrag: zwei bis drei verschiedene Exposés", () => {
  assertEquals(pruefeVergleichAuftrag({ kontaktId: K, investmentId: I, exposeIds: [E1, E2] }).ok, true);
  assertEquals(pruefeVergleichAuftrag({ kontaktId: K, investmentId: I, exposeIds: [E1] }).ok, false);
  assertEquals(pruefeVergleichAuftrag({ kontaktId: K, investmentId: I, exposeIds: [E1, E2, E3, E4] }).ok, false);
  assertEquals(pruefeVergleichAuftrag({ kontaktId: K, investmentId: I, exposeIds: [E1, E1] }).ok, false);
  assertEquals(pruefeVergleichAuftrag({ kontaktId: "x", investmentId: I, exposeIds: [E1, E2] }).ok, false);
});

const zeile = (id: string, teile: Record<string, unknown> = {}) => ({
  id, kontakt_id: K, investment_id: I, wohnung_id: "w-" + id, art: "expose", gueltig_bis: "2026-12-01T00:00:00Z", zurueckgezogen_am: null, ...teile,
});
const auftrag = { kontaktId: K, investmentId: I, exposeIds: [E1, E2] };

Deno.test("Exposés: früheste Frist gilt", () => {
  const r = pruefeExposesFuerVergleich(auftrag, [zeile(E1), zeile(E2, { gueltig_bis: "2026-11-15T00:00:00Z" })], JETZT);
  assertEquals(r, { ok: true, gueltigBis: "2026-11-15T00:00:00.000Z" });
});

Deno.test("Exposés: fremder Kunde, Objektübersicht, ohne Einheit, abgelaufen, fehlend", () => {
  const nein = (z2: Record<string, unknown> | null) =>
    pruefeExposesFuerVergleich(auftrag, z2 ? [zeile(E1), zeile(E2, z2)] : [zeile(E1)], JETZT).ok;
  assertEquals(nein({ kontakt_id: "anders" }), false);
  assertEquals(nein({ art: "objektuebersicht" }), false);
  assertEquals(nein({ wohnung_id: null }), false);
  assertEquals(nein({ zurueckgezogen_am: "2026-10-20T00:00:00Z" }), false);
  assertEquals(nein({ gueltig_bis: "2026-10-01T00:00:00Z" }), false);
  assertEquals(nein(null), false);
});

Deno.test("Link", () => {
  assertEquals(vergleichLink("ab"), "https://osimmobilien.netlify.app/vergleich/ab");
});
