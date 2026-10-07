/**
 * Die Handbuch-Regeln so, wie `submit-lead` sie unter Deno benutzt.
 * Ausführen: deno test supabase/functions/_shared/handbuch-funnel_test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  crmFelder,
  ermittleAusgang,
  handbuchRahmen,
  istHandbuchToken,
  neuesHandbuchToken,
  pruefeAntworten,
} from "./handbuch-funnel.ts";
import { waehleInvestment } from "./handbuch-anlage.ts";
import { HANDBUCH_EREIGNISSE } from "./handbuch-ereignisse.ts";

const A = { ziel: "steuer", beruf: "angestellt", brutto: "80_120", ueberschuss: "1000_1500", eigenkapital: "30_60", start: "drei_monate" };

Deno.test("Handbuch: Antworten werden serverseitig geprüft", () => {
  assertEquals(pruefeAntworten(A), A);
  assertEquals(pruefeAntworten({ ...A, ausgang: "passt", ueberschuss: "9999" }), null);
});

Deno.test("Handbuch: Ausgang und Rahmen rechnet der Server selbst", () => {
  const a = pruefeAntworten(A)!;
  assertEquals(ermittleAusgang(a), "passt");
  assertEquals(handbuchRahmen(a).empf, 190000);
  assertEquals(crmFelder(a).finanzierbarkeit, "Handbuch: passt, Rahmen 158.000 bis 222.000 €");
});

Deno.test("Handbuch: Token aus 32 Zufallsbytes", () => {
  const t = neuesHandbuchToken();
  assertEquals(t.length, 64);
  assertEquals(istHandbuchToken(t), true);
});

Deno.test("Handbuch: Investment ohne unterschriebene Selbstauskunft", () => {
  assertEquals(waehleInvestment([{ id: "a", erstellt_am: "2026-01-01", meta: { saSigned: true } }, { id: "b", erstellt_am: "2025-01-01", meta: {} }]), { id: "b", saUnterschrieben: false, saEntwurf: null });
});

Deno.test("Handbuch: Trichterstufen", () => {
  assertEquals(HANDBUCH_EREIGNISSE.includes("hb_sa_abgeschickt"), true);
});
