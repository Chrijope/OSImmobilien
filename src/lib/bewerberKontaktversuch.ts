import { supabase } from "@/integrations/supabase/client";
import { berufsbezeichnung } from "@/lib/berufsbezeichnung";
import { getBewerberById, updateBewerber, type Kontaktversuch, type KontaktversuchErgebnis } from "./bewerbungStore";
import { toast } from "@/hooks/use-toast";
import {
  LETZTER_MAIL_VERSUCH,
  nichtErreichtIdempotenzSchluessel,
  nichtErreichtMailStufe,
} from "./bewerberNichtErreichtMail";

function uid() { return crypto.randomUUID(); }

// In-Memory Lock gegen Doppelklicks (verhindert parallel laufende Sends für denselben Bewerber)
const inFlight = new Set<string>();

// Stündliches Cap, damit ein Bug/Loop nicht das gesamte Email-Limit reißt
const HOURLY_CAP = 30;
async function nichtErreichtCountLastHour(): Promise<number> {
  try {
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count, error } = await supabase
      .from("email_send_log")
      .select("id", { count: "exact", head: true })
      .eq("template_name", "bewerber-nicht-erreicht")
      .gte("created_at", since);
    if (error) { console.warn("cap check failed:", error); return 0; }
    return count ?? 0;
  } catch (e) { console.warn("cap check error:", e); return 0; }
}

/**
 * Die Ansprechpartnerin fuer Bewerber, so wie sie unten in der Mail steht.
 *
 * Unter dieser Mail steht immer dieselbe Person, unabhaengig davon, wer den
 * Anruf gemacht hat und wie viele Kollegen sonst noch die HR-Rolle tragen.
 * Bewerber sollen einen festen Kontakt haben und nicht bei jedem Anlauf einen
 * anderen Namen lesen.
 *
 * Fest verdrahtet ist deshalb nur der Name. Telefon, Mail und Bild kommen aus
 * ihrem Nutzerprofil. Wer sie im Code doppelt, hat sie beim naechsten Wechsel
 * der Handynummer an zwei Stellen stehen und aendert nur eine davon.
 *
 * Wird das Profil nicht gefunden, liefert die Funktion undefined und die
 * Vorlage faellt auf den anrufenden Berater zurueck. Das ist besser als eine
 * halb ausgefuellte Signatur.
 */
export const HR_ANSPRECHPARTNERIN = "Sarah Kaiser-Thom";

/** Vergleicht Namen ohne Ruecksicht auf Gross-/Kleinschreibung, Bindestriche und Leerzeichen. */
function nameGleich(a: string, b: string): boolean {
  const k = (t: string) => t.toLowerCase().replace(/[\s-]+/g, "");
  return k(a) === k(b);
}

export type MailAnsprechpartner = {
  name: string;
  rolle: string;
  telefon?: string;
  email?: string;
  bildUrl?: string;
};

let hrCache: { wert: MailAnsprechpartner | undefined } | null = null;

