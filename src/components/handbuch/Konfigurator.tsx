/**
 * Der Konfigurator der Handbuch-Seite: sechs Fragen, Auswertung, Kontakt.
 *
 * Aufbau nach der Strategie vom 26.09.2026, Kapitel 3: ein Klick je Frage,
 * Fortschritt, unter jeder Frage ein Satz „warum wir fragen“, Kontaktdaten
 * erst nach der Auswertung. Die Auswertung zeigt den Ausgang ohne Zahlen;
 * den Rahmen sieht der Besucher im Handbuch.
 *
 * Kacheln sind echte Knöpfe mit `aria-pressed`, also per Tastatur bedienbar.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormularOffenFuerPixel } from "@/hooks/useMetaPixelMitEinwilligung";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarClock,
  CalendarDays,
  Check,
  CircleHelp,
  Info,
  Landmark,
  Loader2,
  Percent,
  Search,
  Store,
  Sunset,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  FRAGEN,
  UEBERSCHUSS_WENN_UNBEKANNT,
  ermittleAusgang,
  istPlausibleTelefonnummer,
  type Ausgang,
  type FrageSchluessel,
  type HandbuchAntworten,
} from "../../../supabase/functions/_shared/handbuch-funnel.ts";
import { grenzsatzProzent, zveZuBrutto } from "@/lib/handbuch/modell";
import { zaehleHandbuch } from "@/lib/handbuch/ereignisse";
import { sendeHandbuchLead, type HandbuchKontakt } from "@/lib/handbuch/leadAbsenden";
import { EINLADUNG_TEXTE, sendeEinladung, type HandbuchEinladungDaten } from "@/lib/handbuch/einladung";
import { konfiguratorPfad } from "@/lib/handbuch/wege";
import { handbuchEinwilligungTexte } from "@/lib/leadEinwilligung";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { HANDBUCH_SEITEN_TEXTE, type HandbuchSeitenTexte } from "@/lib/handbuch/seitenTexte";
import { frageIn } from "@/lib/handbuch/fragenSprache";
import { euroIn } from "@/lib/handbuch/diagramme";
import { mitSeitenSprache } from "@/lib/seitenSprache";

const SYMBOLE: Partial<Record<FrageSchluessel, Record<string, LucideIcon>>> = {
  ziel: { vermoegen: TrendingUp, alter: Sunset, steuer: Percent, verstehen: Search },
  beruf: { angestellt: Briefcase, beamter: Landmark, selbststaendig: Store, anderes: CircleHelp },
  start: { sofort: Zap, drei_monate: CalendarClock, spaeter: CalendarDays, informieren: BookOpen },
  ueberschuss: { unbekannt: CircleHelp },
};

/** Stufen-Symbol für Beträge: je höher die Spanne, desto mehr Balken. */
function Stufen({ n }: { n: number }) {
  return (
    <span className="hb-stufen" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <i key={i} className={i < n ? "an" : ""} style={{ height: 6 + i * 4 }} />
      ))}
    </span>
  );
}

export interface KonfiguratorErgebnis {
  antworten: HandbuchAntworten;
  vorname: string;
  nachname: string;
  handbuchToken: string | null;
  saToken: string | null;
}

