/**
 * Die offene Selbstauskunft der Handbuch-Seite, ohne Token.
 *
 * /handbuch/selbstauskunft          ohne Partner
 * /handbuch/:slug/selbstauskunft    mit Partner (Kürzel, serverseitig geprüft)
 *
 * Für alle, die keinen gültigen persönlichen Link haben: Dublette, abgelaufen,
 * weitergegeben, direkt geteilt. Zuerst die Kontaktdaten (wie im
 * Konfigurator: Honigtopf, Zeitfalle, Bremse je Adresse auf dem Server), dann
 * legt `submit-lead` einen Lead an, Quelle „Konfigurator“:
 *
 *   - Firmenweg: „Neuer Lead“ in der Lead-Verwaltung zum Zuteilen,
 *   - Partnerweg: direkt beim Partner unter „Alle Kontakte“.
 *
 * Seit dem 26.09.2026 geht es ohne Ansprechpartner weiter, in die
 * Standard-Selbstauskunft (`/sa/:token`, wie „An Kunde senden“):
 *
 *   - NEUER Kontakt: Der Server gibt den persönlichen Link zurück, es geht
 *     sofort ins Formular. Zusätzlich kommt der Link per Mail, damit der
 *     Besucher später weitermachen kann.
 *   - BEKANNTE Adresse: Kein Link an den Browser. Der Server schickt den Link
 *     automatisch an die gespeicherte Adresse. Wer eine fremde Adresse
 *     eingibt, kommt so nicht an eine fremde Akte; der Mail-Link belegt, dass
 *     die Adresse dem Besucher gehört.
 *
 * Der Text nach dem Absenden ist in beiden Fällen gleich und verrät nicht, ob
 * die Adresse bekannt war. Liegt die Selbstauskunft schon unterschrieben vor,
 * sagt die Mail das, und der Partner bekommt eine Glocke. Scheitert auf dem
 * Server etwas technisch (`zustellung: "fehler"`), bittet die Seite, es in
 * ein paar Minuten erneut zu versuchen.
 */
