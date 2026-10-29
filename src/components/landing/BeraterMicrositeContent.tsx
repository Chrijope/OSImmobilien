import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowRight, Building2, CalendarDays, Check, ChevronDown, CircleDashed, KeyRound, Landmark, Mail, Minus, Phone, PiggyBank } from "lucide-react";
import InvestorBenefitsSection from "@/components/landing/InvestorBenefitsSection";
import AppleBentoSection from "@/components/landing/apple/AppleBentoSection";
import ProzessGrafik, { PROZESS_MOTIVE } from "@/components/landing/ProzessGrafik";
import logoHell from "@/assets/os-real-estate-logo-quer-dunkel.png";
import { SeitenSprachUmschalter, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { PartnerPixelHinweis } from "@/components/cookie/PartnerPixelHinweis";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { MIKROSEITE_OS_TEXTE } from "./mikroseiteOsTexte";
import { positionFuerAnzeige } from "./mikroseiteAbschlussTexte";
import type { BeraterInfo } from "./FloatingBeraterBadge";
// Schriften und Farbwerte der OS-CI (Waldgrün, Schwarz, Papier, Gold), dieselben wie die Beratungspräsentation.
import "@/styles/beratung-os.css";
import "./mikroseiteOs.css";

/*
 * Die persönliche Partner-Landingpage. Neu aufgebaut am 29.10.2026 als
 * Spannungsbogen, der Laien abholt und Kenner nicht langweilt:
 *
 *  1. Hero: das Versprechen (Mieter und Steuer zahlen mit) und der Partner.
 *  2. Ausgangslage: Rentenlücke, Steuerlast, Inflation, Preis des Abwartens.
 *  3. Prinzip: Wer bezahlt die Wohnung? Mieter, Steuer, du.
 *  4. Zwei Konzepte: Steueroptimierung und Altersvorsorge (Verkauf oder
 *     Zusatzrente), je mit „Für Kenner“ zum Aufklappen. Danach Zwischenruf.
 *  5. Für wen: die vier Investorenprofile.
 *  6. Wer wir sind: Gruppe und Vorteile.
 *  7. Leistungen: alles, was du für ein Investment brauchst.
 *  8. Ehrliche Antworten auf die häufigsten Einwände.
 *  9. Prozess in sieben bewegten Schritten.
 * 10. Erstgespräch mit dem Partner.
 *
 * Allgemein gehalten, keine einzelnen OS-Objekte. Hauptaktion im
 * Orange-Verlauf (`btn-brand`), alles andere in der OS-CI. Hell- und
 * Dunkelmodus über mikroseiteOs.css.
 *
 * Die persönlichen Daten (Name, Foto, Telefon, E-Mail, Buchungslink) kommen
 * unverändert aus `BeraterMicroseite.tsx` (öffentlich über `get-vp-microsite`).
 */

interface Props { berater: BeraterInfo | null; onOpenFunnel: () => void; }

const BILD = "/images/mikroseite";

/*
 * Das Original des Partnerfotos in passender Größe. Beim Hochladen entstehen
 * eine kleine Vorschau (avatar.webp, rund 400 px) und das Original bis 1600 px
 * (avatar_original.jpg). Die Vorschau wirkt im Hochformat unscharf, deshalb
 * das Original über die Bildtransformation von Supabase. Fehlt es, fängt
 * onError das ab und die Vorschau übernimmt.
 */
const scharfesPortraet = (url: string | null | undefined): string | null => {
  if (!url) return null;
  const ohneParameter = url.split("?")[0];
  if (!ohneParameter.includes("/object/public/avatars/")) return null;
  const original = ohneParameter.replace(/\/avatar\.[a-z0-9]+$/i, "/avatar_original.jpg");
  if (original === ohneParameter) return null;
  return original.replace("/object/public/", "/render/image/public/") + "?width=420&height=500&resize=cover&quality=80";
};

/**
 * Startet die Bewegung eines Elements, sobald es ins Bild kommt.
 *
 * Ohne Skript, ohne IntersectionObserver oder mit „Bewegung reduzieren“ fehlt
 * `data-anim`, und das CSS zeigt das fertige Bild. Erst wenn Bewegung sicher
 * läuft, setzt der Hook „wartet“ (Startbild) und beim Hereinscrollen „an“.
 */
function useBewegung<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    el.dataset.anim = "wartet";
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (!eintraege.some((e) => e.isIntersecting)) return;
        el.dataset.anim = "an";
        beobachter.disconnect();
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    beobachter.observe(el);
    return () => beobachter.disconnect();
  }, []);
  return ref;
}

