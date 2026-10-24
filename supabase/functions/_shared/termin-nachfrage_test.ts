/**
 * Die Glocke „Wie lief der Termin?“ ohne Netz.
 * Ausführen: deno test supabase/functions/_shared/termin-nachfrage_test.ts
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { alsIsoTag, baueNachfrageGlocken, nachfrageTage, type NachfrageTermin } from "./termin-nachfrage.ts";

const termin = (teile: Partial<NachfrageTermin>): NachfrageTermin => ({
  id: "a1", kunde_id: "k1", beschreibung: "Erstgespräch", faellig_am: "2026-10-23", uhrzeit: "14:00", erledigt_am: null, ...teile,
});
const kontakte = new Map([["k1", { zustaendigId: "vp1", name: "Jonas Becker" }], ["k2", { zustaendigId: null, name: "Ohne" }]]);
const TAGE = ["2026-10-23", "2026-10-22"];

Deno.test("vor 8 Uhr Berliner Zeit keine Nachfrage, danach gestern und vorgestern", () => {
  assertEquals(nachfrageTage(new Date("2026-10-24T05:30:00Z")), []); // 07:30 Berlin
  assertEquals(nachfrageTage(new Date("2026-10-24T06:30:00Z")), ["2026-10-23", "2026-10-22"]); // 08:30 Berlin
});

Deno.test("liest deutsche und ISO-Daten", () => {
  assertEquals(alsIsoTag("3.9.2026"), "2026-09-03");
  assertEquals(alsIsoTag("2026-09-03"), "2026-09-03");
  assertEquals(alsIsoTag("morgen"), null);
});

Deno.test("eine Glocke an den Zuständigen für einen offenen Termin", () => {
  const g = baueNachfrageGlocken({ termine: [termin({ faellig_am: "23.10.2026" })], buchungsStatus: new Map(), kontakte, tage: TAGE });
  assertEquals(g.length, 1);
  assertEquals(g[0].benutzer_id, "vp1");
  assertEquals(g[0].link, "/kunden/k1");
  assertEquals(g[0].meta.sperre, "termin-nachfrage:a1:2026-10-23");
});

Deno.test("keine Glocke, wenn erledigt, Buchung abgeschlossen, ohne Zuständigen oder zu alt", () => {
  const leer = (t: NachfrageTermin, status?: string) =>
    baueNachfrageGlocken({ termine: [t], buchungsStatus: new Map(status ? [[t.id, status]] : []), kontakte, tage: TAGE }).length;
  assertEquals(leer(termin({ erledigt_am: "2026-10-23T15:00:00Z" })), 0);
  assertEquals(leer(termin({}), "wahrgenommen"), 0);
  assertEquals(leer(termin({}), "offen"), 1);
  assertEquals(leer(termin({ kunde_id: "k2" })), 0);
  assertEquals(leer(termin({ faellig_am: "2026-10-10" })), 0);
});