interface Props {
  beraterSlug?: string | null;
  beraterId?: string | null;
  onFertig: (e: KonfiguratorErgebnis) => void;
  /** Ohne kleines Buch am Rand, etwa im zweiten Einstieg. */
  ohneBuch?: boolean;
  /**
   * Persönlicher Link aus der Willkommensmail: Statt des Kontaktformulars
   * steht am Ende nur eine Bestätigung mit dem Pflicht-Haken.
   */
  einladung?: HandbuchEinladungDaten;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Prüft die Kontaktdaten. Gemeinsam für Konfigurator und offene Selbstauskunft. */
export function pruefeKontaktdaten(kontakt: HandbuchKontakt, texte: HandbuchSeitenTexte["formular"], einwilligungFehlt: string): Record<string, string> {
  const f: Record<string, string> = {};
  if (!kontakt.vorname.trim()) f.vorname = texte.fehlerVorname;
  if (!kontakt.nachname.trim()) f.nachname = texte.fehlerNachname;
  if (!EMAIL.test(kontakt.email.trim())) f.email = texte.fehlerEmail;
  if (!kontakt.telefon.trim()) f.telefon = texte.fehlerHandy;
  else if (!istPlausibleTelefonnummer(kontakt.telefon)) f.telefon = texte.fehlerHandyForm;
  if (!kontakt.einwilligung) f.einwilligung = einwilligungFehlt;
  return f;
}

export default function Konfigurator({ beraterSlug, beraterId, onFertig, ohneBuch, einladung }: Props) {
  const sprache = useSeitenSprache();
  const T = useSeitenTexte(HANDBUCH_SEITEN_TEXTE);
  const K = T.konfig;
  const F = T.formular;
  const einw = handbuchEinwilligungTexte(sprache, "handbuch");
  const [schritt, setSchritt] = useState(0);
  const [antworten, setAntworten] = useState<Partial<HandbuchAntworten>>({});
  const [gemeinsam, setGemeinsam] = useState(false);
  const start = useRef<number | null>(null);
  const [kontakt, setKontakt] = useState<HandbuchKontakt>({
    vorname: "",
    nachname: "",
    email: "",
    telefon: "",
    einwilligung: false,
    werbeeinwilligung: false,
    hp: "",
  });
  const [fehler, setFehler] = useState<Record<string, string>>({});
  const [sendet, setSendet] = useState(false);
  const [meldung, setMeldung] = useState<string | null>(null);
  const ueberschrift = useRef<HTMLHeadingElement>(null);
  // Halbfertige Eingaben: Ein Widerruf der Pixel-Einwilligung haelt das Pixel
  // dann nur an, statt die Seite neu zu laden (PIXEL-002).
  // Auch waehrend des Absendens, bis die Antwort verarbeitet ist (NB-08).
  useFormularOffenFuerPixel(
    sendet || Object.keys(antworten).length > 0
      || [kontakt.vorname, kontakt.nachname, kontakt.email, kontakt.telefon].some((v) => v.trim() !== ""),
  );

  const vollstaendig = FRAGEN.every((f) => antworten[f.schluessel]);
  const fertigeAntworten = vollstaendig
    ? ({ ...(antworten as HandbuchAntworten), ...(gemeinsam ? { gemeinsamVeranlagt: true } : {}) } as HandbuchAntworten)
    : null;
  const ausgang: Ausgang | null = fertigeAntworten ? ermittleAusgang(fertigeAntworten) : null;
  // Mit „gemeinsam veranlagt“ der Splittingtarif, derselbe Kern wie im Handbuch.
  const grenzsatz = useMemo(
    () => (antworten.brutto ? grenzsatzProzent(zveZuBrutto(antworten.brutto), gemeinsam) : null),
    [antworten.brutto, gemeinsam],
  );

  // Den Fokus nach jedem Schritt auf die neue Überschrift, für Tastatur und
  // Vorleseprogramme. Beim ersten Anzeigen nicht, sonst springt die Seite.
  const ersterLauf = useRef(true);
  useEffect(() => {
    if (ersterLauf.current) {
      ersterLauf.current = false;
      return;
    }
    const kopf = ueberschrift.current;
    kopf?.focus({ preventScroll: true });
    // Auf dem Handy tippt man eine Antwort weit unten an; die nächste Frage
    // beginnt dann oberhalb des Bildschirms oder unter der festen
    // Kopfleiste. Nur dann zur Karte rollen (Abstand über `scroll-margin-top`).
    const karte = kopf?.closest<HTMLElement>(".hb-konfig");
    if (karte && typeof karte.scrollIntoView === "function" && karte.getBoundingClientRect().top < 80) {
      const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      karte.scrollIntoView({ block: "start", behavior: ruhig ? "auto" : "smooth" });
    }
  }, [schritt]);

  useEffect(() => {
    if (schritt === 6 && ausgang) {
      void zaehleHandbuch(`hb_ausgang_${ausgang}` as "hb_ausgang_passt", beraterId);
    }
  }, [schritt, ausgang, beraterId]);

  const waehle = (schluessel: FrageSchluessel, id: string, nr: number) => {
    if (start.current === null) {
      start.current = Date.now();
      void zaehleHandbuch("hb_konfigurator_gestartet", beraterId);
    }
    setAntworten((a) => ({ ...a, [schluessel]: id }));
    void zaehleHandbuch(`hb_frage_${nr}` as "hb_frage_1", beraterId);
    // Kurz stehen lassen, damit die Wahl sichtbar ist.
    window.setTimeout(() => setSchritt((s) => Math.min(6, Math.max(s, nr))), 180);
  };

  const absenden = async () => {
    // Beim persönlichen Link zählt nur der Pflicht-Haken, die Kontaktdaten kennt der Server.
    const f = einladung
      ? (kontakt.einwilligung ? {} : { einwilligung: einw.fehlt })
      : pruefeKontaktdaten(kontakt, F, einw.fehlt);
    setFehler(f);
    if (Object.keys(f).length > 0 || !fertigeAntworten) return;
    setSendet(true);
    setMeldung(null);
    const ergebnis = einladung
      ? await sendeEinladung({ token: einladung.token, antworten: fertigeAntworten, einwilligung: kontakt.einwilligung, sprache })
      : await sendeHandbuchLead({
          kontakt,
          antworten: fertigeAntworten,
          beraterSlug,
          dauerMs: start.current ? Date.now() - start.current : 60000,
          sprache,
        });
    setSendet(false);
    if (!ergebnis.ok) {
      setMeldung(ergebnis.fehler || F.fehlerAllgemein);
      return;
    }
    void zaehleHandbuch("hb_handbuch_erhalten", beraterId);
    onFertig({
      antworten: fertigeAntworten,
      vorname: einladung ? einladung.vorname : kontakt.vorname.trim(),
      nachname: einladung ? "" : kontakt.nachname.trim(),
      handbuchToken: ergebnis.handbuchToken ?? null,
      saToken: ergebnis.saToken ?? null,
    });
  };

  const setze = (feld: keyof HandbuchKontakt, wert: string | boolean) => {
    setKontakt((k) => ({ ...k, [feld]: wert }));
    if (fehler[feld]) setFehler((f) => ({ ...f, [feld]: "" }));
  };

  // ─── Fragen ──────────────────────────────────────────────────────────
  if (schritt < 6) {
    const frage = frageIn(sprache, schritt);
    const prozent = Math.round(((schritt + 1) / 6) * 100);
    const symbole = SYMBOLE[frage.schluessel];
    return (
      <div className={`hb-konfig hb-karte ${ohneBuch ? "" : "mit-buch"}`} id="konfigurator">
        {!ohneBuch && (
          <div className="hb-buch-mini" aria-hidden="true">
            MOREImmo<b>{K.buchMini}</b>
            <i />
          </div>
        )}
        <div className="hb-konfig-kopf">
          <span>
            <b>
              {K.frage} {frage.nr}
            </b>{" "}
            {K.von6}
          </span>
          <span>{K.entsteht}</span>
        </div>
        <div className="hb-balken" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={prozent} aria-label={K.fortschritt}>
          <i style={{ width: `${prozent}%` }} />
        </div>
        <h3 ref={ueberschrift} tabIndex={-1}>
          {frage.frage}
        </h3>
        <p className="hb-warum">
          <Info aria-hidden="true" />
          <span>
            <span className="sr-only">{K.warum}</span>
            {frage.warum}
          </span>
        </p>
        <div className="hb-kacheln" role="group" aria-label={frage.frage}>
          {frage.antworten.map((a, i) => {
            const gewaehlt = antworten[frage.schluessel] === a.id;
            const Icon = symbole?.[a.id];
            // Eine fünfte Antwort („Weiß ich nicht genau“) läuft über die volle Breite.
            const breit = frage.antworten.length % 2 === 1 && i === frage.antworten.length - 1;
            return (
              <button
                key={a.id}
                type="button"
                className={`hb-kachel${breit ? " breit" : ""}`}
                aria-pressed={gewaehlt}
                onClick={() => waehle(frage.schluessel, a.id, frage.nr)}
              >
                <span className="hb-kachel-symbol">
                  {gewaehlt ? <Check aria-hidden="true" /> : Icon ? <Icon aria-hidden="true" /> : <Stufen n={i + 1} />}
                </span>
                {a.text}
              </button>
            );
          })}
        </div>
        {frage.schluessel === "ueberschuss" && (
          <details className="hb-rechenhilfe">
            <summary>{K.rechenhilfe}</summary>
            <ol>
              {frage.rechenhilfe.map((z) => (
                <li key={z}>{z}</li>
              ))}
            </ol>
          </details>
        )}
        {frage.schluessel === "brutto" && (
          <>
            <label className="hb-schalter">
              <input type="checkbox" checked={gemeinsam} onChange={(e) => setGemeinsam(e.target.checked)} />
              {K.gemeinsam}
            </label>
            {gemeinsam && (
              <p className="hb-klein" style={{ marginTop: 6 }}>
                {K.gemeinsamHinweis}
              </p>
            )}
          </>
        )}
        <div className="hb-konfig-fuss">
          {schritt > 0 ? (
            <button type="button" className="hb-link-knopf" onClick={() => setSchritt((s) => s - 1)}>
              <ArrowLeft aria-hidden="true" style={{ width: 16, height: 16, verticalAlign: "-3px", marginRight: 4 }} />
              {K.zurueck}
            </button>
          ) : (
            <span>{K.einKlickProFrage}</span>
          )}
          <span>{schritt === 0 ? K.kontaktAmEnde : K.einKlickGenuegt}</span>
        </div>
      </div>
    );
  }

  // ─── Auswertung ──────────────────────────────────────────────────────
  if (schritt === 6 && fertigeAntworten && ausgang) {
    const ueUnbekannt = fertigeAntworten.ueberschuss === "unbekannt";
    const ueGut = fertigeAntworten.ueberschuss !== "unter_500" && !ueUnbekannt;
    const ekGut = fertigeAntworten.eigenkapital !== "unter_10";
    const titel = ausgang === "passt" ? K.titelPasst : ausgang === "vielleicht" ? K.titelVielleicht : K.titelNochNicht;
    return (
      <div className="hb-konfig hb-karte" id="konfigurator">
        <span className={`hb-pill ${ausgang === "passt" ? "gruen" : ausgang === "vielleicht" ? "blau" : "gelb"}`}>
          {ausgang === "passt" ? <Check aria-hidden="true" /> : <Info aria-hidden="true" />}
          {ausgang === "passt" ? K.pillPasst : ausgang === "vielleicht" ? K.pillVielleicht : K.pillNochNicht}
        </span>
        <h3 ref={ueberschrift} tabIndex={-1} style={{ marginTop: 14 }}>
          {titel}
        </h3>
        {ausgang === "noch_nicht" && (
          <p className="hb-warum" style={{ display: "block" }}>
            {K.nochNichtText}
          </p>
        )}
        <ul className="hb-pruefliste">
          <li>
            <span className={`kreis ${ueGut ? "gut" : "acht"}`}>{ueGut ? <Check /> : <Info />}</span>
            {ueGut ? K.ueGut : ueUnbekannt ? K.ueUnbekannt(euroIn(UEBERSCHUSS_WENN_UNBEKANNT, sprache)) : K.ueNiedrig}
          </li>
          <li>
            <span className={`kreis ${ekGut ? "gut" : "acht"}`}>{ekGut ? <Check /> : <Info />}</span>
            {ekGut ? K.ekGut : K.ekNiedrig}
          </li>
          {grenzsatz !== null && (
            <li>
              <span className="kreis gut">
                <Check />
              </span>
              {grenzsatz >= 35 ? K.steuerHoch(grenzsatz) : K.steuerNiedrig(grenzsatz)}
            </li>
          )}
        </ul>
        <div className="hb-buchkarte">
          <span className="mini" aria-hidden="true" />
          <div>
            <b style={{ color: "var(--hb-tinte)" }}>{ausgang === "noch_nicht" ? K.buchTrotzdem : K.buchBereit}</b>
            <div className="hb-klein" style={{ marginTop: 4 }}>
              {K.buchInhalt}
            </div>
          </div>
        </div>
        <button type="button" className="hb-knopf hb-orange" style={{ width: "100%" }} onClick={() => setSchritt(7)}>
          {K.knopfErhalten} <ArrowRight aria-hidden="true" />
        </button>
        <div className="hb-konfig-fuss">
          <button type="button" className="hb-link-knopf" onClick={() => setSchritt(5)}>
            {K.antwortenAendern}
          </button>
          <span>{K.rahmenImHandbuch}</span>
        </div>
      </div>
    );
  }

  // ─── Bestätigung beim persönlichen Link ──────────────────────────────
  if (einladung) {
    const E = EINLADUNG_TEXTE[sprache === "en" ? "en" : "de"];
    return (
      <div className="hb-konfig hb-karte" id="konfigurator">
        <h3 ref={ueberschrift} tabIndex={-1} style={{ fontSize: 22 }}>
          {E.titel(einladung.vorname)}
        </h3>
        <p className="hb-warum" style={{ marginBottom: 6 }}>
          <Info aria-hidden="true" />
          <span>{E.hinweis}</span>
        </p>
        {einladung.emailMaskiert && (
          <p style={{ fontWeight: 600, margin: "0 0 14px 28px" }}>{einladung.emailMaskiert}</p>
        )}
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void absenden();
          }}
        >
          <label className={`hb-haken ${fehler.einwilligung ? "fehlt" : ""}`}>
            <input
              type="checkbox"
              checked={kontakt.einwilligung}
              onChange={(e) => setze("einwilligung", e.target.checked)}
              aria-required="true"
              aria-invalid={!!fehler.einwilligung}
            />
            <span>
              {einw.kurz}{" "}
              <a href={mitSeitenSprache("/datenschutz", sprache)} target="_blank" rel="noopener noreferrer">
                {F.datenschutz}
              </a>
              <span className="hb-pflicht" aria-hidden="true">
                {" *"}
              </span>
            </span>
          </label>
          <details className="hb-einwilligung-voll">
            <summary>{F.vollText}</summary>
            <p>{einw.text}</p>
          </details>
          {fehler.einwilligung && <div className="hb-meldung" role="alert">{fehler.einwilligung}</div>}
          {meldung && <div className="hb-meldung" role="alert">{meldung}</div>}
          <button type="submit" className="hb-knopf hb-orange" style={{ width: "100%", marginTop: 8 }} disabled={sendet}>
            {sendet ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" /> {K.wirdErstellt}
              </>
            ) : (
              <>
                {K.anfordern} <ArrowRight aria-hidden="true" />
              </>
            )}
          </button>
          <p className="hb-klein" style={{ textAlign: "center", marginTop: 10, marginBottom: 0 }}>
            {K.kostenlos}
          </p>
          <div className="hb-konfig-fuss">
            <button type="button" className="hb-link-knopf" onClick={() => setSchritt(6)}>
              {K.zurueckAuswertung}
            </button>
            <span>
              {E.nichtIch}{" "}
              <a href={mitSeitenSprache(konfiguratorPfad(beraterSlug ?? undefined), sprache)}>{E.nichtIchLink}</a>
            </span>
          </div>
        </form>
      </div>
    );
  }

  // ─── Kontakt ─────────────────────────────────────────────────────────
  return (
    <div className="hb-konfig hb-karte" id="konfigurator">
      <h3 ref={ueberschrift} tabIndex={-1} style={{ fontSize: 22 }}>
        {K.wohin}
      </h3>
      <p className="hb-warum" style={{ marginBottom: 14 }}>
        <Info aria-hidden="true" />
        <span>{K.wohinHinweis}</span>
      </p>
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void absenden();
        }}
      >
        <div className="hb-felder">
          <Feld id="hb-vorname" pflicht label={F.vorname} wert={kontakt.vorname} fehler={fehler.vorname} autoComplete="given-name" onChange={(v) => setze("vorname", v)} />
          <Feld id="hb-nachname" pflicht label={F.nachname} wert={kontakt.nachname} fehler={fehler.nachname} autoComplete="family-name" onChange={(v) => setze("nachname", v)} />
        </div>
        <Feld id="hb-email" pflicht label={F.email} typ="email" wert={kontakt.email} fehler={fehler.email} autoComplete="email" onChange={(v) => setze("email", v)} />
        <Feld
          id="hb-telefon"
          pflicht
          label={F.handy}
          hinweis={K.handyHinweis}
          typ="tel"
          wert={kontakt.telefon}
          fehler={fehler.telefon}
          autoComplete="tel"
          onChange={(v) => setze("telefon", v)}
        />
        <p className="hb-klein hb-pflicht-hinweis">{F.pflichtHinweis}</p>
        {/* Honigtopf: für Menschen unsichtbar und nicht erreichbar. */}
        <div className="hb-honig" aria-hidden="true">
          <label htmlFor="hb-website">Website</label>
          <input id="hb-website" tabIndex={-1} autoComplete="off" value={kontakt.hp} onChange={(e) => setze("hp", e.target.value)} />
        </div>
        <label className={`hb-haken ${fehler.einwilligung ? "fehlt" : ""}`}>
          <input
            type="checkbox"
            checked={kontakt.einwilligung}
            onChange={(e) => setze("einwilligung", e.target.checked)}
            aria-required="true"
            aria-invalid={!!fehler.einwilligung}
          />
          <span>
            {einw.kurz}{" "}
            <a href={mitSeitenSprache("/datenschutz", sprache)} target="_blank" rel="noopener noreferrer">
              {F.datenschutz}
            </a>
            <span className="hb-pflicht" aria-hidden="true">
              {" *"}
            </span>
          </span>
        </label>
        {/* Der volle Wortlaut bleibt der Text, dem zugestimmt wird und der
            gespeichert wird (Fassung 2026-09-handbuch-v1, englisch -v1-en).
            Er steht direkt unter dem Haken, nur eingeklappt. */}
        <details className="hb-einwilligung-voll">
          <summary>{F.vollText}</summary>
          <p>{einw.text}</p>
        </details>
        {fehler.einwilligung && <div className="hb-meldung" role="alert">{fehler.einwilligung}</div>}
        <label className="hb-haken">
          <input type="checkbox" checked={kontakt.werbeeinwilligung} onChange={(e) => setze("werbeeinwilligung", e.target.checked)} />
          <span>{einw.werbung}</span>
        </label>
        {meldung && <div className="hb-meldung" role="alert">{meldung}</div>}
        <button type="submit" className="hb-knopf hb-orange" style={{ width: "100%", marginTop: 8 }} disabled={sendet}>
          {sendet ? (
            <>
              <Loader2 className="animate-spin" aria-hidden="true" /> {K.wirdErstellt}
            </>
          ) : (
            <>
              {K.anfordern} <ArrowRight aria-hidden="true" />
            </>
          )}
        </button>
        <p className="hb-klein" style={{ textAlign: "center", marginTop: 10, marginBottom: 0 }}>
          {K.kostenlos}
        </p>
        <div className="hb-konfig-fuss">
          <button type="button" className="hb-link-knopf" onClick={() => setSchritt(6)}>
            {K.zurueckAuswertung}
          </button>
          <span />
        </div>
      </form>
    </div>
  );
}

