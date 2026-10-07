/**
 * Die Eintragung des Interessenten.
 *
 * SIE STEHT SEIT DEM 17.09.2026 VOR DEM ERGEBNIS, nicht mehr darunter. Der
 * Rechner soll Leads bringen, fuer das Haus und fuer die Vertriebspartner, und
 * wer die Zahl schon gesehen hat, traegt sich kaum noch ein. Damit ist der
 * Steuerrechner an dieser Stelle wie das Analysetool gebaut. Die Regie fuehrt
 * `SteuerRechnerStrecke`, dort steht auch, warum das KEIN Zugriffsschutz ist.
 *
 * Gegen die Kontaktdaten gibt es GENAU EINES: die persoenliche Auswertung als
 * PDF PER MAIL. Das Ergebnis auf dem Bildschirm entfaellt oeffentlich seit dem
 * 17.09.2026, siehe den Kopf von `SteuerRechnerStrecke`.
 *
 * Warum das so ist: Nur wer eine echte Adresse eintraegt, bekommt etwas. Eine
 * Wegwerfadresse fuehrt ins Leere, und genau das ist der Zweck. Dieselbe Logik
 * gilt fuer die Telefonnummer, denn der Anruf ist der zweite Teil der Zusage.
 *
 * DESHALB MUSS DER BESUCHER DAS VORHER WISSEN. Wer erst nach dem Absenden
 * erfaehrt, dass die Zahl nicht auf dem Bildschirm erscheint, fuehlt sich
 * uebergangen, und genau der traegt beim naechsten Mal etwas Erfundenes ein.
 * Die Texte oben im Formular und die Knopfbeschriftung sagen es deshalb
 * ausdruecklich.
 *
 * Was passiert, wenn die Mail nicht ankommt? Ein Interessent, der seine Daten
 * hergegeben und nichts bekommen hat, ist schlimmer als einer, der sich nie
 * eingetragen hat. Und seit das Ergebnis nicht mehr auf dem Bildschirm steht,
 * waere er dann voellig leer ausgegangen. Deshalb drei Ebenen:
 *   1  Die Mail mit dem PDF im Anhang, dazu der Knopf auf die abgelegte
 *      Auswertung, falls ein Postfach Anhaenge aussortiert.
 *   2  Meldet der Server, dass die Mail nicht hinausging, steht dieselbe
 *      Adresse sofort auf der Bestaetigungsseite. NUR DANN. Ging die Mail
 *      hinaus, gibt es hier keinen Knopf zur Auswertung, denn dann waere das
 *      Ergebnis eben doch mit einem Klick auf dem Bildschirm.
 *   3  Faellt auch die Ablage aus, wird die Auswertung im Browser
 *      heruntergeladen. Sie liegt zu diesem Zeitpunkt ohnehin schon fertig da.
 * Und ueber allem: Der Lead ist vorher abgeschickt. Der Partner meldet sich
 * also auch dann, wenn kein einziger dieser drei Wege traegt.
 *
 * Die beiden Einwilligungshaken kommen aus `EinwilligungFelder`, der Wortlaut
 * aus `leadEinwilligung.ts`. Ein zweiter Wortlaut waere ein zweiter Nachweis in
 * der Datenbank, und im Streitfall waere dann keiner mehr etwas wert.
 */
import { useId, useRef, useState } from "react";
import { Check, Loader2, Mail } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import EinwilligungFelder from "@/components/analysis/EinwilligungFelder";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { STEUERRECHNER_TEXTE } from "@/components/steuerrechner/steuerrechnerTexte";
import { sendeSteuerLead } from "@/lib/steuerrechnerLead";
import { ladeAuswertungHerunter, sendeSteuerAuswertung } from "@/lib/steuerrechnerVersand";
import type { Ergebnis } from "@/lib/steuerRechner";
import type { SteuerAntworten } from "@/lib/steuerrechnerStrecke";
import type { BeraterInfo } from "@/pages/AnalysePublic";

interface Props {
  antworten: SteuerAntworten;
  ergebnis: Ergebnis;
  berater?: BeraterInfo;
  /** Wird nach erfolgreicher Eintragung gemeldet, fuer den Zaehler. */
  onAbgesendet?: () => void;
  /**
   * Steht das Formular am ENDE der oeffentlichen Strecke? Dann sagen die Texte,
   * dass die Auswertung per Mail kommt und das Ergebnis nicht auf dem
   * Bildschirm erscheint. Ohne die Angabe bleibt der alte Wortlaut.
   */
  vorErgebnis?: boolean;
  /**
   * Die Eintragung ist durch.
   *
   * Nur eine Meldung, kein Weg weiter: Oeffentlich endet die Strecke hier. Die
   * Strecke blendet daraufhin den Rueckweg aus und zaehlt den Abschluss.
   */
  onFertig?: () => void;
  /**
   * Oeffnet den Einblender mit dem Ansprechpartner, hinter dem Knopf
   * „Wie es jetzt weitergeht“ auf der Bestaetigung. Fehlt die Angabe, steht
   * der Knopf nicht da.
   */
  onAnsprechpartner?: () => void;
  /**
   * Der Weg weiter zum Ergebnis.
   *
   * Bleibt fuer Fassungen, in denen nach der Eintragung noch etwas kommt. Die
   * oeffentliche Strecke uebergibt das NICHT mehr, und ohne diese Angabe gibt
   * es auf der Bestaetigung auch keinen Knopf „Ergebnis ansehen“.
   */
  onWeiter?: (info: { email: string; hinweis: string | null; ersatzLink: string | null }) => void;
}