/** Gemeinsame Darstellung für öffentliche Microseite und persönliche Vorschau. */
export default function BeraterMicrositeContent({ berater, onOpenFunnel }: Props) {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE);
  return (
    <div className="bos osm">
      <header className="osm-kopf">
        <img src={logoHell} alt={t.kopf.logoAlt} width="192" height="40" />
        {/* Ohne SeitenSpracheProvider zeigt der Umschalter nichts. */}
        <SeitenSprachUmschalter className="osm-sprache" />
      </header>
      {/* Reihenfolge nach Christian (29.10.2026): erst das Problem, dann warum
          Immobilie, dann wer wir sind, und erst danach Prinzip, Rechnung,
          Leistungen und Konzepte. Die Töne wechseln hell und dunkel ab. */}
      <Hero berater={berater} onOpenFunnel={onOpenFunnel} />
      <Ausgangslage />
      <Vergleich />
      <WerWirSind />
      <Prinzip />
      <Musterrechnung />
      {/* Behalten aus der bisherigen Seite, Wording an OS angepasst. */}
      <div className="osm-alt osm-dunkel"><AppleBentoSection /></div>
      <Konzepte onOpenFunnel={onOpenFunnel} />
      <div className="osm-alt osm-dunkel"><InvestorBenefitsSection /></div>
      <Fragen />
      <Prozess />
      <Kontakt berater={berater} onOpenFunnel={onOpenFunnel} />
      <Fuss />
    </div>
  );
}

function Abschnitt({ ton, id, children, className = "" }: { ton: "hell" | "dunkel" | "gruen"; id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`osm-abschnitt osm-${ton} ${className}`}>
      <div className="osm-wrap">{children}</div>
    </section>
  );
}

function Kopf({ kicker, titel, intro }: { kicker: string; titel: string; intro?: string }) {
  return (
    <div className="osm-titelblock">
      <p className="bos-kicker osm-kicker">{kicker}</p>
      <h2 className="bos-serif">{titel}</h2>
      {intro && <p className="osm-intro">{intro}</p>}
    </div>
  );
}

/** Ein waagerechter Balken, der beim Hereinscrollen auf seine Länge wächst. */
function Balken({ label, wert, anteil, zusatz, ton = "normal", nr = 0 }: {
  label: string; wert: string; anteil: number; zusatz?: string; ton?: "normal" | "warnung" | "gut"; nr?: number;
}) {
  return (
    <div className={`osm-balken osm-balken-${ton}`} style={{ "--nr": nr } as CSSProperties}>
      <div className="osm-balken-text">
        <span>{label}</span>
        <b>{wert}</b>
      </div>
      <div className="osm-balken-bahn">
        <span className="osm-balken-fuellung" style={{ width: `${anteil}%` }} />
      </div>
      {zusatz && <small className="osm-balken-zusatz">{zusatz}</small>}
    </div>
  );
}

/** Foto des Partners, erst das scharfe Original, dann die Vorschau, zuletzt Initialen. */
function Portraet({ berater, className }: { berater: BeraterInfo; className: string }) {
  const [quelle, setQuelle] = useState<string | null>(null);
  const [fehlt, setFehlt] = useState(false);
  useEffect(() => {
    setFehlt(false);
    setQuelle(scharfesPortraet(berater.bild) ?? berater.bild ?? null);
  }, [berater.bild]);
  if (!berater.bild || fehlt || !quelle) {
    const initialen = (berater.name || "?").split(" ").filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
    return <div className={`${className} osm-initialen`} aria-label={berater.name}>{initialen}</div>;
  }
  return (
    <img
      className={className}
      src={quelle}
      alt={berater.name}
      width={420}
      height={500}
      onError={() => {
        if (quelle !== berater.bild) setQuelle(berater.bild!);
        else setFehlt(true);
      }}
    />
  );
}

