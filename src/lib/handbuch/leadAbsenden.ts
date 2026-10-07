/**
 * Schickt den Konfigurator der Handbuch-Seite an `submit-lead`.
 *
 * Der Server rechnet Ausgang, Rahmen, Quelle und Notiz selbst nach
 * (`_shared/handbuch-funnel.ts`). Der Browser schickt nur die Antworten, die
 * Kontaktdaten, die Einwilligung, das Partnerkürzel aus der Adresse und die
 * Kampagnenkennung. Die Zuständigkeit ermittelt der Server allein aus dem
 * Kürzel (`beraterSlug`), nie aus einer mitgeschickten Kennung.
 */
import { normalizeTelefon } from "@/lib/phoneUtils";
import { leadFehlermeldung, leadNetzfehlerMeldung, retryAfterSekunden } from "@/lib/leadFehlermeldung";
import { baueHandbuchEinwilligung, baueHandbuchSaEinwilligung } from "@/lib/leadEinwilligung";
import { kampagneFuerLead } from "@/lib/kampagnenKennung";
import { einwilligungFuerServer } from "@/lib/cookieEinwilligung";
import { erzeugeMetaEventId, istMetaPixelAktiv, meldeMetaLead } from "@/lib/metaPixel";
import { HANDBUCH_QUELLE, type HandbuchAntworten } from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import type { Sprache } from "../../../supabase/functions/_shared/kunden-sprache.ts";

export interface HandbuchKontakt {
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  einwilligung: boolean;
  werbeeinwilligung: boolean;
  /** Honigtopf, bleibt bei Menschen leer. */
  hp: string;
}

export interface HandbuchLeadErgebnis {
  ok: boolean;
  handbuchToken?: string | null;
  saToken?: string | null;
  /** `fehler`: ein Schritt auf dem Server ist technisch gescheitert (HB-009). Ältere Server schicken nichts, das gilt als `ok`. */
  zustellung?: "ok" | "fehler";
  fehler?: string;
  status?: number;
}

export function projektUrl(): string {
  const id =
    (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_SUPABASE_PROJECT_ID ||
    "DEIN-SUPABASE-PROJEKT";
  return `https://${id}.supabase.co/functions/v1`;
}

/** Der Rumpf der Anfrage. Eigene Funktion, damit ihn ein Test ohne Netz prüfen kann. */
export function handbuchLeadRumpf(args: {
  kontakt: HandbuchKontakt;
  antworten: HandbuchAntworten;
  beraterSlug?: string | null;
  dauerMs: number;
  metaEventId?: string;
  jetzt?: string;
  /** Sprache der Seite. Sie wird zur Kundensprache des neuen Kontakts. */
  sprache?: Sprache;
}): Record<string, unknown> {
  const { kontakt, antworten } = args;
  const sprache: Sprache = args.sprache === "en" ? "en" : "de";
  const kampagne = kampagneFuerLead();
  const telefon = kontakt.telefon.trim() ? normalizeTelefon(kontakt.telefon) : "";
  return {
    vorname: kontakt.vorname.trim(),
    nachname: kontakt.nachname.trim(),
    email: kontakt.email.trim(),
    telefon,
    hp: kontakt.hp,
    quelle: HANDBUCH_QUELLE,
    beraterSlug: (args.beraterSlug || "").trim() || undefined,
    dsgvo_consent: baueHandbuchEinwilligung(kontakt.einwilligung, kontakt.werbeeinwilligung, args.jetzt, sprache),
    sprache,
    metaEventId: args.metaEventId,
    cookieEinwilligung: einwilligungFuerServer(),
    handbuchFunnel: { antworten, dauerMs: Math.round(args.dauerMs) },
    meta: {
      ...(kampagne ? { kampagne } : {}),
    },
  };
}

/**
 * Der Rumpf der offenen Selbstauskunft (/handbuch/selbstauskunft): nur
 * Kontakt, Einwilligung, Kürzel und Kampagne, dazu `handbuchSelbstauskunft`
 * mit der Dauer für die Zeitfalle. Keine Antworten, kein Handbuch, und seit
 * dem 27.09.2026 keine Meldung an Meta: keine Event-ID, keine
 * Cookie-Einwilligung (Punkt 6, Anlage 4 § 1 Abs. 1).
 */
export function handbuchSaRumpf(args: {
  kontakt: HandbuchKontakt;
  beraterSlug?: string | null;
  dauerMs: number;
  jetzt?: string;
  sprache?: Sprache;
}): Record<string, unknown> {
  const { kontakt } = args;
  const sprache: Sprache = args.sprache === "en" ? "en" : "de";
  const kampagne = kampagneFuerLead();
  return {
    vorname: kontakt.vorname.trim(),
    nachname: kontakt.nachname.trim(),
    email: kontakt.email.trim(),
    telefon: kontakt.telefon.trim() ? normalizeTelefon(kontakt.telefon) : "",
    hp: kontakt.hp,
    quelle: HANDBUCH_QUELLE,
    beraterSlug: (args.beraterSlug || "").trim() || undefined,
    dsgvo_consent: baueHandbuchSaEinwilligung(kontakt.einwilligung, kontakt.werbeeinwilligung, args.jetzt, sprache),
    sprache,
    handbuchSelbstauskunft: { dauerMs: Math.round(args.dauerMs) },
    meta: {
      ...(kampagne ? { kampagne } : {}),
    },
  };
}

export async function sendeHandbuchLead(args: {
  kontakt: HandbuchKontakt;
  antworten: HandbuchAntworten;
  beraterSlug?: string | null;
  dauerMs: number;
  sprache?: Sprache;
}): Promise<HandbuchLeadErgebnis> {
  return sende((metaEventId) => handbuchLeadRumpf({ ...args, metaEventId }), args.sprache);
}

export async function sendeHandbuchSelbstauskunft(args: {
  kontakt: HandbuchKontakt;
  beraterSlug?: string | null;
  dauerMs: number;
  sprache?: Sprache;
}): Promise<HandbuchLeadErgebnis> {
  return sende(() => handbuchSaRumpf(args), args.sprache, false);
}

async function sende(
  rumpf: (metaEventId?: string) => Record<string, unknown>,
  sprache: Sprache = "de",
  mitPixel = true,
): Promise<HandbuchLeadErgebnis> {
  // Die Event-ID nur, wenn der Besucher dem Pixel zugestimmt hat und es läuft,
  // und nie aus der offenen Selbstauskunft.
  const metaEventId = mitPixel && istMetaPixelAktiv() ? erzeugeMetaEventId() : undefined;
  try {
    const res = await fetch(`${projektUrl()}/submit-lead`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rumpf(metaEventId)),
    });
    let json: Record<string, unknown> = {};
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      json = {};
    }
    if (!res.ok) {
      // Die Meldung des Servers ist deutsch; auf Englisch gilt die allgemeine je Status.
      const eigene = sprache === "de" && typeof json.message === "string" ? json.message : "";
      return {
        ok: false,
        status: res.status,
        fehler: eigene || leadFehlermeldung(res.status, retryAfterSekunden(res.headers), sprache, "sie"),
      };
    }
    if (metaEventId) meldeMetaLead(metaEventId);
    return {
      ok: true,
      handbuchToken: typeof json.handbuchToken === "string" ? json.handbuchToken : null,
      saToken: typeof json.saToken === "string" ? json.saToken : null,
      zustellung: json.zustellung === "fehler" ? "fehler" : "ok",
    };
  } catch {
    return { ok: false, fehler: leadNetzfehlerMeldung(sprache, "sie") };
  }
}
