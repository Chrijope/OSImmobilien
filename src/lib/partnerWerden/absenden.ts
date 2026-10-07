/**
 * Schickt eine Anfrage von „Partner werden“ an `submit-partner-werden`.
 *
 * Der Browser schickt Weg, Bereich (Rolle), Antworten, Kontakt, Einwilligung, Honigtopf, die
 * Dauer für die Zeitfalle und die Kampagnenkennung (UTM). Was davon
 * gespeichert wird, entscheidet der Server anhand von
 * `_shared/partner-werden.ts`. Kein Meta Pixel, keine Meldung an Dritte.
 */
import { normalizeTelefon } from "@/lib/phoneUtils";
import { kampagneFuerLead } from "@/lib/kampagnenKennung";
import { projektUrl } from "@/lib/handbuch/leadAbsenden";
import {
  PARTNER_EINWILLIGUNG_TEXT,
  PARTNER_EINWILLIGUNG_VERSION,
  type PartnerKontakt,
  type PartnerRolle,
  type PartnerWeg,
} from "../../../supabase/functions/_shared/partner-werden.ts";

export interface PartnerAnfrage {
  weg: PartnerWeg;
  rolle: PartnerRolle;
  antworten: Record<string, string>;
  kontakt: PartnerKontakt;
  einwilligung: boolean;
  hp: string;
  dauerMs: number;
}

/** Der Rumpf der Anfrage. Eigene Funktion, damit ein Test ihn ohne Netz prüft. */
export function partnerAnfrageRumpf(a: PartnerAnfrage, jetzt: string = new Date().toISOString()): Record<string, unknown> {
  const kampagne = kampagneFuerLead();
  return {
    weg: a.weg,
    rolle: a.rolle,
    antworten: a.antworten,
    kontakt: {
      vorname: a.kontakt.vorname.trim(),
      nachname: a.kontakt.nachname.trim(),
      email: a.kontakt.email.trim(),
      telefon: normalizeTelefon(a.kontakt.telefon.trim()),
      firma: a.kontakt.firma.trim(),
    },
    einwilligung: a.einwilligung
      ? { erteilt: true, version: PARTNER_EINWILLIGUNG_VERSION, text: PARTNER_EINWILLIGUNG_TEXT, am: jetzt }
      : null,
    hp: a.hp,
    dauerMs: Math.round(a.dauerMs),
    ...(kampagne ? { kampagne } : {}),
  };
}

export async function sendePartnerAnfrage(a: PartnerAnfrage): Promise<{ ok: true } | { ok: false; fehler: string }> {
  try {
    const res = await fetch(`${projektUrl()}/submit-partner-werden`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(partnerAnfrageRumpf(a)),
    });
    if (res.ok) return { ok: true };
    let meldung = "";
    try {
      const j = (await res.json()) as Record<string, unknown>;
      meldung = typeof j.message === "string" ? j.message : "";
    } catch {
      meldung = "";
    }
    if (res.status === 429) return { ok: false, fehler: meldung || "Zu viele Anfragen. Bitte versuch es später noch einmal." };
    return { ok: false, fehler: meldung || "Das hat leider nicht geklappt. Bitte versuch es gleich noch einmal." };
  } catch {
    return { ok: false, fehler: "Keine Verbindung. Bitte prüfe dein Internet und versuch es noch einmal." };
  }
}
