import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Mail, Phone } from "lucide-react";
import InvestorBenefitsSection from "@/components/landing/InvestorBenefitsSection";
import AppleBentoSection from "@/components/landing/apple/AppleBentoSection";
import logoHell from "@/assets/os-real-estate-logo-quer-dunkel.png";
import { SeitenSprachUmschalter, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { CookieEinstellungenLink } from "@/components/cookie/CookieEinstellungenLink";
import { PartnerPixelHinweis } from "@/components/cookie/PartnerPixelHinweis";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { MIKROSEITE_OS_TEXTE, type KonzeptOs } from "./mikroseiteOsTexte";
import { positionFuerAnzeige } from "./mikroseiteAbschlussTexte";
import type { BeraterInfo } from "./FloatingBeraterBadge";
// Schriften und Farbwerte der OS-CI (Waldgrün, Schwarz, Papier, Gold), dieselben wie die Beratungspräsentation.
import "@/styles/beratung-os.css";
import "./mikroseiteOs.css";

/*
 * Die persönliche Partner-Landingpage, umgebaut am 16.10.2026 auf
 * OS Real Estate. Aufbau wie die Handbuch-Seite, mit Wechsel zwischen dunklen
 * und hellen Abschnitten. Reihenfolge, die aufeinander aufbaut:
 * Hero, Ausgangslage, zwei Konzepte, drei Objekte, Musterrechnung,
 * Investorenprofile, Leistungen, Warum OS Real Estate, Referenzen, Prozess,
 * Kontakt. Der frühere Steuer- und Eignungscheck ist entfallen.
 *
 * Die persönlichen Daten (Name, Foto, Telefon, E-Mail, Buchungslink) kommen
 * unverändert aus `BeraterMicroseite.tsx` (öffentlich über `get-vp-microsite`).
 */

interface Props { berater: BeraterInfo | null; onOpenFunnel: () => void; }

const BILD = "/images/mikroseite";

/** Bilder je Objekt, in der Reihenfolge von `objekte.liste`. */
const OBJEKTE: Array<{ konzept: KonzeptOs; bilder: string[] }> = [
  { konzept: "steuer", bilder: ["barfuss-fassade", "barfuss-luftbild", "barfuss-altbau-innen", "barfuss-fassade-hell", "barfuss-innenhof", "barfuss-zimmer", "barfuss-wohnungstuer"] },
  { konzept: "alter", bilder: ["hauff-fassade", "hauff-garten", "hauff-luftbild", "hauff-aufzug", "hauff-strassenseite", "hauff-wohnraum", "hauff-zimmer"] },
  { konzept: "alter", bilder: ["zossen-haus-garten", "zossen-luisenstrasse", "zossen-strasse", "zossen-rasen", "zossen-treppe", "zossen-kueche", "zossen-zimmer"] },
];

/** Bilder der Referenzen, in der Reihenfolge von `referenzen.bilder`. */
const REFERENZ_BILDER = ["barfuss-luftbild", "hauff-garten", "zossen-strasse", "barfuss-altbau-innen", "hauff-luftbild", "zossen-luisenstrasse"];

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
      <Hero berater={berater} onOpenFunnel={onOpenFunnel} />
      <Problem />
      <Konzepte />
      <Objekte />
      <Musterrechnung />
      {/* Behalten aus der bisherigen Seite, nur Wording an OS angepasst. */}
      <div className="osm-alt osm-hell"><InvestorBenefitsSection /></div>
      <div className="osm-alt osm-dunkel"><AppleBentoSection /></div>
      <Warum />
      <Referenzen />
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
            <button type="button" className="osm-knopf osm-gold" onClick={onOpenFunnel}>
              {t.knopfTermin} <ArrowRight aria-hidden="true" />
            </button>
            <a className="osm-knopf osm-rand" href="#objekte">{t.knopfObjekte}</a>
          </div>
        </div>
        {berater && <HeroAnsprechpartner berater={berater} onOpenFunnel={onOpenFunnel} />}
      </div>
      <p className="osm-bildort">{t.bildOrt}</p>
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
        <a className="osm-knopf osm-gold osm-portraet-knopf" href={berater.buchungslink} target="_blank" rel="noopener noreferrer">{inhalt}</a>
      ) : (
        <button type="button" className="osm-knopf osm-gold osm-portraet-knopf" onClick={onOpenFunnel}>{inhalt}</button>
      )}
    </aside>
  );
}

function Problem() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).problem;
  return (
    <Abschnitt ton="hell">
      <Kopf kicker={t.kicker} titel={t.titel} />
      <div className="osm-drei">
        {t.punkte.map((p, i) => (
          <div key={p.titel} className="osm-karte">
            <span className="osm-nummer">0{i + 1}</span>
            <h3>{p.titel}</h3>
            <p>{p.text}</p>
          </div>
        ))}
      </div>
      <p className="osm-schluss">{t.schluss}</p>
    </Abschnitt>
  );
}

function Konzepte() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).konzepte;
  return (
    <Abschnitt ton="gruen">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-zwei">
        {(["steuer", "alter"] as const).map((k, i) => {
          const karte = t.karten[k];
          return (
            <div key={k} className="osm-karte osm-konzept">
              <span className="osm-marke">{`${t.nummer(i + 1)} · ${karte.marke}`}</span>
              <h3 className="bos-serif">{karte.titel}</h3>
              <p>{karte.text}</p>
              <p className="osm-konzept-objekte">{karte.objekte}</p>
            </div>
          );
        })}
      </div>
    </Abschnitt>
  );
}

