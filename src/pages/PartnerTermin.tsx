import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarCheck, CalendarClock, Check, Clock, Copy, Mail, Phone, User } from "lucide-react";
import { useSeitentitel, oeffentlicherTitel } from "@/lib/seitentitel";
import {
  Buehne, Balken, Kennung, FLAECHE_FELD, FLAECHE_FELD_KNOPF, FLAECHE_HINWEIS,
} from "@/components/videoraum/Buehne";
import { Karte, KartenTitel } from "@/components/videoraum/Warteraum";
import {
  BuchungLaedt, BuchungMeldung, Fehlerzeile, Hauptknopf, Nebenknopf, Schrittleiste,
} from "@/components/buchung/Bausteine";
import { DatumFeld, UhrzeitFeld } from "@/components/buchung/TerminFelder";
import { langesDatumAusIso } from "@/lib/datumsformate";
import {
  bestaetigePartnertermin, ladePartnerterminMitGrund,
  type PartnerAnlass, type PartnerKunde, type PartnerTermin as Termin, type PartnerterminZugang,
  type ZugangFehler, ZUGANG_FEHLER_CODE,
} from "@/lib/partnerterminStore";
import { PARTNERTERMIN_FEHLER_TEXTE } from "@/lib/partnerterminFehlerTexte";
import { useUser } from "@/contexts/UserContext";
import { datumLangText } from "@/lib/sprachFormat";
import { ZweiKlickEinbettung } from "@/components/cookie/ZweiKlickEinbettung";
import { texteFuer, useLinkSprache, type Sprache } from "@/lib/seitenSprache";
import { PARTNER_TERMIN_TEXTE, dauerAnzeige, istPartnerAnlass, type PartnerTerminTexte } from "./partnerTerminTexte";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";

/**
 * Die Terminseite des Vertriebspartners, unter `/terminwahl/:token`.
 *
 * ## Warum es diese Seite gibt
 *
 * Jeder Partner terminiert über seinen eigenen Kalenderdienst, in der Regel
 * Calendly. Der meldet uns nichts zurück: Der Kunde bucht dort, und im CRM
 * steht nichts. Der Partner trug den Termin von Hand nach, oder er vergaß es.
 *
 * Christian hat am 21.09.2026 dieselbe Lösung wie beim Bewerber bestellt. Der
 * fremde Kalender steckt in unserer eigenen Seite, und daneben wird die
 * gebuchte Zeit eingetragen. Damit steht sie sofort in der Akte.
 *
 * ## Nur für den Partner, dem der Link gehört
 *
 * Seit dem 29.09.2026 (Christians Freigabe) ist die Seite ausschließlich für
 * den angemeldeten Vertriebspartner, dem der Link gehört
 * (`buchung_links.mitarbeiter_id`), nicht für Kunden. Ohne Anmeldung steht ein
 * Hinweis mit Weg zur Anmeldung da, und die Datenbank wird gar nicht erst
 * gefragt. Wer angemeldet ist, aber nicht Besitzer, sieht dieselbe neutrale
 * Ablehnung wie bei einem ungültigen Link. Die Grenze zieht Migration
 * 20260929130000 in der Datenbank; bis sie läuft, prüft die Seite selbst über
 * `zugang.kunde` (siehe `PartnerKunde`). `?intern=1` aus alten Links wird
 * schlicht nicht mehr gelesen.
 *
 * ## Warum zwei Schritte
 *
 *   1. Anliegen. Ein Partner hat bis zu vier Kalender, für Erstgespräch,
 *      Beratung, Objekt und Finanzierung. Erst die Wahl sagt, welcher gezeigt
 *      wird. Hat er nur einen, entfällt der Schritt: Eine Auswahl aus einem
 *      einzigen Eintrag ist keine Auswahl.
 *   2. Zeit wählen und bestätigen, nebeneinander. Links der eingebettete
 *      Kalender, rechts Datum und Uhrzeit von Hand, weil der fremde Kalender
 *      sie uns nicht meldet.
 *
 * ## Warum die Bestätigung neben dem Kalender steht
 *
 * Bis zum 21.09.2026 lag dazwischen ein eigener Schritt mit dem Knopf „Ich habe
 * gebucht". Wer gerade gebucht hat, hat die Zeit noch vor Augen, und genau
 * dieser Klick kostet die Leute, die danach ohne Bestätigung weggehen. Neben
 * dem Kalender bleibt das Feld im Blick, dieselbe Aufteilung wie auf der
 * Bewerberseite unter `/kennenlerngespraech/:token`.
 *
 * ## Warum nichts erzwungen wird
 *
 * Wer die Bestätigung überspringt, hat trotzdem gebucht. Die Seite sagt das
 * auch. Ein Pflichtfeld hinter einer bereits erfolgten Buchung lässt Leute
 * glauben, die Buchung sei nicht durchgegangen, und sie buchen ein zweites Mal.
 *
 * ## Sprache
 *
 * Der Partner sieht die Seite als Werkzeug auf Deutsch, außer er setzt selbst
 * `?lang=en`, etwa wenn der Kunde neben ihm sitzt. Die Kundensprache aus dem
 * Token wird nicht mehr gefragt. Texte in `partnerTerminTexte.ts`.
 *
 * Den eingebetteten Kalender (meist Calendly) lässt die Seite unverändert.
 * Calendly wählt seine Sprache selbst; einen sicheren Adresszusatz dafür gibt
 * es nicht.
 */

