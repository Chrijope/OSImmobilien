import { meetingZeitISO } from "./meetingZeit";
/**
 * Versendet die Einladung zu einem selbst angelegten Meeting.
 *
 * Bisher hat der Dialog "Meeting erstellen" bei gesetzter Checkbox nur eine
 * Aktivität geschrieben und im Hinweis behauptet, eine Einladung sei an den
 * Kunden gegangen. Verschickt wurde nie etwas.
 *
 * Der Versand läuft über die Vorlage `zoom-meeting-einladung`: mit
 * Zugangslink und Knöpfen, um den Termin in den eigenen Kalender zu legen.
 * Name und Datenfeld `zoomJoinUrl` stammen aus der Zeit der Zoom-Anbindung
 * und bleiben, weil die ausgerollte Function send-transactional-email sie so
 * erwartet. Inhaltlich ist es die allgemeine Meeting-Einladung.
 */
import { supabase } from "@/integrations/supabase/client";
import { beraterMailFelder, findeBerater } from "./mailBerater";

const ICS_BASIS = "https://DEIN-SUPABASE-PROJEKT.supabase.co/functions/v1/get-ics";

export interface MeetingEinladung {
  kundeId: string;
  meetingId?: string;
  kalenderUid?: string;
  kalenderSequenz?: number;
  kundeName: string;
  kundeEmail: string;
  /** Name des Beraters, wie er im Dialog steht. */
  berater: string;
  /**
   * Kennung des Beraters, also seine Nutzer-ID.
   *
   * Sie ist die verlaessliche Quelle. Der Name daneben ist nur noch der
   * Rueckfall fuer Aufrufer, die die Kennung nicht zur Hand haben.
   */
  beraterId?: string;
  titel: string;
  agenda?: string;
  /** Datum als YYYY-MM-DD. */
  datum: string;
  /** Uhrzeit als HH:MM. */
  uhrzeit: string;
  /** Zugangslink zum Termin, heute der eigene Videoraum. */
  meetingLink?: string;
  /** Dauer in Minuten. */
  dauerMinuten?: number;
  /**
   * Wie das Treffen stattfindet. Bestimmt Wortlaut und Ortsangabe der Mail.
   * Ohne Angabe schreibt die Vorlage die Fassung für ein Videogespräch.
   */
  modus?: "video" | "vor_ort" | "telefon";
  /** Adresse bei einem Treffen vor Ort. */
  treffpunkt?: string;
  /** Nummer, auf der der Kunde beim Telefontermin angerufen wird. */
  kundeTelefon?: string;
  /**
   * Zusatz fuer den Doppelversand-Schutz. Ein bewusstes erneutes Senden
   * (der Kunde findet den Link nicht mehr) braucht einen eigenen Schluessel,
   * sonst verschluckt die Edge Function die Wiederholung.
   */
  schluesselZusatz?: string;
}

/**
 * Merkt sich, fuer welchen Termin schon gemeldet wurde, dass der Berater fehlt.
 *
 * Ohne das schriebe eine Einladung an den Kunden und an drei Gaeste vier
 * gleichlautende Zeilen in den Verlauf.
 */
const schonGemeldet = new Set<string>();

/**
 * Sagt Bescheid, wenn der Berater nicht gefunden wurde.
 *
 * Vorher verschluckte ein leeres `catch` jeden Fehlgriff. Die Mail ging
 * trotzdem hinaus, nur eben mit der allgemeinen Adresse statt der des
 * Beraters. Eine Mail mit falschem Absender ist schlimmer als eine, die
 * auffaellt, deshalb landet der Fall in der Konsole und im Verlauf des Kunden.
 */
function meldeBeraterFehlt(e: MeetingEinladung): void {
  const hinweis =
    `Meeting-Einladung: Berater "${e.berater}" nicht gefunden` +
    `${e.beraterId ? ` (Kennung ${e.beraterId})` : " (ohne Kennung)"}. ` +
    "Die Mail geht ohne seine Adresse, Bezeichnung und Bild hinaus.";
  console.warn(hinweis);

  const schluessel = `${e.kundeId}-${e.datum}-${e.uhrzeit}`;
  if (schonGemeldet.has(schluessel)) return;
  schonGemeldet.add(schluessel);
  // Nachgeladen, damit der Verlauf nur im Fehlerfall ins Spiel kommt.
  void import("./aktivitaetenStore")
    .then(({ addAktivitaet }) =>
      addAktivitaet({
        kundeId: e.kundeId,
        art: "email",
        beschreibung: "Einladung ohne Beraterangaben verschickt",
        details: hinweis,
      }),
    )
    .catch(() => {
      // Der Verlauf ist das Zusatzangebot, die Konsolenzeile steht schon.
    });
}

