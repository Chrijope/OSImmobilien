/**
 * Die öffentliche Seite „Partner werden“ (/partner-werden), ohne Anmeldung.
 *
 * Seit dem 30.09.2026 steht hier diese Seite; die frühere Landingpage für
 * Vertriebspartner bleibt unter /karriere/vertriebspartner-immobilien
 * erreichbar (`VertriebspartnerLanding`). Die Anzeigen auf Instagram
 * verlinken hierher, deshalb zuerst für das Handy gebaut.
 *
 * Gestaltung und Bausteine der Handbuch-Seite (`handbuchSeite.css`, Klassen
 * `hb-*`), dazu wenige eigene Regeln in `partnerWerden.css`. Texte und Zahlen
 * stehen in `lib/partnerWerden/inhalt.ts`; offene Zahlen sind dort als
 * „[ZAHL PRÜFEN: …]“ markiert und erscheinen hier gelb hervorgehoben. Die
 * Objekte je Standort kommen live aus der Edge Function `partner-standorte`.
 *
 * Bewegung wie auf der Handbuch-Seite: Einblenden beim Scrollen, bewegter
 * Grund und Glas (`handbuchSeiteLiquid.css`), Kantenlicht an der Karte unter
 * dem Zeiger (`lib/glasLicht.ts`), dazu der Lichtkegel hinter dem Zeiger
 * (`useMausLicht`), das Laufband der Kundenstimmen und die Pfeile im Ablauf.
 *
 * Jede Auswahlkarte und jeder Aufruf öffnet den Wizard. Er hängt an der
 * Adresse (`?anfrage=1`, bei einer Auswahlkarte mit `&weg=…`), damit der
 * Zurück-Knopf des Browsers ihn schließt und die Kampagnenkennung (UTM) in
 * der Adresse stehen bleibt. Kein Meta Pixel auf dieser Seite.
 */
import "@/styles/handbuchSeite.css";
import "@/styles/handbuchSeiteLiquid.css";
import "@/styles/partnerWerden.css";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Clock, Lock, MapPin, Plus, ShieldCheck, Star, Users } from "lucide-react";
import heldenBild from "@/assets/login-hero-building.webp";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { useEinblenden, useHandbuchThema, useMausLicht, useSeitenTitel, Wortmarke } from "@/components/handbuch/teile";
import PartnerWizard from "@/components/partnerWerden/PartnerWizard";
import StandortKarte from "@/components/partnerWerden/StandortKarte";
import { MitPlatzhaltern } from "@/components/partnerWerden/MitPlatzhaltern";
import { ladeStandortZahlen, objekteSatz, type StandortZahlen } from "@/lib/partnerWerden/standortZahlen";
import { kampagneErfassen } from "@/lib/kampagnenKennung";
import {
  ABLAUF,
  ABSCHLUSS,
  FAQ,
  HERO,
  KONZEPT,
  SEITE,
  STANDORTE,
  STANDORTE_TEXTE,
  STIMMEN,
  STIMMEN_TEXTE,
  UEBER_UNS,
  ZAHLEN_TEXTE,
} from "@/lib/partnerWerden/inhalt";
import { istPartnerWeg, type PartnerWeg } from "../../supabase/functions/_shared/partner-werden.ts";

// Das Laufband blendet als Ganzes ein: Seine Karten liegen seitlich außerhalb
// des Bildes und kämen einzeln nie ins Sichtfeld.
const EINBLENDEN = [
  ".hb-augenbraue", ".hb-h2", ".hb-lead", ".hb-vier > *", ".pw-karte", ".pw-standorte > *", ".pw-zahlen > *",
  ".pw-laufband", ".hb-frage", ".pw-schritte > *", ".hb-cta",
]
  .map((ziel) => `.hb-abschnitt ${ziel}`)
  .join(", ");

