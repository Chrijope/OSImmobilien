/**
 * Kalender ohne Netz: Lesen von .ics (Zeitzone, Serie, ganztägig), signierter
 * Anmeldestatus, Sperre interner Adressen.
 * Laufen lassen: deno test -A --node-modules-dir=none --no-config supabase/functions/_shared/kalender_test.ts
 */
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { baueIcs, sicheresFetch, termineAusIcs } from "./kalender.ts";
import { statusPruefen, statusSignieren } from "./kalender-status.ts";

const ICS = [
  "BEGIN:VCALENDAR", "VERSION:2.0",
  "BEGIN:VTIMEZONE", "TZID:Europe/Berlin",
  "BEGIN:STANDARD", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "END:STANDARD",
  "BEGIN:DAYLIGHT", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "END:DAYLIGHT",
  "END:VTIMEZONE",
  "BEGIN:VEVENT", "UID:serie", "DTSTART;TZID=Europe/Berlin:20261102T100000", "DTEND;TZID=Europe/Berlin:20261102T110000", "RRULE:FREQ=WEEKLY;COUNT=3", "SUMMARY:Jour fixe", "END:VEVENT",
  "BEGIN:VEVENT", "UID:tag", "DTSTART;VALUE=DATE:20261105", "DTEND;VALUE=DATE:20261106", "SUMMARY:Urlaub", "END:VEVENT",
  "BEGIN:VEVENT", "UID:alt", "DTSTART:20250101T100000Z", "DTEND:20250101T110000Z", "SUMMARY:Vorbei", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

Deno.test(".ics lesen: Serie in Ortszeit, ganztägig, außerhalb des Zeitraums weg", () => {
  const t = termineAusIcs(ICS, { id: "v1", art: "abo" }, new Date("2026-11-01T00:00:00Z"), new Date("2026-11-30T00:00:00Z"));
  assertEquals(t.filter((x) => x.titel === "Jour fixe").map((x) => x.start), [
    "2026-11-02T09:00:00.000Z", "2026-11-09T09:00:00.000Z", "2026-11-16T09:00:00.000Z",
  ]);
  const urlaub = t.find((x) => x.titel === "Urlaub")!;
  assertEquals([urlaub.start, urlaub.ganztags], ["2026-11-05", true]);
  assert(!t.some((x) => x.titel === "Vorbei"));
});

Deno.test("selbst gebaute .ics ist wieder lesbar, Sonderzeichen maskiert", () => {
  const ics = baueIcs("u1", { titel: "Beratung; Müller, Anna", ort: "Büro\nBerlin", start: "2026-11-03T13:00:00.000Z", dauerMinuten: 45 });
  const [t] = termineAusIcs(ics, { id: "v", art: "caldav" }, new Date("2026-11-01"), new Date("2026-11-30"));
  assertEquals([t.titel, t.ort, t.start, t.ende], ["Beratung; Müller, Anna", "Büro\nBerlin", "2026-11-03T13:00:00.000Z", "2026-11-03T13:45:00.000Z"]);
});

Deno.test("Anmeldestatus: signiert, nicht fälschbar", async () => {
  Deno.env.set("KALENDER_STATUS_SCHLUESSEL", "test-schluessel-1234567890");
  const s = await statusSignieren({ u: "nutzer-a", a: "google", z: "kalender", o: "https://crm.example" });
  assertEquals((await statusPruefen(s))?.u, "nutzer-a");
  const [inhalt, sig] = s.split(".");
  const fremd = btoa(JSON.stringify({ ...JSON.parse(atob(inhalt.replace(/-/g, "+").replace(/_/g, "/"))), u: "nutzer-b" })).replace(/=+$/, "");
  assertEquals(await statusPruefen(`${fremd}.${sig}`), null);
  assertEquals(await statusPruefen("unsinn"), null);
});

Deno.test("Abo-Links: nur https, nie ins interne Netz", async () => {
  await assertRejects(() => sicheresFetch("http://example.com/kal.ics"));
  await assertRejects(() => sicheresFetch("https://example.com:8443/kal.ics"));
  await assertRejects(() => sicheresFetch("https://localhost/kal.ics"));
});

Deno.test("Ortszeit nach UTC, auch in der Nacht der Zeitumstellung", async () => {
  const { berlinNachUtc } = await import("./kalender.ts");
  assertEquals(berlinNachUtc("2026-11-03", "14:00").toISOString(), "2026-11-03T13:00:00.000Z");
  assertEquals(berlinNachUtc("2026-07-01", "09:00").toISOString(), "2026-07-01T07:00:00.000Z");
  assertEquals(berlinNachUtc("2027-03-28", "01:30").toISOString(), "2027-03-28T00:30:00.000Z");
  assertEquals(berlinNachUtc("2026-10-25", "03:30").toISOString(), "2026-10-25T02:30:00.000Z");
});

Deno.test("Lange Serie: aktuelle Termine kommen trotz vieler Vorgänger", () => {
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "BEGIN:VEVENT", "UID:d", "DTSTART:20200101T080000Z", "DTEND:20200101T083000Z", "RRULE:FREQ=DAILY", "SUMMARY:Täglich", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
  const t = termineAusIcs(ics, { id: "v", art: "abo" }, new Date("2026-11-01T00:00:00Z"), new Date("2026-11-04T00:00:00Z"));
  assertEquals(t.length, 3);
});
