/**
 * Der Wortlaut der Datenschutzerklärung, Deutsch und Englisch.
 *
 * INTERNER VERMERK: Entwurf Stand 27.09.2026, anwaltliche Prüfung ausstehend.
 * Verfasst auf Christians Auftrag aus dem, was der Code tatsächlich tut, und
 * überarbeitet nach der Gegenlesung durch Dr. Hellwig (Muss-Liste) und
 * Christians Entscheidungen vom 26. und 27.09.2026. Die Fassung für den Anwalt mit
 * Fragen und Code-Belegen je Abschnitt liegt als Markdown bei Christian
 * (Datenschutzerklaerung_Entwurf_MOREImmo.md). Dieser Vermerk steht bewusst
 * nur hier im Code und nicht auf der Seite.
 *
 * WARUM ALS DATENSTRUKTUR
 *
 * Der Anwalt wird Formulierungen ändern. Dafür soll niemand JSX lesen müssen:
 * Jeder Abschnitt ist eine Liste von Bausteinen (Absatz, Aufzählung, Tabelle,
 * Adresszeilen, Link zu den Cookie-Einstellungen). Gezeichnet wird in
 * `src/components/datenschutz/DatenschutzInhalt.tsx`. Die Nummern der
 * Abschnitte entstehen beim Zeichnen aus der Reihenfolge, deshalb stehen sie
 * nicht im Titel.
 *
 * REGELN FÜR ÄNDERUNGEN
 *
 *   - Deutsch im Sie (Gruppe F), keine Gedankenstriche, in keiner Sprache.
 *   - Beide Sprachen haben dieselben Abschnitte mit denselben `id`s, damit
 *     Sprungmarken wie `/datenschutz#cookies` in beiden Fassungen gehen.
 *   - Keine Platzhalter veröffentlichen. Fehlt eine Angabe, wird der Satz
 *     gestrichen oder allgemein gefasst. Die Seite würde `[Angabe ergänzen]`
 *     gelb hervorheben; `datenschutzTexte.test.ts` schlägt dann fehl.
 *   - Löschfristen nur nennen, wenn der Löschlauf in einer Migration
 *     eingeplant ist (pg_cron) oder die Frist gesetzlich ist. Alles andere
 *     allgemein formulieren.
 *   - Wer den Inhalt ändert, hebt `DATENSCHUTZ_FASSUNG` an.
 */
import { IMPRESSUM_EMAIL, IMPRESSUM_TELEFON } from "./impressumKontakt";
/*
 * Der wesentliche Inhalt der Vereinbarung nach Art. 26 DSGVO (Anlage 4 zum
 * Vertriebspartnervertrag). Wörtlich übernommen, damit Vertrag und
 * Erklärung nie auseinanderlaufen. Die englische Fassung unten ist eine
 * Übersetzung dieses Textes und muss bei jeder Änderung mitgezogen werden.
 */
import { ANLAGE_4_BETROFFENEN_TEXT, ANLAGE_4_BETROFFENEN_TITEL } from "./vertragAnlage4";

/** Interne Fassungskennung, steht im Fuß der Seite. */
export const DATENSCHUTZ_FASSUNG = "2026-09-27e";

/** Adresse für Datenschutzanfragen, so auch in den Einwilligungstexten der Formulare. */
export const DATENSCHUTZ_EMAIL = "datenschutz@more.immo";

/** Markierung für fehlende Angaben. Darf nie veröffentlicht werden, siehe Test. */
export const PLATZHALTER = { de: "[Angabe ergänzen]", en: "[to be completed]" } as const;

export type DatenschutzBaustein =
  | string
  | { liste: string[] }
  | { zeilen: string[] }
  | { tabelle: { kopf: string[]; zeilen: string[][] } }
  | { cookieEinstellungen: string };

export interface DatenschutzUnterabschnitt {
  id: string;
  titel: string;
  inhalt: DatenschutzBaustein[];
}

export interface DatenschutzAbschnitt extends DatenschutzUnterabschnitt {
  unterabschnitte?: DatenschutzUnterabschnitt[];
}

export interface DatenschutzFassung {
  titel: string;
  stand: string;
  inhaltTitel: string;
  abschnitte: DatenschutzAbschnitt[];
}

/** "1", "2", … aus der Position in der Liste. */
export function abschnittNummer(index: number): string {
  return `${index + 1}.`;
}

/* ═══════════════════════════════ DEUTSCH ═══════════════════════════════ */

