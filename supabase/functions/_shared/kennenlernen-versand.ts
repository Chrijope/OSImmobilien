import { sendeVorlage } from "./transactional-versand.ts";
import { hrAnsprechpartner } from "./hr-ansprechpartner.ts";
import {
  KENNENLERNEN_BASIS_URL,
  KENNENLERNEN_GUELTIG_TAGE,
} from "./bewerber-kennenlernen-mail.ts";
import { MAIL_KENNENLERNEN, linkMitZaehlung } from "./bewerber-mail-tracking.ts";

/**
 * Der eigentliche Versand der Kennenlern-Einladung, ohne jede Rechtepruefung
 * und ohne HTTP.
 *
 * Warum als gemeinsames Modul, seit dem 15.09.2026: Der automatische Eingang
 * (Website, Zapier, Erfassung) rief die Function `send-bewerber-kennenlernen`
 * ueber das Netz auf und wies sich mit einem gemeinsamen Geheimnis aus. Dieser
 * Weg fuehrt ueber das Tor der Plattform, ueber eine zweite Anmeldung und
 * ueber eine Rechtepruefung, und er ist genau deshalb immer wieder
 * stillschweigend gescheitert: Im Profil stand „non-2xx", der Bewerber bekam
 * nichts, und HR musste die Mail von Hand nachschicken.
 *
 * Jetzt ruft der Eingang diese Funktion direkt im selben Prozess auf. Es gibt
 * keinen zweiten Netzaufruf mehr, also auch nichts, was daran scheitern kann.
 * Die Function bleibt bestehen; sie prueft weiterhin die Rolle und benutzt
 * danach dasselbe Modul. So laufen Hand- und Automatikversand durch denselben
 * Code.
 */

export interface KennenlernErgebnis {
  /** Fuer die HTTP-Antwort der Function. */
  status: number;
  koerper: Record<string, unknown>;
  /** Ging die Mail wirklich hinaus? */
  versandt: boolean;
  /** Grund, falls nicht. */
  grund?: string;
  /**
   * Der Schluessel des angelegten oder wiederverwendeten Bogens, sobald es
   * ihn gibt, auch wenn die Mail danach scheiterte.
   *
   * Bewusst ein eigenes Feld und nicht Teil von `koerper`: `koerper` geht als
   * HTTP-Antwort an das CRM. Dieses Feld liest nur der Eingang
   * `submit-bewerbung`, und der reicht es allein an den Absender der gerade
   * angelegten Bewerbung weiter, damit er ohne Umweg ueber sein Postfach in
   * seinen Bogen kommt. Nie protokollieren.
   */
  token?: string;
}

/**
 * Stammt diese Zeile aus dem neuen Kennenlernen?
 *
 * Beide Boegen schreiben in dieselbe Tabelle `bewerber_formular`, der alte
 * Vorabbogen aus `send-bewerber-formular` und dieser hier. Erkennungsmerkmal
 * ist dasselbe wie im Browser (`istKennenlernen` in
 * `src/lib/bewerberKennenlernen.ts`): der gewaehlte Weg. Zusaetzlich das
 * Kennzeichen `bogen`, das schon beim Anlegen gesetzt wird.
 */
export function istKennenlernZeile(antworten: unknown): boolean {
  if (!antworten || typeof antworten !== "object") return false;
  const a = antworten as Record<string, unknown>;
  return a.bogen === "kennenlernen" || (typeof a.weg === "string" && a.weg.trim() !== "");
}

/** Wer den Versand von Hand ausgeloest hat, fuer Vermerk und Verlauf. */
export interface VersandAusloeser {
  id: string;
  name: string;
}

export interface KennenlernVersandOptionen {
  bewerbungId: string;
  /** Ausdrueckliche Wiederholung aus dem CRM, auch bei vorliegendem Bogen. */
  erneutSenden?: boolean;
  /** Nur den Link liefern, keine Mail. */
  nurLink?: boolean;
  /**
   * Nur zusammen mit `nurLink`: Der Link wird fuer „Link kopieren" oder
   * „So sieht es aus" in der Akte erzeugt, nicht fuer eine Mail. Eine neu
   * angelegte Zeile bekommt dann das Kennzeichen `ohneMail`, damit Liste und
   * Akte nicht behaupten, es sei eine Einladung hinausgegangen. Der naechste
   * echte Versand entfernt das Kennzeichen wieder.
   */
  ohneMail?: boolean;
  /** Gesetzt beim Klick im CRM, leer beim automatischen Eingang. */
  ausgeloestVon?: VersandAusloeser;
}