/**
 * Bilder eines Objekts im Wechsel. Läuft von selbst weiter, hält beim
 * Überfahren und Fokussieren an und bei „Bewegung reduzieren“ gar nicht erst
 * los. Pfeile und Punkte gehen immer.
 */
function Diashow({ bilder, label }: { bilder: Array<{ src: string; alt: string }>; label: string }) {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).objekte;
  const [aktuell, setAktuell] = useState(0);
  const [pause, setPause] = useState(false);
  const anzahl = bilder.length;
  useEffect(() => {
    const ruhig = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (pause || ruhig || anzahl < 2) return;
    const takt = window.setInterval(() => setAktuell((x) => (x + 1) % anzahl), 5000);
    return () => window.clearInterval(takt);
  }, [pause, anzahl]);
  const gehe = (schritt: number) => setAktuell((x) => (x + schritt + anzahl) % anzahl);
  return (
    <div
      className="osm-diashow"
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
      onFocus={() => setPause(true)}
      onBlur={() => setPause(false)}
    >
      {bilder.map((b, i) => (
        <img key={b.src} src={b.src} alt={b.alt} aria-hidden={i !== aktuell} className={i === aktuell ? "an" : ""} loading="lazy" />
      ))}
      <button type="button" className="osm-pfeil links" aria-label={t.vorher} onClick={() => gehe(-1)}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" className="osm-pfeil rechts" aria-label={t.weiter} onClick={() => gehe(1)}><ChevronRight aria-hidden="true" /></button>
      <div className="osm-punkte">
        {bilder.map((b, i) => (
          <button key={b.src} type="button" aria-label={t.bildNummer(i + 1, anzahl)} aria-current={i === aktuell} onClick={() => setAktuell(i)}>
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Objekte() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).objekte;
  return (
    <Abschnitt ton="hell" id="objekte">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-objekte">
        {t.liste.map((o, i) => {
          const { konzept, bilder } = OBJEKTE[i];
          return (
            <article key={o.titel} className="osm-objekt">
              <Diashow label={t.diashow(o.titel)} bilder={bilder.map((b, j) => ({ src: `${BILD}/${b}.jpg`, alt: o.bilder[j] }))} />
              <div className="osm-objekt-text">
                <span className={`osm-marke osm-marke-${konzept}`}>{t.marke[konzept]}</span>
                <p className="osm-ort">{o.ort}</p>
                <h3 className="bos-serif">{o.titel}</h3>
                <ul>
                  {o.daten.map((d) => <li key={d}>{d}</li>)}
                </ul>
                <p className="osm-preis">{o.preis}</p>
              </div>
            </article>
          );
        })}
      </div>
      <p className="osm-fussnote">{t.hinweis}</p>
    </Abschnitt>
  );
}

function Musterrechnung() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).muster;
  return (
    <Abschnitt ton="dunkel" id="musterrechnung">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-rechnung-raster">
        <table className="osm-rechnung">
          <thead>
            <tr><th scope="col" colSpan={2}>{t.spalte}</th></tr>
          </thead>
          <tbody>
            {t.zeilen.map((z) => (
              <tr key={z.text} className={z.ton}>
                <td>{z.text}</td>
                <td>{z.betrag}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="osm-kennzahlen">
          {t.karten.map((k) => (
            <div key={k.wert} className="osm-kennzahl">
              <b className="bos-serif">{k.wert}</b>
              <span>{k.text}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="osm-fussnote">{t.fuss}</p>
    </Abschnitt>
  );
}

function Warum() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).warum;
  return (
    <Abschnitt ton="hell">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-drei osm-punkte-liste">
        {t.punkte.map((p) => (
          <div key={p.titel} className="osm-karte">
            <h3>{p.titel}</h3>
            <p>{p.text}</p>
          </div>
        ))}
        <div className="osm-karte osm-gruppe">
          <h3>{t.gruppeTitel}</h3>
          <p>{t.gruppeText}</p>
        </div>
      </div>
    </Abschnitt>
  );
}

function Referenzen() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).referenzen;
  return (
    <Abschnitt ton="dunkel">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      <div className="osm-galerie">
        {t.bilder.map((b, i) => (
          <figure key={REFERENZ_BILDER[i]}>
            <img src={`${BILD}/${REFERENZ_BILDER[i]}.jpg`} alt={b.alt} loading="lazy" />
            <figcaption>{b.ort}</figcaption>
          </figure>
        ))}
      </div>
    </Abschnitt>
  );
}

function Prozess() {
  const t = useSeitenTexte(MIKROSEITE_OS_TEXTE).prozess;
  return (
    <Abschnitt ton="hell" id="ablauf">
      <Kopf kicker={t.kicker} titel={t.titel} intro={t.intro} />
      {/* Die Linie zwischen den Kästchen zeichnet mikroseiteOs.css, als Schlange in zwei Reihen. */}
      <ol className="osm-schritte">
        {t.schritte.map((s, i) => (
          <li key={s.titel}>
            <span className="osm-schritt-nr">{i + 1}</span>
            <div>
              <b>{s.titel}</b>
              <span>{s.text}</span>
            </div>
          </li>
        ))}
      </ol>
    </Abschnitt>
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
          <div className="osm-knoepfe">
            {berater?.buchungslink && (
              <a className="osm-knopf osm-gold" href={berater.buchungslink} target="_blank" rel="noopener noreferrer">
                <CalendarDays aria-hidden="true" /> {t.terminBuchen}
              </a>
            )}
            <button type="button" className={`osm-knopf ${berater?.buchungslink ? "osm-rand" : "osm-gold"}`} onClick={onOpenFunnel}>
              {t.anfrage} <ArrowRight aria-hidden="true" />
            </button>
          </div>
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