const FELD =
  "h-11 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30";

export default function SteuerFormular({
  antworten,
  ergebnis,
  berater,
  onAbgesendet,
  vorErgebnis = false,
  onFertig,
  onAnsprechpartner,
  onWeiter,
}: Props) {
  const id = useId();
  /* Die Sprache der Seite geht mit dem Lead (Einwilligung im gelesenen
     Wortlaut, Kundensprache des neuen Kontakts) und mit dem Versand (PDF und
     Mail). Ohne Provider, also im CRM, ist sie Deutsch. */
  const sprache = useSeitenSprache();
  const t = useSeitenTexte(STEUERRECHNER_TEXTE).formular;
  const [beruehrt, setBeruehrt] = useState(false);
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [einwilligung, setEinwilligung] = useState(false);
  const [werbeeinwilligung, setWerbeeinwilligung] = useState(false);
  /* Einfache Bot-Pruefung fuer den Versand (seit 04.10.2026): ein Feld, das
     ein Mensch nie sieht, und die Zeit seit dem Oeffnen des Formulars. */
  const [hp, setHp] = useState("");
  const geoeffnetAm = useRef(Date.now());
  const [einwilligungFehlt, setEinwilligungFehlt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [fertig, setFertig] = useState(false);
  /** Steht nur da, wenn die Mail den Interessenten nicht erreicht hat. */
  const [ersatzLink, setErsatzLink] = useState<string | null>(null);
  const [hinweis, setHinweis] = useState<string | null>(null);

  const emailOk = /.+@.+\..+/.test(email.trim());
  const vollstaendig =
    !!vorname.trim() && !!nachname.trim() && emailOk && telefon.trim().length >= 6;

  const absenden = async () => {
    if (!vollstaendig || laeuft) return;
    if (!einwilligung) {
      setEinwilligungFehlt(true);
      setFehler(t.einwilligungFehlt);
      return;
    }
    setEinwilligungFehlt(false);
    setLaeuft(true);
    setFehler(null);

    const antwort = await sendeSteuerLead(
      { vorname, nachname, email, telefon, einwilligung, werbeeinwilligung },
      antworten,
      ergebnis,
      berater,
      sprache,
    );

    if (!antwort.ok) {
      setLaeuft(false);
      setFehler(antwort.fehler || t.fehlerAllgemein);
      return;
    }

    onAbgesendet?.();

    /* Ab hier ist der Lead sicher angekommen. Alles Weitere kann schiefgehen,
       ohne dass der Interessent verloren waere, deshalb bleibt die Bestaetigung
       in jedem Fall stehen und nur der Hinweis darunter aendert sich. */
    const versand = await sendeSteuerAuswertung(
      { vorname, nachname, email, hp, dauerMs: Date.now() - geoeffnetAm.current },
      ergebnis,
      antworten,
      berater,
      sprache,
    );

    if (versand.ok && versand.mailVersendet) {
      setHinweis(null);
      setErsatzLink(null);
    } else if (versand.pdfUrl) {
      // Abgelegt, aber die Mail ging nicht hinaus. Dann eben direkt hier.
      setErsatzLink(versand.pdfUrl);
      setHinweis(t.hinweisAblage);
    } else if (versand.blob && versand.dateiname) {
      // Auch die Ablage ist ausgefallen. Die Datei ist fertig, also bekommt er
      // sie direkt aus dem Browser.
      try {
        ladeAuswertungHerunter(versand.blob, versand.dateiname);
        setHinweis(t.hinweisDownload);
      } catch (e) {
        console.error("Steuerauswertung konnte nicht heruntergeladen werden", e);
        setHinweis(t.hinweisNichtZugestellt);
      }
    } else {
      setHinweis(t.hinweisNichtErstellt);
    }

    setLaeuft(false);
    setFertig(true);
    onFertig?.();
  };

  if (fertig) {
    return (
      <div data-ui="card" role="status" className="rounded-2xl border border-border bg-card p-6 text-center md:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-lg font-semibold text-foreground">
          {hinweis ? t.fertigTitelHinweis : t.fertigTitel}
        </h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {!hinweis && <>{t.fertigGeschickt(email.trim())} </>}
          {berater?.name ? t.meldetSichName(berater.name) : t.meldetSich}
        </p>
        {hinweis && (
          <p className="mx-auto mt-3 max-w-md text-xs leading-relaxed text-muted-foreground">
            {hinweis}
          </p>
        )}
        {/* Der Knopf zur Auswertung steht NUR da, wenn die Mail nicht hinausging.
            Sonst waere das Ergebnis eben doch mit einem Klick auf dem Bildschirm,
            und genau das soll es oeffentlich nicht mehr geben. Faellt die Mail
            aus, wiegt das andere schwerer: Wer seine Daten gegeben hat, darf
            nicht mit leeren Haenden dastehen. */}
        {ersatzLink && (
          <a
            href={ersatzLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t.auswertungOeffnen}
          </a>
        )}
        {/* „Wie es jetzt weitergeht“: wer sich meldet und wie man ihn selbst
            erreicht. Steht hier, weil die Ergebnisseite oeffentlich wegfaellt
            und diese Bestaetigung damit die letzte Seite der Strecke ist. */}
        {onAnsprechpartner && (
          <button
            type="button"
            onClick={onAnsprechpartner}
            className="mt-5 inline-flex min-h-[2.75rem] items-center justify-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {t.wieWeiter}
          </button>
        )}
        {/* Nur fuer Fassungen, in denen nach der Eintragung noch etwas kommt.
            Die oeffentliche Strecke uebergibt `onWeiter` nicht mehr. */}
        {onWeiter && (
          <button
            type="button"
            onClick={() => onWeiter({ email: email.trim(), hinweis, ersatzLink })}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t.ergebnisAnsehen}
          </button>
        )}
      </div>
    );
  }

  return (
    <div data-ui="card" className="steuer-form-layout rounded-2xl border border-border bg-card p-6 md:p-8">
      <div className="steuer-form-intro">
      <h3 className="text-lg font-semibold text-foreground">
        {vorErgebnis ? t.titel : t.titelAlt}
      </h3>
      {/* Der Satz sagt VOR dem Absenden, was danach passiert und was nicht.
          Wer erst hinterher merkt, dass die Zahl nicht auf dem Bildschirm
          erscheint, fuehlt sich uebergangen. */}
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {vorErgebnis ? t.einleitung : t.einleitungAlt}
      </p>

      <div className="steuer-form-benefits"><h4>{t.mitnehmenTitel}</h4><p>{t.mitnehmenText}</p><p className="mt-4 font-medium text-accent-foreground">{vorErgebnis ? t.adresseHinweis : t.adresseHinweisAlt}</p></div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void absenden(); }}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label className="steuer-form-label" htmlFor={`${id}-vorname`}>{t.vorname}</label><input
          id={`${id}-vorname`}
          required
          value={vorname}
          onChange={(e) => setVorname(e.target.value)}
          placeholder={t.vorname}
          className={FELD}
          autoComplete="given-name"
        /></div>
        <div><label className="steuer-form-label" htmlFor={`${id}-nachname`}>{t.nachname}</label><input
          id={`${id}-nachname`}
          required
          value={nachname}
          onChange={(e) => setNachname(e.target.value)}
          placeholder={t.nachname}
          className={FELD}
          autoComplete="family-name"
        /></div>
        <div className="sm:col-span-2"><label className="steuer-form-label" htmlFor={`${id}-email`}>{t.email}</label><input
          id={`${id}-email`}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t.email}
          onBlur={() => setBeruehrt(true)}
          aria-invalid={beruehrt && !emailOk}
          aria-describedby={beruehrt && !emailOk ? `${id}-email-fehler` : undefined}
          type="email"
          className={`${FELD} sm:col-span-2`}
          autoComplete="email"
        />{beruehrt && !emailOk && <p id={`${id}-email-fehler`} className="steuer-field-error">{t.emailUngueltig}</p>}</div>
        <div className="sm:col-span-2">
          <label className="steuer-form-label" htmlFor={`${id}-telefon`}>{t.telefon}</label>
          <PhoneInput id={`${id}-telefon`} required value={telefon} onChange={setTelefon} />
        </div>
        {/* Honigtopf, für Menschen unsichtbar und nicht erreichbar */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor={`${id}-website`}>Website</label>
          <input id={`${id}-website`} type="text" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
        </div>
      </div>

      <div className="mt-4">
        <EinwilligungFelder
          einwilligung={einwilligung}
          onEinwilligung={setEinwilligung}
          werbung={werbeeinwilligung}
          onWerbung={setWerbeeinwilligung}
          fehlt={einwilligungFehlt}
          /* Derselbe Wortlaut, der mit dem Lead als Nachweis hinausgeht. */
          sprache={sprache}
        />
      </div>

      {fehler && !einwilligungFehlt && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          {fehler}
        </p>
      )}

      <button
        type="submit"
        disabled={!vollstaendig || laeuft}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {laeuft ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Mail className="h-4 w-4" aria-hidden="true" />
        )}
        {t.absenden}
      </button>
      </form>
    </div>
  );
}