export async function ladeHrAnsprechpartner(): Promise<MailAnsprechpartner | undefined> {
  if (hrCache) return hrCache.wert;
  try {
    // Erst unter den HR-Nutzern suchen. Die Rolle ist der Schutz davor, dass ein
    // gleichnamiger Bewerber- oder Kundenaccount in der Signatur landet.
    const { data: rollen } = await supabase
      .from("user_roles").select("user_id").eq("role", "hr");
    const ids = ((rollen || []) as any[]).map((r) => r.user_id).filter(Boolean);

    let treffer: any = null;
    if (ids.length) {
      const { data: profile } = await supabase
        .from("profiles").select("name, email, telefon, avatar_url").in("id", ids);
      treffer = ((profile || []) as any[])
        .find((p) => nameGleich(String(p?.name || ""), HR_ANSPRECHPARTNERIN)) || null;
    }

    // Zweiter Anlauf ohne Rollenfilter, falls die HR-Rolle im Nutzerprofil
    // (noch) fehlt. Sonst stuende die Mail wegen einer fehlenden Rolle ohne
    // Ansprechpartnerin da, obwohl das Profil vorhanden ist.
    if (!treffer) {
      const { data: profile } = await supabase
        .from("profiles").select("name, email, telefon, avatar_url")
        .ilike("name", HR_ANSPRECHPARTNERIN);
      treffer = ((profile || []) as any[])
        .find((p) => nameGleich(String(p?.name || ""), HR_ANSPRECHPARTNERIN)) || null;
    }

    if (!treffer) { hrCache = { wert: undefined }; return undefined; }

    const wert: MailAnsprechpartner = {
      name: String(treffer.name).trim(),
      // Die Bezeichnung haengt an der Rolle und steht nur in
      // berufsbezeichnung.ts, damit sie sich an einer Stelle aendern laesst.
      rolle: berufsbezeichnung("hr"),
      // Leere Felder weglassen, damit die Vorlage die allgemeine Angabe zeigt
      // statt einer leeren Zeile.
      ...(treffer.telefon?.trim() ? { telefon: treffer.telefon.trim() } : {}),
      ...(treffer.email?.trim() ? { email: treffer.email.trim() } : {}),
      ...(treffer.avatar_url?.trim() ? { bildUrl: treffer.avatar_url.trim() } : {}),
    };
    hrCache = { wert };
    return wert;
  } catch (e) {
    // Eine Mail, die wegen der Signatur nicht hinausgeht, waere ein schlechter Tausch.
    console.warn("HR-Ansprechpartner nicht geladen:", e);
    return undefined;
  }
}

/**
 * Loggt einen Kontaktversuch und sendet bei "nicht_erreicht" eine Mail an den
 * Bewerber, aber nur beim ersten und beim fünften Versuch (seit 26.09.2026,
 * siehe bewerberNichtErreichtMail.ts). Bei
 * "kein_interesse" wird der Bewerber direkt auf "Kein Interesse" gesetzt.
 * "closing_gebucht" schreibt nur einen Verlaufseintrag; der Knopf dafür ist
 * aus der Oberfläche entfernt, der Zweig bleibt für Bestandsdaten.
 *
 * Eine automatische Absage gibt es nicht. Wer einen Bewerber ablehnt, tut das
 * von Hand und mit Grund.
 */