const de: DatenschutzFassung = {
  titel: "Datenschutzerklärung",
  stand: "Stand: September 2026",
  inhaltTitel: "Inhalt",
  abschnitte: [
    {
      id: "verantwortlicher",
      titel: "Verantwortlicher und Kontakt",
      inhalt: [
        "Verantwortlich für die Verarbeitung Ihrer personenbezogenen Daten auf dieser Website (portal.more.immo), im Kundenportal und in den damit verbundenen Abläufen ist:",
        {
          zeilen: [
            "MOREImmo",
            "Einzelunternehmen, Inhaber: Christian Kurz",
            "Wendelsteinstraße 19",
            "83075 Bad Feilnbach",
            "Deutschland",
            ...(IMPRESSUM_TELEFON ? [`Telefon: ${IMPRESSUM_TELEFON}`] : []),
            `E-Mail: ${IMPRESSUM_EMAIL}`,
          ],
        },
        `Ansprechpartner für den Datenschutz ist der Inhaber Christian Kurz. Für alle Fragen zum Datenschutz und zur Ausübung Ihrer Rechte erreichen Sie uns unter ${DATENSCHUTZ_EMAIL} oder unter der oben genannten Anschrift.`,
      ],
    },
    {
      id: "ueberblick",
      titel: "Überblick und Rechtsgrundlagen",
      inhalt: [
        "Diese Erklärung informiert Besucherinnen und Besucher unserer Website, Interessenten, Kundinnen und Kunden, Bewerberinnen und Bewerber sowie Tippgeber darüber, welche personenbezogenen Daten wir verarbeiten, zu welchem Zweck, auf welcher Rechtsgrundlage, an wen wir sie weitergeben und wie lange wir sie speichern. Die Marketing-Website more.immo ist ein eigenes Angebot mit eigener Datenschutzerklärung.",
        "Wir verarbeiten Daten auf folgenden Rechtsgrundlagen:",
        {
          liste: [
            "Vertrag und vorvertragliche Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO): alles, was für Ihre Anfrage, Ihre Beratung, Ihre Finanzierung, Ihren Kauf oder Ihre Bewerbung nötig ist, etwa die Bearbeitung einer Anfrage, die Selbstauskunft, die Reservierung und das Kundenportal.",
            "Rechtliche Verpflichtung (Art. 6 Abs. 1 lit. c DSGVO), etwa die Identifizierung nach dem Geldwäschegesetz und handels- und steuerrechtliche Aufbewahrungspflichten.",
            "Berechtigtes Interesse (Art. 6 Abs. 1 lit. f DSGVO), etwa für den sicheren Betrieb der Website, die Abwehr von Missbrauch und die Betreuung bestehender Kundinnen und Kunden. Wo wir uns darauf stützen, nennen wir das Interesse im jeweiligen Abschnitt.",
            "Einwilligung (Art. 6 Abs. 1 lit. a DSGVO) dort, wo die Sache freiwillig ist, etwa für Informationen zu weiteren Angeboten per E-Mail und Telefon, Statistik und Marketing im Cookie-Hinweis, die schriftliche Mitschrift eines Videogesprächs, Push-Benachrichtigungen und die freiwilligen Angaben im Kennenlernbogen einer Bewerbung. Eine Einwilligung können Sie jederzeit mit Wirkung für die Zukunft widerrufen.",
            "Speichern und Auslesen von Informationen in Ihrem Browser (§ 25 TDDDG): Was für den von Ihnen gewünschten Dienst unbedingt erforderlich ist, speichern wir nach § 25 Abs. 2 Nr. 2 TDDDG ohne Einwilligung. Alles Weitere nur mit Ihrer Einwilligung nach § 25 Abs. 1 TDDDG.",
          ],
        },
      ],
    },
    {
      id: "hosting",
      titel: "Hosting, Infrastruktur und Sicherheit",
      inhalt: [],
      unterabschnitte: [
        {
          id: "hosting-anbieter",
          titel: "Hosting und Datenbank",
          inhalt: [
            "Diese Website und das Kundenportal werden über die Plattform Lovable (Lovable.dev, Schweden) bereitgestellt. Datenbank, Anmeldung, Dateiablage und die serverseitigen Funktionen laufen in Lovable Cloud, das technisch auf Supabase (Supabase, Inc., USA) aufbaut. Die Datenbank liegt in der Region Frankfurt am Main (EU). Beide Anbieter verarbeiten Daten in unserem Auftrag (Art. 28 DSGVO).",
            "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, soweit die Verarbeitung der Erfüllung eines Vertrags mit Ihnen dient, im Übrigen unser berechtigtes Interesse an einem sicheren und zuverlässigen Betrieb unserer Angebote (Art. 6 Abs. 1 lit. f DSGVO). Zur Wiederherstellung im Fehlerfall bestehen Sicherungskopien, die nur für diesen Zweck genutzt und nach Ablauf ihrer Aufbewahrungszeit gelöscht werden.",
          ],
        },
        {
          id: "hosting-protokolle",
          titel: "Server-Protokolle und Schutz vor Missbrauch",
          inhalt: [
            "Bei jedem Aufruf verarbeiten die Server unseres Hosting-Anbieters technisch notwendige Angaben: IP-Adresse, Datum und Uhrzeit, aufgerufene Adresse, übertragene Datenmenge, Browser und Betriebssystem sowie die zuvor besuchte Seite (Referrer). Diese Angaben dienen der Auslieferung der Seite, der Fehlersuche und der Sicherheit (Art. 6 Abs. 1 lit. f DSGVO).",
            "Um unsere Formulare und Schnittstellen vor automatisierten Massenanfragen zu schützen, zählen wir Anfragen je IP-Adresse (Schutzbremse). Die IP-Adresse wird dafür ungekürzt gespeichert, bei der Anmeldung zusammen mit der eingegebenen E-Mail-Adresse. Eingehende Formularübermittlungen an unsere Schnittstellen protokollieren wir zur Fehlersuche und zur Abwehr von Missbrauch mit IP-Adresse, Browserkennung und dem Inhalt der Übermittlung. Beides speichern wir nur so lange, wie es für diese Zwecke erforderlich ist.",
            "Unser berechtigtes Interesse liegt in der Sicherheit und Verfügbarkeit unserer Dienste und im Schutz Ihrer Daten vor unbefugtem Zugriff.",
          ],
        },
        {
          id: "hosting-verschluesselung",
          titel: "Verschlüsselung",
          inhalt: [
            "Die Website nutzt eine TLS-Verschlüsselung (erkennbar an „https://“ und dem Schloss-Symbol im Browser). Sie schützt Daten, die Sie an uns übermitteln, auf dem Übertragungsweg vor dem Mitlesen durch Dritte.",
          ],
        },
      ],
    },
    {
      id: "cookies",
      titel: "Cookies und Speicher im Browser",
      inhalt: [
        "Auf unseren öffentlichen Seiten fragt ein Hinweis beim ersten Besuch, was im Browser gespeichert werden darf. Es gibt drei Kategorien:",
        {
          liste: [
            "Notwendig (immer aktiv): Anmeldung, Zwischenstand Ihrer Eingaben, Sprachwahl und Ihre Wahl im Cookie-Hinweis. Rechtsgrundlage ist § 25 Abs. 2 Nr. 2 TDDDG und Art. 6 Abs. 1 lit. b bzw. f DSGVO.",
            "Statistik (nur mit Einwilligung): Die Kampagnenkennung, über welche Anzeige oder welchen Link Sie gekommen sind, bleibt 30 Tage im Browser (siehe „Kampagnenkennung und Zählung der Seitenschritte“). Außerdem merkt sich der Browser für die Dauer der Sitzung, dass ein Empfehlungslink bereits gezählt wurde. Rechtsgrundlage ist § 25 Abs. 1 TDDDG und Art. 6 Abs. 1 lit. a DSGVO.",
            "Marketing (nur mit Einwilligung): Ihre allgemeine Wahl zu Marketing. Das Meta Pixel eines Vertriebspartners lädt damit allein nicht; dafür fragen wir auf der Seite des Partners gesondert und nur für diesen Partner (siehe „Meta Pixel und Conversions API“). Rechtsgrundlage ist § 25 Abs. 1 TDDDG und Art. 6 Abs. 1 lit. a DSGVO.",
          ],
        },
        "Ihre Wahl speichern wir mit Zeitpunkt in Ihrem Browser. Sie können sie jederzeit über „Cookie-Einstellungen“ im Fuß der Seite ändern oder eine Einwilligung widerrufen; auf Seiten ohne Fuß finden Sie dafür einen runden Knopf unten links. Wählen Sie „Nur notwendige“ oder schalten Sie Marketing aus, nehmen Sie alle Erlaubnisse für Partner-Pixel zurück, und die Meta-Cookies „_fbp“ und „_fbc“ werden gelöscht; nehmen Sie die Statistik-Einwilligung zurück, verschwindet die gespeicherte Kampagnenkennung.",
        { cookieEinstellungen: "Ihre Auswahl ändern:" },
        "Folgende Einträge können in Ihrem Browser entstehen:",
        {
          tabelle: {
            kopf: ["Name", "Zweck", "Dauer", "Kategorie"],
            zeilen: [
              ["moreimmo.cookie-einwilligung", "Ihre Wahl im Cookie-Hinweis mit Zeitpunkt, einschließlich Ihrer Erlaubnisse je Vertriebspartner", "bis Sie die Wahl ändern oder die Website-Daten löschen; Erlaubnisse je Partner höchstens 13 Monate", "Notwendig"],
              ["moreimmo-seiten-sprache, moreimmo-crm-lang", "Gewählte Sprache", "bis Sie die Website-Daten löschen", "Notwendig"],
              ["mi_lead_funnel_entwurf", "Zwischenstand des Anfrageformulars auf der Seite eines Vertriebspartners", "2 Stunden", "Notwendig"],
              ["hb_ergebnis_frisch (Sitzungsspeicher)", "Ihr Ergebnis auf der Handbuch-Seite, damit es beim Neuladen erhalten bleibt", "bis zum Schließen des Tabs", "Notwendig"],
              ["mi_bewerber_fragebogen_…", "Zwischenstand des Kennenlernbogens für Bewerbungen", "14 Tage", "Notwendig"],
              ["mi_selbstauskunft_… (Sitzungsspeicher)", "Zwischenstand der Selbstauskunft, wenn Sie auf „Zwischenspeichern“ klicken", "bis Sie die Selbstauskunft einreichen, höchstens bis zum Schließen des Tabs", "Notwendig"],
              ["sb-…-auth-token", "Ihre Anmeldung im Kundenportal, dauerhaft im Speicher des Browsers", "bis Sie sich abmelden oder wir die Sitzung beenden: Konten von Kundinnen und Kunden nach 30 Tagen, Konten unserer Mitarbeitenden und Partner jede Nacht um 03:30 Uhr", "Notwendig"],
              ["mi_client_ip (Sitzungsspeicher)", "Nur im CRM und nur bei eingeschalteter IP-Freigabeliste: Ihre öffentliche IP-Adresse für die Zugangsprüfung", "5 Minuten, höchstens bis zum Schließen des Tabs", "Notwendig"],
              ["role_permissions_v1, mi_current_role", "Zwischenspeicher Ihrer Zugriffsrechte nach der Anmeldung", "bis Sie die Website-Daten löschen", "Notwendig"],
              ["videoraum-gast:…, videoraum-kachelreihe (Sitzungsspeicher)", "Ihr Anzeigename und die Ansicht im Videoraum", "bis zum Schließen des Tabs", "Notwendig"],
              ["lazy-route-reload:…, versionshinweis-ausgeblendet (Sitzungsspeicher)", "Laden einer neuen Programmversion", "bis zum Schließen des Tabs", "Notwendig"],
              ["moreimmo.kampagne.v2", "Kampagnenkennung (UTM-Parameter, gclid, fbclid)", "30 Tage", "Statistik"],
              ["tg_klick_… (Sitzungsspeicher)", "Verhindert, dass der Aufruf eines Empfehlungslinks doppelt gezählt wird", "bis zum Schließen des Tabs", "Statistik"],
              ["_fbp, _fbc (Cookies von Meta)", "Meta Pixel auf den Seiten eines Vertriebspartners, nur mit Erlaubnis für diesen Partner", "von Meta festgelegt, bis zu 90 Tage", "Marketing"],
            ],
          },
        },
        "Im angemeldeten Bereich legt die Anwendung außerdem Anzeigeeinstellungen und zwischengespeicherte Daten ab, damit Seiten schnell laden und Ihre Einstellungen erhalten bleiben. Diese Einträge sind für den Betrieb notwendig.",
        "Sie können gespeicherte Website-Daten jederzeit in den Einstellungen Ihres Browsers löschen.",
      ],
    },
    {
      id: "kampagnen",
      titel: "Kampagnenkennung und Zählung der Seitenschritte",
      inhalt: [
        "Kommen Sie über eine Anzeige oder einen Link mit Kampagnenparametern auf unsere Seiten, lesen wir diese Parameter aus der Adresse: utm_source, utm_medium, utm_campaign, utm_content, utm_term sowie die Klickkennungen gclid (Google) und fbclid (Meta). Wir merken uns den ersten und den letzten Kontakt.",
        "Ohne Statistik-Einwilligung bleiben diese Werte nur im Arbeitsspeicher der geöffneten Seite und verschwinden beim Schließen. Mit Einwilligung bleiben sie 30 Tage in Ihrem Browser, damit eine spätere Anfrage der Anzeige noch zugeordnet werden kann.",
        "Senden Sie eine Anfrage ab, speichern wir die Kampagnenkennung zusammen mit Ihrem Kontakt. So sehen wir, welche Werbung zu Anfragen führt. Rechtsgrundlage ist unser berechtigtes Interesse an der Steuerung unserer Werbung (Art. 6 Abs. 1 lit. f DSGVO), für das Speichern im Browser über den Besuch hinaus Ihre Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO). Die Kennung am Kontakt speichern wir so lange wie den Kontakt selbst.",
        "Auf unseren Rechnern, der Handbuch-Seite und den Formularseiten zählen wir zusätzlich, wie viele Besuche welchen Schritt erreichen (etwa „Rechner gestartet“ oder „Ergebnis angezeigt“). Gespeichert werden nur Schritt, Werkzeug, zuständiger Partner, Kampagnenname und Zeitpunkt, keine IP-Adresse und keine Angaben zu Ihrer Person.",
      ],
    },
    {
      id: "meta",
      titel: "Meta Pixel und Conversions API",
      inhalt: [
        "Unsere Vertriebspartner haben persönliche Seiten. Nur dort, nämlich auf seiner Seite unter „/vp/…“ und seiner Handbuch-Seite unter „/handbuch/…“ samt Konfigurator, kann der jeweilige Partner das Meta Pixel der Meta Platforms Ireland Limited, Merrion Road, Dublin 4, D04 X2K5, Irland („Meta“) einsetzen. Auf der Selbstauskunft der Handbuch-Seite und auf Seiten mit einem persönlichen Link, etwa Ihrem Handbuch-Ergebnis oder einer Selbstauskunft, die Sie über einen persönlichen Link öffnen, lädt nie ein Pixel, und von dort melden wir nichts an Meta.",
        "Das Pixel eines Vertriebspartners lädt nur, wenn Sie es auf seiner Seite ausdrücklich für genau diesen Partner erlaubt haben. Ihre allgemeine Wahl zu Marketing im Cookie-Hinweis reicht dafür nicht. Der Cookie-Hinweis auf der Seite nennt den Partner mit Firmenname und Geschäftsanschrift als gemeinsam Verantwortlichen; ist keine Geschäftsanschrift hinterlegt, lädt kein Pixel. Ihre Erlaubnis gilt höchstens 13 Kalendermonate, danach fragen wir erneut.",
        "Mit dieser Erlaubnis melden wir das Absenden Ihrer Anfrage zusätzlich von unserem Server an Meta (Conversions API). Vorher prüft unser Server, ob eine gültige Einwilligung für genau diesen Partner vorliegt. Den Nachweis Ihrer Einwilligung (Fassung des Cookie-Hinweises, Zeitpunkt und Partner) speichern wir an Ihrer Anfrage und schützen ihn gegen nachträgliche Änderung.",
        "Rechtsgrundlage ist Ihre Einwilligung (§ 25 Abs. 1 TDDDG, Art. 6 Abs. 1 lit. a DSGVO). Meta kann Daten in die USA übermitteln; Meta ist unter dem EU-US Data Privacy Framework zertifiziert. Informationen zur Verarbeitung durch Meta finden Sie unter https://www.facebook.com/privacy/policy.",
        "Ihre Einwilligung können Sie jederzeit mit Wirkung für die Zukunft über die Cookie-Einstellungen widerrufen. Wählen Sie dort „Nur notwendige“ oder schalten Sie Marketing aus, nehmen Sie damit die Erlaubnisse für alle Vertriebspartner zurück, und zwar in allen offenen Tabs. Das Pixel sendet ab sofort keine Daten mehr an Meta, und die Meta-Cookies „_fbp“ und „_fbc“ werden gelöscht. Der Widerruf wirkt nicht zurück; Übermittlungen vor dem Widerruf bleiben davon unberührt.",
        { cookieEinstellungen: "Einwilligung widerrufen oder ändern:" },
      ],
      unterabschnitte: [
        {
          id: "meta-gemeinsame-verantwortung",
          titel: ANLAGE_4_BETROFFENEN_TITEL,
          inhalt: [...ANLAGE_4_BETROFFENEN_TEXT],
        },
      ],
    },
    {
      id: "dienste",
      titel: "Eingebundene Dienste Dritter",
      inhalt: [],
      unterabschnitte: [
        {
          id: "dienste-recaptcha",
          titel: "Google reCAPTCHA",
          inhalt: [
            "Unsere Bewerbungsformulare schützen wir mit Google reCAPTCHA v3 vor automatisierten Eingaben. Anbieter ist die Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Irland. Das Skript lädt erst, wenn Sie in ein Feld des Formulars klicken; darauf weisen wir am Formular hin. reCAPTCHA wertet dabei unter anderem IP-Adresse, Browserangaben und Ihr Verhalten auf der Seite aus. Beim Absenden prüft unser Server das Ergebnis bei Google und übermittelt dafür Ihre IP-Adresse.",
            "Rechtsgrundlage ist unser berechtigtes Interesse am Schutz unserer Formulare vor Missbrauch (Art. 6 Abs. 1 lit. f DSGVO). Google kann Daten in die USA übermitteln; Google ist unter dem EU-US Data Privacy Framework zertifiziert. Weitere Informationen: https://policies.google.com/privacy",
          ],
        },
        {
          id: "dienste-calendly",
          titel: "Calendly",
          inhalt: [
            "Auf einigen Terminseiten für Partner und Bewerbungen können Sie einen Termin über Calendly buchen (Calendly LLC, USA). Der Kalender lädt erst, wenn Sie ihn per Klick freigeben (Zwei-Klick-Lösung). Diese Freigabe gilt nur, bis Sie die Seite schließen, gespeichert wird sie nicht. Erst dann werden Daten wie Ihre IP-Adresse und die Angaben, die Sie bei der Buchung eingeben, an Calendly übertragen.",
            "Rechtsgrundlage ist Ihre Einwilligung durch den Klick (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG) sowie die Durchführung der gewünschten Terminbuchung (Art. 6 Abs. 1 lit. b DSGVO). Zur Übermittlung in die USA siehe „Übermittlung in Drittländer“. Weitere Informationen: https://calendly.com/privacy",
          ],
        },
        {
          id: "dienste-karten",
          titel: "Karten und Adresssuche (OpenStreetMap)",
          inhalt: [
            "In Exposés und Objektansichten zeigen wir die Lage einer Immobilie auf einer Karte. Die Kartenkacheln lädt Ihr Browser direkt von Servern der OpenStreetMap Foundation (St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, Vereinigtes Königreich). Dabei erhält die OpenStreetMap Foundation Ihre IP-Adresse und Browserangaben.",
            "In der Selbstauskunft schlagen wir Ihnen beim Eintippen der Straße passende Adressen vor. Dafür sendet Ihr Browser die bisher eingegebene Adresse an den Suchdienst Nominatim der OpenStreetMap Foundation.",
            "Im CRM verorten unsere Mitarbeitenden außerdem Adressen: Für die Übersichtskarte im Marketing gehen die Anschriften von Kundinnen und Kunden an den Suchdienst Nominatim der OpenStreetMap Foundation, um sie auf der Karte zu zeigen. Für die Objektempfehlung gehen Postleitzahl und Ort Ihres Wohnorts an den Suchdienst Photon der komoot GmbH (Deutschland); die ermittelte Koordinate speichern wir gerundet an Ihrem Investment, um passende Objekte in Ihrer Nähe vorzuschlagen.",
            "Rechtsgrundlage ist unser berechtigtes Interesse an einer anschaulichen Darstellung der Lage, an korrekten Adressangaben und an passenden Objektvorschlägen (Art. 6 Abs. 1 lit. f DSGVO). Für das Vereinigte Königreich besteht ein Angemessenheitsbeschluss der EU-Kommission. Weitere Informationen: https://osmfoundation.org/wiki/Privacy_Policy",
          ],
        },
        {
          id: "dienste-schriften",
          titel: "Schriftarten",
          inhalt: [
            "Die Schriftarten dieser Website liefern wir von unseren eigenen Servern aus. Beim Aufruf der Seite wird dafür keine Verbindung zu Servern von Google oder anderen Schriftanbietern hergestellt.",
          ],
        },
        {
          id: "dienste-youtube",
          titel: "Videos im CRM (YouTube)",
          inhalt: [
            "Im angemeldeten Bereich zeigen wir auf der News-Seite gelegentlich Videos von YouTube (Google Ireland Limited). Ein Video lädt erst, wenn Sie auf „Video laden“ klicken; vorher wird keine Verbindung zu Google hergestellt. Nach dem Klick lädt es über youtube-nocookie.com, dabei erhält Google Ihre IP-Adresse und Angaben zu Ihrem Browser. Rechtsgrundlage ist Ihre Einwilligung durch den Klick (Art. 6 Abs. 1 lit. a DSGVO, § 25 Abs. 1 TDDDG). Weitere Informationen: https://policies.google.com/privacy",
          ],
        },
        {
          id: "dienste-ipfreigabe",
          titel: "IP-Freigabeliste im CRM",
          inhalt: [
            "Zum Schutz des CRM kann die Verwaltung eine Liste freigegebener IP-Adressen einschalten. Nur dann fragt Ihr Browser nach der Anmeldung seine öffentliche IP-Adresse beim Dienst ipify (api.ipify.org) ab, damit wir sie mit der Liste vergleichen können. Die Adresse merkt sich der Browser höchstens 5 Minuten im Sitzungsspeicher (mi_client_ip). Rechtsgrundlage ist unser berechtigtes Interesse am Schutz der Daten im CRM vor unbefugtem Zugriff (Art. 6 Abs. 1 lit. f DSGVO).",
          ],
        },
        {
          id: "dienste-passwort",
          titel: "Prüfung auf bekannte Passwörter",
          inhalt: [
            "Wenn Sie ein Passwort festlegen, prüfen wir, ob es in bekannten Datenlecks vorkommt. Dafür sendet Ihr Browser nur die ersten fünf Zeichen eines Hashwerts Ihres Passworts an den Dienst „Pwned Passwords“ (https://haveibeenpwned.com). Ihr Passwort selbst wird dabei nicht an diesen Dienst übertragen. Rechtsgrundlage ist unser berechtigtes Interesse an der Sicherheit Ihres Kontos (Art. 6 Abs. 1 lit. f DSGVO).",
          ],
        },
      ],
    },
    {
      id: "anfragen",
      titel: "Anfragen, Lead-Formulare und Zuständigkeit",
      inhalt: [],
      unterabschnitte: [
        {
          id: "anfragen-formulare",
          titel: "Formulare auf unseren Seiten",
          inhalt: [
            "Wenn Sie über ein Formular auf unseren Seiten eine Beratung, eine Auswertung oder Informationen anfordern (etwa auf der Seite eines Vertriebspartners, im Steuerrechner, in der Analyse, im EXPATS Calculator oder auf der Handbuch-Seite), verarbeiten wir:",
            {
              liste: [
                "Vorname, Nachname, E-Mail-Adresse und Telefonnummer, bei einigen Formularen auch Anschrift",
                "Ihre Antworten im Formular, etwa Beruf, Einkommen, Eigenkapital, Ziele, gewünschter Zeitrahmen und bevorzugte Kontaktzeit",
                "den Vertriebspartner oder Tippgeber, über dessen Link Sie gekommen sind, und die Kampagnenkennung",
                "Ihre Erklärungen im Formular mit Zeitpunkt, Fassung und Wortlaut sowie die gewählte Sprache",
              ],
            },
            "Rechtsgrundlage für die Bearbeitung Ihrer Anfrage ist die Durchführung vorvertraglicher Maßnahmen (Art. 6 Abs. 1 lit. b DSGVO). Für Informationen zu weiteren Angeboten per E-Mail und Telefon ist Rechtsgrundlage Ihre gesonderte, freiwillige Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die Sie jederzeit widerrufen können, etwa per E-Mail an " + DATENSCHUTZ_EMAIL + ".",
            "Wenden Sie sich schon einmal an uns, ordnen wir die neue Anfrage Ihrem bestehenden Kontakt zu. Unsere Formulare enthalten ein für Menschen unsichtbares Feld und zählen Anfragen je IP-Adresse, um automatisierte Eingaben abzuwehren (siehe „Server-Protokolle und Schutz vor Missbrauch“).",
          ],
        },
        {
          id: "anfragen-partner",
          titel: "Bearbeitung durch unsere Vertriebspartner",
          inhalt: [
            "Unsere Beratung erfolgt über Vertriebspartner, die als selbstständige Handelsvertreter für uns tätig sind. Ihre Anfrage ordnen wir dem Partner zu, über dessen Link Sie gekommen sind, sonst einem Partner, den wir auswählen. Der Partner bearbeitet Ihre Anfrage in unserem Auftrag und nach unseren Weisungen (Art. 28 DSGVO) und sieht dafür Ihren Namen, Ihre Kontaktdaten, Ihren Ort, die Quelle der Anfrage und Ihre Angaben im Formular. Rechtsgrundlage ist die Durchführung vorvertraglicher Maßnahmen auf Ihre Anfrage (Art. 6 Abs. 1 lit. b DSGVO).",
            "Hat ein Vertriebspartner Sie selbst als eigenen Kontakt in unserem System angelegt, ist er für diese Daten selbst verantwortlich; wir stellen ihm dafür nur das System bereit. Anfragen dazu, die uns erreichen, leiten wir an ihn weiter.",
          ],
        },
        {
          id: "anfragen-extern",
          titel: "Anfragen über Werbeanzeigen und Partnerwebsites",
          inhalt: [
            "Anfragen, die Sie in einem Formular einer Werbeanzeige auf Facebook oder Instagram (Meta Lead Ads) oder auf einer Website eines Kooperationspartners abschicken, erreichen uns über den Automatisierungsdienst Zapier (Zapier, Inc., USA) oder direkt über unsere Schnittstelle. Wir verarbeiten sie wie eine Anfrage über unsere eigenen Formulare. Welche Angaben dort abgefragt werden, sehen Sie im jeweiligen Formular; für die Verarbeitung bei Meta gilt die Datenrichtlinie von Meta. Zapier verarbeitet die Daten in unserem Auftrag. Zur Übermittlung in die USA siehe „Übermittlung in Drittländer“.",
          ],
        },
        {
          id: "anfragen-objekt",
          titel: "Angebot einer Immobilie",
          inhalt: [
            "Über das Formular zur Objekt-Akquise können Eigentümerinnen und Eigentümer oder Vermittler uns eine Immobilie anbieten. Wir verarbeiten dabei die Angaben zum Objekt, Name, Geburtsdatum, Kontaktdaten und Familienstand der Eigentümer, gegebenenfalls Bankverbindung und Handelsregisterangaben sowie den Namen der vermittelnden Person, um das Angebot zu prüfen und einen Ankauf vorzubereiten (Art. 6 Abs. 1 lit. b DSGVO).",
          ],
        },
        {
          id: "anfragen-zusammenfuehren",
          titel: "Doppelte Einträge",
          inhalt: [
            "Entstehen für dieselbe Person versehentlich zwei Einträge in unserem System, führen wir sie zusammen. Der ältere Eintrag bleibt bestehen, Angaben, Unterlagen und Verlauf des jüngeren werden übernommen, und der jüngere Eintrag kommt in den Papierkorb. Abweichende Angaben halten wir im Verlauf fest. Rechtsgrundlage ist unser berechtigtes Interesse an einem richtigen und vollständigen Datenbestand (Art. 6 Abs. 1 lit. f DSGVO in Verbindung mit Art. 5 Abs. 1 lit. d DSGVO).",
          ],
        },
      ],
    },
    {
      id: "handbuch",
      titel: "Handbuch-Seite mit Konfigurator",
      inhalt: [
        "Auf der Handbuch-Seite können Sie ein persönliches Handbuch zur Kapitalanlage-Immobilie anfordern. Dafür beantworten Sie sechs Fragen zu Ziel, beruflicher Situation, Jahresbrutto, monatlichem Überschuss, Eigenkapital und gewünschtem Start, jeweils durch Auswahl einer Spanne. Anschließend geben Sie Vor- und Nachnamen und E-Mail-Adresse an, die Telefonnummer ist freiwillig.",
        "Aus Ihren Antworten berechnen wir einen unverbindlichen Rahmen als Modellrechnung und eine Einordnung in drei Stufen („passt“, „passt vielleicht“, „passt noch nicht“). Jede Person erhält ihr Handbuch unabhängig von dieser Einordnung. Wir nutzen sie nur, um zu entscheiden, wen unsere Partner zuerst ansprechen (siehe „Automatisierte Entscheidungen und Profiling“).",
        "Ihr Handbuch erhalten Sie per E-Mail als persönlichen Link, der 30 Tage gültig ist. Wir halten fest, ob und wann der Link aufgerufen wird. Zusätzlich legen wir einen persönlichen Link zur Selbstauskunft an, vorausgefüllt mit Ihren Angaben, damit Sie auf Wunsch direkt weitermachen können. Die Mail kommt im Namen des für Sie zuständigen Vertriebspartners, Antworten gehen an ihn.",
        "Über die Handbuch-Seite können Sie außerdem direkt eine Selbstauskunft beginnen, ohne zuvor ein Handbuch anzufordern. Dafür geben Sie zunächst Ihre Kontaktdaten an. Ist Ihre E-Mail-Adresse bei uns noch nicht bekannt, geht es sofort weiter ins Formular, und Sie erhalten den Link zusätzlich per E-Mail. Ist sie bereits bekannt, schicken wir den Link ausschließlich an diese Adresse, damit niemand über eine fremde Adresse an fremde Angaben gelangt.",
        "Damit über die Formulare keine fremde Adresse mit Mails überhäuft werden kann, begrenzen wir die Zahl der Anforderungen je E-Mail-Adresse. Dafür speichern wir nur einen Hashwert der Adresse. Die Schritte auf der Seite zählen wir ohne Personenbezug (siehe „Kampagnenkennung und Zählung der Seitenschritte“).",
        "Rechtsgrundlage ist die Durchführung vorvertraglicher Maßnahmen auf Ihre Anfrage (Art. 6 Abs. 1 lit. b DSGVO), für Informationen zu weiteren Angeboten Ihre gesonderte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Die Bearbeitung durch den zuständigen Vertriebspartner richtet sich nach dem Abschnitt „Anfragen, Lead-Formulare und Zuständigkeit“.",
      ],
    },
    {
      id: "rechner",
      titel: "Steuerrechner, Analyse und weitere Rechner",
      inhalt: [
        "Im Steuerrechner geben Sie Jahresbrutto, Beschäftigung, Steuerklasse, gegebenenfalls das Brutto Ihrer Partnerin oder Ihres Partners, Kinder, Bundesland, Kirchensteuerpflicht, bestehende Immobilien und den gewünschten Startzeitpunkt an. Die Angabe zur Kirchensteuer speichern wir nicht an Ihrem Kontakt im CRM; sie fließt aber in Ihre PDF-Auswertung ein, in der die Kirchensteuer als eigener Posten erscheint, wenn sie anfällt. In der Analyse fragen wir unter anderem Alter, Familienstand, Haushalt, Beruf, Nettoeinkommen, Eigenkapital, Kredite, Fixkosten, Erfahrung und Ziele ab. Im EXPATS Calculator geben Sie Eigenkapital, Brutto und Familienstand an.",
        "Die Berechnung läuft in Ihrem Browser. Wenn Sie Ihr Ergebnis anfordern, speichern wir Ihre übrigen Eingaben und das Ergebnis zusammen mit Ihrem Kontakt, damit Ihr Ansprechpartner Sie dazu beraten kann. Die Auswertung des Steuerrechners erhalten Sie als PDF per E-Mail; versandt wird sie über unseren Versanddienst Mailgun (siehe „Versand unserer E-Mails“). Das PDF legen wir in einem nicht öffentlichen Speicher ab; der Link darauf ist 90 Tage gültig.",
        "Rechtsgrundlage ist die Durchführung vorvertraglicher Maßnahmen auf Ihre Anfrage (Art. 6 Abs. 1 lit. b DSGVO), für Informationen zu weiteren Angeboten Ihre gesonderte Einwilligung (Art. 6 Abs. 1 lit. a DSGVO).",
      ],
    },
    {
      id: "termine",
      titel: "Terminbuchung, Videoberatung und Zoom",
      inhalt: [],
      unterabschnitte: [
        {
          id: "termine-buchung",
          titel: "Terminbuchung",
          inhalt: [
            "Über einen persönlichen oder öffentlichen Buchungslink können Sie einen Termin mit uns buchen. Wir verarbeiten dabei Name, E-Mail-Adresse, freiwillig Telefonnummer und Nachricht, den gewählten Termin sowie auf Wunsch Name und E-Mail-Adresse einer Begleitperson. Buchen Sie über einen öffentlichen Link, legen wir dafür einen Kontakt an. Sie und der zuständige Ansprechpartner erhalten eine Bestätigung per E-Mail, dazu Erinnerungen vor dem Termin. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Wenn Sie eine Begleitperson angeben, stellen Sie bitte sicher, dass sie damit einverstanden ist.",
          ],
        },
        {
          id: "termine-videoraum",
          titel: "Eigener Videoraum",
          inhalt: [
            "Videoberatungen und Gespräche mit Bewerberinnen und Bewerbern führen wir in unserem eigenen Videoraum im Browser (WebRTC). Bild und Ton gehen verschlüsselt und nach Möglichkeit direkt zwischen den Geräten der Teilnehmenden. Ist keine direkte Verbindung möglich, laufen sie verschlüsselt über einen Weiterleitungsserver (TURN). Die Daten zum Aufbau der Verbindung laufen über unsere Infrastruktur. Damit sich die Geräte finden, fragen sie öffentliche Vermittlungsserver (STUN) von Google und Cloudflare (Cloudflare, Inc., USA) nach ihrer öffentlichen IP-Adresse; diese Anbieter erhalten dabei Ihre IP-Adresse.",
            "Gespräche werden nicht aufgezeichnet, weder Bild noch Ton. Der Chat im Videoraum wird nicht gespeichert.",
            "Die Gastgeberin oder der Gastgeber kann eine schriftliche Mitschrift starten, aber nur, nachdem die Gäste zugestimmt haben. Sie sehen dann im Raum den Hinweis, dass mitgeschrieben wird. Die Spracherkennung läuft vollständig im Browser der Gastgeberin oder des Gastgebers; es wird kein Ton an einen externen Dienst geschickt. Gespeichert wird nur der Text, und zwar so lange, wie es für die Betreuung erforderlich ist.",
            "Rechtsgrundlage ist die Durchführung des gewünschten Gesprächs (Art. 6 Abs. 1 lit. b DSGVO), für die Mitschrift Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO). Die Räume selbst löschen wir 90 Tage nach ihrem Ablauf.",
          ],
        },
        {
          id: "termine-zoom",
          titel: "Zoom",
          inhalt: [
            "Unsere wöchentliche Vertriebsrunde mit den Vertriebspartnern (Weekly Sales Call) findet über Zoom statt (Zoom Communications, Inc., USA). Nehmen Sie teil, verarbeitet Zoom Ihre Verbindungs- und Gerätedaten sowie Bild und Ton. Wir zeichnen Zoom-Gespräche nicht auf. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO. Zoom verarbeitet Daten in unserem Auftrag und ist unter dem EU-US Data Privacy Framework zertifiziert. Weitere Informationen: https://explore.zoom.us/de/privacy/",
          ],
        },
      ],
    },
    {
      id: "selbstauskunft",
      titel: "Selbstauskunft und Finanzierung",
      inhalt: [
        "Für die Prüfung Ihrer Finanzierungsmöglichkeiten füllen Sie eine Selbstauskunft aus, gegebenenfalls auch für eine zweite Person. Dabei verarbeiten wir:",
        {
          liste: [
            "Stammdaten: Anrede, Titel, Name, Geburtsname, Geburtsdatum, Staatsangehörigkeit, Anschrift, Kontaktdaten, Familienstand, Güterstand, Kinder, Steuer-Identifikationsnummer und Steuerklasse",
            "die Angabe, ob Sie kirchensteuerpflichtig sind",
            "Beruf: Beschäftigungsart, Arbeitgeber oder selbstständige Tätigkeit",
            "Finanzen: Einkommen, Ausgaben, Kredite, Vermögen, Bürgschaften, Immobilien, Bankverbindungen, Versicherungen und Unterhalt",
            "Angaben zur Bonität, etwa zu Mahnverfahren und zu Ihrer SCHUFA-Auskunft, soweit Sie diese angeben",
            "hochgeladene Unterlagen, etwa Gehaltsabrechnungen, Steuerbescheide, Kontoauszüge und Ihr Ausweis",
            "Ihre digitale Unterschrift (siehe „Digitale Unterschrift“)",
          ],
        },
        "Die Verarbeitung dient der Prüfung, ob und wie ein Immobilienkauf für Sie finanzierbar ist, und der Vorbereitung einer Finanzierung (Art. 6 Abs. 1 lit. b DSGVO). Nach der Unterschrift übernehmen wir Ihre Stammdaten in Ihr Kundenprofil und erstellen ein PDF der Selbstauskunft.",
        "Die Angabe, ob Sie kirchensteuerpflichtig sind, ist eine Pflichtangabe der Selbstauskunft. Banken benötigen sie, um bei der Finanzierungsprüfung Ihr verfügbares Nettoeinkommen und Ihre Steuerbelastung zu berechnen. Wir fragen nur ab, ob Kirchensteuer anfällt, nicht Ihre Konfession. Weil die Angabe Rückschlüsse auf eine Religionszugehörigkeit zulassen kann, verwenden wir sie ausschließlich für die Prüfung und Vorbereitung Ihrer Finanzierung und geben sie nur an den für Sie zuständigen Vertriebspartner, unseren Finanzierungspartner und die finanzierende Bank weiter. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.",
        "Ihre Selbstauskunft und Unterlagen sehen der für Sie zuständige Vertriebspartner und, sobald Ihre Bonitätsunterlagen freigegeben sind, unser Finanzierungspartner, der Ihre Finanzierung vorbereitet. An ein finanzierendes Kreditinstitut oder einen Finanzierungsvermittler geben wir Ihre Daten weiter, soweit Sie uns mit der Vorbereitung Ihrer Finanzierung beauftragen (Art. 6 Abs. 1 lit. b DSGVO). Die in der Selbstauskunft enthaltene SCHUFA-Klausel berechtigt allein die finanzierende Bank, Daten an die SCHUFA zu übermitteln und Auskünfte einzuholen; MOREImmo selbst holt keine SCHUFA-Auskunft ein.",
        "Den persönlichen Link zum Ausfüllen löschen wir sieben Tage nach seinem Ablauf. Klicken Sie auf „Zwischenspeichern“, bleibt der Zwischenstand in Ihrem Browser, bis Sie die Website-Daten löschen. Nutzen Sie dafür bitte kein fremdes oder gemeinsam genutztes Gerät.",
      ],
    },
    {
      id: "reservierung",
      titel: "Reservierung, Kaufabwicklung und digitale Unterschrift",
      inhalt: [],
      unterabschnitte: [
        {
          id: "reservierung-daten",
          titel: "Reservierungsvereinbarung",
          inhalt: [
            "Für die Reservierung einer Immobilie verarbeiten wir:",
            {
              liste: [
                "Vorname, Nachname, Geburtsname, Geburtsdatum und freiwillig Geburtsort, Staatsangehörigkeit, Anschrift, Telefonnummer, E-Mail-Adresse und Güterstand",
                "freiwillig Ihre Bankverbindung (IBAN) für die Rückzahlung einer Reservierungsgebühr",
                "Angaben zum gewünschten Objekt (Wohneinheit, Stellplatz oder Garage, Adresse, Kaufpreis) und zu den Verkäufern",
                "beim Kauf eines ganzen Hauses durch eine Gesellschaft zusätzlich Firma, Rechtsform, Anschrift, Registergericht und Registernummer sowie die Funktion der vertretenden Person",
                "ob Sie zur Beurkundung eine Dolmetscherin oder einen Dolmetscher benötigen und in welcher Sprache, die Vertragssprache und freiwillige Angaben im Freitext",
                "Ihre Wahl zum Beginn der Reservierung (sofort oder nach Ablauf der Widerrufsfrist)",
                "Ihre digitale Unterschrift mit Zeitpunkt und, sofern angegeben, Ort",
              ],
            },
            "Die Verarbeitung dient der Vorbereitung und Durchführung des Kaufs (Art. 6 Abs. 1 lit. b DSGVO). Nach der letzten Unterschrift erhalten Sie die Vereinbarung einschließlich Widerrufsbelehrung als PDF per E-Mail; das Dokument liegt zudem in Ihrem Kundenprofil. Der zuständige Vertriebspartner und unsere Geschäftsführung werden über die Unterschrift informiert.",
            "Zur Durchführung der Reservierung und des Kaufs übermitteln wir die erforderlichen Daten an die Verkäufer des Objekts, das beauftragte Notariat, das finanzierende Kreditinstitut und nach der Beurkundung an die Hausverwaltung des Objekts (Art. 6 Abs. 1 lit. b DSGVO). Für die Vorbereitung des Kaufvertrags füllen wir mit Ihnen einen Notarbogen aus, den wir an das Notariat übermitteln.",
          ],
        },
        {
          id: "reservierung-unterschrift",
          titel: "Digitale Unterschrift",
          inhalt: [
            "Selbstauskunft, Reservierung und weitere Dokumente unterschreiben Sie digital auf dem Bildschirm, auf Wunsch auch mit dem Handy. Wir speichern dabei das Bild Ihrer Unterschrift, den Zeitpunkt der Unterschrift, den Zeitpunkt, zu dem Sie den Link geöffnet haben, die Browserkennung Ihres Geräts (User-Agent), bei der Reservierung freiwillig den Ort und den Wortlaut der Erklärung, die Sie unterschrieben haben. Ihre IP-Adresse speichern wir dabei nicht.",
            "Die Angaben dienen dem Nachweis, dass und wann Sie unterschrieben haben (Art. 6 Abs. 1 lit. b und f DSGVO). Unterschriftslinks sind 14 Tage gültig. Die Anfrage zur Unterschrift löschen wir 180 Tage nach Ablauf des Links; das unterschriebene Dokument bewahren wir nach den gesetzlichen Fristen auf.",
          ],
        },
      ],
    },
    {
      id: "geldwaesche",
      titel: "Identifizierung nach dem Geldwäschegesetz",
      inhalt: [
        "Als Immobilienmakler sind wir nach dem Geldwäschegesetz verpflichtet, die Parteien eines vermittelten Kaufvertrags zu identifizieren (§ 2 Abs. 1 Nr. 14, § 11 GwG). Dafür erheben wir Name, Geburtsort, Geburtsdatum, Staatsangehörigkeit und Anschrift sowie Art, Nummer und ausstellende Behörde Ihres Ausweisdokuments und fertigen eine Kopie des Ausweises an. Rechtsgrundlage ist Art. 6 Abs. 1 lit. c DSGVO in Verbindung mit §§ 8, 11 und 12 GwG. Diese Unterlagen bewahren wir fünf Jahre auf (§ 8 Abs. 4 GwG).",
      ],
    },
    {
      id: "kundenportal",
      titel: "Kundenportal",
      inhalt: [],
      unterabschnitte: [
        {
          id: "kundenportal-konto",
          titel: "Konto und Anmeldung",
          inhalt: [
            "Als Kundin oder Kunde erhalten Sie Zugang zu unserem Kundenportal. Für Ihr Konto verarbeiten wir Name, E-Mail-Adresse, ein Passwort (nur als Hashwert) und die Daten zu Ihren Investments. Den Aktivierungslink löschen wir sieben Tage nach Ablauf bzw. 30 Tage nach Nutzung.",
            "Sie können freiwillig eine Zwei-Faktor-Anmeldung mit einer Authenticator-App einrichten. Ihre Wiederherstellungscodes speichern wir nur als Hashwert; lösen Sie einen ein, speichern wir den Zeitpunkt und die IP-Adresse. Melden Sie sich mit Zwei-Faktor-Anmeldung an, speichern wir zum Schutz Ihres Kontos IP-Adresse, Browser, Betriebssystem und den ungefähren Standort (Land und Stadt), den wir aus der IP-Adresse über den externen Dienst ip-api.com ermitteln. Fällt uns eine ungewöhnliche Anmeldung auf, informieren wir Sie per E-Mail.",
            "Nach fünf fehlgeschlagenen Anmeldeversuchen innerhalb von 15 Minuten sperren wir das Konto für 15 Minuten und speichern dafür E-Mail-Adresse und IP-Adresse. Anmeldungen im Kundenportal beenden wir aus Sicherheitsgründen spätestens nach 30 Tagen; danach melden Sie sich neu an.",
            "Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für die Sicherheitsdaten unser berechtigtes Interesse am Schutz Ihres Kontos (Art. 6 Abs. 1 lit. f DSGVO). Im Portal können Sie Ihre Daten jederzeit exportieren und die Löschung Ihres Kontos beantragen.",
          ],
        },
        {
          id: "kundenportal-chat",
          titel: "Chat und Benachrichtigungen",
          inhalt: [
            "Im Portal können Sie mit Ihrem Ansprechpartner chatten und Dateien bis 20 MB anhängen. Nachrichten und Anhänge sehen die Teilnehmenden des Chats sowie die Administratoren von MOREImmo. Über neue Nachrichten informieren wir die Teilnehmenden im Portal, per E-Mail mit einem kurzen Auszug und, wenn Sie das im Browser erlaubt haben, per Push-Benachrichtigung. Push-Nachrichten stellt der Push-Dienst Ihres Browserherstellers zu; wir speichern dafür die Adresse Ihres Push-Abonnements und die Browserkennung. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO, für Push-Benachrichtigungen Ihre Einwilligung (Art. 6 Abs. 1 lit. a DSGVO), die Sie in den Browsereinstellungen widerrufen können.",
          ],
        },
        {
          id: "kundenportal-unterlagen",
          titel: "Unterlagen und Handy-Scan",
          inhalt: [
            "Unterlagen, die Sie im Portal hochladen, legen wir in einem nicht öffentlichen Speicher ab. Mit dem Handy-Scan können Sie Unterlagen mit der Kamera Ihres Handys erfassen: Sie öffnen dazu einen Link, der eine Stunde gültig ist. Das PDF entsteht auf Ihrem Handy und wird dann in Ihren Unterlagen abgelegt. Den Scan-Link löschen wir zwei Tage nach seinem Ablauf. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.",
          ],
        },
        {
          id: "kundenportal-links",
          titel: "Exposé- und Objektlinks",
          inhalt: [
            "Schicken wir Ihnen einen persönlichen Link zu einem Exposé oder einer Objektansicht, zählen wir, wie oft und wann der Link zuerst und zuletzt aufgerufen wurde. Beim ersten Aufruf erhält Ihr Ansprechpartner einen Hinweis. IP-Adresse und Browserkennung speichern wir dabei nicht. Solche Links sind 60 Tage gültig. Rechtsgrundlage ist unser berechtigtes Interesse, Sie zum richtigen Zeitpunkt zu betreuen (Art. 6 Abs. 1 lit. f DSGVO).",
          ],
        },
        {
          id: "kundenportal-betreuung",
          titel: "Betreuung nach dem Kauf",
          inhalt: [
            "Nach dem Kauf betreuen wir Sie weiter: Wir erinnern an Termine und fehlende Unterlagen und dokumentieren Beratungen nach dem Kauf. Nach dem Notartermin bitten wir Sie per E-Mail um eine Bewertung bei Google, mit bis zu zwei Erinnerungen, und um eine vertrauliche Rückmeldung zu Ihrem Vertriebspartner. Zum Geburtstag gratulieren wir Ihnen per E-Mail. Im Portal können Sie außerdem den ungefähren Marktwert Ihrer Immobilie schätzen lassen (siehe „KI-gestützte Funktionen“).",
            "Rechtsgrundlage für die Erinnerungen an Termine und Unterlagen und für die Dokumentation der Beratung ist Art. 6 Abs. 1 lit. b DSGVO. Die Bitte um Bewertung, die Bitte um Rückmeldung und den Geburtstagsgruß schicken wir als Direktwerbung auf Grundlage unseres berechtigten Interesses an der Pflege unserer Kundenbeziehung (Art. 6 Abs. 1 lit. f DSGVO). Diesen Mails können Sie jederzeit ohne Angabe von Gründen widersprechen, etwa über den Abmeldelink oder per E-Mail an " + DATENSCHUTZ_EMAIL + ".",
          ],
        },
      ],
    },
    {
      id: "email",
      titel: "E-Mail-Kommunikation",
      inhalt: [],
      unterabschnitte: [
        {
          id: "email-versand",
          titel: "Versand unserer E-Mails",
          inhalt: [
            "Unsere automatischen E-Mails (etwa Bestätigungen, Links, Erinnerungen und Anmeldemails) versenden wir über den E-Mail-Dienst von Lovable, der dafür den Versanddienst Mailgun nutzt (Mailgun Technologies, Inc., USA). Absender ist eine Adresse unter more.immo, technisch über die Subdomain notify.more.immo.",
            "Über jede Mail führen wir ein Versandprotokoll mit Empfängeradresse, Art der Mail, Zeitpunkt und Status. Einträge zu versandten Mails löschen wir nach 14 Tagen, zu fehlgeschlagenen oder abgewiesenen Mails nach drei Tagen. Rechtsgrundlage ist die jeweilige Grundlage der Mail, für das Protokoll unser berechtigtes Interesse an einem nachvollziehbaren Versand (Art. 6 Abs. 1 lit. f DSGVO).",
          ],
        },
        {
          id: "email-abmeldung",
          titel: "Abmeldung und Sperrliste",
          inhalt: [
            "Mails, die nicht zwingend zu einem laufenden Vorgang gehören, können Sie über einen Abmeldelink abbestellen. Ihre Adresse kommt dann auf eine Sperrliste, ebenso nach einer dauerhaften Zustellstörung oder einer Spam-Beschwerde. Die Sperrliste bewahren wir auf, solange sie nötig ist, um Ihren Widerspruch zu beachten (Art. 6 Abs. 1 lit. c und f DSGVO). Mails, die für einen von Ihnen begonnenen Vorgang zwingend nötig sind, etwa ein Link zur Unterschrift oder zur Aktivierung, erhalten Sie trotz Abmeldung, außer nach einer Spam-Beschwerde. Den verwendeten Abmeldelink löschen wir 90 Tage nach der Nutzung.",
          ],
        },
        {
          id: "email-zaehlung",
          titel: "Aufruf persönlicher Links",
          inhalt: [
            "Unsere E-Mails enthalten keine Zählpixel; wir erfassen also nicht, ob Sie eine Mail öffnen. Viele Mails enthalten aber einen persönlichen Link, etwa zur Selbstauskunft, zur Unterschrift, zu Ihrem Handbuch oder, im Bewerbungsablauf, zu Ihrer Bewerberseite, zum Kennenlernbogen oder zu Vertragsunterlagen. Rufen Sie einen solchen Link auf, halten wir den Zeitpunkt des Aufrufs fest; bei Bewerbermails trägt der Link dafür eine Kennung, welcher Mail er entstammt. IP-Adresse und Browserkennung speichern wir dabei nicht.",
            "So wissen wir, ob Sie den Vorgang begonnen haben, und können rechtzeitig nachfassen. Rechtsgrundlage ist die Durchführung des jeweiligen Vorgangs (Art. 6 Abs. 1 lit. b DSGVO) bzw. unser berechtigtes Interesse an seiner zuverlässigen Abwicklung (Art. 6 Abs. 1 lit. f DSGVO). Eine Einwilligung ist dafür nicht nötig, weil wir dabei nicht über das Laden eines Bildes auf Ihr Endgerät zugreifen, sondern nur den Aufruf erfassen, den Sie selbst auslösen.",
          ],
        },
        {
          id: "email-postfach",
          titel: "E-Mails an uns",
          inhalt: [
            "Schreiben Sie uns eine E-Mail, verarbeiten wir Ihre Adresse und den Inhalt, um Ihr Anliegen zu bearbeiten (Art. 6 Abs. 1 lit. b oder f DSGVO). Unsere Postfächer liegen beim Anbieter one.com. Absender, Betreff, Datum und auf Abruf den Text eingehender Mails holen wir in unser CRM, damit Ihr Ansprechpartner den Verlauf sieht.",
          ],
        },
      ],
    },
    {
      id: "bewerbung",
      titel: "Bewerbungen",
      inhalt: [
        "Bewerben Sie sich bei uns, etwa als Vertriebspartnerin oder Vertriebspartner, verarbeiten wir Vorname, Nachname, E-Mail-Adresse, Handynummer, Ort, Ihre Angaben zu Erfahrung und Motivation, wie Sie auf uns aufmerksam geworden sind, die Stelle und gegebenenfalls Ihren Lebenslauf. Über die Bearbeitung informieren wir das für Bewerbungen zuständige Team per E-Mail und im CRM. Ihre Bewerbung sehen in unserem CRM nur die für Bewerbungen zuständigen Bereiche: Personal, Backoffice, Administration und Geschäftsleitung. Sie erhalten eine persönliche Bewerberseite, deren Link 365 Tage gültig ist; die Seite löschen wir 30 Tage nach Ablauf des Links.",
        "Für ein Kennenlernen senden wir Ihnen einen Kennenlernbogen, dessen Link 14 Tage gültig ist. Darin fragen wir unter anderem nach Region, beruflicher Situation und Hintergrund, Erfahrung, verfügbarer Zeit, Einkommensziel, Startzeitpunkt, Erreichbarkeit, einer Erlaubnis nach § 34c GewO, Gewerbe und möglichen Nebentätigkeits- oder Wettbewerbsverboten. Ihre Einwilligung speichern wir mit Zeitpunkt und Fassung. Aus den Antworten bilden wir eine Vorab-Einstufung, die nur die Reihenfolge der Einladungen unterstützt; die Entscheidung trifft immer ein Mensch.",
        "Gespräche führen wir in unserem Videoraum (siehe „Terminbuchung, Videoberatung und Zoom“) oder buchen sie über Calendly. Aus den Notizen zum Erstgespräch kann unser Team eine Zusammenfassung mit KI erstellen lassen (siehe „KI-gestützte Funktionen“).",
        "Bewerbungen, die Sie über ein Formular einer Werbeanzeige auf Facebook oder Instagram abschicken, erreichen uns über Zapier (siehe „Anfragen über Werbeanzeigen und Partnerwebsites“), einschließlich der dort erfragten Angaben, etwa Einkommen, verfügbare Stunden, aktuelle Situation und Alter.",
        "Rechtsgrundlage für die Bearbeitung Ihrer Bewerbung ist die Anbahnung eines Vertragsverhältnisses auf Ihre Bewerbung hin (Art. 6 Abs. 1 lit. b DSGVO). Die Angaben im Kennenlernbogen sind freiwillig; für sie gilt Ihre Einwilligung, die Sie im Bogen erteilen und jederzeit widerrufen können (Art. 6 Abs. 1 lit. a DSGVO). Kommt keine Zusammenarbeit zustande, löschen wir Ihre Daten, sobald sie für das Verfahren und mögliche Rechtsansprüche nicht mehr erforderlich sind.",
      ],
    },
    {
      id: "tippgeber",
      titel: "Tippgeber und Empfehlungen",
      inhalt: [
        "Tippgeber und Kunden können uns Personen empfehlen, die sich für eine Kapitalanlage-Immobilie interessieren. Wir erhalten dabei Name und Kontaktdaten sowie, soweit die empfehlende Person sie kennt und angibt, freiwillige Angaben zu Ihrem Anliegen, etwa Ziel, Beruf, Einkommen, Eigenkapital und ob Ihre SCHUFA nach ihrem Wissen ohne Negativeinträge ist. Die empfehlende Person bestätigt uns per Häkchen, dass Sie mit der Weitergabe Ihrer Kontaktdaten einverstanden sind; diese Bestätigung speichern wir mit Zeitpunkt und Wortlaut. Wir nehmen Kontakt auf, um eine Beratung anzubieten (Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse an der Bearbeitung der Empfehlung).",
        "Kommen Sie über den Empfehlungslink eines Tippgebers auf die Seite eines Vertriebspartners, zählen wir den Aufruf für den Tippgeber, ohne IP-Adresse oder andere Angaben zu Ihrer Person. Senden Sie eine Anfrage ab, vermerken wir den Tippgeber an Ihrem Kontakt, damit seine Empfehlung abgerechnet werden kann (Art. 6 Abs. 1 lit. f DSGVO).",
      ],
    },
    {
      id: "ki",
      titel: "KI-gestützte Funktionen",
      inhalt: [
        "Für einige Aufgaben nutzen wir KI-Modelle von Google (Gemini), die wir über das KI-Gateway von Lovable ansprechen. Lovable und Google verarbeiten die Daten dabei in unserem Auftrag. Eingesetzt wird die KI für:",
        {
          liste: [
            "Zusammenfassungen von Erstgesprächen mit Interessenten und Bewerbern aus den Notizen unseres Teams, die Name, Beruf, Familie, Einkommen und Eigenkapital enthalten können",
            "das Auslesen von Kontaktdaten aus einem Foto, etwa einer Visitenkarte oder eines Formulars",
            "das Auslesen der Konditionen aus einem Darlehensvertrag, den Sie uns geben",
            "die Schätzung des Marktwerts Ihrer Immobilie im Kundenportal aus Adresse, Kaufpreis und Kaufdatum",
            "die Auswertung von Objektunterlagen und das Formulieren von Objekttexten",
          ],
        },
        "Die Ergebnisse sind Arbeitshilfen für unser Team bzw. unverbindliche Schätzungen. Die KI trifft keine Entscheidungen über Sie. Rechtsgrundlage ist die jeweilige Grundlage der zugrunde liegenden Verarbeitung (Art. 6 Abs. 1 lit. b DSGVO) und unser berechtigtes Interesse an effizienter Bearbeitung (Art. 6 Abs. 1 lit. f DSGVO).",
      ],
    },
    {
      id: "telefon-kalender",
      titel: "Telefonie und Kalender",
      inhalt: [
        "Unsere Telefonie läuft über sipgate (sipgate GmbH, Gladbacher Straße 74, 40219 Düsseldorf). Zu Anrufen speichern wir Rufnummer, Zeitpunkt, Dauer, Ergebnis und den zugehörigen Kontakt im CRM (Art. 6 Abs. 1 lit. b und f DSGVO).",
        "Mitarbeitende können ihren Kalender bei Google (Google Ireland Limited) oder Apple iCloud (Apple Distribution International Ltd., Hollyhill Industrial Estate, Hollyhill, Cork, Irland) mit dem CRM verbinden. Dann gehen Termine und Wiedervorlagen dorthin, die Ihren Namen enthalten können (Art. 6 Abs. 1 lit. f DSGVO, berechtigtes Interesse an einer verlässlichen Terminplanung).",
      ],
    },
    {
      id: "empfaenger",
      titel: "Empfänger und Auftragsverarbeiter",
      inhalt: [
        "Innerhalb von MOREImmo greifen unsere Mitarbeitenden und Vertriebspartner über Rollen im CRM auf Ihre Daten zu. Vertriebspartner bearbeiten Kontakte, die über uns kommen, als unsere Auftragsverarbeiter (siehe „Bearbeitung durch unsere Vertriebspartner“). Darüber hinaus geben wir Daten nur weiter, wenn es gesetzlich erlaubt ist, Sie eingewilligt haben oder es für die Vertragserfüllung nötig ist. Empfänger sind die in den Abschnitten genannten Finanzierungspartner, Kreditinstitute, Verkäufer, Notariate und Hausverwaltungen sowie folgende Dienstleister:",
        {
          tabelle: {
            kopf: ["Empfänger", "Zweck"],
            zeilen: [
              ["Vertriebspartner von MOREImmo (Auftragsverarbeiter)", "Beratung und Betreuung von Kontakten, die über uns kommen"],
              ["Lovable.dev", "Hosting, serverseitige Funktionen, E-Mail-Versand, KI-Gateway"],
              ["Supabase, Inc. (Lovable Cloud)", "Datenbank, Anmeldung, Dateiablage"],
              ["Mailgun Technologies, Inc. (über Lovable)", "Versand unserer E-Mails"],
              ["Google Ireland Limited", "KI-Modelle (über Lovable), reCAPTCHA, Vermittlungsserver im Videoraum, Kalender, YouTube-Videos im CRM (nach Klick)"],
              ["one.com", "E-Mail-Postfächer"],
              ["Zapier, Inc.", "Übernahme von Anfragen und Bewerbungen aus Werbeanzeigen"],
              ["Zoom Communications, Inc.", "Wöchentliche Vertriebsrunde (Weekly Sales Call)"],
              ["sipgate GmbH", "Telefonie"],
              ["Cloudflare, Inc.", "Vermittlungsserver im Videoraum"],
              ["Calendly LLC", "Terminbuchung (nach Klick)"],
              ["OpenStreetMap Foundation", "Karten und Adresssuche (Nominatim), auch Verortung von Kundenadressen im CRM"],
              ["komoot GmbH (Photon)", "Verortung von Postleitzahl und Ort für die Objektempfehlung im CRM"],
              ["ipify (api.ipify.org)", "Abfrage der eigenen IP-Adresse, nur bei eingeschalteter IP-Freigabeliste im CRM"],
              ["ip-api.com", "Ungefährer Standort bei der Anmeldung"],
              ["Apple Distribution International Ltd.", "Kalender (iCloud)"],
            ],
          },
        },
        "Für das Meta Pixel und die Conversions API sind wir mit dem jeweiligen Vertriebspartner gemeinsam verantwortlich; Empfänger der Daten ist Meta Platforms Ireland Limited (siehe „Meta Pixel und Conversions API“).",
      ],
    },
    {
      id: "drittland",
      titel: "Übermittlung in Drittländer",
      inhalt: [
        "Einige Anbieter haben ihren Sitz in den USA oder greifen von dort auf Daten zu, insbesondere Supabase, Mailgun, Zapier, Zoom, Cloudflare und Calendly sowie Google und Meta. Für die USA besteht ein Angemessenheitsbeschluss der EU-Kommission für Unternehmen, die unter dem EU-US Data Privacy Framework zertifiziert sind. Wo ein Anbieter nicht zertifiziert ist, stützen wir die Übermittlung auf die Standardvertragsklauseln der EU-Kommission (Art. 46 Abs. 2 lit. c DSGVO). Für das Vereinigte Königreich besteht ein eigener Angemessenheitsbeschluss. Eine Kopie der Garantien erhalten Sie auf Anfrage an " + DATENSCHUTZ_EMAIL + ".",
      ],
    },
    {
      id: "speicherdauer",
      titel: "Speicherdauer",
      inhalt: [
        "Wir speichern personenbezogene Daten nur so lange, wie es für den jeweiligen Zweck erforderlich ist. Danach löschen wir sie, soweit keine gesetzlichen Aufbewahrungsfristen bestehen; in diesem Fall löschen wir sie nach Ablauf dieser Fristen. Für einzelne Daten gelten diese Fristen:",
        {
          tabelle: {
            kopf: ["Daten", "Speicherdauer"],
            zeilen: [
              ["Vertrags- und Abwicklungsunterlagen (Reservierung, Selbstauskunft, Kaufvorgang)", "für die Dauer der Geschäftsbeziehung, danach nach den gesetzlichen Aufbewahrungsfristen von sechs, acht bzw. zehn Jahren (§ 257 HGB, § 147 AO; Buchungsbelege seit dem 01.01.2025 acht Jahre)"],
              ["Unterlagen zur Identifizierung nach dem Geldwäschegesetz", "fünf Jahre (§ 8 Abs. 4 GwG)"],
              ["Nachweis einer Einwilligung in Telefonwerbung", "fünf Jahre ab jeder Verwendung (§ 7a UWG)"],
              ["Kampagnenkennung im Browser", "30 Tage, nur mit Einwilligung"],
              ["Links zur Selbstauskunft", "gelöscht sieben Tage nach Ablauf"],
              ["Aktivierungslinks für das Kundenportal", "gelöscht sieben Tage nach Ablauf bzw. 30 Tage nach Nutzung"],
              ["Links für den Handy-Scan", "gelöscht zwei Tage nach Ablauf"],
              ["Anfragen zur Unterschrift", "gelöscht 180 Tage nach Ablauf des Links"],
              ["Versandprotokoll der E-Mails", "14 Tage, bei Fehlern drei Tage"],
              ["Genutzte Abmeldelinks", "90 Tage"],
              ["Sperrliste für E-Mails", "solange nötig, um Ihren Widerspruch zu beachten"],
              ["Aktivitätsprotokoll im CRM", "180 Tage"],
              ["Videoräume", "90 Tage nach Ablauf"],
              ["Bewerberseiten", "30 Tage nach Ablauf des Links"],
              ["Anmeldungen im Kundenportal", "spätestens nach 30 Tagen beendet"],
            ],
          },
        },
      ],
    },
    {
      id: "profiling",
      titel: "Automatisierte Entscheidungen und Profiling",
      inhalt: [
        "Wir treffen keine Entscheidungen, die ausschließlich auf einer automatisierten Verarbeitung beruhen und Ihnen gegenüber rechtliche Wirkung entfalten oder Sie in ähnlicher Weise erheblich beeinträchtigen (Art. 22 DSGVO).",
        "In der Analyse, im Steuerrechner und auf der Handbuch-Seite ordnen wir Ihre Angaben automatisch ein, etwa in die Stufen „passt“, „passt vielleicht“ und „passt noch nicht“, und bilden daraus eine Einschätzung der Dringlichkeit. Das ist eine Bewertung persönlicher Aspekte im Sinne von Art. 4 Nr. 4 DSGVO (Profiling). Die Einordnung schließt niemanden aus: Sie erhalten Ihr Ergebnis bzw. Ihr Handbuch in jedem Fall. Sie ersetzt keine Finanzierungszusage oder Kreditprüfung und bestimmt nur, in welcher Reihenfolge unsere Partner Kontakt aufnehmen. Ob eine Finanzierung möglich ist, entscheiden Menschen, am Ende die finanzierende Bank. Ebenso unterstützt die Vorab-Einstufung im Bewerbungsablauf nur die Reihenfolge der Einladungen.",
        "Rechtsgrundlage ist unser berechtigtes Interesse, Anfragen sinnvoll zu priorisieren (Art. 6 Abs. 1 lit. f DSGVO). Sie können dieser Verarbeitung widersprechen.",
      ],
    },
    {
      id: "rechte",
      titel: "Ihre Rechte",
      inhalt: [
        "Sie haben gegenüber uns folgende Rechte hinsichtlich Ihrer personenbezogenen Daten:",
        {
          liste: [
            "Auskunft (Art. 15 DSGVO)",
            "Berichtigung (Art. 16 DSGVO)",
            "Löschung (Art. 17 DSGVO)",
            "Einschränkung der Verarbeitung (Art. 18 DSGVO)",
            "Datenübertragbarkeit (Art. 20 DSGVO)",
            "Widerruf einer Einwilligung mit Wirkung für die Zukunft (Art. 7 Abs. 3 DSGVO); die Rechtmäßigkeit der bis dahin erfolgten Verarbeitung bleibt unberührt",
          ],
        },
        "Widerspruchsrecht (Art. 21 DSGVO): Soweit wir Daten auf Grundlage unseres berechtigten Interesses verarbeiten (Art. 6 Abs. 1 lit. f DSGVO), können Sie aus Gründen, die sich aus Ihrer besonderen Situation ergeben, jederzeit widersprechen. Verarbeiten wir Daten für Direktwerbung, können Sie dem jederzeit ohne Angabe von Gründen widersprechen; wir verwenden Ihre Daten dann nicht mehr für diesen Zweck.",
        `Zur Ausübung Ihrer Rechte genügt eine formlose Nachricht an ${DATENSCHUTZ_EMAIL} oder an die oben genannte Anschrift. Im Kundenportal können Sie Ihre Daten außerdem selbst exportieren und die Löschung beantragen.`,
        "Sie haben das Recht, sich bei einer Datenschutzaufsichtsbehörde zu beschweren. Für uns zuständig ist:",
        {
          zeilen: [
            "Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)",
            "Promenade 18",
            "91522 Ansbach",
            "https://www.lda.bayern.de",
          ],
        },
      ],
    },
    {
      id: "pflicht",
      titel: "Pflicht zur Bereitstellung",
      inhalt: [
        "Für den Kauf einer Immobilie über uns sind Sie nach dem Geldwäschegesetz verpflichtet, uns die zur Identifizierung nötigen Angaben und Unterlagen zu geben (§ 11 Abs. 6 GwG); ohne sie dürfen wir nicht tätig werden. Im Übrigen sind Sie nicht verpflichtet, uns Daten bereitzustellen. Ohne die als Pflichtfelder gekennzeichneten Angaben können wir Ihre Anfrage, Bewerbung oder Reservierung jedoch nicht bearbeiten und keinen Vertrag vorbereiten.",
      ],
    },
    {
      id: "aenderungen",
      titel: "Änderungen dieser Erklärung",
      inhalt: [
        "Wir passen diese Datenschutzerklärung an, wenn sich unsere Angebote oder die Rechtslage ändern. Es gilt die jeweils auf dieser Seite veröffentlichte Fassung.",
      ],
    },
  ],
};