function formatiereDatum(datum: string): string {
  const d = new Date(`${datum}T00:00:00`);
  if (isNaN(d.getTime())) return datum;
  return d.toLocaleDateString("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function alsIcsZeit(datum: string, uhrzeit: string, plusMinuten = 0): string {
  const d = new Date(meetingZeitISO(datum, uhrzeit || "10:00"));
  if (isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() + plusMinuten);
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export async function versendeMeetingEinladung(e: MeetingEinladung): Promise<boolean> {
  if (!e.kundeEmail) return false;

  const dauer = e.dauerMinuten ?? 60;

  // Kontaktdaten des Beraters für die Signatur in der Mail.
  const gefunden = findeBerater(e.beraterId, e.berater);
  if (!gefunden) meldeBeraterFehlt(e);
  const beraterFelder = beraterMailFelder(gefunden, e.berater, e.beraterId);
  const beraterEmail = gefunden?.email || "";

  // Die Sprache des Kunden aus dem Profil. Gäste bekommen dieselbe, eine
  // Sprache je Termin (Plan Kundensprache, Entscheidung 11). Dynamisch
  // geladen wie in buchungslinkMail.ts, damit kein Importkreis entsteht.
  const sprache = (await import("./kundenSprache")).kundenSprache(e.kundeId);
  const englisch = sprache === "en";

  const start = alsIcsZeit(e.datum, e.uhrzeit);
  const ende = alsIcsZeit(e.datum, e.uhrzeit, dauer);
  const ort =
    e.modus === "vor_ort" ? (e.treffpunkt || (englisch ? "In person" : "Vor Ort"))
    : e.modus === "telefon" ? (englisch ? "Phone call" : "Telefontermin")
    : (e.meetingLink || "Online");
  const icsUrl = start && ende
    ? `${ICS_BASIS}?title=${encodeURIComponent(e.titel)}&start=${start}&end=${ende}` +
      `&desc=${encodeURIComponent(e.agenda || "")}&loc=${encodeURIComponent(ort)}` +
      `&org=${encodeURIComponent(gefunden?.name || e.berater)}&orgEmail=${encodeURIComponent(beraterEmail)}` +
      `&att=${encodeURIComponent(e.kundeEmail)}&uid=${encodeURIComponent(e.kalenderUid || `meeting-${e.meetingId || e.kundeId}-${start}`)}` + `&seq=${e.kalenderSequenz || 0}` +
      (englisch ? "&lang=en" : "")
    : undefined;

  const googleCalendarUrl = start && ende
    ? `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.titel)}` +
      `&dates=${start}/${ende}&details=${encodeURIComponent(e.agenda || "")}` +
      `&location=${encodeURIComponent(ort)}`
    : undefined;

  try {
    const { data, error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "zoom-meeting-einladung",
        recipientEmail: e.kundeEmail,
        // Stabile Meeting-ID verhindert Doppelversand bei Wiederholung.
        idempotencyKey: `meeting-${e.meetingId || e.kundeId}-${e.datum}-${e.uhrzeit}${e.schluesselZusatz ? `-${e.schluesselZusatz}` : ""}`,
        // Mail und Kalenderdatei in derselben Sprache.
        sprache,
        templateData: {
          kundeName: e.kundeName,
          // Name, Kennung, Adresse, Bezeichnung und Bild des Beraters, siehe
          // mailBerater.ts. Dieselben Felder benutzt die Chat-Benachrichtigung.
          ...beraterFelder,
          terminDatum: formatiereDatum(e.datum),
          terminUhrzeit: e.uhrzeit,
          terminDauer: dauer,
          zoomJoinUrl: e.meetingLink || undefined,
          terminModus: e.modus,
          treffpunkt: e.treffpunkt || undefined,
          kundeTelefon: e.kundeTelefon || undefined,
          icsUrl,
          googleCalendarUrl,
          agenda: e.agenda || undefined,
        },
        metadata: { kontaktId: e.kundeId, quelle: "meeting-dialog" },
      },
    });
    if (error || data?.error || data?.suppressed || data?.success === false) {
      console.error("versendeMeetingEinladung:", error || "Versand abgelehnt");
      return false;
    }
    return true;
  } catch (fehler) {
    console.error("versendeMeetingEinladung:", fehler);
    return false;
  }
}

/** Ein zusaetzlicher Gast des Termins, muss nicht im CRM angelegt sein. */
export interface TerminGast {
  name: string;
  email: string;
}

/**
 * Versendet die Einladung zusaetzlich an Gaeste.
 *
 * Jeder Gast bekommt seine eigene Mail mit persoenlicher Anrede, demselben
 * Zugang (Raumlink, Treffpunkt oder Anruf-Hinweis) und eigenem
 * Doppelversand-Schutz. Bewusst ohne jeden Kundenbezug im Inhalt: Der Gast
 * sieht Termin, Zugang und Berater, sonst nichts.
 */
export async function versendeGastEinladungen(
  gaeste: TerminGast[],
  einladung: Omit<MeetingEinladung, "kundeName" | "kundeEmail">,
): Promise<{ gesendet: TerminGast[]; fehlgeschlagen: TerminGast[] }> {
  const gesendet: TerminGast[] = [];
  const fehlgeschlagen: TerminGast[] = [];
  for (const gast of gaeste) {
    const email = gast.email.trim();
    if (!email) continue;
    const ok = await versendeMeetingEinladung({
      ...einladung,
      kundeName: gast.name.trim() || email,
      kundeEmail: email,
      // Eigener Schluessel je Gast, sonst verschluckt der Doppelversand-Schutz
      // ab dem zweiten Gast alle weiteren Mails desselben Termins.
      schluesselZusatz: [einladung.schluesselZusatz, `gast-${email.toLowerCase()}`]
        .filter(Boolean)
        .join("-"),
    });
    (ok ? gesendet : fehlgeschlagen).push(gast);
  }
  return { gesendet, fehlgeschlagen };
}