export function Feld({
  id,
  label,
  zusatz,
  hinweis,
  typ = "text",
  wert,
  fehler,
  autoComplete,
  pflicht = false,
  onChange,
}: {
  id: string;
  label: string;
  /** Kennzeichnet das Feld sichtbar mit einem Sternchen als Pflichtfeld. */
  pflicht?: boolean;
  zusatz?: string;
  /** Ein Satz unter dem Feld, etwa warum wir fragen. */
  hinweis?: string;
  typ?: string;
  wert: string;
  fehler?: string;
  autoComplete?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="hb-feld">
      <label htmlFor={id}>
        {label}
        {pflicht && (
          <span className="hb-pflicht" aria-hidden="true">
            {" *"}
          </span>
        )}{" "}
        {zusatz && <span>{zusatz}</span>}
      </label>
      <input
        id={id}
        type={typ}
        value={wert}
        autoComplete={autoComplete}
        aria-required={pflicht || undefined}
        aria-invalid={!!fehler}
        aria-describedby={[fehler ? `${id}-fehler` : "", hinweis ? `${id}-hinweis` : ""].filter(Boolean).join(" ") || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hinweis && (
        <span className="hb-klein" id={`${id}-hinweis`}>
          {hinweis}
        </span>
      )}
      {fehler && (
        <span className="fehler" id={`${id}-fehler`}>
          {fehler}
        </span>
      )}
    </div>
  );
}