function Hero({ berater, onOpenFunnel }: Props) {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).hero;
  return (
    <section className="osm-hero">
      <img className="osm-hero-bild" src={`${BILD}/zossen-haus-garten.jpg`} alt={t.bildAlt} loading="eager" fetchPriority="high" />
      <div className="osm-wrap osm-hero-inhalt">
        <div>
          <p className="bos-kicker osm-kicker">{t.kicker}</p>
          <h1 className="bos-serif">
            {t.titelZeile1}
            <br />
            <em>{t.titelZeile2}</em>
          </h1>
          <p className="osm-hero-text">{t.text}</p>
          <div className="osm-knoepfe">
            <button type="button" className="osm-knopf btn-brand" onClick={onOpenFunnel}>
              {t.knopfTermin} <ArrowRight aria-hidden="true" />
            </button>
            <a className="osm-knopf osm-rand" href="#prinzip">{t.knopfPrinzip}</a>
          </div>
          <ul className="osm-hero-vorteile">
            {t.vorteile.map((v) => <li key={v}><Check aria-hidden="true" /> {v}</li>)}
          </ul>
        </div>
        {berater && <HeroAnsprechpartner berater={berater} onOpenFunnel={onOpenFunnel} />}
      </div>
    </section>
  );
}

/**
 * Glaskarte des Ansprechpartners im Hero: Foto (sonst Initialen), Name,
 * Position und ein direkter Knopf. Mit Buchungslink geht der Knopf zum
 * Kalender, ohne öffnet er das Anfrageformular.
 */
function HeroAnsprechpartner({ berater, onOpenFunnel }: { berater: BeraterInfo; onOpenFunnel: () => void }) {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).hero;
  const sprache = useSeitenSprache();
  const inhalt = <><CalendarDays aria-hidden="true" /> {t.portraetTermin}</>;
  return (
    <aside className="osm-portraetkarte" aria-label={t.portraetUeber}>
      <Portraet berater={berater} className="osm-portraet" />
      <div className="osm-portraet-text">
        <small>{t.portraetUeber}</small>
        <strong>{berater.name}</strong>
        <span>{positionFuerAnzeige(berater.position, sprache)}</span>
      </div>
      {berater.buchungslink ? (
        <a className="osm-knopf btn-brand osm-portraet-knopf" href={berater.buchungslink} target="_blank" rel="noopener noreferrer">{inhalt}</a>
      ) : (
        <button type="button" className="osm-knopf btn-brand osm-portraet-knopf" onClick={onOpenFunnel}>{inhalt}</button>
      )}
    </aside>
  );
}

function Ausgangslage() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).lage;
  const druck = useBewegung<HTMLDivElement>();
  const warten = useBewegung<HTMLDivElement>();
  return (
    <Abschnitt ton="hell">
      <Kopf kicker={t.kicker} titel={t.titel} />
      <div className="osm-drei osm-druck" ref={druck}>
        {t.punkte.map((p, i) => (
          <div key={p.titel} className="osm-karte" style={{ "--nr": i } as CSSProperties}>
            <b className="osm-grosszahl">{p.wert}</b>
            <h3>{p.titel}</h3>
            <p>{p.text}</p>
          </div>
        ))}
      </div>
      <div className="osm-karte osm-warten" ref={warten}>
        <div>
          <h3>{t.nichtstun.titel}</h3>
          <p>{t.nichtstun.text}</p>
        </div>
        <div className="osm-balken-liste">
          {t.nichtstun.balken.map((b, i) => (
            <Balken key={b.label} label={b.label} wert={b.wert} anteil={b.anteil} ton={b.warnung ? "warnung" : "normal"} nr={i} />
          ))}
        </div>
        <p className="osm-warten-satz">{t.nichtstun.satz}</p>
      </div>
      <p className="osm-schluss">{t.schluss}</p>
    </Abschnitt>
  );
}

const BEWERTUNG_SYMBOL = { ja: Check, teil: CircleDashed, nein: Minus } as const;

