/**
 * Kalender-Anbindungen: Google, Microsoft (Outlook/365), CalDAV (iCloud und
 * andere) und Abo-Links (01.11.2026).
 *
 * Alle Anbieter liefern dieselbe Form (`FremdTermin`) und können, außer dem
 * Abo, Termine anlegen, ändern und löschen. Zugangsdaten liegen im Tresor
 * (`kalender_geheimnis_lesen`), nur mit der Dienstrolle lesbar.
 */
import ICAL from "npm:ical.js@2.1.0";
import { istInterneAdresse } from "./mailkonto.ts";
import { tokenHolen, type Token } from "./oauth.ts";
export { OAUTH, oauthEingerichtet, oauthRueckweg, tokenHolen } from "./oauth.ts";

// deno-lint-ignore no-explicit-any
type Admin = any;

export interface Verbindung {
  id: string;
  benutzer_id: string;
  art: "google" | "microsoft" | "caldav" | "abo";
  konto: string;
  server_url: string | null;
  benutzername: string | null;
  kalender: { id: string; name: string; url?: string; primary?: boolean }[];
  schreibziel: boolean;
}

export const VERBINDUNG_SPALTEN = "id, benutzer_id, art, konto, server_url, benutzername, kalender, schreibziel";

export interface FremdTermin {
  id: string;
  /** Bei CalDAV die UID; ältere iCloud-Verknüpfungen im CRM tragen nur sie. */
  uid?: string;
  verbindungId: string;
  art: Verbindung["art"];
  titel: string;
  start: string;
  ende?: string;
  ort?: string;
  ganztags?: boolean;
}

export interface TerminDaten {
  titel: string;
  beschreibung?: string;
  ort?: string;
  start: string;
  dauerMinuten: number;
}

// ── Sicher ins Netz ─────────────────────────────────────────────────────────

/**
 * fetch nur zu öffentlichen https-Adressen, Weiterleitungen einzeln geprüft.
 * ponytail: Die Adresse wird vor dem Abruf geprüft, nicht festgenagelt (fetch
 * erlaubt keine eigene Namensauflösung); ein Namensserver könnte zwischen
 * Prüfung und Abruf umschwenken. Enges Zeitfenster, Antwort geht nur an den
 * Nutzer selbst. Festnageln, falls Deno das einmal erlaubt.
 */
/** example.com aus caldav.example.com: Weiterleitungen innerhalb davon dürfen den Zugang behalten. */
export function grunddomain(host: string): string {
  return host.toLowerCase().split(".").slice(-2).join(".");
}

export async function sicheresFetch(url: string, init: RequestInit = {}, weiterleitungen = 4): Promise<Response> {
  const ziel = new URL(url);
  if (ziel.protocol === "webcal:") ziel.protocol = "https:";
  if (ziel.protocol !== "https:") throw new Error("Nur https-Adressen sind erlaubt.");
  if (ziel.port && ziel.port !== "443") throw new Error("Nur der Standardport 443 ist erlaubt.");
  if (Deno.env.get("KALENDER_TEST_LOKAL") !== "1") {
    const adressen: string[] = [];
    for (const art of ["A", "AAAA"] as const) {
      try {
        adressen.push(...(await Deno.resolveDns(ziel.hostname, art)));
      } catch {
        // Keine Einträge dieser Art.
      }
    }
    if (adressen.length === 0) throw new Error("Server nicht gefunden.");
    if (adressen.some(istInterneAdresse)) throw new Error("Diese Adresse zeigt ins interne Netz und ist nicht erlaubt.");
  }
  const antwort = await fetch(ziel, { ...init, redirect: "manual", signal: AbortSignal.timeout(20_000) });
  if (antwort.status >= 300 && antwort.status < 400 && antwort.headers.get("location")) {
    if (weiterleitungen <= 0) throw new Error("Zu viele Weiterleitungen.");
    await antwort.body?.cancel();
    const weiter = new URL(antwort.headers.get("location")!, ziel);
    // Wechselt die Weiterleitung die Domain, geht kein Zugang mit (sonst
    // könnte ein Server das Passwort an eine fremde Adresse umlenken).
    let naechstes = init;
    if (grunddomain(weiter.hostname) !== grunddomain(ziel.hostname)) {
      const kopf = new Headers(init.headers);
      kopf.delete("Authorization");
      naechstes = { ...init, headers: kopf };
    }
    return sicheresFetch(weiter.toString(), naechstes, weiterleitungen - 1);
  }
  return antwort;
}

