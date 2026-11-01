/**
 * Abo-Link mit den eigenen CRM-Terminen (01.11.2026).
 *
 * Für Apple-, Google- und Outlook-Kalender gleichermaßen: Der Link wird dort
 * als Kalender abonniert. Öffentlich erreichbar, geschützt nur durch die
 * lange Zufallskennung im Link (gespeichert als Hash). Enthält nur Titel,
 * Zeit, Ort und Kunde, keine Notizen.
 */
import { dienst } from "../_shared/mail-anfrage.ts";
import { baueIcs, berlinNachUtc } from "../_shared/kalender.ts";

async function sha256(text: string): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
    .map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const kennung = new URL(req.url).searchParams.get("k") ?? "";
  if (!/^[a-f0-9]{64}$/.test(kennung)) return new Response("Nicht gefunden", { status: 404 });
  const admin = dienst();
  const { data: feed } = await admin.from("kalender_feed").select("benutzer_id").eq("kennung_hash", await sha256(kennung)).maybeSingle();
  if (!feed) return new Response("Nicht gefunden", { status: 404 });

  const von = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const bis = new Date(Date.now() + 365 * 864e5).toISOString().slice(0, 10);
  const { data: termine } = await admin.from("aktivitaeten")
    .select("id, beschreibung, faellig_am, uhrzeit, dauer, kunde_id")
    .eq("art", "meeting").eq("benutzer_id", feed.benutzer_id)
    .gte("faellig_am", von).lte("faellig_am", bis).limit(2000);
  const kundenIds = [...new Set((termine ?? []).map((t: { kunde_id: string | null }) => t.kunde_id).filter(Boolean))];
  const namen = new Map<string, string>();
  if (kundenIds.length) {
    const { data: kunden } = await admin.from("kontakte").select("id, vorname, nachname").in("id", kundenIds);
    for (const k of kunden ?? []) namen.set(k.id, [k.vorname, k.nachname].filter(Boolean).join(" "));
  }

  const ereignisse: string[] = [];
  for (const t of termine ?? []) {
    const tag = String(t.faellig_am).slice(0, 10);
    const zeit = /^\d{1,2}:\d{2}/.test(t.uhrzeit ?? "") ? String(t.uhrzeit).slice(0, 5).padStart(5, "0") : "09:00";
    // Uhrzeiten im CRM sind deutsche Ortszeit.
    const start = berlinNachUtc(tag, zeit);
    if (Number.isNaN(start.getTime())) continue;
    const kunde = t.kunde_id ? namen.get(t.kunde_id) : "";
    const ics = baueIcs(`${t.id}@os-immobilien-crm`, {
      titel: [String(t.beschreibung || "Termin").split("\n")[0].slice(0, 120), kunde].filter(Boolean).join(" · "),
      start: start.toISOString(),
      dauerMinuten: Number(t.dauer) || 60,
    });
    ereignisse.push(ics.split("BEGIN:VEVENT")[1].split("END:VEVENT")[0]);
  }
  const kalender = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OS Immobilien//CRM//DE", "X-WR-CALNAME:OS Immobilien CRM", "CALSCALE:GREGORIAN",
    ...ereignisse.map((e) => `BEGIN:VEVENT${e}END:VEVENT`), "END:VCALENDAR"].join("\r\n");
  return new Response(kalender + "\r\n", { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
});