/* ═══════════════════════════════ ENGLISCH ══════════════════════════════ */

const en: DatenschutzFassung = {
  titel: "Privacy Policy",
  stand: "Last updated: September 2026",
  inhaltTitel: "Contents",
  abschnitte: [
    {
      id: "verantwortlicher",
      titel: "Controller and contact",
      inhalt: [
        "The controller responsible for processing your personal data on this website (portal.more.immo), in the customer portal and in the related processes is:",
        {
          zeilen: [
            "MOREImmo",
            "Sole proprietorship, owner: Christian Kurz",
            "Wendelsteinstraße 19",
            "83075 Bad Feilnbach",
            "Germany",
            ...(IMPRESSUM_TELEFON ? [`Phone: ${IMPRESSUM_TELEFON}`] : []),
            `Email: ${IMPRESSUM_EMAIL}`,
          ],
        },
        `The contact person for data protection is the owner, Christian Kurz. For any questions about data protection and to exercise your rights, please contact us at ${DATENSCHUTZ_EMAIL} or at the address above.`,
      ],
    },
    {
      id: "ueberblick",
      titel: "Overview and legal bases",
      inhalt: [
        "This policy informs visitors to our website, prospective customers, customers, applicants and referrers about which personal data we process, for what purpose, on which legal basis, to whom we disclose it and how long we keep it. The marketing website more.immo is a separate service with its own privacy policy.",
        "We process data on the following legal bases:",
        {
          liste: [
            "Contract and pre-contractual measures (Art. 6(1)(b) GDPR): everything required for your enquiry, your consultation, your financing, your purchase or your application, for example handling an enquiry, the financial self-disclosure, the reservation and the customer portal.",
            "Legal obligation (Art. 6(1)(c) GDPR), for example identification under the German Anti-Money Laundering Act and retention duties under commercial and tax law.",
            "Legitimate interests (Art. 6(1)(f) GDPR), for example for the secure operation of the website, the prevention of misuse and the support of existing customers. Where we rely on this, we name the interest in the relevant section.",
            "Consent (Art. 6(1)(a) GDPR) where the matter is optional, for example for information about further offers by email and phone, statistics and marketing in the cookie notice, the written transcript of a video call, push notifications and the optional details in an applicant questionnaire. You can withdraw consent at any time with effect for the future.",
            "Storing and accessing information in your browser (Section 25 TDDDG, the German Telecommunications Digital Services Data Protection Act): what is strictly necessary for the service you requested is stored without consent under Section 25(2) no. 2 TDDDG. Everything else only with your consent under Section 25(1) TDDDG.",
          ],
        },
      ],
    },
    {
      id: "hosting",
      titel: "Hosting, infrastructure and security",
      inhalt: [],
      unterabschnitte: [
        {
          id: "hosting-anbieter",
          titel: "Hosting and database",
          inhalt: [
            "This website and the customer portal are provided via the Lovable platform (Lovable.dev, Sweden). The database, sign in, file storage and server functions run in Lovable Cloud, which is technically based on Supabase (Supabase, Inc., USA). The database is located in the Frankfurt am Main region (EU). Both providers process data on our behalf (Art. 28 GDPR).",
            "The legal basis is Art. 6(1)(b) GDPR where processing serves the performance of a contract with you, otherwise our legitimate interest in the secure and reliable operation of our services (Art. 6(1)(f) GDPR). For recovery after an error there are backups, which are used only for this purpose and deleted once their retention period ends.",
          ],
        },
        {
          id: "hosting-protokolle",
          titel: "Server logs and protection against misuse",
          inhalt: [
            "With every visit, our hosting provider's servers process technically necessary information: IP address, date and time, requested address, amount of data transferred, browser and operating system and the previously visited page (referrer). This information is used to deliver the page, to find errors and for security (Art. 6(1)(f) GDPR).",
            "To protect our forms and interfaces against automated mass requests, we count requests per IP address (rate limiting). For this purpose the IP address is stored in full, and when signing in together with the email address entered. We log incoming form submissions to our interfaces with IP address, browser identifier and the content of the submission in order to find errors and prevent misuse. We keep both only for as long as necessary for these purposes.",
            "Our legitimate interest lies in the security and availability of our services and in protecting your data against unauthorised access.",
          ],
        },
        {
          id: "hosting-verschluesselung",
          titel: "Encryption",
          inhalt: [
            "This website uses TLS encryption (recognisable by “https://” and the padlock symbol in your browser). It protects data you send to us against being read by third parties while in transit.",
          ],
        },
      ],
    },
    {
      id: "cookies",
      titel: "Cookies and browser storage",
      inhalt: [
        "On our public pages, a notice asks on your first visit what may be stored in your browser. There are three categories:",
        {
          liste: [
            "Necessary (always on): sign in, the progress of your entries, your language choice and your choice in the cookie notice. The legal basis is Section 25(2) no. 2 TDDDG and Art. 6(1)(b) or (f) GDPR.",
            "Statistics (only with consent): the campaign identifier showing which advertisement or link brought you here remains in your browser for 30 days (see “Campaign identifier and counting of page steps”). In addition, the browser remembers for the duration of the session that a referral link has already been counted. The legal basis is Section 25(1) TDDDG and Art. 6(1)(a) GDPR.",
            "Marketing (only with consent): your general choice on marketing. On its own, it does not load a sales partner's Meta Pixel; for that we ask separately on the partner's page and only for that partner (see “Meta Pixel and Conversions API”). The legal basis is Section 25(1) TDDDG and Art. 6(1)(a) GDPR.",
          ],
        },
        "We store your choice with a timestamp in your browser. You can change it or withdraw consent at any time via “Cookie settings” in the footer of the page; on pages without a footer there is a round button at the bottom left. If you choose “Necessary only” or switch marketing off, you withdraw all permissions for partner pixels and the Meta cookies “_fbp” and “_fbc” are deleted; if you withdraw statistics consent, the stored campaign identifier is removed.",
        { cookieEinstellungen: "Change your selection:" },
        "The following entries may be created in your browser:",
        {
          tabelle: {
            kopf: ["Name", "Purpose", "Duration", "Category"],
            zeilen: [
              ["moreimmo.cookie-einwilligung", "Your choice in the cookie notice with timestamp, including your permissions per sales partner", "until you change your choice or delete the site data; permissions per partner at most 13 months", "Necessary"],
              ["moreimmo-seiten-sprache, moreimmo-crm-lang", "Selected language", "until you delete the site data", "Necessary"],
              ["mi_lead_funnel_entwurf", "Progress of the enquiry form on a sales partner's page", "2 hours", "Necessary"],
              ["hb_ergebnis_frisch (session storage)", "Your result on the handbook page, so that it survives a reload", "until you close the tab", "Necessary"],
              ["mi_bewerber_fragebogen_…", "Progress of the applicant questionnaire", "14 days", "Necessary"],
              ["mi_selbstauskunft_… (session storage)", "Progress of the financial self-disclosure when you click “Save for later”", "until you submit the self-disclosure, at most until you close the tab", "Necessary"],
              ["sb-…-auth-token", "Your sign in to the customer portal, kept permanently in the browser's storage", "until you sign out or we end the session: customer accounts after 30 days, accounts of our staff and partners every night at 03:30", "Necessary"],
              ["mi_client_ip (session storage)", "Only in the CRM and only with the IP allowlist switched on: your public IP address for the access check", "5 minutes, at most until you close the tab", "Necessary"],
              ["role_permissions_v1, mi_current_role", "Cache of your access rights after sign in", "until you delete the site data", "Necessary"],
              ["videoraum-gast:…, videoraum-kachelreihe (session storage)", "Your display name and the layout in the video room", "until you close the tab", "Necessary"],
              ["lazy-route-reload:…, versionshinweis-ausgeblendet (session storage)", "Loading a new program version", "until you close the tab", "Necessary"],
              ["moreimmo.kampagne.v2", "Campaign identifier (UTM parameters, gclid, fbclid)", "30 days", "Statistics"],
              ["tg_klick_… (session storage)", "Prevents a referral link visit from being counted twice", "until you close the tab", "Statistics"],
              ["_fbp, _fbc (Meta cookies)", "Meta Pixel on a sales partner's pages, only with permission for that partner", "set by Meta, up to 90 days", "Marketing"],
            ],
          },
        },
        "In the signed in area, the application also stores display settings and cached data so that pages load quickly and your settings are kept. These entries are necessary for operation.",
        "You can delete stored site data at any time in your browser settings.",
      ],
    },
    {
      id: "kampagnen",
      titel: "Campaign identifier and counting of page steps",
      inhalt: [
        "If you reach our pages via an advertisement or a link with campaign parameters, we read these parameters from the address: utm_source, utm_medium, utm_campaign, utm_content, utm_term and the click identifiers gclid (Google) and fbclid (Meta). We remember the first and the most recent contact.",
        "Without statistics consent, these values are only kept in the memory of the open page and disappear when you close it. With consent, they remain in your browser for 30 days so that a later enquiry can still be attributed to the advertisement.",
        "When you submit an enquiry, we store the campaign identifier with your contact record. This shows us which advertising leads to enquiries. The legal basis is our legitimate interest in managing our advertising (Art. 6(1)(f) GDPR), and for storage in the browser beyond your visit your consent (Section 25(1) TDDDG, Art. 6(1)(a) GDPR). We keep the identifier for as long as the contact record itself.",
        "On our calculators, the handbook page and the form pages we also count how many visits reach which step (for example “calculator started” or “result shown”). We only store the step, tool, responsible partner, campaign name and time, no IP address and no information about you.",
      ],
    },
    {
      id: "meta",
      titel: "Meta Pixel and Conversions API",
      inhalt: [
        "Our sales partners have personal pages. Only there, namely on the partner's page under “/vp/…” and their handbook page under “/handbuch/…” including the configurator, can the relevant partner use the Meta Pixel of Meta Platforms Ireland Limited, Merrion Road, Dublin 4, D04 X2K5, Ireland (“Meta”). On the self-disclosure of the handbook page and on pages opened via a personal link, for example your handbook result or a self-disclosure you open via a personal link, a pixel never loads, and nothing from there is reported to Meta.",
        "A sales partner's pixel only loads if you have explicitly allowed it on their page for exactly this partner. Your general choice on marketing in the cookie notice is not sufficient. The cookie notice on the page names the partner with company name and business address as joint controller; if no business address is stored, no pixel loads. Your permission is valid for at most 13 calendar months; after that we ask again.",
        "With this permission, we also report the submission of your enquiry from our server to Meta (Conversions API). Beforehand, our server checks whether valid consent exists for exactly this partner. We store the proof of your consent (version of the cookie notice, time and partner) with your enquiry and protect it against subsequent changes.",
        "The legal basis is your consent (Section 25(1) TDDDG, Art. 6(1)(a) GDPR). Meta may transfer data to the USA; Meta is certified under the EU-US Data Privacy Framework. Information on processing by Meta is available at https://www.facebook.com/privacy/policy.",
        "You can withdraw your consent at any time with effect for the future via the cookie settings. If you choose “Necessary only” there or switch marketing off, you withdraw the permissions for all sales partners, in all open tabs. From then on the pixel sends no more data to Meta, and the Meta cookies “_fbp” and “_fbc” are deleted. The withdrawal does not apply retroactively; transmissions before the withdrawal remain unaffected.",
        { cookieEinstellungen: "Withdraw or change your consent:" },
      ],
      unterabschnitte: [
        {
          id: "meta-gemeinsame-verantwortung",
          titel: "Joint controllership for the Meta Pixel on our sales partners' pages",
          inhalt: [
            "On the personal pages of our sales partners (their page under /vp/ and their handbook page under /handbuch/ including the configurator, each with the partner's identifier in the address), the relevant sales partner may use the Meta Pixel. No pixel loads on the self-disclosure of the handbook page or on pages opened via a personal link. With it, the partner measures whether their own advertisements on Facebook and Instagram are successful. MOREImmo and the sales partner whose page you visit are joint controllers for this under Art. 26 GDPR. You will find the sales partner's name and address in the privacy notice on their page.",
            "We are jointly responsible for two steps. First, for loading the Meta Pixel after you have consented and for transmitting your usage data to Meta Platforms Ireland Ltd., such as IP address, browser information, page visited, page view and the submission of an enquiry. Second, for reporting a submitted enquiry from our server to Meta (Conversions API). In doing so, your email address and phone number are only transmitted as a hash value. Meta thus does not receive the plain text, but can match the hash value with its own data and thereby assign your enquiry to an account. We do not transmit any further details from your enquiry. Without your consent, neither step takes place.",
            "What happens at Meta after the transmission is the responsibility of the sales partner and Meta, not MOREImmo. Details can be found in Meta's privacy policy. This may involve a transfer to the USA.",
            "The tasks are divided as follows: MOREImmo operates the pages, obtains your consent, informs you about the processing and is your central point of contact. The sales partner is responsible for their advertising account at Meta, keeps the settings of their pixel data-minimising and uses the data only to measure the success of their advertisements.",
            "You can exercise your rights of access, rectification, erasure, restriction of processing, data portability and objection against each of us. The quickest way is via MOREImmo, Wendelsteinstraße 19, 83075 Bad Feilnbach, datenschutz@more.immo. Where necessary, we forward your request to the sales partner. You can withdraw your consent at any time with effect for the future via the “Cookie settings” link in the footer of every page. You can also lodge a complaint with a data protection supervisory authority.",
          ],
        },
      ],
    },
    {
      id: "dienste",
      titel: "Third party services",
      inhalt: [],
      unterabschnitte: [
        {
          id: "dienste-recaptcha",
          titel: "Google reCAPTCHA",
          inhalt: [
            "We protect our application forms against automated entries with Google reCAPTCHA v3. The provider is Google Ireland Limited, Gordon House, Barrow Street, Dublin 4, Ireland. The script only loads once you click into a field of the form; we point this out at the form. reCAPTCHA evaluates, among other things, IP address, browser information and your behaviour on the page. When you submit, our server checks the result with Google and transmits your IP address for this purpose.",
            "The legal basis is our legitimate interest in protecting our forms against misuse (Art. 6(1)(f) GDPR). Google may transfer data to the USA; Google is certified under the EU-US Data Privacy Framework. More information: https://policies.google.com/privacy",
          ],
        },
        {
          id: "dienste-calendly",
          titel: "Calendly",
          inhalt: [
            "On some appointment pages for partners and applicants you can book an appointment via Calendly (Calendly LLC, USA). The calendar only loads once you enable it with a click (two click solution). This approval only applies until you close the page and is not stored. Only then is data such as your IP address and the details you enter when booking transferred to Calendly.",
            "The legal basis is your consent given by the click (Art. 6(1)(a) GDPR, Section 25(1) TDDDG) and carrying out the requested booking (Art. 6(1)(b) GDPR). For transfers to the USA see “Transfers to third countries”. More information: https://calendly.com/privacy",
          ],
        },
        {
          id: "dienste-karten",
          titel: "Maps and address search (OpenStreetMap)",
          inhalt: [
            "In exposés and property views we show the location of a property on a map. Your browser loads the map tiles directly from servers of the OpenStreetMap Foundation (St John’s Innovation Centre, Cowley Road, Cambridge, CB4 0WS, United Kingdom). The OpenStreetMap Foundation receives your IP address and browser information.",
            "In the financial self-disclosure we suggest matching addresses while you type the street. For this, your browser sends the address entered so far to the Nominatim search service of the OpenStreetMap Foundation.",
            "In the CRM our staff also locate addresses: for the overview map in marketing, customers' addresses are sent to the Nominatim search service of the OpenStreetMap Foundation to show them on the map. For property recommendations, the postcode and town of your place of residence are sent to the Photon search service of komoot GmbH (Germany); we store the resulting coordinate, rounded, with your investment in order to suggest suitable properties near you.",
            "The legal basis is our legitimate interest in a clear presentation of the location, in correct addresses and in suitable property suggestions (Art. 6(1)(f) GDPR). An adequacy decision of the EU Commission exists for the United Kingdom. More information: https://osmfoundation.org/wiki/Privacy_Policy",
          ],
        },
        {
          id: "dienste-schriften",
          titel: "Fonts",
          inhalt: [
            "We deliver the fonts of this website from our own servers. No connection to servers of Google or other font providers is made when you open the page.",
          ],
        },
        {
          id: "dienste-youtube",
          titel: "Videos in the CRM (YouTube)",
          inhalt: [
            "In the signed in area, the news page occasionally shows videos from YouTube (Google Ireland Limited). A video only loads once you click “Video laden” (load video); before that no connection to Google is made. After the click it loads via youtube-nocookie.com, and Google receives your IP address and information about your browser. The legal basis is your consent given by the click (Art. 6(1)(a) GDPR, Section 25(1) TDDDG). More information: https://policies.google.com/privacy",
          ],
        },
        {
          id: "dienste-ipfreigabe",
          titel: "IP allowlist in the CRM",
          inhalt: [
            "To protect the CRM, the administration can switch on a list of approved IP addresses. Only then does your browser query its public IP address from the ipify service (api.ipify.org) after sign in, so that we can compare it with the list. The browser keeps the address for at most 5 minutes in session storage (mi_client_ip). The legal basis is our legitimate interest in protecting the data in the CRM against unauthorised access (Art. 6(1)(f) GDPR).",
          ],
        },
        {
          id: "dienste-passwort",
          titel: "Check for known passwords",
          inhalt: [
            "When you set a password, we check whether it appears in known data breaches. For this, your browser sends only the first five characters of a hash of your password to the “Pwned Passwords” service (https://haveibeenpwned.com). Your password itself is not transmitted to this service. The legal basis is our legitimate interest in the security of your account (Art. 6(1)(f) GDPR).",
          ],
        },
      ],
    },
    {
      id: "anfragen",
      titel: "Enquiries, lead forms and responsibility",
      inhalt: [],
      unterabschnitte: [
        {
          id: "anfragen-formulare",
          titel: "Forms on our pages",
          inhalt: [
            "When you request a consultation, an evaluation or information via a form on our pages (for example on a sales partner's page, in the tax calculator, in the analysis, in the EXPATS Calculator or on the handbook page), we process:",
            {
              liste: [
                "first name, last name, email address and phone number, for some forms also your address",
                "your answers in the form, for example occupation, income, equity, goals, desired time frame and preferred contact time",
                "the sales partner or referrer whose link you used, and the campaign identifier",
                "your declarations in the form with time, version and wording, and the language you selected",
              ],
            },
            "The legal basis for handling your enquiry is pre-contractual measures (Art. 6(1)(b) GDPR). For information about further offers by email and phone, the legal basis is your separate, voluntary consent (Art. 6(1)(a) GDPR), which you can withdraw at any time, for example by email to " + DATENSCHUTZ_EMAIL + ".",
            "If you have contacted us before, we assign the new enquiry to your existing contact record. Our forms contain a field that is invisible to humans and count requests per IP address in order to fend off automated entries (see “Server logs and protection against misuse”).",
          ],
        },
        {
          id: "anfragen-partner",
          titel: "Handling by our sales partners",
          inhalt: [
            "Our consultations are provided by sales partners who work for us as independent commercial agents. We assign your enquiry to the partner whose link you used, otherwise to a partner we select. The partner handles your enquiry on our behalf and according to our instructions (Art. 28 GDPR) and sees your name, contact details, town, the source of the enquiry and your answers in the form for this purpose. The legal basis is pre-contractual measures taken at your request (Art. 6(1)(b) GDPR).",
            "If a sales partner has entered you as their own contact in our system, the partner is responsible for this data; we only provide the system. Requests about this that reach us are forwarded to the partner.",
          ],
        },
        {
          id: "anfragen-extern",
          titel: "Enquiries via advertisements and partner websites",
          inhalt: [
            "Enquiries you submit in a form within an advertisement on Facebook or Instagram (Meta Lead Ads) or on a website of a cooperation partner reach us via the automation service Zapier (Zapier, Inc., USA) or directly via our interface. We process them like an enquiry via our own forms. The form itself shows which details are requested; Meta's data policy applies to processing by Meta. Zapier processes the data on our behalf. For transfers to the USA see “Transfers to third countries”.",
          ],
        },
        {
          id: "anfragen-objekt",
          titel: "Offering a property",
          inhalt: [
            "Via the property acquisition form, owners or intermediaries can offer us a property. We process the property details, name, date of birth, contact details and marital status of the owners, where applicable bank details and commercial register details, and the name of the intermediary, in order to review the offer and prepare a purchase (Art. 6(1)(b) GDPR).",
          ],
        },
        {
          id: "anfragen-zusammenfuehren",
          titel: "Duplicate records",
          inhalt: [
            "If two records are accidentally created in our system for the same person, we merge them. The older record is kept, the details, documents and history of the newer record are transferred to it, and the newer record is moved to the recycle bin. We note differing details in the history. The legal basis is our legitimate interest in accurate and complete records (Art. 6(1)(f) GDPR in conjunction with Art. 5(1)(d) GDPR).",
          ],
        },
      ],
    },
    {
      id: "handbuch",
      titel: "Handbook page with configurator",
      inhalt: [
        "On the handbook page you can request a personal handbook on investment property. To do so, you answer six questions on your goal, occupation, gross annual income, monthly surplus, equity and preferred start, each by selecting a range. You then enter your first and last name and email address; the phone number is optional.",
        "From your answers we calculate a non-binding range as a model calculation and a classification in three levels (“fits”, “may fit”, “does not fit yet”). Everyone receives their handbook regardless of this classification. We only use it to decide whom our partners contact first (see “Automated decisions and profiling”).",
        "You receive your handbook by email as a personal link that is valid for 30 days. We record whether and when the link is opened. We also create a personal link to the financial self-disclosure, pre-filled with your details, so that you can continue directly if you wish. The email is sent in the name of the sales partner responsible for you, and replies go to them.",
        "Via the handbook page you can also start a financial self-disclosure directly without first requesting a handbook. For this you first enter your contact details. If your email address is not yet known to us, you continue straight to the form and also receive the link by email. If it is already known, we send the link only to that address, so that nobody can reach someone else's details by entering another person's address.",
        "To prevent the forms from being used to flood someone else's address with emails, we limit the number of requests per email address. For this we only store a hash value of the address. We count the steps on the page without personal reference (see “Campaign identifier and counting of page steps”).",
        "The legal basis is pre-contractual measures taken at your request (Art. 6(1)(b) GDPR), and for information about further offers your separate consent (Art. 6(1)(a) GDPR). Handling by the responsible sales partner follows the section “Enquiries, lead forms and responsibility”.",
      ],
    },
    {
      id: "rechner",
      titel: "Tax calculator, analysis and other calculators",
      inhalt: [
        "In the tax calculator you enter your gross annual income, employment, tax class, where applicable your partner's gross income, children, federal state, church tax liability, existing properties and the desired start. We do not store the church tax information with your contact record in the CRM; it is, however, included in your PDF evaluation, where church tax appears as a separate item if it applies. In the analysis we ask, among other things, for age, marital status, household, occupation, net income, equity, loans, fixed costs, experience and goals. In the EXPATS Calculator you enter equity, gross income and marital status.",
        "The calculation runs in your browser. When you request your result, we store your other entries and the result with your contact record so that your adviser can advise you. You receive the tax calculator evaluation as a PDF by email; it is sent via our delivery service Mailgun (see “Sending our emails”). We store the PDF in non-public storage; the link to it is valid for 90 days.",
        "The legal basis is pre-contractual measures taken at your request (Art. 6(1)(b) GDPR), and for information about further offers your separate consent (Art. 6(1)(a) GDPR).",
      ],
    },
    {
      id: "termine",
      titel: "Appointment booking, video consultation and Zoom",
      inhalt: [],
      unterabschnitte: [
        {
          id: "termine-buchung",
          titel: "Appointment booking",
          inhalt: [
            "You can book an appointment with us via a personal or public booking link. We process your name, email address, optionally phone number and message, the selected appointment and, if you wish, the name and email address of an accompanying person. If you book via a public link, we create a contact record for this. You and the responsible adviser receive a confirmation by email and reminders before the appointment. The legal basis is Art. 6(1)(b) GDPR. If you name an accompanying person, please make sure that they agree.",
          ],
        },
        {
          id: "termine-videoraum",
          titel: "Our own video room",
          inhalt: [
            "We hold video consultations and conversations with applicants in our own video room in the browser (WebRTC). Image and sound travel encrypted and, where possible, directly between the participants' devices. If no direct connection is possible, they travel encrypted via a relay server (TURN). The data needed to establish the connection passes through our infrastructure. So that the devices can find each other, they ask public discovery servers (STUN) operated by Google and Cloudflare (Cloudflare, Inc., USA) for their public IP address; these providers receive your IP address in the process.",
            "Conversations are not recorded, neither image nor sound. The chat in the video room is not stored.",
            "The host can start a written transcript, but only after the guests have agreed. You will then see a notice in the room that a transcript is being made. Speech recognition runs entirely in the host's browser; no audio is sent to an external service. Only the text is stored, for as long as necessary for supporting you.",
            "The legal basis is holding the requested conversation (Art. 6(1)(b) GDPR), for the transcript your consent (Art. 6(1)(a) GDPR). We delete the rooms themselves 90 days after they expire.",
          ],
        },
        {
          id: "termine-zoom",
          titel: "Zoom",
          inhalt: [
            "Our weekly sales meeting with our sales partners (Weekly Sales Call) takes place via Zoom (Zoom Communications, Inc., USA). When you take part, Zoom processes your connection and device data as well as image and sound. We do not record Zoom calls. The legal basis is Art. 6(1)(b) GDPR. Zoom processes data on our behalf and is certified under the EU-US Data Privacy Framework. More information: https://explore.zoom.us/en/privacy/",
          ],
        },
      ],
    },
    {
      id: "selbstauskunft",
      titel: "Financial self-disclosure and financing",
      inhalt: [
        "To assess your financing options you complete a financial self-disclosure, where applicable also for a second person. We process:",
        {
          liste: [
            "master data: salutation, title, name, birth name, date of birth, nationality, address, contact details, marital status, matrimonial property regime, children, tax identification number and tax class",
            "whether you are liable to pay church tax",
            "occupation: type of employment, employer or self-employment",
            "finances: income, expenses, loans, assets, guarantees, properties, bank accounts, insurance and maintenance payments",
            "information on creditworthiness, for example on dunning proceedings and your SCHUFA credit report, where you provide it",
            "uploaded documents, for example payslips, tax assessments, bank statements and your identity document",
            "your digital signature (see “Digital signature”)",
          ],
        },
        "Processing serves to assess whether and how a property purchase can be financed for you and to prepare financing (Art. 6(1)(b) GDPR). After you sign, we transfer your master data to your customer profile and create a PDF of the self-disclosure.",
        "Whether you are liable to pay church tax is a mandatory item of the self-disclosure. Banks need it to calculate your disposable net income and your tax burden when assessing financing. We only ask whether church tax applies, not your denomination. Because the information may allow conclusions about a religious affiliation, we use it exclusively to assess and prepare your financing and only pass it to the sales partner responsible for you, our financing partner and the financing bank. The legal basis is Art. 6(1)(b) GDPR.",
        "Your self-disclosure and documents can be seen by the sales partner responsible for you and, once your creditworthiness documents have been released, by our financing partner, who prepares your financing. We pass your data to a financing bank or a financing intermediary to the extent you instruct us to prepare your financing (Art. 6(1)(b) GDPR). The SCHUFA clause contained in the self-disclosure only entitles the financing bank to transmit data to SCHUFA and to obtain information; MOREImmo itself does not obtain SCHUFA reports.",
        "We delete the personal link for completing the form seven days after it expires. If you click “Save for later”, the progress remains in your browser until you delete the site data. Please do not use a shared or third party device for this.",
      ],
    },
    {
      id: "reservierung",
      titel: "Reservation, purchase process and digital signature",
      inhalt: [],
      unterabschnitte: [
        {
          id: "reservierung-daten",
          titel: "Reservation agreement",
          inhalt: [
            "To reserve a property, we process:",
            {
              liste: [
                "first name, last name, birth name, date of birth and optionally place of birth, nationality, address, phone number, email address and matrimonial property regime",
                "optionally your bank details (IBAN) for the refund of a reservation fee",
                "details of the desired property (unit, parking space or garage, address, purchase price) and of the sellers",
                "if a whole building is bought by a company, additionally company name, legal form, address, register court and register number and the role of the representative",
                "whether you need an interpreter for the notarisation and in which language, the contract language and optional free text",
                "your choice regarding the start of the reservation (immediately or after the withdrawal period)",
                "your digital signature with time and, if provided, place",
              ],
            },
            "Processing serves to prepare and carry out the purchase (Art. 6(1)(b) GDPR). After the last signature, you receive the agreement including the information on your right of withdrawal as a PDF by email; the document is also stored in your customer profile. The responsible sales partner and our management are informed of the signature.",
            "To carry out the reservation and the purchase, we transmit the required data to the sellers of the property, the appointed notary, the financing bank and, after notarisation, the property management (Art. 6(1)(b) GDPR). To prepare the purchase contract, we complete a notary form with you, which we send to the notary.",
          ],
        },
        {
          id: "reservierung-unterschrift",
          titel: "Digital signature",
          inhalt: [
            "You sign the self-disclosure, the reservation and other documents digitally on screen, or by phone if you prefer. We store the image of your signature, the time of signing, the time you opened the link, your device's browser identifier (user agent), for the reservation optionally the place, and the wording of the declaration you signed. We do not store your IP address in this process.",
            "This information serves as proof that and when you signed (Art. 6(1)(b) and (f) GDPR). Signature links are valid for 14 days. We delete the signature request 180 days after the link expires; we keep the signed document in accordance with statutory retention periods.",
          ],
        },
      ],
    },
    {
      id: "geldwaesche",
      titel: "Identification under the Anti-Money Laundering Act",
      inhalt: [
        "As a real estate agent, we are obliged under the German Anti-Money Laundering Act (GwG) to identify the parties to a purchase contract we arrange (Section 2(1) no. 14, Section 11 GwG). For this we collect name, place of birth, date of birth, nationality and address as well as type, number and issuing authority of your identity document, and we make a copy of the document. The legal basis is Art. 6(1)(c) GDPR in conjunction with Sections 8, 11 and 12 GwG. We keep these documents for five years (Section 8(4) GwG).",
      ],
    },
    {
      id: "kundenportal",
      titel: "Customer portal",
      inhalt: [],
      unterabschnitte: [
        {
          id: "kundenportal-konto",
          titel: "Account and sign in",
          inhalt: [
            "As a customer you receive access to our customer portal. For your account we process your name, email address, a password (only as a hash value) and the data on your investments. We delete the activation link seven days after it expires or 30 days after it has been used.",
            "You can optionally set up two factor authentication with an authenticator app. We only store your recovery codes as hash values; if you use one, we store the time and IP address. If you sign in with two factor authentication, we store IP address, browser, operating system and approximate location (country and city) to protect your account; we determine the location from the IP address via the external service ip-api.com. If we notice an unusual sign in, we inform you by email.",
            "After five failed sign in attempts within 15 minutes, we lock the account for 15 minutes and store the email address and IP address for this. For security reasons we end sign ins to the customer portal after 30 days at the latest; you then sign in again.",
            "The legal basis is Art. 6(1)(b) GDPR, for the security data our legitimate interest in protecting your account (Art. 6(1)(f) GDPR). In the portal you can export your data and request the deletion of your account at any time.",
          ],
        },
        {
          id: "kundenportal-chat",
          titel: "Chat and notifications",
          inhalt: [
            "In the portal you can chat with your adviser and attach files of up to 20 MB. Messages and attachments can be seen by the chat participants and by MOREImmo administrators. We inform participants of new messages in the portal, by email with a short excerpt and, if you have allowed it in your browser, by push notification. Push notifications are delivered by the push service of your browser vendor; for this we store the address of your push subscription and the browser identifier. The legal basis is Art. 6(1)(b) GDPR, for push notifications your consent (Art. 6(1)(a) GDPR), which you can withdraw in your browser settings.",
          ],
        },
        {
          id: "kundenportal-unterlagen",
          titel: "Documents and phone scan",
          inhalt: [
            "Documents you upload in the portal are stored in non-public storage. With the phone scan you can capture documents with your phone's camera: you open a link that is valid for one hour. The PDF is created on your phone and then stored with your documents. We delete the scan link two days after it expires. The legal basis is Art. 6(1)(b) GDPR.",
          ],
        },
        {
          id: "kundenportal-links",
          titel: "Exposé and property links",
          inhalt: [
            "If we send you a personal link to an exposé or a property view, we count how often the link was opened and when it was first and last opened. On the first visit your adviser receives a notification. We do not store IP address or browser identifier in this process. Such links are valid for 60 days. The legal basis is our legitimate interest in supporting you at the right time (Art. 6(1)(f) GDPR).",
          ],
        },
        {
          id: "kundenportal-betreuung",
          titel: "Support after the purchase",
          inhalt: [
            "After the purchase we continue to support you: we send reminders of appointments and missing documents and document consultations after the purchase. After the notary appointment we ask you by email for a review on Google, with up to two reminders, and for confidential feedback on your sales partner. We congratulate you on your birthday by email. In the portal you can also have the approximate market value of your property estimated (see “AI supported functions”).",
            "The legal basis for reminders of appointments and documents and for documenting consultations is Art. 6(1)(b) GDPR. We send the request for a review, the request for feedback and the birthday greeting as direct marketing on the basis of our legitimate interest in maintaining our customer relationship (Art. 6(1)(f) GDPR). You can object to these emails at any time without giving reasons, for example via the unsubscribe link or by email to " + DATENSCHUTZ_EMAIL + ".",
          ],
        },
      ],
    },
    {
      id: "email",
      titel: "Email communication",
      inhalt: [],
      unterabschnitte: [
        {
          id: "email-versand",
          titel: "Sending our emails",
          inhalt: [
            "We send our automatic emails (for example confirmations, links, reminders and sign in emails) via Lovable's email service, which uses the delivery service Mailgun for this (Mailgun Technologies, Inc., USA). The sender is an address under more.immo, technically via the subdomain notify.more.immo.",
            "We keep a delivery log for every email with recipient address, type of email, time and status. We delete entries for delivered emails after 14 days and for failed or rejected emails after three days. The legal basis is the respective basis of the email, for the log our legitimate interest in traceable delivery (Art. 6(1)(f) GDPR).",
          ],
        },
        {
          id: "email-abmeldung",
          titel: "Unsubscribing and suppression list",
          inhalt: [
            "You can unsubscribe from emails that are not strictly part of an ongoing process via an unsubscribe link. Your address is then added to a suppression list, as it is after a permanent delivery failure or a spam complaint. We keep the suppression list for as long as necessary to respect your objection (Art. 6(1)(c) and (f) GDPR). Emails that are strictly necessary for a process you started, such as a signature or activation link, will still reach you after unsubscribing, except after a spam complaint. We delete a used unsubscribe link 90 days after use.",
          ],
        },
        {
          id: "email-zaehlung",
          titel: "Opening personal links",
          inhalt: [
            "Our emails contain no tracking pixels; we therefore do not record whether you open an email. Many emails, however, contain a personal link, for example to the financial self-disclosure, to a signature, to your handbook or, in the application process, to your applicant page, the questionnaire or contract documents. If you open such a link, we record the time; in emails to applicants the link carries an identifier showing which email it comes from. We do not store IP address or browser identifier in this process.",
            "This tells us whether you have started the process so that we can follow up in time. The legal basis is carrying out the respective process (Art. 6(1)(b) GDPR) or our legitimate interest in handling it reliably (Art. 6(1)(f) GDPR). No consent is required because we do not access your device by loading an image; we only record the request that you trigger yourself.",
          ],
        },
        {
          id: "email-postfach",
          titel: "Emails to us",
          inhalt: [
            "If you send us an email, we process your address and the content in order to deal with your request (Art. 6(1)(b) or (f) GDPR). Our mailboxes are hosted by the provider one.com. We import sender, subject, date and, when opened, the text of incoming emails into our CRM so that your adviser can see the history.",
          ],
        },
      ],
    },
    {
      id: "bewerbung",
      titel: "Applications",
      inhalt: [
        "If you apply to us, for example as a sales partner, we process your first name, last name, email address, mobile number, town, your details on experience and motivation, how you heard about us, the position and, where applicable, your CV. We inform the team responsible for applications by email and in the CRM. In our CRM, your application can only be seen by the areas responsible for applications: human resources, back office, administration and management. You receive a personal applicant page whose link is valid for 365 days; we delete the page 30 days after the link expires.",
        "For an introductory meeting we send you a questionnaire whose link is valid for 14 days. Among other things, it asks about region, professional situation and background, experience, available time, income goal, start date, availability, a licence under Section 34c of the German Trade Regulation Act, business registration and any secondary employment or non-compete restrictions. We store your consent with time and version. From the answers we derive a preliminary classification that only supports the order of invitations; a human always makes the decision.",
        "We hold conversations in our video room (see “Appointment booking, video consultation and Zoom”) or book them via Calendly. Our team may have a summary of the notes from the first conversation created with AI (see “AI supported functions”).",
        "Applications you submit via a form within an advertisement on Facebook or Instagram reach us via Zapier (see “Enquiries via advertisements and partner websites”), including the details requested there, for example income, available hours, current situation and age.",
        "The legal basis for handling your application is the initiation of a contractual relationship following your application (Art. 6(1)(b) GDPR). The details in the questionnaire are optional; for them your consent applies, which you give in the questionnaire and can withdraw at any time (Art. 6(1)(a) GDPR). If no cooperation results, we delete your data once it is no longer required for the procedure and possible legal claims.",
      ],
    },
    {
      id: "tippgeber",
      titel: "Referrers and recommendations",
      inhalt: [
        "Referrers and customers can recommend people to us who are interested in an investment property. We receive the name and contact details and, where the recommending person knows and provides them, optional details about your concern, for example goal, occupation, income, equity and whether, to their knowledge, your SCHUFA record is free of negative entries. The recommending person confirms to us by ticking a box that you agree to the disclosure of your contact details; we store this confirmation with time and wording. We make contact to offer a consultation (Art. 6(1)(f) GDPR, legitimate interest in handling the recommendation).",
        "If you reach a sales partner's page via a referrer's link, we count the visit for the referrer without IP address or other information about you. If you submit an enquiry, we note the referrer on your contact record so that the referral can be settled (Art. 6(1)(f) GDPR).",
      ],
    },
    {
      id: "ki",
      titel: "AI supported functions",
      inhalt: [
        "For some tasks we use AI models from Google (Gemini), which we access via Lovable's AI gateway. Lovable and Google process the data on our behalf. We use AI for:",
        {
          liste: [
            "summaries of first conversations with prospective customers and applicants from our team's notes, which may include name, occupation, family, income and equity",
            "reading contact details from a photo, for example a business card or a form",
            "reading the terms of a loan agreement you give us",
            "estimating the market value of your property in the customer portal from address, purchase price and purchase date",
            "evaluating property documents and writing property texts",
          ],
        },
        "The results are working aids for our team or non-binding estimates. The AI does not make decisions about you. The legal basis is that of the underlying processing (Art. 6(1)(b) GDPR) and our legitimate interest in efficient handling (Art. 6(1)(f) GDPR).",
      ],
    },
    {
      id: "telefon-kalender",
      titel: "Telephony and calendar",
      inhalt: [
        "Our telephony runs via sipgate (sipgate GmbH, Gladbacher Straße 74, 40219 Düsseldorf, Germany). For calls we store phone number, time, duration, outcome and the related contact in the CRM (Art. 6(1)(b) and (f) GDPR).",
        "Staff can connect their calendar at Google (Google Ireland Limited) or Apple iCloud (Apple Distribution International Ltd., Hollyhill Industrial Estate, Hollyhill, Cork, Ireland) with the CRM. Appointments and follow ups, which may contain your name, are then sent there (Art. 6(1)(f) GDPR, legitimate interest in reliable scheduling).",
      ],
    },
    {
      id: "empfaenger",
      titel: "Recipients and processors",
      inhalt: [
        "Within MOREImmo, our staff and sales partners access your data through roles in the CRM. Sales partners handle contacts that come through us as our processors (see “Handling by our sales partners”). Beyond that, we only disclose data where permitted by law, where you have consented or where it is necessary to perform a contract. Recipients are the financing partners, banks, sellers, notaries and property managers named in the sections above, as well as the following service providers:",
        {
          tabelle: {
            kopf: ["Recipient", "Purpose"],
            zeilen: [
              ["MOREImmo sales partners (processors)", "Advising and supporting contacts that come through us"],
              ["Lovable.dev", "Hosting, server functions, email delivery, AI gateway"],
              ["Supabase, Inc. (Lovable Cloud)", "Database, sign in, file storage"],
              ["Mailgun Technologies, Inc. (via Lovable)", "Delivery of our emails"],
              ["Google Ireland Limited", "AI models (via Lovable), reCAPTCHA, discovery servers in the video room, calendar, YouTube videos in the CRM (after click)"],
              ["one.com", "Email mailboxes"],
              ["Zapier, Inc.", "Transfer of enquiries and applications from advertisements"],
              ["Zoom Communications, Inc.", "Weekly sales meeting (Weekly Sales Call)"],
              ["sipgate GmbH", "Telephony"],
              ["Cloudflare, Inc.", "Discovery servers in the video room"],
              ["Calendly LLC", "Appointment booking (after click)"],
              ["OpenStreetMap Foundation", "Maps and address search (Nominatim), also locating customer addresses in the CRM"],
              ["komoot GmbH (Photon)", "Locating postcode and town for property recommendations in the CRM"],
              ["ipify (api.ipify.org)", "Querying the own IP address, only with the IP allowlist switched on in the CRM"],
              ["ip-api.com", "Approximate location at sign in"],
              ["Apple Distribution International Ltd.", "Calendar (iCloud)"],
            ],
          },
        },
        "For the Meta Pixel and the Conversions API we are joint controllers with the relevant sales partner; the recipient of the data is Meta Platforms Ireland Limited (see “Meta Pixel and Conversions API”).",
      ],
    },
    {
      id: "drittland",
      titel: "Transfers to third countries",
      inhalt: [
        "Some providers are based in the USA or access data from there, in particular Supabase, Mailgun, Zapier, Zoom, Cloudflare and Calendly as well as Google and Meta. For the USA, an adequacy decision of the EU Commission exists for companies certified under the EU-US Data Privacy Framework. Where a provider is not certified, we base the transfer on the standard contractual clauses of the EU Commission (Art. 46(2)(c) GDPR). A separate adequacy decision exists for the United Kingdom. You can obtain a copy of the safeguards on request to " + DATENSCHUTZ_EMAIL + ".",
      ],
    },
    {
      id: "speicherdauer",
      titel: "Retention periods",
      inhalt: [
        "We only store personal data for as long as necessary for the respective purpose. We then delete it unless statutory retention periods apply; in that case we delete it once those periods have expired. The following periods apply to individual data:",
        {
          tabelle: {
            kopf: ["Data", "Retention period"],
            zeilen: [
              ["Contract and transaction documents (reservation, self-disclosure, purchase)", "for the duration of the business relationship, then in accordance with the statutory retention periods of six, eight or ten years (Section 257 HGB, Section 147 AO; accounting vouchers eight years since 1 January 2025)"],
              ["Identification documents under the Anti-Money Laundering Act", "five years (Section 8(4) GwG)"],
              ["Proof of consent to telephone advertising", "five years from each use (Section 7a UWG)"],
              ["Campaign identifier in the browser", "30 days, only with consent"],
              ["Links to the financial self-disclosure", "deleted seven days after expiry"],
              ["Activation links for the customer portal", "deleted seven days after expiry or 30 days after use"],
              ["Phone scan links", "deleted two days after expiry"],
              ["Signature requests", "deleted 180 days after the link expires"],
              ["Email delivery log", "14 days, three days for errors"],
              ["Used unsubscribe links", "90 days"],
              ["Email suppression list", "as long as necessary to respect your objection"],
              ["Activity log in the CRM", "180 days"],
              ["Video rooms", "90 days after expiry"],
              ["Applicant pages", "30 days after the link expires"],
              ["Sign ins to the customer portal", "ended after 30 days at the latest"],
            ],
          },
        },
      ],
    },
    {
      id: "profiling",
      titel: "Automated decisions and profiling",
      inhalt: [
        "We do not make decisions based solely on automated processing that produce legal effects concerning you or similarly significantly affect you (Art. 22 GDPR).",
        "In the analysis, the tax calculator and on the handbook page we automatically classify your details, for example into the levels “fits”, “may fit” and “does not fit yet”, and derive an assessment of urgency. This is an evaluation of personal aspects within the meaning of Art. 4(4) GDPR (profiling). The classification does not exclude anyone: you receive your result or handbook in any case. It does not replace a financing commitment or credit check and only determines the order in which our partners make contact. Whether financing is possible is decided by people, ultimately by the financing bank. Likewise, the preliminary classification in the application process only supports the order of invitations.",
        "The legal basis is our legitimate interest in prioritising enquiries sensibly (Art. 6(1)(f) GDPR). You can object to this processing.",
      ],
    },
    {
      id: "rechte",
      titel: "Your rights",
      inhalt: [
        "You have the following rights regarding your personal data:",
        {
          liste: [
            "access (Art. 15 GDPR)",
            "rectification (Art. 16 GDPR)",
            "erasure (Art. 17 GDPR)",
            "restriction of processing (Art. 18 GDPR)",
            "data portability (Art. 20 GDPR)",
            "withdrawal of consent with effect for the future (Art. 7(3) GDPR); the lawfulness of processing carried out until then remains unaffected",
          ],
        },
        "Right to object (Art. 21 GDPR): Where we process data on the basis of our legitimate interests (Art. 6(1)(f) GDPR), you can object at any time on grounds relating to your particular situation. Where we process data for direct marketing, you can object at any time without giving reasons; we will then no longer use your data for this purpose.",
        `An informal message to ${DATENSCHUTZ_EMAIL} or to the address above is sufficient to exercise your rights. In the customer portal you can also export your data yourself and request deletion.`,
        "You have the right to lodge a complaint with a data protection supervisory authority. The authority responsible for us is:",
        {
          zeilen: [
            "Bayerisches Landesamt für Datenschutzaufsicht (BayLDA)",
            "Promenade 18",
            "91522 Ansbach, Germany",
            "https://www.lda.bayern.de",
          ],
        },
      ],
    },
    {
      id: "pflicht",
      titel: "Obligation to provide data",
      inhalt: [
        "For the purchase of a property through us, you are obliged under the Anti-Money Laundering Act to provide us with the details and documents required for identification (Section 11(6) GwG); without them we may not act. Otherwise you are not obliged to provide us with data. Without the details marked as mandatory, however, we cannot handle your enquiry, application or reservation or prepare a contract.",
      ],
    },
    {
      id: "aenderungen",
      titel: "Changes to this policy",
      inhalt: [
        "We update this privacy policy when our services or the legal situation change. The version published on this page applies. This English version is a translation. In case of discrepancies, the German version prevails.",
      ],
    },
  ],
};

export const DATENSCHUTZ_TEXTE: Record<"de" | "en", DatenschutzFassung> = { de, en };