/**
 * Die vier festen Anlässe aus `partnerTerminTexte.ts`, in beiden Sprachen.
 * Die Datenbank schickt sie in Ersatzschreibweise („Erstgespraech“), deshalb
 * zählt hier der Schlüssel und nicht ihr Wortlaut. Alles andere bleibt.
 */
function anlassAnzeige(
  a: { anlass: string; bezeichnung: string; beschreibung?: string },
  t: PartnerTerminTexte,
): { bezeichnung: string; beschreibung: string } {
  if (istPartnerAnlass(a.anlass)) return t.anlaesse[a.anlass];
  return { bezeichnung: a.bezeichnung, beschreibung: a.beschreibung ?? "" };
}

/**
 * Der Termin dieser Gesprächsart, dessen Zeit sich noch korrigieren lässt.
 * Nur ihn ändert ein neues Eintragen; jeder andere Fall legt einen neuen an
 * (Migration 20260929130000).
 */
function offenerTermin(z: PartnerterminZugang | null, anlass: string): Termin | undefined {
  if (!z || !anlass) return undefined;
  return z.termine.find((t) => t.anlass === anlass && t.korrigierbar);
}

/**
 * Vorbelegung für „Gehört zu“: das Investment am Link, sonst das einzige,
 * sonst das des passenden oder des zuletzt eingetragenen Termins, sofern es
 * noch unter den laufenden steht.
 */
function vorbelegtesInvestment(z: PartnerterminZugang | null, termin?: Termin): string {
  if (!z) return "";
  if (z.investmentId) return z.investmentId;
  if (z.investments.length === 1) return z.investments[0].id;
  const bisher = termin?.investmentId
    ?? [...z.termine].reverse().find((t) => t.investmentId)?.investmentId;
  return bisher && z.investments.some((i) => i.id === bisher) ? bisher : "";
}

/** Langes Datum aus JJJJ-MM-TT. Deutsch wie bisher, Englisch über `sprachFormat`. */
function langesDatum(iso: string, sprache: Sprache): string {
  return sprache === "en" ? datumLangText(iso, "en", { wochentag: true }) || iso : langesDatumAusIso(iso);
}

/** Der eingebettete Kalender, ohne den Zustimmungsbanner des Dienstes. */
function kalenderAdresse(url: string): string {
  /*
    Die Zusätze versteht nur Calendly. Bei jedem anderen Dienst blieben sie
    wirkungslose Anhängsel in der Adresse, und manche Seite stolpert darüber.
    Deshalb hängen sie nur dort dran, wo sie etwas bewirken.
  */
  if (!/(^|\.)calendly\.com$/i.test(hostVon(url))) return url;
  const trenner = url.includes("?") ? "&" : "?";
  return `${url}${trenner}hide_gdpr_banner=1&hide_landing_page_details=1&primary_color=087AC7`;
}

/**
 * Kalenderdienste, die sich nicht einbetten lassen.
 *
 * Fantastical setzt in seiner Sicherheitsregel `frame-ancestors 'self'`, die
 * Seite darf also ausschliesslich von fantastical.app selbst eingebettet
 * werden. Am 21.09.2026 nachgemessen: Der Kopf der Antwort sagt das
 * ausdruecklich. Der Rahmen bleibt deshalb leer und zeigt nur den Satz
 * "hat die Verbindung abgelehnt".
 *
 * Umgehen laesst sich das nicht, es ist eine Entscheidung des Anbieters. Statt
 * eines toten Rahmens steht dort deshalb ein Knopf, der den Kalender in einem
 * eigenen Fenster oeffnet. Der Ablauf bleibt derselbe: buchen, zurueckkommen,
 * Zeit eintragen.
 *
 * Calendly steht bewusst nicht in dieser Liste, es erlaubt das Einbetten. Wer
 * einen weiteren Dienst ergaenzt, misst vorher nach:
 * `curl -I <adresse>` und in `content-security-policy` nach `frame-ancestors`
 * sehen.
 */