import "@/styles/handbuchSeite.css";
import "@/styles/handbuchSeiteLiquid.css";
import { useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Info, Loader2, MailCheck } from "lucide-react";
import { Feld, pruefeKontaktdaten } from "@/components/handbuch/Konfigurator";
import { HandbuchFuss, HandbuchKopf, useBeraterAusKuerzel } from "@/components/handbuch/Rahmen";
import { useHandbuchThema, useSeitenTitel } from "@/components/handbuch/teile";
import { SeitenSpracheProvider, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { sendeHandbuchSelbstauskunft, type HandbuchKontakt } from "@/lib/handbuch/leadAbsenden";
import { handbuchStartseite, konfiguratorPfad, saTokenPfad } from "@/lib/handbuch/wege";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import { handbuchEinwilligungTexte } from "@/lib/leadEinwilligung";
import { mitSeitenSprache } from "@/lib/seitenSprache";

export default function HandbuchSelbstauskunftOffen() {
  return (
    <SeitenSpracheProvider>
      <SaOffen />
    </SeitenSpracheProvider>
  );
}

function SaOffen() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const thema = useHandbuchThema();
  const sprache = useSeitenSprache();
  const T = useSeitenTexte(HANDBUCH_SEITEN_TEXTE);
  const S = T.saOffen;
  const F = T.formular;
  const einw = handbuchEinwilligungTexte(sprache, "sa");
  const stand = useBeraterAusKuerzel(slug);
  const berater = stand.status === "ok" ? stand.berater : null;
  // Bewusst kein Meta Pixel auf dieser Seite (27.09.2026, Punkt 6): Hier
  // gehen Finanzdaten ein, und Anlage 4 § 1 Abs. 1 nennt die Seite nicht.
  // Ein vom Konfigurator mitgebrachtes Pixel entfernt `pruefeMetaPixelBindung`.
  const start = useRef(Date.now());
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
  const [perMail, setPerMail] = useState(false);

  useSeitenTitel(S.titel);

  const setze = (feld: keyof HandbuchKontakt, wert: string | boolean) => {
    setKontakt((k) => ({ ...k, [feld]: wert }));
    if (fehler[feld]) setFehler((f) => ({ ...f, [feld]: "" }));
  };

  const absenden = async () => {
    const f = pruefeKontaktdaten(kontakt, F, einw.fehlt);
    setFehler(f);
    if (Object.keys(f).length > 0) return;
    setSendet(true);
    setMeldung(null);
    const ergebnis = await sendeHandbuchSelbstauskunft({
      kontakt,
      beraterSlug: berater?.slug ?? slug ?? null,
      dauerMs: Date.now() - start.current,
      sprache,
    });
    setSendet(false);
    if (!ergebnis.ok) {
      setMeldung(ergebnis.fehler || F.fehlerAllgemein);
      return;
    }
    if (ergebnis.saToken) {
      navigate(mitSeitenSprache(saTokenPfad(ergebnis.saToken), sprache));
      return;
    }
    // Link oder Mail sind auf dem Server gescheitert: keine Erfolgsmeldung.
    // Das Feld ist für bekannte und neue Adressen gleich (HB-009).
    if (ergebnis.zustellung === "fehler") {
      setMeldung(S.nichtGeklappt);
      return;
    }
    setPerMail(true);
  };

  return (
    <div className="hb" data-thema={thema}>
      <HandbuchKopf thema={thema} berater={berater} anker={false} startseite={handbuchStartseite(slug)} />
      <main className="hb-wizard-seite">
        <div className="hb-wrap">
          <div className="einleitung">
            <span className="hb-augenbraue">{S.augenbraue}</span>
            <h1>{S.h1}</h1>
            <p>{S.lead}</p>
          </div>
          <div className="hb-konfig hb-karte">
            {perMail ? (
              <div role="status">
                <div className="hb-schritt-hinweis">
                  <MailCheck aria-hidden="true" />
                  <span>
                    <b>{S.gesendetTitel}</b> {S.gesendetText}
                  </span>
                </div>
                <a className="hb-knopf hb-zweit" href={mitSeitenSprache(handbuchStartseite(slug), sprache)}>
                  {S.zurSeite}
                </a>
              </div>
            ) : (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  void absenden();
                }}
              >
                <h2 style={{ fontSize: 22, marginBottom: 6 }}>{S.wer}</h2>
                <p className="hb-warum" style={{ marginBottom: 16 }}>
                  <Info aria-hidden="true" />
                  <span>{S.danach}</span>
                </p>
                <div className="hb-felder">
                  <Feld id="sa-vorname" label={F.vorname} wert={kontakt.vorname} fehler={fehler.vorname} autoComplete="given-name" onChange={(v) => setze("vorname", v)} />
                  <Feld id="sa-nachname" label={F.nachname} wert={kontakt.nachname} fehler={fehler.nachname} autoComplete="family-name" onChange={(v) => setze("nachname", v)} />
                </div>
                <Feld id="sa-email" label={F.email} typ="email" wert={kontakt.email} fehler={fehler.email} autoComplete="email" onChange={(v) => setze("email", v)} />
                <Feld
                  id="sa-telefon"
                  label={F.handy}
                  hinweis={S.handyHinweis}
                  typ="tel"
                  wert={kontakt.telefon}
                  fehler={fehler.telefon}
                  autoComplete="tel"
                  onChange={(v) => setze("telefon", v)}
                />
                <div className="hb-honig" aria-hidden="true">
                  <label htmlFor="sa-website">Website</label>
                  <input id="sa-website" tabIndex={-1} autoComplete="off" value={kontakt.hp} onChange={(e) => setze("hp", e.target.value)} />
                </div>
                <label className={`hb-haken ${fehler.einwilligung ? "fehlt" : ""}`}>
                  <input type="checkbox" checked={kontakt.einwilligung} onChange={(e) => setze("einwilligung", e.target.checked)} aria-invalid={!!fehler.einwilligung} />
                  <span>
                    {einw.kurz}{" "}
                    <a href={mitSeitenSprache("/datenschutz", sprache)} target="_blank" rel="noopener noreferrer">
                      {F.datenschutz}
                    </a>
                  </span>
                </label>
                <details className="hb-einwilligung-voll">
                  <summary>{F.vollText}</summary>
                  <p>{einw.text}</p>
                </details>
                {fehler.einwilligung && (
                  <div className="hb-meldung" role="alert">
                    {fehler.einwilligung}
                  </div>
                )}
                <label className="hb-haken">
                  <input type="checkbox" checked={kontakt.werbeeinwilligung} onChange={(e) => setze("werbeeinwilligung", e.target.checked)} />
                  <span>{einw.werbung}</span>
                </label>
                {meldung && (
                  <div className="hb-meldung" role="alert">
                    {meldung}
                  </div>
                )}
                <button type="submit" className="hb-knopf hb-orange" style={{ width: "100%", marginTop: 8 }} disabled={sendet}>
                  {sendet ? (
                    <>
                      <Loader2 className="animate-spin" aria-hidden="true" /> {S.einenMoment}
                    </>
                  ) : (
                    <>
                      {S.weiter} <ArrowRight aria-hidden="true" />
                    </>
                  )}
                </button>
                <p className="hb-klein" style={{ textAlign: "center", marginTop: 10, marginBottom: 0 }}>
                  {S.nochKeinHandbuch} <a href={mitSeitenSprache(konfiguratorPfad(slug), sprache)}>{S.ersteFragen}</a>
                </p>
              </form>
            )}
          </div>
        </div>
      </main>
      <HandbuchFuss startseite={handbuchStartseite(slug)} konfigurator={konfiguratorPfad(slug)} />
    </div>
  );
}