export async function logKontaktversuch(opts: {
  bewerberId: string;
  ergebnis: KontaktversuchErgebnis;
  beraterName: string;
}): Promise<{ ok: boolean; versuch: number }> {
  const b = getBewerberById(opts.bewerberId);
  if (!b) return { ok: false, versuch: 0 };

  // Idempotenz: blockiere parallele Aufrufe für denselben Bewerber
  if (inFlight.has(opts.bewerberId)) {
    toast({ title: "Bitte einen Moment…", description: "Der vorherige Versuch wird noch verarbeitet." });
    return { ok: false, versuch: 0 };
  }
  inFlight.add(opts.bewerberId);
  try {
  const bestehend: Kontaktversuch[] = Array.isArray(b.kontaktversuche) ? [...b.kontaktversuche!] : [];
  // Zaehlt die erfolglosen Anrufe, und zwar ohne Deckel. Frueher stand hier ein
  // Math.min(..., 5), weil nach dem fuenften Versuch ohnehin die automatische
  // Absage kam. Die gibt es nicht mehr, und acht erfolglose Anrufe sind ein
  // anderer Fall als fuenf. Also wird weitergezaehlt.
  const versuch = bestehend.filter((k) => k.ergebnis === "nicht_erreicht").length + 1;

  // Mindestabstand zwischen zwei "Nicht erreicht"-Versuchen.
  //
  // Ohne diese Bremse lassen sich alle fuenf Versuche in einer Minute
  // durchklicken, und der Bewerber bekommt fuenf Mails an einem Tag. Das ist
  // aus seiner Sicht keine Bemuehung mehr, sondern Belaestigung. Ab dem
  // vierten Versuch gilt ein Tag, weil dann ohnehin nicht mehr die Uhrzeit das
  // Problem ist, sondern der Tag.
  if (opts.ergebnis === "nicht_erreicht") {
    const letzterNichtErreicht = [...bestehend]
      .reverse()
      .find((k) => k.ergebnis === "nicht_erreicht");
    if (letzterNichtErreicht) {
      const mindestStunden = versuch >= 4 ? 24 : 4;
      const vergangen = (Date.now() - new Date(letzterNichtErreicht.datum).getTime()) / 3_600_000;
      if (isFinite(vergangen) && vergangen < mindestStunden) {
        const rest = Math.max(1, Math.ceil(mindestStunden - vergangen));
        toast({
          title: "Noch zu frueh fuer den naechsten Versuch",
          description: `Zwischen zwei Anrufen liegen mindestens ${mindestStunden} Stunden. Bitte in etwa ${rest} Stunde${rest === 1 ? "" : "n"} erneut versuchen.`,
          variant: "destructive",
        });
        return { ok: false, versuch: versuch - 1 };
      }
    }
  }

  /*
   * ERREICHT: notieren, keine Mail, kein Stufenwechsel.
   *
   * ## Warum genau diese Wirkung
   *
   * Der Zähler `countNichtErreichtVersuche` zählt ausschliesslich
   * „nicht_erreicht". Ein geglücktes Gespräch lässt die Mailkette damit von
   * selbst stehen, und das ist richtig: Eine weitere Mail „Wir haben dich
   * nicht erreicht" nach einem Telefonat wäre schlicht falsch.
   *
   * Der Status ändert sich nicht. Das ist dieselbe Regel wie bei
   * „nicht_erreicht": Die Stufe rückt nur, wenn ein Mensch sie rückt oder ein
   * Termin steht. Ein Anruf allein sagt noch nicht, wie es weitergeht, das
   * sagt erst der Termin, der danach eingetragen wird.
   *
   * Aufgehoben wird allein die 24-Stunden-Ruhe im Eingang. Sie stammt aus
   * „nicht erreicht" und soll verhindern, dass derselbe Bewerber am selben Tag
   * wieder oben steht. Nach einem geglückten Gespräch ist sie hinfällig: Wer
   * gerade telefoniert hat, will die Akte sehen und nicht suchen müssen.
   */
  if (opts.ergebnis === "erreicht") {
    bestehend.push({ id: uid(), versuch, datum: new Date().toISOString(), ergebnis: "erreicht", von: opts.beraterName, emailGesendet: false });
    updateBewerber(opts.bewerberId, { kontaktversuche: bestehend, eingangHiddenUntil: "" });
    toast({
      title: "Erreicht, notiert",
      description: "Der Anruf steht im Verlauf. Stufe und Mailkette bleiben unverändert.",
    });
    return { ok: true, versuch };
  }

  // CLOSING_GEBUCHT: nur loggen, keine Aktion
  if (opts.ergebnis === "closing_gebucht") {
    bestehend.push({ id: uid(), versuch, datum: new Date().toISOString(), ergebnis: "closing_gebucht", von: opts.beraterName });
    updateBewerber(opts.bewerberId, { kontaktversuche: bestehend });
    toast({ title: "Closing-Termin notiert", description: "Bitte im Erstgesprächs-Skript Datum & Uhrzeit pflegen." });
    return { ok: true, versuch };
  }

  // KEIN_INTERESSE: nur loggen + Status auf „Kein Interesse" (keine Mail)
  if (opts.ergebnis === "kein_interesse") {
    bestehend.push({ id: uid(), versuch, datum: new Date().toISOString(), ergebnis: "kein_interesse", von: opts.beraterName, emailGesendet: false });
    updateBewerber(opts.bewerberId, { kontaktversuche: bestehend, status: "KeinInteresse" as any });
    toast({
      title: 'Status auf „Kein Interesse" gesetzt',
      description: `${b.vorname} ${b.nachname} wurde markiert. Es wurde keine Mail an den Bewerber gesendet.`,
    });
    return { ok: true, versuch };
  }

  // NICHT_ERREICHT: zählen, und nur beim ersten und beim letzten Versuch eine
  // Mail senden. Dazwischen und danach wird der Anruf nur protokolliert.
  let emailGesendet = false;
  const mailStufe = nichtErreichtMailStufe(versuch);
  if (b.email && mailStufe) {
    // Cap-Check (max. 30 "Nicht erreicht"-Mails pro Stunde global)
    const recent = await nichtErreichtCountLastHour();
    if (recent >= HOURLY_CAP) {
      toast({
        title: "Stündliches Limit erreicht",
        description: `Es wurden bereits ${recent} „Nicht erreicht"-Mails in der letzten Stunde gesendet. Versuch wird ohne Mail protokolliert.`,
        variant: "destructive",
      });
    } else {
    // Keine Ansprechpartnerin aus dem Browser: Unterschrift, Absender und
    // Antwortadresse setzt send-transactional-email aus der festgelegten
    // HR-Ansprechpartnerin, ueber ihre Kennung und nicht ueber den Namen.
    const templateData = {
      bewerberName: `${b.vorname} ${b.nachname}`.trim(),
      versuch,
    };
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "bewerber-nicht-erreicht",
          recipientEmail: b.email,
          // Je Bewerber und Stufe hoechstens eine Mail.
          idempotencyKey: nichtErreichtIdempotenzSchluessel(b.id, mailStufe),
          templateData,
        },
      });
      if (error) console.warn("send-transactional-email failed:", error);
      else emailGesendet = true;
    } catch (e) {
      console.warn("send-transactional-email error:", e);
    }
    }
  }

  bestehend.push({
    id: uid(), versuch, datum: new Date().toISOString(),
    ergebnis: "nicht_erreicht", von: opts.beraterName, emailGesendet,
  });

  // Nach „Nicht erreicht": Bewerber für 24h aus der „Eingang"-Ansicht ausblenden,
  // solange er noch im Eingang ist. Der Status bleibt unangetastet: Eine
  // automatische Ablehnung gibt es nicht mehr, egal wie oft angerufen wurde.
  const hideUntil = b.status === "Eingang"
    ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    : undefined;
  updateBewerber(opts.bewerberId, {
    kontaktversuche: bestehend,
    ...(hideUntil ? { eingangHiddenUntil: hideUntil } : {}),
  });

  toast({
    title: `Versuch ${versuch} protokolliert`,
    description: emailGesendet
      ? "Erinnerungs-Mail wurde gesendet."
      : !mailStufe
        ? versuch > LETZTER_MAIL_VERSUCH
          ? "Nach dem fünften Versuch geht bewusst keine Mail mehr an den Bewerber. Der Versuch ist nur notiert."
          : "Eine Mail geht nur nach dem ersten und dem fünften Versuch hinaus. Dieser Versuch ist nur notiert."
        : "Email konnte nicht gesendet werden (keine Adresse oder Fehler).",
  });

  return { ok: true, versuch };
  } finally {
    inFlight.delete(opts.bewerberId);
  }
}

/** Zählt nur die wirklich relevanten Versuche (nicht_erreicht). */
export function countNichtErreichtVersuche(b: { kontaktversuche?: Kontaktversuch[] }): number {
  return (b.kontaktversuche || []).filter(k => k.ergebnis === "nicht_erreicht").length;
}

/**
 * Steht ein Closing-Termin? Maßgeblich sind die echten Wege: Datum in der
 * Closing-Termin-Karte oder in Punkt 10 des Erstgesprächsskripts. Der alte
 * Verlaufseintrag "closing_gebucht" (früherer Knopf in der Kontakt-Karte,
 * ohne Datum) zählt für Bestandsdaten weiterhin mit.
 */
export function closingGebucht(b: { kontaktversuche?: Kontaktversuch[]; closingTerminDatum?: string }): boolean {
  if ((b.closingTerminDatum || "").trim()) return true;
  return (b.kontaktversuche || []).some(k => k.ergebnis === "closing_gebucht");
}