const NICHT_EINBETTBAR = ["fantastical.app"];

/** Laesst sich dieser Kalender in unsere Seite einbetten? */
function einbettbar(url: string): boolean {
  const host = hostVon(url);
  return !NICHT_EINBETTBAR.some((d) => host === d || host.endsWith("." + d));
}

function hostVon(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export default function PartnerTermin() {
  const { token = "" } = useParams<{ token: string }>();
  /*
    Der Anlass darf in der Adresse stehen: `/terminwahl/<token>?anlass=beratung`.
    So kann ein Knopf im Kundenprofil direkt auf ein bestimmtes Gespraech
    zeigen, und die Frage "worum geht es" ist schon beantwortet.

    Die Vorwahl sperrt nichts. Ueber "Anderes Anliegen" geht es zurueck in die
    Auswahl, und ein Anlass, den dieser Partner gar nicht anbietet, wird
    schlicht ignoriert.
  */
  const [suche] = useSearchParams();
  const vorgewaehlt = suche.get("anlass") || "";
  // Ohne Token fragt der Hook den Server nicht; es gilt `?lang=` oder Deutsch.
  const { sprache, bereit } = useLinkSprache("partnertermin", null);
  const t = texteFuer(PARTNER_TERMIN_TEXTE, sprache);
  useSeitentitel(oeffentlicherTitel(t.seitentitel));
  const { isLoggedIn, loading: anmeldungLaedt } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const [zugang, setZugang] = useState<PartnerterminZugang | null>(null);
  const [fehlgrund, setFehlgrund] = useState<ZugangFehler | undefined>();
  const [ladeTechnik, setLadeTechnik] = useState<string | undefined>();
  const [laedt, setLaedt] = useState(true);
  const [anlass, setAnlass] = useState("");
  const [schritt, setSchritt] = useState(0);
  const [datum, setDatum] = useState("");
  const [uhrzeit, setUhrzeit] = useState("");
  const [investmentId, setInvestmentId] = useState("");
  const [arbeitet, setArbeitet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [ergebnis, setErgebnis] = useState<Termin | null>(null);
  // Über „Zeit korrigieren" geht es aus der Bestätigung zurück in die Eingabe.
  const [korrigiert, setKorrigiert] = useState(false);

  const holen = useCallback(async () => {
    // Ohne Anmeldung wird nichts gelesen, auch solange die Datenbank es noch zuließe.
    if (!isLoggedIn) return;
    const { zugang: z, grund, technik } = await ladePartnerterminMitGrund(token);
    setZugang(z);
    setFehlgrund(grund);
    setLadeTechnik(technik);
    /*
      Welche Gesprächsart gleich feststeht: die aus der Adresse (Knopf im
      Kundenprofil), sonst die einzige. Sonst wählt der Partner in Schritt 1.
    */
    const start = z?.anlaesse.some((a) => a.anlass === vorgewaehlt)
      ? vorgewaehlt
      : z?.anlaesse.length === 1 ? z.anlaesse[0].anlass : "";
    /*
      Seit dem 29.09.2026 bekommt jede Gesprächsart ihren eigenen Termin. Steht
      für die feststehende schon einer, der sich noch korrigieren lässt, zeigt
      die Seite ihn; sonst geht es direkt zum Eintragen.
    */
    const offen = offenerTermin(z, start);
    setErgebnis(offen ?? null);
    setInvestmentId(vorbelegtesInvestment(z, offen));
    if (start) {
      setAnlass(start);
      setSchritt(1);
      setDatum(offen?.datum ?? "");
      setUhrzeit(offen?.uhrzeit ?? "");
    }
    setLaedt(false);
  }, [token, vorgewaehlt, isLoggedIn]);

  useEffect(() => { void holen(); }, [holen]);

  const nurEinAnlass = (zugang?.anlaesse.length ?? 0) === 1;

  const gewaehlt: PartnerAnlass | undefined = useMemo(
    () => zugang?.anlaesse.find((a) => a.anlass === anlass),
    [zugang, anlass],
  );

  const waehle = (a: PartnerAnlass) => {
    /*
      Steht für diese Gesprächsart schon ein Termin, der sich korrigieren
      lässt, kommt seine Zeit in die Felder: Eintragen ändert dann ihn. Sonst
      bleiben die Felder leer, und es entsteht ein neuer Termin.
    */
    const offen = offenerTermin(zugang, a.anlass);
    setAnlass(a.anlass);
    setDatum(offen?.datum ?? "");
    setUhrzeit(offen?.uhrzeit ?? "");
    setInvestmentId(vorbelegtesInvestment(zugang, offen) || investmentId);
    setFehler(null);
    setSchritt(1);
  };

  // Aus der Bestätigung zurück zur Auswahl, für die nächste Gesprächsart.
  const weitererTermin = () => {
    setErgebnis(null);
    setKorrigiert(false);
    setAnlass("");
    setDatum("");
    setUhrzeit("");
    setFehler(null);
    setSchritt(0);
  };

  /*
    „Gehört zu“ ist Pflicht, sobald der Kunde mehrere laufende Investments hat
    und der Link keines festlegt. Ohne Wahl hängte die Datenbank den Termin an
    kein Investment, und die Stufe keines Investments rückte vor.
  */
  const investmentWahlNoetig = !zugang?.investmentId && (zugang?.investments.length ?? 0) > 1;

  const bestaetigen = async () => {
    if (arbeitet || (investmentWahlNoetig && !investmentId)) return;
    setFehler(null);
    // Gesperrt bleibt der Knopf auch während der stillen Wiederholungen im Store.
    setArbeitet(true);
    const antwort = await bestaetigePartnertermin(token, anlass, datum, uhrzeit, investmentId || null);
    setArbeitet(false);
    if (antwort.ok !== true) {
      /*
        Ein Satz, der sagt, wo der Fehler liegt und was zu tun ist, dazu der
        Fehlercode für den Support. Der Code enthält weder Kunden- noch
        Datenbankdetails.
      */
      setFehler(antwort.code
        ? `${texteFuer(PARTNERTERMIN_FEHLER_TEXTE, sprache)[antwort.code]} ${t.fehlercode(antwort.code, antwort.technik)}`
        : antwort.grund);
      return;
    }
    const termin = antwort.termin;
    setErgebnis(termin);
    setKorrigiert(false);
    // Die Liste je Gesprächsart nachziehen, sonst fehlte der Hinweis beim nächsten Wählen.
    setZugang((z) => z && {
      ...z,
      termine: [...z.termine.filter((t) => t.anlass !== termin.anlass), termin],
    });
  };

  if (anmeldungLaedt || !bereit) return <BuchungLaedt sprache={sprache} />;

  if (!isLoggedIn) {
    // Wie beim PraesentationGuard: nach der Anmeldung zurück auf genau diese Adresse.
    const ziel = `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
    return (
      <BuchungMeldung kennung={t.kennung} titel={t.anmeldenTitel} text={t.anmeldenText}>
        <Hauptknopf aufKlick={() => navigate(ziel)} sprache={sprache}>
          {t.anmelden} <ArrowRight className="h-4 w-4" />
        </Hauptknopf>
      </BuchungMeldung>
    );
  }

  if (laedt) return <BuchungLaedt sprache={sprache} />;

  /*
    Ohne `kunde` ist der Aufrufer nicht der Besitzer des Links. Er bekommt
    dieselbe neutrale Ablehnung wie bei einem ungültigen Link, auch solange
    die Datenbank ihm die Seite noch geben würde.
  */
  if (!zugang || !zugang.kunde) {
    /*
      Ein toter Link und ein technischer Fehler sehen verschieden aus, je mit
      eigenem Satz und Fehlercode. Vorher sah ein kaputtes Backend aus wie ein
      alter Link.
    */
    const grund: ZugangFehler = zugang ? "unbekannt" : fehlgrund ?? "unbekannt";
    const code = ZUGANG_FEHLER_CODE[grund];
    return (
      <BuchungMeldung
        kennung={t.kennung}
        titel={grund === "unbekannt" ? t.ungueltigTitel : t.technischTitel}
        text={`${texteFuer(PARTNERTERMIN_FEHLER_TEXTE, sprache)[code]} ${t.fehlercode(code, zugang ? undefined : ladeTechnik)}`}
      />
    );
  }
  const kunde = zugang.kunde;

  if (zugang.anlaesse.length === 0) {
    // Noch kein Kalender hinterlegt: Ohne diesen Zweig stünde eine leere Auswahl da.
    return <BuchungMeldung kennung={t.kennung} titel={t.keinKalenderTitel} text={t.keinKalenderText} />;
  }

  // ───────────────────────────────────────────────── Der bestätigte Termin

  if (ergebnis && !korrigiert) {
    return (
      <Buehne>
        <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-col justify-center px-6 py-24">
          <div className="text-center">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-[#34C759]/30 bg-[#34C759]/10 px-4 py-1.5 text-xs text-[#7EE29B]">
              <CalendarCheck className="h-3.5 w-3.5" />
              {t.terminSteht}
            </span>
            <h1 className="mt-4 text-[30px] font-extrabold leading-[1.1] tracking-[-0.03em] sm:text-[38px]">
              {zugang.vorname ? t.eingetragenMitName(zugang.vorname) : t.eingetragen}
            </h1>
            <Balken className="mx-auto mt-6" />
          </div>

          <div className="mt-9 grid items-start gap-6 sm:grid-cols-[1fr_260px]">
            <Karte>
              <KartenTitel>{t.derTermin}</KartenTitel>
              <div className="flex flex-col gap-4">
                <Zeile icon={<CalendarClock className="h-3.5 w-3.5" />} beschriftung={t.wann}>
                  {t.zeitpunkt(langesDatum(ergebnis.datum, sprache), ergebnis.uhrzeit)}
                </Zeile>
                <Zeile icon={<Clock className="h-3.5 w-3.5" />} beschriftung={t.dauer}>
                  {dauerAnzeige(ergebnis.anlass, ergebnis.dauerMinuten, sprache)}
                </Zeile>
                <Zeile icon={<User className="h-3.5 w-3.5" />} beschriftung={t.anliegen}>
                  {anlassAnzeige(ergebnis, t).bezeichnung}
                </Zeile>
              </div>

              {/* Den Zugang verschickt der Kalender des Partners selbst, nicht wir. */}
              <div className={`mt-6 rounded-[14px] border border-[#88CFFF]/15 ${FLAECHE_HINWEIS} p-4`}>
                <p className="text-[12.5px] leading-relaxed text-white/60">
                  {t.eingetragenHinweis}
                </p>
              </div>

              {/* Korrigieren ändert genau diesen Termin, also nur für dieselbe Gesprächsart. */}
              {ergebnis.korrigierbar && (
                <>
                  <p className="mt-6 border-t border-white/10 pt-5 text-[12.5px] leading-relaxed text-white/40">
                    {t.falschEingetragen}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setAnlass(ergebnis.anlass);
                      setDatum(ergebnis.datum);
                      setUhrzeit(ergebnis.uhrzeit);
                      setKorrigiert(true);
                      setSchritt(1);
                    }}
                    className="mt-3 inline-flex items-center gap-2 text-[13px] font-semibold text-[#88CFFF] hover:underline"
                  >
                    {t.zeitKorrigieren} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
              {/* Die nächste Gesprächsart bekommt ihren eigenen Termin. */}
              {!nurEinAnlass && (
                <div className="mt-6 border-t border-white/10 pt-5">
                  <Nebenknopf aufKlick={weitererTermin}>
                    {t.weitererTermin} <ArrowRight className="h-4 w-4" />
                  </Nebenknopf>
                </div>
              )}
            </Karte>
            <KundenKarte kunde={kunde} sprache={sprache} />
          </div>

          <Fussleiste t={t} sprache={sprache} />
        </div>
      </Buehne>
    );
  }

  // ────────────────────────────────────────────────────────── Die Schritte

  /*
    Zwei Schritte. Bleibt nur einer übrig, weil der Partner genau einen Kalender
    hinterlegt hat, entfällt die Leiste ganz: Ein einzelner Eintrag zeigt keinen
    Weg, er macht die Seite nur voller.
  */
  const schrittNamen = [t.schrittAnliegen, t.schrittZeit];
  const gewaehltAnzeige = gewaehlt ? anlassAnzeige(gewaehlt, t) : null;

  return (
    <Buehne>
      <div className="mx-auto min-h-[100dvh] max-w-6xl px-6 py-24 sm:px-10">
        <Kennung>{t.kennung}</Kennung>
        <h1 className="mt-3 max-w-2xl text-[30px] font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-[40px]">
          {zugang.vorname ? t.titelMitName(zugang.vorname) : t.titel}
        </h1>
        <Balken className="mt-6" />
        <p className="mt-5 max-w-[540px] text-[15.5px] leading-relaxed text-white/60">
          {t.einleitung}
        </p>

        {!nurEinAnlass && (
          <div className="mt-9">
            <Schrittleiste schritte={schrittNamen} aktiv={schritt} sprache={sprache} />
          </div>
        )}

        {/* ── Schritt 1: Worum geht es ─────────────────────────────── */}
        {schritt === 0 && (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[300px_1fr]">
            <div className="flex flex-col gap-6">
              <KundenKarte kunde={kunde} sprache={sprache} />
              {gewaehlt && gewaehltAnzeige && (
                <Karte>
                  <KartenTitel>{gewaehltAnzeige.bezeichnung}</KartenTitel>
                  <p className="mb-3 text-[12.5px] text-white/40">
                    {dauerAnzeige(gewaehlt.anlass, gewaehlt.dauerMinuten, sprache)}
                  </p>
                  <p className="text-[13px] leading-snug text-white/50">{gewaehltAnzeige.beschreibung}</p>
                </Karte>
              )}
            </div>

            <Karte>
              <KartenTitel>{t.worumGehtEs}</KartenTitel>
              <div className="flex flex-col gap-3">
                {zugang.anlaesse.map((a) => (
                  <button
                    key={a.anlass}
                    type="button"
                    onClick={() => waehle(a)}
                    aria-pressed={a.anlass === anlass}
                    className={`rounded-[14px] border p-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88CFFF] ${
                      a.anlass === anlass
                        ? "border-[#087AC7] bg-[#087AC7]/15"
                        : `border-white/12 ${FLAECHE_FELD_KNOPF} hover:border-[#88CFFF]/40`
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-[15.5px] font-semibold">{anlassAnzeige(a, t).bezeichnung}</span>
                      <span className="shrink-0 text-[12px] text-white/40">
                        {dauerAnzeige(a.anlass, a.dauerMinuten, sprache)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[13px] leading-snug text-white/50">{anlassAnzeige(a, t).beschreibung}</p>
                    {(() => {
                      const offen = offenerTermin(zugang, a.anlass);
                      return offen && (
                        <p className="mt-2 text-[12px] font-semibold text-[#7EE29B]">
                          {t.schonEingetragen(t.zeitpunkt(langesDatum(offen.datum, sprache), offen.uhrzeit))}
                        </p>
                      );
                    })()}
                  </button>
                ))}
              </div>
          </Karte>
          </div>
        )}

        {/* ── Schritt 2: Kalender links, Bestätigung rechts ─────────── */}
        {schritt === 1 && gewaehlt && (
          <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            {/*
              Die Kundenkarte bleibt auch hier stehen: Wer im fremden Kalender
              (Calendly, Fantastical) bucht, braucht Name, Telefon und E-Mail
              des Kunden direkt vor sich. Auf breiten Bildschirmen sitzt sie
              rechts über der Bestätigung, damit der Kalender seine volle
              Breite behält; auf dem Handy steht sie über dem Kalender.
            */}
            <div className="lg:col-start-2 lg:row-start-1">
              <KundenKarte kunde={kunde} sprache={sprache} />
            </div>
            <Karte className="lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <KartenTitel>
                {t.kalenderTitel}
                {" · "}
                {dauerAnzeige(gewaehlt.anlass, gewaehlt.dauerMinuten, sprache)}
              </KartenTitel>

              {einbettbar(gewaehlt.url) ? (
                <div className="overflow-hidden rounded-[14px] border border-white/10 bg-white">
                  {/*
                    Der Kalender des Partners als eingebettete Seite. Die
                    Sicherheitsregel in `public/_headers` erlaubt fremde Seiten
                    über HTTPS ausdrücklich. Die Höhe ist fest, weil eine
                    eingebettete fremde Seite ihre eigene Höhe nicht an uns
                    melden kann.

                    Weißer Grund: Die Kalenderdienste liefern selbst eine helle
                    Seite. Ohne ihn blitzt beim Laden der dunkle Hintergrund
                    durch und es sieht nach einem Fehler aus.
                  */}
                  {/* Erst nach einem Klick, siehe `ZweiKlickEinbettung`. */}
                  <ZweiKlickEinbettung url={gewaehlt.url} sprache={sprache}>
                    <iframe
                      src={kalenderAdresse(gewaehlt.url)}
                      title={t.iframeTitel(anlassAnzeige(gewaehlt, t).bezeichnung)}
                      className="block h-[820px] w-full border-0"
                      loading="lazy"
                    />
                  </ZweiKlickEinbettung>
                </div>
              ) : (
                /*
                  Dieser Kalenderdienst erlaubt das Einbetten nicht, siehe
                  NICHT_EINBETTBAR. Statt eines leeren Rahmens mit der Meldung
                  "hat die Verbindung abgelehnt" steht hier ein Knopf, der ihn
                  in einem eigenen Fenster öffnet. Der Ablauf bleibt derselbe.
                */
                <div className={`rounded-[14px] border border-white/12 ${FLAECHE_FELD} p-6 text-center`}>
                  <p className="text-[15px] font-semibold">
                    {t.nichtEinbettbarTitel}
                  </p>
                  <p className="mx-auto mt-2 max-w-[420px] text-[13.5px] leading-relaxed text-white/60">
                    {t.nichtEinbettbarText}
                  </p>
                  <div className="mx-auto mt-5 max-w-[280px]">
                    <Hauptknopf aufKlick={() => window.open(gewaehlt.url, "_blank", "noopener,noreferrer")} sprache={sprache}>
                      {t.kalenderOeffnen} <ArrowRight className="h-4 w-4" />
                    </Hauptknopf>
                  </div>
                </div>
              )}

              {!nurEinAnlass && (
                <div className="mt-6 border-t border-white/10 pt-6">
                  <Nebenknopf aufKlick={() => setSchritt(0)}>
                    <ArrowLeft className="h-4 w-4" /> {t.anderesAnliegen}
                  </Nebenknopf>
                </div>
              )}
            </Karte>

            {/*
              Die Bestätigung klebt auf breiten Bildschirmen oben fest. Der
              Kalender daneben ist hoch und scrollt innen; ohne das Kleben wäre
              das Feld nach dem Buchen wieder aus dem Blick, und genau das soll
              der Umbau verhindern.
            */}
            <div className="lg:sticky lg:top-8 lg:col-start-2 lg:row-start-2">
              <Karte>
                <form onSubmit={(e) => { e.preventDefault(); void bestaetigen(); }} noValidate>
                  <KartenTitel>{t.bestaetigenTitel}</KartenTitel>
                  <p className="mb-5 text-[13.5px] leading-relaxed text-white/60">
                    {t.bestaetigenText}
                  </p>

                  {/*
                    „Gehört zu", nur wenn es wirklich etwas zu wählen gibt.

                    Steht das Investment am Link, oder gibt es nur eines, ist die
                    Frage beantwortet und der Block bleibt weg. Erst bei mehreren
                    Objekten muss jemand sagen, um welches es geht, sonst hängt
                    der Termin am falschen Vorgang.
                  */}
                  {investmentWahlNoetig && (
                    <div className="mb-5">
                      <label htmlFor="partnertermin-investment" className="block text-xs font-semibold text-white/60">
                        {t.gehoertZu}
                      </label>
                      <select
                        id="partnertermin-investment"
                        value={investmentId}
                        onChange={(e) => { setInvestmentId(e.target.value); setFehler(null); }}
                        className={`mt-2 h-[48px] w-full rounded-xl border border-white/15 ${FLAECHE_FELD} px-4 text-[15px] text-white outline-none focus:border-[#88CFFF]`}
                      >
                        <option value="">{t.bitteWaehlen}</option>
                        {zugang.investments.map((inv, i) => (
                          <option key={inv.id} value={inv.id}>
                            {inv.bezeichnung || t.objektNummer(i + 1)}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-[12px] leading-relaxed text-white/40">
                        {t.gehoertZuHinweis}
                      </p>
                    </div>
                  )}

                  {/*
                    Nebeneinander nur dort, wo Platz ist. In der schmalen rechten
                    Spalte stünden zwei Felder sonst gequetscht nebeneinander.
                  */}
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
                    <div>
                      <label htmlFor="partnertermin-datum" className="block text-xs font-semibold text-white/60">
                        {t.datum}
                      </label>
                      {/* Eigene Auswahl statt des weißen Browserfensters, siehe `TerminFelder`. */}
                      <DatumFeld
                        id="partnertermin-datum"
                        wert={datum}
                        aufWahl={(v) => { setDatum(v); setFehler(null); }}
                        sprache={sprache}
                      />
                    </div>
                    <div>
                      <label htmlFor="partnertermin-uhrzeit" className="block text-xs font-semibold text-white/60">
                        {t.uhrzeit}
                      </label>
                      <UhrzeitFeld
                        id="partnertermin-uhrzeit"
                        wert={uhrzeit}
                        aufWahl={(v) => { setUhrzeit(v); setFehler(null); }}
                        sprache={sprache}
                      />
                    </div>
                  </div>

                  {/*
                    Derselbe Anlass mit einem Termin, der sich noch korrigieren
                    lässt: Eintragen ändert ihn, statt einen zweiten anzulegen.
                    Das soll der Partner vorher wissen.
                  */}
                  {(() => {
                    const offen = offenerTermin(zugang, anlass);
                    return offen && (
                      <p className="mt-4 text-[12.5px] leading-relaxed text-white/50">
                        {t.aendertTermin(t.zeitpunkt(langesDatum(offen.datum, sprache), offen.uhrzeit))}
                      </p>
                    );
                  })()}

                  {datum && uhrzeit && (
                    <p className="mt-4 text-[13.5px] text-white/60">
                      {t.gewaehlt}{" "}
                      <b className="font-semibold text-white">
                        {t.zeitpunkt(langesDatum(datum, sprache), uhrzeit)}
                      </b>
                    </p>
                  )}

                  <div className="mt-6 flex flex-col gap-3">
                    <Fehlerzeile text={fehler} />
                    <Hauptknopf
                      art="submit"
                      laedt={arbeitet}
                      gesperrt={!datum || !uhrzeit || (investmentWahlNoetig && !investmentId)}
                      sprache={sprache}
                    >
                      {t.bestaetigen} <ArrowRight className="h-4 w-4" />
                    </Hauptknopf>
                    <p className="text-center text-[12.5px] leading-relaxed text-white/40">
                      {t.ohneSchritt}
                    </p>
                  </div>
                </form>
              </Karte>
            </div>
          </div>
        )}

        <Fussleiste t={t} sprache={sprache} />
      </div>
    </Buehne>
  );
}

/**
 * Die Karte für den Partner: sein Kunde statt des eigenen Bilds.
 *
 * Christian am 21.09.2026 und 29.09.2026: Der Partner kennt sich selbst. Er
 * braucht Name, Telefon und E-Mail des Kunden, auch in Schritt 2, wenn er im
 * fremden Kalender bucht. Ohne Bild, Rolle und Zitat, weil wir vom Kunden
 * nichts davon haben.
 *
 * Die Daten kommen nur mit, wenn die Datenbank den Aufrufer als angemeldeten
 * Besitzer des Links erkennt, siehe `partnertermin_zugang`. Ohne sie zeigt die
 * Seite diese Karte gar nicht erst, sondern die Ablehnung.
 */
function KundenKarte({ kunde, sprache }: { kunde: PartnerKunde; sprache: Sprache }) {
  const t = texteFuer(PARTNER_TERMIN_TEXTE, sprache);
  return (
    <Karte>
      <KartenTitel>{t.deinKunde}</KartenTitel>
      {kunde.name && <p className="text-[16px] font-semibold">{kunde.name}</p>}
      <div className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4">
        {kunde.telefon && (
          <KontaktZeile
            href={`tel:${(kunde.telefon.trim().startsWith("+") ? "+" : "") + kunde.telefon.replace(/\D/g, "")}`}
            icon={<Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#88CFFF]" />}
            wert={kunde.telefon}
            kopierBeschriftung={t.telefonKopieren}
            kopiert={t.kopiert}
          />
        )}
        {kunde.email && (
          <KontaktZeile
            href={`mailto:${kunde.email}`}
            icon={<Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#88CFFF]" />}
            wert={kunde.email}
            kopierBeschriftung={t.emailKopieren}
            kopiert={t.kopiert}
          />
        )}
        {!kunde.email && !kunde.telefon && (
          <p className="text-[12.5px] leading-relaxed text-white/40">
            {t.keineKontaktdaten}
          </p>
        )}
      </div>
    </Karte>
  );
}

/** Eine Zeile zum Anklicken (Anruf, Mail) mit Kopierknopf daneben. */
function KontaktZeile({
  href,
  icon,
  wert,
  kopierBeschriftung,
  kopiert,
}: {
  href: string;
  icon: React.ReactNode;
  wert: string;
  kopierBeschriftung: string;
  kopiert: string;
}) {
  const [erledigt, setErledigt] = useState(false);
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(wert);
      setErledigt(true);
      window.setTimeout(() => setErledigt(false), 1500);
    } catch {
      // Ohne Freigabe der Zwischenablage bleibt der Wert markierbar stehen.
    }
  };
  return (
    <div className="flex items-start gap-2">
      <a href={href} className="flex min-w-0 flex-1 items-start gap-3 text-[13.5px] text-white/70 hover:text-white">
        {icon}
        <span className="min-w-0 break-words">{wert}</span>
      </a>
      <button
        type="button"
        onClick={() => void kopieren()}
        aria-label={erledigt ? kopiert : kopierBeschriftung}
        title={erledigt ? kopiert : kopierBeschriftung}
        className="shrink-0 rounded-md p-1 text-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#88CFFF]"
      >
        {erledigt ? <Check className="h-3.5 w-3.5 text-[#7EE29B]" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function Fussleiste({ t, sprache }: { t: PartnerTerminTexte; sprache: Sprache }) {
  return (
    <p className="mt-10 text-center text-[10.5px] text-white/30">
      MOREImmo · Wendelsteinstraße 19, 83075 Bad Feilnbach
      <span aria-hidden className="mx-2 text-white/20">·</span>
      <a href="/impressum" className="hover:text-white/60 hover:underline">{t.impressum}</a>
      <span aria-hidden className="mx-2 text-white/20">·</span>
      <a href="/datenschutz" className="hover:text-white/60 hover:underline">{t.datenschutz}</a>
      <span aria-hidden className="mx-2 text-white/20">·</span>
      <CookieEinstellungenLink sprache={sprache} className="hover:text-white/60 hover:underline" />
    </p>
  );
}

function Zeile({
  icon,
  beschriftung,
  children,
}: {
  icon: React.ReactNode;
  beschriftung: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#88CFFF]/[0.13] text-[#88CFFF]">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] uppercase tracking-[0.14em] text-white/40">{beschriftung}</span>
        <span className="mt-0.5 block text-[14.5px] text-white">{children}</span>
      </span>
    </div>
  );
}