export default function PartnerWerden() {
  const thema = useHandbuchThema();
  const [suche, setSuche] = useSearchParams();
  const wizardOffen = suche.get("anfrage") === "1";
  const wegRoh = suche.get("weg");
  // Frühere Links trugen `rolle=immobilienvertrieb` für den Portfolio-Weg.
  const startWeg: PartnerWeg | null = istPartnerWeg(wegRoh) ? wegRoh : suche.get("rolle") === "immobilienvertrieb" ? "portfolio" : null;
  const [ablauf, setAblauf] = useState<PartnerWeg>("tippgeber");
  const [aktiverStandort, setAktiverStandort] = useState<string | null>(null);
  // `undefined` heißt: lädt noch. `null`: keine Zahlen, dann ohne Zahl zeigen.
  const [zahlen, setZahlen] = useState<StandortZahlen | null | undefined>(undefined);
  const seite = useRef<HTMLDivElement>(null);

  useSeitenTitel(SEITE.titel, SEITE.beschreibung);
  useEinblenden(EINBLENDEN, !wizardOffen);
  useMausLicht(seite, !wizardOffen);

  useEffect(() => {
    const abbruch = new AbortController();
    void ladeStandortZahlen(abbruch.signal).then((z) => {
      if (!abbruch.signal.aborted) setZahlen(z);
    });
    return () => abbruch.abort();
  }, []);

  // Auf der Karte gewählt: die Karte des Standorts ins Bild holen und hervorheben.
  const waehleStandort = (name: string) => {
    const neu = aktiverStandort === name ? null : name;
    setAktiverStandort(neu);
    const s = STANDORTE.find((x) => x.name === neu);
    const karte = s ? document.getElementById(`standort-${s.slug}`) : null;
    if (karte && typeof karte.scrollIntoView === "function") {
      const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      karte.scrollIntoView({ block: "nearest", behavior: ruhig ? "auto" : "smooth" });
    }
  };

  // Die Kampagne gleich beim Aufruf merken, nicht erst beim Absenden.
  useEffect(() => {
    kampagneErfassen();
  }, []);

  // Beim Öffnen und Schließen des Wizards nach oben. Gerollt wird im
  // App-Rahmen, nicht im Fenster, deshalb über das Element selbst.
  useEffect(() => {
    document.querySelector(".hb")?.scrollIntoView({ block: "start" });
  }, [wizardOffen]);

  const oeffne = (weg?: PartnerWeg) => {
    const neu = new URLSearchParams(suche);
    neu.set("anfrage", "1");
    neu.delete("rolle");
    if (weg) neu.set("weg", weg);
    else neu.delete("weg");
    setSuche(neu);
  };
  const schliesse = () => {
    const neu = new URLSearchParams(suche);
    neu.delete("anfrage");
    neu.delete("rolle");
    neu.delete("weg");
    setSuche(neu);
  };

  if (wizardOffen) {
    return (
      <div className="hb pw" data-thema={thema}>
        <Kopf onAufruf={null} />
        <main className="hb-wizard-seite">
          <div className="hb-wrap">
            <div className="einleitung">
              <span className="hb-augenbraue">{HERO.augenbraue}</span>
              <h1>Partner werden</h1>
              <p>Ein paar kurze Schritte, rund eine Minute. Danach melden wir uns persönlich.</p>
            </div>
            {/* Schlüssel am Weg: Wer über eine andere Karte kommt, beginnt neu. */}
            <PartnerWizard key={startWeg ?? "ohne"} startWeg={startWeg} onZurueckZurSeite={schliesse} />
            <div className="hb-vertrauen" style={{ marginTop: 18 }}>
              <span>
                <ShieldCheck aria-hidden="true" />
                Unverbindlich
              </span>
              <span>
                <Clock aria-hidden="true" />
                Rund 60 Sekunden
              </span>
              <span>
                <Lock aria-hidden="true" />
                Keine automatischen Mails
              </span>
            </div>
          </div>
        </main>
        <Fuss anker={false} />
      </div>
    );
  }

  return (
    <div ref={seite} className="hb pw hb-mit-mobil-cta" data-thema={thema}>
      <Kopf onAufruf={() => oeffne()} />

      {/* 1 Einstieg */}
      <section className="hb-umschlag" aria-labelledby="pw-titel">
        <div className="hb-wrap">
          <div>
            <span className="hb-augenbraue">{HERO.augenbraue}</span>
            <h1 id="pw-titel">
              {HERO.h1a}
              <br />
              <span className="hb-verlauf">
                <MitPlatzhaltern text={HERO.h1b} />
              </span>
            </h1>
            <div className="hb-akzentlinie" aria-hidden="true" />
            <p className="hb-lead">{HERO.lead}</p>
            <div className="pw-wege">
              {HERO.karten.map((k) => (
                <button
                  key={k.weg}
                  type="button"
                  className="pw-weg"
                  onClick={() => oeffne(k.weg)}
                >
                  <span className="wer">{k.wer}</span>
                  <b>
                    {k.titel} <ArrowRight aria-hidden="true" />
                  </b>
                  <span className="text">{k.text}</span>
                </button>
              ))}
            </div>
            <ul className="pw-haken">
              {HERO.haken.map((h) => (
                <li key={h.t}>
                  <Check aria-hidden="true" />
                  <span>
                    <b>{h.t}</b> {h.x}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <figure className="hb-held-bild pw-held-bild">
            {/* Vorhandenes Motiv aus dem Projekt (Anmeldeseite), keine Personen. */}
            <img src={heldenBild} alt={HERO.bildAlt} loading="eager" fetchPriority="high" />
            <figcaption className="pw-held-zahlen">
              {HERO.kennzahlen.map((z) => (
                <div key={z.text} className="hb-karte">
                  <b>
                    <MitPlatzhaltern text={z.wert} />
                  </b>
                  <span>{z.text}</span>
                </div>
              ))}
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 2 Wo wir tätig sind */}
      <section className="hb-abschnitt" id="standorte">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{STANDORTE_TEXTE.augenbraue}</span>
          <h2 className="hb-h2">{STANDORTE_TEXTE.h2}</h2>
          <p className="hb-lead">{STANDORTE_TEXTE.lead}</p>
          <div className="pw-karte-raster">
            <StandortKarte standorte={STANDORTE} aktiv={aktiverStandort} onWaehle={waehleStandort} tipp={STANDORTE_TEXTE.tipp} />
            <div className="pw-standorte">
              {STANDORTE.map((s) => {
                const satz = objekteSatz(zahlen?.[s.name as keyof StandortZahlen], STANDORTE_TEXTE.objekteEins, STANDORTE_TEXTE.objekteViele);
                return (
                  <div
                    key={s.name}
                    id={`standort-${s.slug}`}
                    className={`pw-standort hb-karte${aktiverStandort === s.name ? " aktiv" : ""}`}
                    aria-current={aktiverStandort === s.name ? "true" : undefined}
                  >
                    <div className="kopf">
                      <span className="hb-rund">
                        <MapPin aria-hidden="true" />
                      </span>
                      <div>
                        <h3>{s.name}</h3>
                        {zahlen === undefined ? (
                          <span className="anzahl laedt" aria-label="Anzahl wird geladen">
                            …
                          </span>
                        ) : (
                          satz && <span className="anzahl">{satz}</span>
                        )}
                      </div>
                    </div>
                    <p>{s.text}</p>
                  </div>
                );
              })}
              <div className="pw-standort pw-weitere hb-karte">
                <h3>{STANDORTE_TEXTE.weitere}</h3>
                <p>{STANDORTE_TEXTE.weitereText}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Zahlen */}
      <section className="hb-abschnitt hb-zweiter" id="zahlen">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{ZAHLEN_TEXTE.augenbraue}</span>
          <h2 className="hb-h2">{ZAHLEN_TEXTE.h2}</h2>
          <div className="pw-zahlen">
            {ZAHLEN_TEXTE.kacheln.map((k) => (
              <div key={k.text} className="hb-karte">
                <b>
                  <MitPlatzhaltern text={k.wert} />
                </b>
                <span>{k.text}</span>
              </div>
            ))}
          </div>
          <div className="pw-mitte">
            <button type="button" className="hb-knopf hb-orange" onClick={() => oeffne()}>
              {ZAHLEN_TEXTE.cta} <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* 4 Das Konzept */}
      <section className="hb-abschnitt" id="konzept">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{KONZEPT.augenbraue}</span>
          <h2 className="hb-h2">{KONZEPT.h2}</h2>
          <p className="hb-lead">{KONZEPT.lead}</p>
          <div className="hb-vier drei">
            {KONZEPT.karten.map((k, i) => (
              <div key={k.t} className="hb-kachel-karte hb-karte">
                <span className="hb-rund">
                  <b aria-hidden="true">{i + 1}</b>
                </span>
                <h3>{k.t}</h3>
                <p>{k.x}</p>
              </div>
            ))}
          </div>
          <div className="hb-hinweise" style={{ marginTop: 8 }}>
            <b>Wichtig:</b> {KONZEPT.hinweis}
          </div>
        </div>
      </section>

      {/* 5 Über uns */}
      <section className="hb-abschnitt hb-zweiter" id="ueber-uns">
        <div className="hb-wrap hb-zwei gleich">
          <div>
            <span className="hb-augenbraue">{UEBER_UNS.augenbraue}</span>
            <h2 className="hb-h2">{UEBER_UNS.h2}</h2>
            {UEBER_UNS.absaetze.map((a) => (
              <p key={a} style={{ fontSize: 17, color: "var(--hb-text2)" }}>
                {a}
              </p>
            ))}
            <div className="hb-ergebnis" style={{ "--hb-spalten": UEBER_UNS.kennzahlen.length } as CSSProperties}>
              {UEBER_UNS.kennzahlen.map((k) => (
                <div key={k.text}>
                  <b>
                    <MitPlatzhaltern text={k.wert} />
                  </b>
                  <span>{k.text}</span>
                </div>
              ))}
            </div>
            <ul className="hb-nutzen pw-punkte">
              {UEBER_UNS.punkte.map((p) => (
                <li key={p}>
                  <Check aria-hidden="true" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
          {/* Platzhalter, bis ein Teamfoto vorliegt. Keine erfundenen Personen. */}
          <div className="pw-teamfoto" role="img" aria-label="Teamfoto folgt">
            <Users aria-hidden="true" />
            <span><MitPlatzhaltern text={UEBER_UNS.teamfoto} /></span>
          </div>
        </div>
      </section>

      {/* 6 Stimmen unserer Kunden */}
      <section className="hb-abschnitt" id="stimmen">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{STIMMEN_TEXTE.augenbraue}</span>
          <h2 className="hb-h2">{STIMMEN_TEXTE.h2}</h2>
          <p className="hb-lead">{STIMMEN_TEXTE.lead}</p>
          {/* Laufband von rechts nach links, nahtlos: zwei gleiche Sätze, der zweite
              nur fürs Auge (aria-hidden). Maus darüber hält es an. Bei „weniger
              Bewegung“ steht es und lässt sich seitlich wischen, der zweite Satz entfällt. */}
          <div className="pw-laufband">
            <div className="lp-marquee-track pw-laufband-spur">
              {[0, 1].map((kopie) => (
                <div key={kopie} className="pw-laufband-satz" role={kopie === 0 ? "list" : undefined} aria-hidden={kopie === 1 ? true : undefined}>
                  {STIMMEN.map((s) => (
                    <figure className="hb-stimme hb-karte" key={s.name} role={kopie === 0 ? "listitem" : undefined}>
                      <div className="sterne" aria-label={kopie === 0 ? "Kundenstimme" : undefined}>
                        {[0, 1, 2, 3, 4].map((i) => (
                          <Star key={i} aria-hidden="true" />
                        ))}
                      </div>
                      <blockquote>„{s.text}“</blockquote>
                      <figcaption>
                        <b>{s.name}</b>
                        <span>{s.ort}</span>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <p className="hb-fussnote">{STIMMEN_TEXTE.fuss}</p>
        </div>
      </section>

      {/* 7 So einfach ist die Zusammenarbeit */}
      <section className="hb-abschnitt hb-zweiter" id="ablauf">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{ABLAUF.augenbraue}</span>
          <h2 className="hb-h2">{ABLAUF.h2}</h2>
          <div className="pw-umschalter" role="group" aria-label="Ablauf anzeigen für">
            {(["tippgeber", "vertriebspartner", "portfolio"] as const).map((w) => (
              <button key={w} type="button" aria-pressed={ablauf === w} onClick={() => setAblauf(w)}>
                {ABLAUF.umschalter[w]}
              </button>
            ))}
          </div>
          <ol className="pw-schritte" aria-live="polite">
            {ABLAUF[ablauf].map((s, i, alle) => (
              <li key={s.t} className="hb-karte">
                <span className="zahl">{i + 1}</span>
                <h3>{s.t}</h3>
                <p>
                  <MitPlatzhaltern text={s.x} />
                </p>
                {/* Überleitung zum nächsten Schritt: rechts daneben, am Handy darunter. */}
                {i < alle.length - 1 && (
                  <span className="pw-pfeil" aria-hidden="true">
                    <ArrowRight />
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="pw-mitte">
            <button type="button" className="hb-knopf hb-orange" onClick={() => oeffne(ablauf)}>
              {ABSCHLUSS.knopf} <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      {/* 8 Häufige Fragen */}
      <section className="hb-abschnitt" id="fragen">
        <div className="hb-wrap">
          <div className="hb-faq">
            <div className="hb-faq-kopf">
              <span className="hb-augenbraue">{FAQ.augenbraue}</span>
              <h2 className="hb-h2">{FAQ.h2}</h2>
              <p style={{ color: "var(--hb-text2)" }}>{FAQ.text}</p>
            </div>
            <div>
              {FAQ.fragen.map(({ f, a }, i) => (
                <details className="hb-frage hb-karte" key={f} open={i === 0}>
                  <summary>
                    {f}
                    <Plus aria-hidden="true" />
                  </summary>
                  <p>
                    <MitPlatzhaltern text={a} />
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 9 Abschluss */}
      <section className="hb-abschnitt hb-zweiter">
        <div className="hb-wrap">
          <div className="hb-cta" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <span className="hb-augenbraue">{ABSCHLUSS.augenbraue}</span>
              <h2 className="hb-h2">{ABSCHLUSS.h2}</h2>
              <p style={{ fontSize: 18, maxWidth: 720 }}>{ABSCHLUSS.unter}</p>
              <button type="button" className="hb-knopf hb-orange" style={{ marginTop: 10 }} onClick={() => oeffne()}>
                {ABSCHLUSS.knopf} <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <Fuss anker />
      <MobilerAufruf onClick={() => oeffne()} />
    </div>
  );
}

/**
 * Der feste Knopf unten auf dem Handy, wie auf der Handbuch-Seite. Er blendet
 * sich aus, solange die Auswahlkarten im Einstieg, ein anderer Aufruf-Knopf
 * oder der Fuß sichtbar sind, damit er weder doppelt steht noch Impressum und
 * Datenschutz verdeckt.
 */
function MobilerAufruf({ onClick }: { onClick: () => void }) {
  const [verdeckt, setVerdeckt] = useState(true);
  const sichtbar = useRef(new Set<Element>());
  useEffect(() => {
    const ziele = [...document.querySelectorAll(".pw-wege, .pw-mitte, .hb-cta, .hb-fuss")];
    if (ziele.length === 0 || typeof IntersectionObserver === "undefined") {
      setVerdeckt(false);
      return;
    }
    const io = new IntersectionObserver((eintraege) => {
      for (const e of eintraege) {
        if (e.isIntersecting) sichtbar.current.add(e.target);
        else sichtbar.current.delete(e.target);
      }
      setVerdeckt(sichtbar.current.size > 0);
    });
    ziele.forEach((z) => io.observe(z));
    return () => io.disconnect();
  }, []);
  return (
    <div className={`hb-mobil-cta${verdeckt ? " weg" : ""}`} aria-hidden={verdeckt}>
      <button type="button" className="hb-knopf hb-orange" onClick={onClick} tabIndex={verdeckt ? -1 : undefined}>
        {ABSCHLUSS.knopf} <ArrowRight aria-hidden="true" />
      </button>
    </div>
  );
}

/** Kopfleiste im Stil der Handbuch-Seite, ohne Sprachumschalter (die Seite ist deutsch). */
function Kopf({ onAufruf }: { onAufruf: (() => void) | null }) {
  const thema = useHandbuchThema();
  return (
    <header className="hb-kopf">
      <div className="hb-kopf-marke">
        <a href="/partner-werden" aria-label="Zum Anfang der Seite" style={{ display: "inline-flex", color: "inherit", textDecoration: "none" }}>
          {thema === "dunkel" ? <Wortmarke hell groesse={19} /> : <img src="/images/moreimmo-logo.png" alt="MOREImmo" />}
        </a>
      </div>
      {onAufruf && (
        <nav aria-label="Abschnitte">
          <a href="#standorte">Standorte</a>
          <a href="#konzept">Konzept</a>
          <a href="#ablauf">Ablauf</a>
          <a href="#fragen">Fragen</a>
        </nav>
      )}
      <div className="hb-kopf-rechts">
        {onAufruf && (
          <button type="button" className="hb-knopf hb-orange hb-klein-knopf" onClick={onAufruf}>
            {SEITE.kopfKnopf}
          </button>
        )}
      </div>
    </header>
  );
}

/** Fuß wie auf der Handbuch-Seite: Anschrift, Impressum, Datenschutz, Cookie-Einstellungen. */
function Fuss({ anker }: { anker: boolean }) {
  return (
    <footer className="hb-fuss">
      <div className="hb-wrap">
        <div>
          <div style={{ marginBottom: 14 }}>
            <Wortmarke hell groesse={20} />
          </div>
          <div>MOREImmo, Wendelsteinstraße 19, 83075 Bad Feilnbach</div>
          <div style={{ marginTop: 8 }}>
            <a href="mailto:office@more.immo" className="pw-fuss-mail">
              office@more.immo
            </a>
          </div>
        </div>
        {anker ? (
          <div>
            <b>Partnerprogramm</b>
            <a href="#standorte">Standorte</a>
            <a href="#ablauf">Ablauf</a>
            <a href="#fragen">Häufige Fragen</a>
          </div>
        ) : (
          <div />
        )}
        <div>
          <b>Rechtliches</b>
          <a href="/impressum">Impressum</a>
          <a href="/datenschutz">Datenschutz</a>
          <CookieEinstellungenLink className="hb-fuss-link" />
        </div>
      </div>
    </footer>
  );
}