/** Tagesgeld, Aktien, Gold und Immobilie im Vergleich; die Immobilie ist hervorgehoben. */
function Vergleich() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).vergleich;
  const tabelle = useBewegung<HTMLDivElement>();
  const letzte = t.spalten.length - 1;
  return (
    <Abschnitt ton="dunkel" id="vergleich">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-vergleich" ref={tabelle} role="table" aria-label={t.titel}>
        <div className="osm-vergleich-zeile osm-vergleich-kopf" role="row">
          <span role="columnheader" />
          {t.spalten.map((s, i) => (
            <span key={s} role="columnheader" className={i === letzte ? "osm-vergleich-wir" : undefined}>{s}</span>
          ))}
        </div>
        {t.zeilen.map((z, nr) => (
          <div key={z.kriterium} className="osm-vergleich-zeile" role="row" style={{ "--nr": nr } as CSSProperties}>
            <span role="rowheader">{z.kriterium}</span>
            {z.werte.map((w, i) => {
              const Symbol = BEWERTUNG_SYMBOL[w];
              return (
                <span key={t.spalten[i]} role="cell" className={`osm-wert osm-wert-${w}${i === letzte ? " osm-vergleich-wir" : ""}`}>
                  <Symbol aria-hidden="true" />
                  <span className="sr-only">{t.bewertung[w]}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <ul className="osm-vergleich-legende" aria-hidden="true">
        {(["ja", "teil", "nein"] as const).map((w) => {
          const Symbol = BEWERTUNG_SYMBOL[w];
          return <li key={w} className={`osm-wert-${w}`}><Symbol />{t.bewertung[w]}</li>;
        })}
      </ul>
      <div className="osm-karte osm-hebel">
        <h3>{t.fazitTitel}</h3>
        <p>{t.fazitText}</p>
        <p className="osm-hebel-ehrlich">{t.ehrlich}</p>
      </div>
      <p className="osm-fussnote">{t.fuss}</p>
    </Abschnitt>
  );
}

const BAUSTEIN_SYMBOLE = [KeyRound, PiggyBank, Landmark, Building2];

function Prinzip() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).prinzip;
  const leiste = useBewegung<HTMLDivElement>();
  return (
    <Abschnitt ton="gruen" id="prinzip">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-anteile" ref={leiste}>
        <p className="osm-anteile-frage">{t.frage}</p>
        <div className="osm-anteile-leiste" role="img" aria-label={t.anteile.map((a) => `${a.label} ${a.prozent} %`).join(", ")}>
          {t.anteile.map((a, i) => (
            <span key={a.teil} className={`osm-anteil osm-anteil-${a.teil}`} style={{ flexGrow: a.prozent, "--nr": i } as CSSProperties}>
              <b>{a.prozent} %</b>
            </span>
          ))}
        </div>
        <ul className="osm-anteile-legende">
          {t.anteile.map((a) => (
            <li key={a.teil}>
              <i className={`osm-anteil-${a.teil}`} aria-hidden="true" />
              <span><strong>{a.label}</strong> {a.text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="osm-vier">
        {t.bausteine.map((b, i) => {
          const Symbol = BAUSTEIN_SYMBOLE[i];
          return (
            <div key={b.titel} className="osm-karte osm-baustein">
              <Symbol aria-hidden="true" />
              <h3>{b.titel}</h3>
              <p>{b.text}</p>
            </div>
          );
        })}
      </div>
      <details className="osm-kenner">
        <summary>{t.kennerTitel} <ChevronDown aria-hidden="true" /></summary>
        <p>{t.kennerText}</p>
      </details>
      <p className="osm-fussnote">{t.fuss}</p>
    </Abschnitt>
  );
}

/** Eine echte Wohnung aus dem Angebot, Zeile für Zeile wie im Exposé. */
function Musterrechnung() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).muster;
  const rechnung = useBewegung<HTMLDivElement>();
  return (
    <Abschnitt ton="hell" id="musterrechnung">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-muster">
        <figure className="osm-karte osm-muster-objekt">
          <img src={`${BILD}/barfuss-fassade.jpg`} alt={t.bildAlt} loading="lazy" />
          <figcaption>
            <b>{t.objekt}</b>
            <span>{t.ort}</span>
            <ul>{t.daten.map((d) => <li key={d}>{d}</li>)}</ul>
          </figcaption>
        </figure>
        <div className="osm-karte osm-muster-rechnung" ref={rechnung}>
          <h3>{t.rechnungTitel}</h3>
          <dl>
            {t.zeilen.map((z, nr) => (
              <div key={z.label} className={`osm-muster-zeile osm-muster-${z.art}`} style={{ "--nr": nr } as CSSProperties}>
                <dt>{z.label}</dt>
                <dd>{z.wert}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
      <div className="osm-drei osm-muster-zahlen">
        {t.kennzahlen.map((k) => (
          <div key={k.text} className="osm-karte">
            <b className="osm-grosszahl">{k.wert}</b>
            <p>{k.text}</p>
          </div>
        ))}
      </div>
      <p className="osm-schluss">{t.satz}</p>
      <p className="osm-muster-ehrlich">{t.ehrlich}</p>
      <p className="osm-fussnote">{t.fuss}</p>
    </Abschnitt>
  );
}

function Kenner({ titel, punkte }: { titel: string; punkte: ReadonlyArray<string> }) {
  return (
    <details className="osm-kenner">
      <summary>{titel} <ChevronDown aria-hidden="true" /></summary>
      <ul>{punkte.map((p) => <li key={p}>{p}</li>)}</ul>
    </details>
  );
}

function Konzepte({ onOpenFunnel }: { onOpenFunnel: () => void }) {
  const alles = useSeitenTexte(MIKROSEITE_OS_TEXTE);
  const t = alles.konzepte;
  const z = alles.zwischenruf;
  const steuer = useBewegung<HTMLDivElement>();
  const rente = useBewegung<HTMLDivElement>();
  return (
    <Abschnitt ton="hell" id="konzepte">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-zwei osm-konzepte">
        <article className="osm-karte osm-konzept" ref={steuer}>
          <span className="osm-marke">{`${t.steuer.nummer} · ${t.steuer.marke}`}</span>
          <h3 className="bos-serif">{t.steuer.titel}</h3>
          <p>{t.steuer.text}</p>
          <div className="osm-beispiel">
            <p className="osm-beispiel-kopf">{t.steuer.beispielKopf}</p>
            {t.steuer.beispiel.map((b, i) => (
              <Balken key={b.text} label={b.text} wert={b.wert} anteil={b.anteil} zusatz={b.plus || undefined} ton={i === 0 ? "warnung" : "gut"} nr={i} />
            ))}
          </div>
          <p className="osm-passt">{t.steuer.passt}</p>
          <Kenner titel={t.kennerKnopf} punkte={t.steuer.kenner} />
          <p className="osm-fussnote">{t.steuer.fuss}</p>
        </article>
        <article className="osm-karte osm-konzept" ref={rente}>
          <span className="osm-marke">{`${t.alter.nummer} · ${t.alter.marke}`}</span>
          <h3 className="bos-serif">{t.alter.titel}</h3>
          <p>{t.alter.text}</p>
          <ol className="osm-zeitachse">
            {t.alter.zeitachse.map((s, i) => (
              <li key={s.titel} style={{ "--nr": i } as CSSProperties}>
                <b>{s.titel}</b>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
          {/* Die Gabel: aus dem Ruhestand gehen zwei Wege ab. */}
          <svg className="osm-gabel" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path className="zl" pathLength={1} vectorEffect="non-scaling-stroke" d="M100 0v12c0 8-50 6-50 16v12" />
            <path className="zl" pathLength={1} vectorEffect="non-scaling-stroke" d="M100 0v12c0 8 50 6 50 16v12" />
          </svg>
          <div className="osm-wege">
            {t.alter.wege.map((w) => (
              <div key={w.marke} className="osm-weg">
                <span>{w.marke}</span>
                <b>{w.titel}</b>
                <p>{w.text}</p>
              </div>
            ))}
          </div>
          <p className="osm-passt">{t.alter.passt}</p>
          <Kenner titel={t.kennerKnopf} punkte={t.alter.kenner} />
        </article>
      </div>
      <p className="osm-schluss">{t.beide}</p>
      <div className="osm-zwischenruf">
        <div>
          <h3 className="bos-serif">{z.titel}</h3>
          <p>{z.text}</p>
        </div>
        <button type="button" className="osm-knopf btn-brand" onClick={onOpenFunnel}>
          {z.knopf} <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </Abschnitt>
  );
}

function WerWirSind() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).werWir;
  const gruppe = useBewegung<HTMLDivElement>();
  return (
    <Abschnitt ton="hell" id="wer-wir-sind">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-gruppe" ref={gruppe}>
        <div className="osm-dach">
          <b>{t.dach}</b>
          <span>{t.dachText}</span>
        </div>
        <svg className="osm-gruppe-linien" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
          <path className="zl" pathLength={1} vectorEffect="non-scaling-stroke" d="M150 0v20M50 20h200M50 20v20M150 20v20M250 20v20" />
        </svg>
        <div className="osm-drei osm-marken">
          {t.marken.map((m, i) => (
            <div key={m.name} className="osm-karte osm-marke-karte" style={{ "--nr": i } as CSSProperties}>
              <span className="osm-marke">{m.rolle}</span>
              <h3>{m.name}</h3>
              <p>{m.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="osm-vier osm-vorteile">
        {t.vorteile.map((v) => (
          <div key={v.titel} className="osm-vorteil">
            <Check aria-hidden="true" />
            <div>
              <b>{v.titel}</b>
              <p>{v.text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="osm-fussnote">{t.fuss}</p>
    </Abschnitt>
  );
}

function Fragen() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).faq;
  return (
    <Abschnitt ton="hell" id="fragen">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-fragen">
        {t.fragen.map((f) => (
          <details key={f.frage} className="osm-frage">
            <summary>{f.frage} <ChevronDown aria-hidden="true" /></summary>
            <p>{f.antwort}</p>
          </details>
        ))}
      </div>
    </Abschnitt>
  );
}

function Prozess() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).prozess;
  return (
    <Abschnitt ton="dunkel" id="ablauf">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      {/* Eine Linie in der Mitte (am Handy links), die sich Schritt für Schritt füllt. */}
      <ol className="osm-schritte">
        {t.schritte.map((s, i) => <Schritt key={s.titel} nr={i} schritt={s} />)}
      </ol>
    </Abschnitt>
  );
}

function Schritt({ nr, schritt }: { nr: number; schritt: { titel: string; text: string; ergebnis: string } }) {
  const ref = useBewegung<HTMLLIElement>();
  return (
    <li ref={ref}>
      <span className="osm-schritt-nr" aria-hidden="true">{nr + 1}</span>
      <div className="osm-schritt-karte">
        <ProzessGrafik motiv={PROZESS_MOTIVE[nr]} />
        <div>
          <b>{schritt.titel}</b>
          <span>{schritt.text}</span>
          <small><Check aria-hidden="true" /> {schritt.ergebnis}</small>
        </div>
      </div>
    </li>
  );
}

function Kontakt({ berater, onOpenFunnel }: Props) {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).kontakt;
  const sprache = useSeitenSprache();
  const name = berater?.name || t.ersatzName;
  return (
    <Abschnitt ton="gruen" id="beratung">
      <div className="osm-kontakt">
        <div>
          <p className="bos-kicker osm-kicker">{t.kicker}</p>
          <h2 className="bos-serif">{t.titel}</h2>
          <p className="osm-intro">{t.text}</p>
          <ul className="osm-haken-liste">
            {t.punkte.map((p) => <li key={p}><Check aria-hidden="true" /> {p}</li>)}
          </ul>
          <div className="osm-knoepfe">
            {berater?.buchungslink && (
              <a className="osm-knopf btn-brand" href={berater.buchungslink} target="_blank" rel="noopener noreferrer">
                <CalendarDays aria-hidden="true" /> {t.terminBuchen}
              </a>
            )}
            <button type="button" className={`osm-knopf ${berater?.buchungslink ? "osm-rand" : "btn-brand"}`} onClick={onOpenFunnel}>
              {t.anfrage} <ArrowRight aria-hidden="true" />
            </button>
          </div>
          <p className="osm-zusage">{t.zusage}</p>
        </div>
        <div className="osm-partner">
          {berater && <Portraet berater={berater} className="osm-partner-bild" />}
          <div className="osm-partner-text">
            <strong className="bos-serif">{name}</strong>
            <span>{positionFuerAnzeige(berater?.position, sprache)}</span>
            {berater?.telefon && (
              <a href={`tel:${berater.telefon.replace(/\s+/g, "")}`}><Phone aria-hidden="true" /> {berater.telefon}</a>
            )}
            {berater?.email && (
              <a href={`mailto:${berater.email}`}><Mail aria-hidden="true" /> {berater.email}</a>
            )}
          </div>
        </div>
      </div>
    </Abschnitt>
  );
}

function Fuss() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).fuss;
  const sprache = useSeitenSprache();
  return (
    <footer className="osm-fuss">
      <div className="osm-wrap">
        <div className="osm-fuss-oben">
          <div>
            <img src={logoHell} alt="OS Real Estate GmbH" width="168" height="35" />
            <p>{t.marke}</p>
          </div>
          <nav aria-label={t.rechtliches}>
            <a href={mitSeitenSprache("/impressum", sprache)}>{t.impressum}</a>
            <a href={mitSeitenSprache("/datenschutz", sprache)}>{t.datenschutz}</a>
            <CookieEinstellungenLink sprache={sprache} className="osm-fuss-link" />
          </nav>
        </div>
        <PartnerPixelHinweis sprache={sprache} className="osm-fuss-pixel" />
        <p className="osm-fuss-rechte">{t.rechte(new Date().getFullYear())}</p>
      </div>
    </footer>
  );
}