// ── iCalendar ──────────────────────────────────────────────────────────────

/** Liest VEVENTs aus einer .ics und faltet Serien im Zeitraum auf. */
export function termineAusIcs(ics: string, verbindung: Pick<Verbindung, "id" | "art">, von: Date, bis: Date, href?: string): FremdTermin[] {
  const ergebnis: FremdTermin[] = [];
  let comp;
  try {
    comp = new ICAL.Component(ICAL.parse(ics));
  } catch {
    return ergebnis;
  }
  for (const tz of comp.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  for (const v of comp.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(v);
    const uid = ev.uid || crypto.randomUUID();
    const id = href ?? uid;
    const eintragen = (start: ICAL.Time, ende: ICAL.Time | null, nr: number) => {
      const s = start.toJSDate();
      const e = ende?.toJSDate();
      if (s > bis || (e ?? s) < von) return;
      ergebnis.push({
        id: nr === 0 ? id : `${id}#${s.toISOString()}`,
        uid: nr === 0 && href ? uid : undefined,
        verbindungId: verbindung.id,
        art: verbindung.art,
        titel: ev.summary || "(ohne Titel)",
        start: start.isDate ? start.toString() : s.toISOString(),
        ende: e ? (ende!.isDate ? ende!.toString() : e.toISOString()) : undefined,
        ort: ev.location || undefined,
        ganztags: start.isDate,
      });
    };
    if (!ev.isRecurring()) {
      eintragen(ev.startDate, ev.endDate, 0);
      continue;
    }
    // Lange laufende Serien: Vorgänger überspringen, gezählt wird nur, was im
    // Zeitraum liegt. Grenzen gegen Endlosserien: 20.000 Schritte, 500 Treffer.
    const it = ev.iterator();
    let treffer = 0;
    for (let n = 0, naechste = it.next(); naechste && n < 20_000 && treffer < 500; n++, naechste = it.next()) {
      const d = ev.getOccurrenceDetails(naechste);
      const s = d.startDate.toJSDate();
      if (s > bis) break;
      if ((d.endDate?.toJSDate() ?? s) < von) continue;
      eintragen(d.startDate, d.endDate, n + 1);
      treffer++;
    }
  }
  return ergebnis;
}

function icsZeit(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function icsText(wert: string): string {
  return String(wert || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export function baueIcs(uid: string, t: TerminDaten): string {
  const von = new Date(t.start);
  const bis = new Date(von.getTime() + Math.max(5, t.dauerMinuten) * 60_000);
  const zeilen = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//OS Immobilien//CRM//DE", "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${icsZeit(new Date())}`, `DTSTART:${icsZeit(von)}`, `DTEND:${icsZeit(bis)}`,
    `SUMMARY:${icsText(t.titel)}`,
  ];
  if (t.beschreibung) zeilen.push(`DESCRIPTION:${icsText(t.beschreibung)}`);
  if (t.ort) zeilen.push(`LOCATION:${icsText(t.ort)}`);
  zeilen.push("END:VEVENT", "END:VCALENDAR");
  return zeilen.join("\r\n") + "\r\n";
}

// ── Zugang ─────────────────────────────────────────────────────────────────

export async function zugangLesen(admin: Admin, id: string): Promise<Record<string, unknown>> {
  const { data, error } = await admin.rpc("kalender_geheimnis_lesen", { _verbindung: id });
  if (error || !data) throw new Error("Zugang zu diesem Kalender fehlt. Bitte neu verbinden.");
  return JSON.parse(data);
}

/** Gültiges Zugangstoken, bei Bedarf erneuert und zurück in den Tresor. */
async function zugangstoken(admin: Admin, v: Verbindung): Promise<string> {
  const z = (await zugangLesen(admin, v.id)) as unknown as Token;
  if (z.access_token && (z.expires_at ?? 0) > Date.now() + 60_000) return z.access_token;
  if (!z.refresh_token) throw new Error("Anmeldung abgelaufen. Bitte neu verbinden.");
  const neu = await tokenHolen(v.art as "google" | "microsoft", { grant_type: "refresh_token", refresh_token: z.refresh_token });
  await admin.rpc("kalender_geheimnis_setzen", { _verbindung: v.id, _wert: JSON.stringify(neu) });
  return neu.access_token;
}

async function api(url: string, token: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  if (r.status === 204) return null;
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || `Kalender antwortet mit ${r.status}`);
  return j;
}

// ── CalDAV ─────────────────────────────────────────────────────────────────

function basic(benutzer: string, passwort: string): string {
  return "Basic " + btoa(unescape(encodeURIComponent(`${benutzer}:${passwort}`)));
}

function hrefs(xml: string, tag: string): string[] {
  const re = new RegExp(`<[a-z]*:?${tag}[^>]*>\\s*<[a-z]*:?href[^>]*>([^<]+)<`, "gi");
  return [...xml.matchAll(re)].map((m) => m[1].trim());
}

async function propfind(url: string, auth: string, tiefe: "0" | "1", inhalt: string): Promise<string> {
  const r = await sicheresFetch(url, { method: "PROPFIND", headers: { Authorization: auth, Depth: tiefe, "Content-Type": "application/xml; charset=utf-8" }, body: inhalt });
  if (r.status === 401) throw new Error("Benutzername oder Passwort stimmt nicht. Apple verlangt ein app-spezifisches Passwort.");
  if (!r.ok && r.status !== 207) throw new Error(`Kalenderserver antwortet mit ${r.status}`);
  return r.text();
}

/** Sucht über den Server die Kalender des Kontos (current-user-principal, calendar-home-set). */
export async function caldavEntdecken(serverUrl: string, benutzer: string, passwort: string) {
  const auth = basic(benutzer, passwort);
  const basis = new URL(serverUrl);
  const p1 = await propfind(basis.toString(), auth, "0", `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>`);
  const principal = hrefs(p1, "current-user-principal")[0];
  if (!principal) throw new Error("Auf diesem Server wurde kein Kalenderkonto gefunden.");
  // Antworten dürfen nicht auf eine fremde Domain zeigen, dorthin ginge sonst das Passwort.
  const gleicheDomain = (u: string) => {
    if (grunddomain(new URL(u, basis).hostname) !== grunddomain(basis.hostname)) throw new Error("Der Kalenderserver verweist auf eine fremde Adresse.");
    return u;
  };
  gleicheDomain(principal);
  const p2 = await propfind(new URL(principal, basis).toString(), auth, "0", `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>`);
  const home = hrefs(p2, "calendar-home-set")[0];
  if (!home) throw new Error("Auf diesem Server wurden keine Kalender gefunden.");
  const homeUrl = new URL(gleicheDomain(home), basis).toString();
  const p3 = await propfind(homeUrl, auth, "1", `<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:displayname/><d:resourcetype/><c:supported-calendar-component-set/></d:prop></d:propfind>`);
  const kalender: Verbindung["kalender"] = [];
  for (const teil of p3.split(/<[a-z]*:?response[\s>]/i).slice(1)) {
    if (!/<[a-z]*:?calendar[\s/>]/i.test(teil.match(/resourcetype[\s\S]*?\/[a-z]*:?resourcetype/i)?.[0] ?? "")) continue;
    if (/supported-calendar-component-set/i.test(teil) && !/name="VEVENT"/i.test(teil)) continue;
    const href = teil.match(/<[a-z]*:?href[^>]*>([^<]+)</i)?.[1]?.trim();
    if (!href) continue;
    const name = teil.match(/<[a-z]*:?displayname[^>]*>([^<]*)</i)?.[1] || "Kalender";
    const url = new URL(gleicheDomain(new URL(href, homeUrl).toString())).toString();
    kalender.push({ id: url, name, url });
  }
  if (kalender.length === 0) throw new Error("In diesem Konto gibt es keinen Kalender für Termine.");
  return { kalender, serverUrl: new URL(principal, basis).origin };
}

// ── Termine lesen ──────────────────────────────────────────────────────────

export async function termineLesen(admin: Admin, v: Verbindung, von: Date, bis: Date): Promise<FremdTermin[]> {
  if (v.art === "google") {
    const token = await zugangstoken(admin, v);
    const liste = v.kalender.length ? v.kalender : [{ id: "primary", name: "" }];
    const alle: FremdTermin[] = [];
    for (const k of liste) {
      const q = new URLSearchParams({ timeMin: von.toISOString(), timeMax: bis.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "500" });
      const j = await api(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(k.id)}/events?${q}`, token);
      // deno-lint-ignore no-explicit-any
      for (const e of (j?.items ?? []) as any[]) {
        if (e.status === "cancelled") continue;
        alle.push({ id: e.id, verbindungId: v.id, art: v.art, titel: e.summary || "(ohne Titel)", start: e.start?.dateTime ?? e.start?.date, ende: e.end?.dateTime ?? e.end?.date, ort: e.location, ganztags: !e.start?.dateTime });
      }
    }
    return alle;
  }
  if (v.art === "microsoft") {
    const token = await zugangstoken(admin, v);
    const q = new URLSearchParams({ startDateTime: von.toISOString(), endDateTime: bis.toISOString(), $top: "500" });
    const j = await api(`https://graph.microsoft.com/v1.0/me/calendarView?${q}`, token, { headers: { Prefer: 'outlook.timezone="UTC"' } });
    // deno-lint-ignore no-explicit-any
    return ((j?.value ?? []) as any[]).filter((e) => !e.isCancelled).map((e) => ({
      id: e.id, verbindungId: v.id, art: v.art, titel: e.subject || "(ohne Titel)",
      start: e.isAllDay ? String(e.start.dateTime).slice(0, 10) : `${String(e.start.dateTime).slice(0, 19)}Z`,
      ende: e.isAllDay ? String(e.end.dateTime).slice(0, 10) : `${String(e.end.dateTime).slice(0, 19)}Z`,
      ort: e.location?.displayName || undefined, ganztags: e.isAllDay,
    }));
  }
  if (v.art === "abo") {
    const { url } = (await zugangLesen(admin, v.id)) as { url: string };
    const r = await sicheresFetch(url);
    if (!r.ok) throw new Error(`Abo-Link antwortet mit ${r.status}`);
    return termineAusIcs(await r.text(), v, von, bis);
  }
  // CalDAV: REPORT mit Zeitraum je Kalender, Serien vom Server aufgefaltet.
  const { passwort } = (await zugangLesen(admin, v.id)) as { passwort: string };
  const auth = basic(v.benutzername ?? v.konto, passwort);
  const alle: FremdTermin[] = [];
  for (const k of v.kalender) {
    const r = await sicheresFetch(k.url ?? k.id, {
      method: "REPORT",
      headers: { Authorization: auth, Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
      body: `<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${icsZeit(von)}" end="${icsZeit(bis)}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`,
    });
    if (r.status === 401) throw new Error("Zugang abgelehnt. Bitte neu verbinden.");
    const xml = await r.text();
    for (const teil of xml.split(/<[a-z]*:?response[\s>]/i).slice(1)) {
      const href = teil.match(/<[a-z]*:?href[^>]*>([^<]+)</i)?.[1]?.trim();
      const daten = teil.match(/<[a-z]*:?calendar-data[^>]*>([\s\S]*?)<\/[a-z]*:?calendar-data>/i)?.[1];
      if (!daten) continue;
      const ics = daten.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#13;/g, "\r").replace(/&amp;/g, "&");
      alle.push(...termineAusIcs(ics, v, von, bis, href ? new URL(href, k.url ?? k.id).toString() : undefined));
    }
  }
  return alle;
}

// ── Schreiben ──────────────────────────────────────────────────────────────

/** Legt einen Termin an und gibt die Kennung zurück, unter der er später wiedergefunden wird. */
export async function terminAnlegen(admin: Admin, v: Verbindung, t: TerminDaten): Promise<string> {
  const start = new Date(t.start);
  const ende = new Date(start.getTime() + Math.max(5, t.dauerMinuten) * 60_000);
  if (v.art === "google") {
    const token = await zugangstoken(admin, v);
    const j = await api("https://www.googleapis.com/calendar/v3/calendars/primary/events", token, {
      method: "POST",
      body: JSON.stringify({ summary: t.titel, description: t.beschreibung, location: t.ort, start: { dateTime: start.toISOString() }, end: { dateTime: ende.toISOString() } }),
    });
    return j.id;
  }
  if (v.art === "microsoft") {
    const token = await zugangstoken(admin, v);
    const j = await api("https://graph.microsoft.com/v1.0/me/events", token, {
      method: "POST",
      body: JSON.stringify(msTermin(t, start, ende)),
    });
    return j.id;
  }
  if (v.art === "caldav") {
    const ziel = v.kalender[0];
    if (!ziel) throw new Error("Kein Kalender zum Eintragen gefunden.");
    const uid = `${crypto.randomUUID()}@os-immobilien-crm`;
    const href = new URL(`${encodeURIComponent(uid)}.ics`, (ziel.url ?? ziel.id).replace(/\/?$/, "/")).toString();
    await caldavSchreiben(admin, v, href, baueIcs(uid, t), true);
    return href;
  }
  throw new Error("In einen abonnierten Kalender kann nicht geschrieben werden.");
}

function msTermin(t: TerminDaten, start: Date, ende: Date) {
  const utc = (d: Date) => ({ dateTime: d.toISOString().slice(0, 19), timeZone: "UTC" });
  return { subject: t.titel, body: { contentType: "text", content: t.beschreibung ?? "" }, location: { displayName: t.ort ?? "" }, start: utc(start), end: utc(ende) };
}

async function caldavSchreiben(admin: Admin, v: Verbindung, href: string, ics: string, neu: boolean) {
  const { passwort } = (await zugangLesen(admin, v.id)) as { passwort: string };
  const r = await sicheresFetch(href, {
    method: "PUT",
    headers: { Authorization: basic(v.benutzername ?? v.konto, passwort), "Content-Type": "text/calendar; charset=utf-8", ...(neu ? { "If-None-Match": "*" } : {}) },
    body: ics,
  });
  if (!r.ok) throw new Error(`Kalenderserver antwortet mit ${r.status}`);
}

export async function terminAendern(admin: Admin, v: Verbindung, kennung: string, t: TerminDaten): Promise<void> {
  const start = new Date(t.start);
  const ende = new Date(start.getTime() + Math.max(5, t.dauerMinuten) * 60_000);
  if (v.art === "google") {
    await api(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(kennung)}`, await zugangstoken(admin, v), {
      method: "PATCH",
      body: JSON.stringify({ summary: t.titel, description: t.beschreibung, location: t.ort, start: { dateTime: start.toISOString() }, end: { dateTime: ende.toISOString() } }),
    });
  } else if (v.art === "microsoft") {
    await api(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(kennung)}`, await zugangstoken(admin, v), { method: "PATCH", body: JSON.stringify(msTermin(t, start, ende)) });
  } else if (v.art === "caldav") {
    const uid = decodeURIComponent(kennung.split("/").pop()!.replace(/\.ics$/, ""));
    await caldavSchreiben(admin, v, caldavHref(v, kennung), baueIcs(uid, t), false);
  }
}

export async function terminLoeschen(admin: Admin, v: Verbindung, kennung: string): Promise<void> {
  if (v.art === "google") {
    await api(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(kennung)}`, await zugangstoken(admin, v), { method: "DELETE" }).catch((e) => {
      if (!/410|404/.test(String(e?.message))) throw e;
    });
  } else if (v.art === "microsoft") {
    await api(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(kennung)}`, await zugangstoken(admin, v), { method: "DELETE" });
  } else if (v.art === "caldav") {
    const { passwort } = (await zugangLesen(admin, v.id)) as { passwort: string };
    const r = await sicheresFetch(caldavHref(v, kennung), { method: "DELETE", headers: { Authorization: basic(v.benutzername ?? v.konto, passwort) } });
    if (!r.ok && r.status !== 404) throw new Error(`Kalenderserver antwortet mit ${r.status}`);
  }
}

/**
 * Ältere iCloud-Einträge haben nur eine UID als Kennung. Die volle Adresse
 * liegt dann im ersten Kalender; neue Einträge tragen die volle Adresse.
 * Nur Adressen auf dem Server dieser Verbindung sind erlaubt.
 */
function caldavHref(v: Verbindung, kennung: string): string {
  const basis = v.kalender[0]?.url ?? v.kalender[0]?.id ?? v.server_url ?? "";
  const href = /^https:\/\//.test(kennung) ? kennung : new URL(`${encodeURIComponent(kennung)}.ics`, basis.replace(/\/?$/, "/")).toString();
  const erlaubt = new Set(v.kalender.map((k) => new URL(k.url ?? k.id).host));
  if (!erlaubt.has(new URL(href).host)) throw new Error("Dieser Termin gehört nicht zu diesem Kalender.");
  return href;
}

// ── Ortszeit ───────────────────────────────────────────────────────────────

/** Versatz Berlins gegen UTC in Millisekunden zu einem Zeitpunkt. */
function versatzBei(ms: number): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Berlin", timeZoneName: "longOffset" })
    .formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName")?.value ?? "GMT+01:00";
  const m = name.match(/([+-])(\d{2}):(\d{2})/);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000 : 3600_000;
}

/**
 * Berliner Ortszeit nach UTC. Der Versatz wird am Ergebnis geprüft, nicht an
 * der Ortszeit als UTC gelesen; sonst läge ein Termin in der Nacht der
 * Zeitumstellung eine Stunde daneben.
 */
export function berlinNachUtc(tag: string, zeit: string): Date {
  const alsUtc = Date.parse(`${tag}T${zeit}:00Z`);
  const erster = alsUtc - versatzBei(alsUtc);
  return new Date(alsUtc - versatzBei(erster));
}