/** Der Verlaufstext in der Akte, wenn HR die Eingangsmail von Hand verschickt. */
export const KENNENLERNEN_VERLAUFSTEXT_ERSTMALS = "Eingangsmail mit dem Kennenlernbogen verschickt.";
export const KENNENLERNEN_VERLAUFSTEXT_ERNEUT = "Eingangsmail mit dem Kennenlernbogen erneut verschickt.";

export async function versendeKennenlernen(
  // deno-lint-ignore no-explicit-any
  admin: any,
  opts: KennenlernVersandOptionen,
): Promise<KennenlernErgebnis> {
  const bewerbungId = String(opts.bewerbungId || "").trim();
  if (!bewerbungId) {
    return { status: 400, koerper: { error: "bewerbungId fehlt" }, versandt: false, grund: "bewerbungId fehlt" };
  }
  const erneutSenden = opts.erneutSenden === true;

  const { data: bewerber, error: leseFehler } = await admin
    .from("bewerbungen")
    .select("id, vorname, nachname, email, meta")
    .eq("id", bewerbungId)
    .maybeSingle();

  if (leseFehler || !bewerber) {
    if (leseFehler) console.error("[kennenlernen-versand] Lesen fehlgeschlagen", leseFehler);
    return {
      status: 404,
      koerper: {
        error: "Bewerber nicht gefunden",
        ...(leseFehler?.message ? { grund: leseFehler.message } : {}),
      },
      versandt: false,
      grund: leseFehler?.message || "Bewerber nicht gefunden",
    };
  }
  if (!bewerber.email) {
    return {
      status: 200,
      koerper: { ok: false, grund: "Am Bewerber steht keine E-Mail-Adresse." },
      versandt: false,
      grund: "Am Bewerber steht keine E-Mail-Adresse.",
    };
  }

  /*
   * Bereits eingereicht? Dann nicht versehentlich erneut einladen. Es zaehlen
   * nur Zeilen des neuen Kennenlernens, und eine ausdrueckliche Wiederholung
   * aus dem CRM hebt die Sperre auf.
   */
  const { data: vorhanden } = await admin
    .from("bewerber_formular")
    .select("id, status, antworten")
    .eq("bewerbung_id", bewerbungId);

  const schonAusgefuellt = (vorhanden || []).some(
    (f: { status?: string; antworten?: unknown }) =>
      f.status === "eingereicht" && istKennenlernZeile(f.antworten),
  );

  if (schonAusgefuellt && !erneutSenden) {
    return {
      status: 200,
      koerper: {
        ok: false,
        grund: "Das Kennenlernen ist schon ausgefüllt.",
        bereitsAusgefuellt: true,
      },
      versandt: false,
      grund: "Das Kennenlernen ist schon ausgefüllt.",
    };
  }

  /*
   * Ein noch gueltiger Link wird wiederverwendet, statt ihn zu ersetzen.
   * Ersetzt wird erst nach erfolgreichem Versand, weiter unten. Und
   * wiederverwendet wird nur eine Zeile des NEUEN Bogens, sonst landet der
   * Bewerber im alten Vorabbogen.
   */
  const jetztIso = new Date().toISOString();
  const { data: nochGueltig } = await admin
    .from("bewerber_formular")
    .select("id, token, expires_at, antworten")
    .eq("bewerbung_id", bewerbungId)
    .eq("status", "offen")
    .eq("antworten->>bogen", "kennenlernen")
    .gt("expires_at", jetztIso)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (nochGueltig?.token) {
    console.log("[kennenlernen-versand] Vorhandener Link wird wiederverwendet", nochGueltig.id);
  }

  const ablauf = new Date(Date.now() + KENNENLERNEN_GUELTIG_TAGE * 24 * 3600 * 1000);
  const { data: angelegt, error: anlegeFehler } = nochGueltig?.token
    ? { data: nochGueltig, error: null }
    : await admin
      .from("bewerber_formular")
      .insert({
        bewerbung_id: bewerbungId,
        vorname: bewerber.vorname || "",
        expires_at: ablauf.toISOString(),
        // Kennzeichen des neuen Bogens, schon beim Anlegen gesetzt, damit der
        // alte Erinnerungslauf diese Zeile nicht mitnimmt. `ohneMail` sagt,
        // dass hier nur ein Link entstand und keine Mail hinausging.
        antworten: {
          bogen: "kennenlernen",
          ...(opts.nurLink === true && opts.ohneMail === true ? { ohneMail: true } : {}),
        },
      })
      .select("id, token")
      .single();

  if (anlegeFehler || !angelegt) {
    console.error("[kennenlernen-versand] Anlegen fehlgeschlagen", anlegeFehler);
    return {
      status: 500,
      koerper: {
        error: "Anlegen fehlgeschlagen",
        grund: anlegeFehler?.message || "Der Link konnte nicht angelegt werden.",
      },
      versandt: false,
      grund: anlegeFehler?.message || "Der Link konnte nicht angelegt werden.",
    };
  }

  const hrKontakt = await hrAnsprechpartner(admin as never);
  const link = `${KENNENLERNEN_BASIS_URL}/${angelegt.token}`;

  /*
   * `nurLink` liefert den Link zurueck, ohne eine Mail zu verschicken.
   * Gebraucht vom Sammelversand, der seine eigene Mail schreibt.
   */
  if (opts.nurLink === true) {
    return { status: 200, koerper: { ok: true, link, formularId: angelegt.id }, versandt: false };
  }

  /*
   * Die Zaehlmarke am Link, seit dem 26.09.2026 statt des Zaehlpixels. Der
   * Eintrag entsteht VOR dem Versand, denn sein Token gehoert an den Link.
   * Scheitert er, geht der nackte Link hinaus. Die Marke gehoert nur in die
   * Mail, nicht an `link` oben: Der geht auch in die Akte und an den
   * Sammelversand.
   */
  const mailLink = await linkMitZaehlung(admin, bewerbungId, MAIL_KENNENLERNEN, link);

  const versand = await sendeVorlage(admin, {
    templateName: "bewerber-kennenlernen-einladung",
    recipientEmail: bewerber.email,
    /*
     * Der Schluessel traegt den Tag mit, damit ein Nachfassen am naechsten Tag
     * durchgeht, ein doppelter Klick heute aber nicht.
     *
     * Bei einer ausdruecklichen Wiederholung aus dem CRM zaehlt die Minute:
     * Kam die Mail am selben Tag ueber den automatischen Eingang und landete
     * im Spam, muss HR sie sofort noch einmal hinausbekommen. Mit dem
     * Tagesschluessel haette die Warteschlange den zweiten Versand
     * stillschweigend verworfen und die Akte trotzdem „Mail ist raus" gemeldet.
     */
    idempotencyKey: erneutSenden
      ? `bewerber-kennenlernen-einladung-${angelegt.id}-erneut-${jetztIso.slice(0, 16)}`
      : `bewerber-kennenlernen-einladung-${angelegt.id}-${jetztIso.slice(0, 10)}`,
    templateData: {
      ...(hrKontakt ? { hrKontakt } : {}),
      bewerberName: `${bewerber.vorname || ""} ${bewerber.nachname || ""}`.trim(),
      kennenlernenLink: mailLink,
      gueltigTage: KENNENLERNEN_GUELTIG_TAGE,
    },
    // Absender und Antwortadresse (die Ansprechpartnerin) setzt
    // send-transactional-email fuer alle Bewerbermails an einer Stelle,
    // siehe _shared/bewerber-absender.ts.
  });

  if (!versand.ok) {
    console.error("[kennenlernen-versand] Versand fehlgeschlagen", versand.grund);
  }

  /*
   * Erst jetzt, nach dem Versand, werden aeltere offene Boegen
   * zurueckgezogen, und nur wenn die Mail wirklich hinausging. Der gerade
   * verschickte Bogen bleibt ausdruecklich stehen.
   */
  if (versand.ok) {
    await admin
      .from("bewerber_formular")
      .update({ status: "ersetzt" })
      .eq("bewerbung_id", bewerbungId)
      .eq("status", "offen")
      .neq("id", angelegt.id);

    // Wurde der Link vorher nur fuer die Akte erzeugt, ist er jetzt wirklich
    // verschickt: Das Kennzeichen faellt weg, Liste und Akte zaehlen die Mail.
    const bisherigeAntworten = (nochGueltig?.antworten && typeof nochGueltig.antworten === "object"
      ? nochGueltig.antworten
      : {}) as Record<string, unknown>;
    if (nochGueltig?.token && bisherigeAntworten.ohneMail === true) {
      const { ohneMail: _o, ...ohneKennzeichen } = bisherigeAntworten;
      await admin
        .from("bewerber_formular")
        .update({ antworten: ohneKennzeichen })
        .eq("id", angelegt.id);
    }
  }

  /*
   * Den Versand am Bewerber vermerken. Ein alter Fehlergrund darf einen
   * gelungenen Versand nicht ueberleben.
   */
  const meta = (bewerber.meta || {}) as Record<string, unknown>;
  const altesKennenlernen = (typeof meta.kennenlernen === "object" && meta.kennenlernen
    ? meta.kennenlernen
    : {}) as Record<string, unknown>;
  const { versandGrund: _g, versandVersuchAm: _v, ...ohneAltenFehler } = altesKennenlernen;
  const bisherigesKennenlernen = versand.ok ? ohneAltenFehler : altesKennenlernen;
  const versandZeit = new Date().toISOString();

  /*
   * War schon einmal eine Einladung hinaus? Dann ist dieser Versand eine
   * Wiederholung und wird als solche gezaehlt, gleich ob HR sie ausdrueck-
   * lich angefordert hat oder ob der Link nur noch einmal hinausging.
   */
  const warSchonVerschickt = typeof altesKennenlernen.gesendetAm === "string" && altesKennenlernen.gesendetAm !== "";
  const bisherErneut = Number(altesKennenlernen.erneutGesendet ?? 0);
  const erneutGesendet = versand.ok && warSchonVerschickt
    ? (Number.isFinite(bisherErneut) ? bisherErneut : 0) + 1
    : (Number.isFinite(bisherErneut) ? bisherErneut : 0);

  /*
   * Der Verlaufseintrag in der Akte, nur beim Versand von Hand. Der
   * automatische Eingang schreibt keinen: Dort steht schon die Bewerbung
   * selbst, und ein zweiter Eintrag zur selben Minute sagt nichts Neues.
   */
  const notizenLog = Array.isArray(meta.notizenLog) ? meta.notizenLog : [];
  const verlaufsEintrag = opts.ausgeloestVon && versand.ok
    ? [{
        id: crypto.randomUUID(),
        text: warSchonVerschickt ? KENNENLERNEN_VERLAUFSTEXT_ERNEUT : KENNENLERNEN_VERLAUFSTEXT_ERSTMALS,
        datum: versandZeit,
        autor: opts.ausgeloestVon.name,
        autorId: opts.ausgeloestVon.id,
      }]
    : [];

  await admin
    .from("bewerbungen")
    .update({
      meta: {
        ...meta,
        ...(verlaufsEintrag.length > 0 ? { notizenLog: [...verlaufsEintrag, ...notizenLog] } : {}),
        kennenlernen: {
          ...bisherigesKennenlernen,
          formularId: angelegt.id,
          gesendetAm: versandZeit,
          versandOk: versand.ok,
          ...(opts.ausgeloestVon
            ? { gesendetVon: opts.ausgeloestVon.name, gesendetVonId: opts.ausgeloestVon.id }
            : {}),
          erneutGesendet,
          ...(versand.ok && warSchonVerschickt ? { erneutGesendetAm: versandZeit } : {}),
          ...(versand.ok
            ? {}
            : { versandGrund: versand.grund || "", versandVersuchAm: versandZeit }),
        },
      },
    })
    .eq("id", bewerbungId);

  return {
    status: 200,
    koerper: {
      ok: true,
      id: angelegt.id,
      link,
      versandt: versand.ok,
      ...(versand.ok ? {} : { versandGrund: versand.grund || "" }),
    },
    versandt: versand.ok,
    ...(versand.ok ? {} : { grund: versand.grund || "" }),
    token: String(angelegt.token || ""),
  };
}
