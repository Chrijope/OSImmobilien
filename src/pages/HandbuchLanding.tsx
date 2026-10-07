/**
 * Die öffentliche Handbuch-Seite: die Landingpage.
 *
 * /handbuch           die Seite des Hauses, etwa für Anzeigen. Leads landen
 *                     ohne Partner in der Lead-Verwaltung.
 * /handbuch/:slug     die Seite eines Partners, mit demselben Kürzel wie die
 *                     Berater-Mikroseite. Leads gehören diesem Partner, das
 *                     entscheidet der Server allein aus dem Kürzel.
 *
 * Aufbau nach der Strategie vom 26.09.2026, Teil A, Kapitel 4.1, überarbeitet
 * am selben Tag nach der Westmont-Analyse: Der Konfigurator hat eine eigene
 * Seite (`HandbuchKonfigurator`), der Einstieg zeigt ein Beispielergebnis,
 * das Problem kommt vor dem Produkt, drei Ablaufdarstellungen sind eine
 * Zeitleiste. Zahlen nur aus dem Rechenkern (`lib/handbuch/modell.ts`), immer
 * als Beispiel oder Modell beschriftet. Kennzahlen und Kundenstimmen nur so,
 * wie sie auf more.immo veröffentlicht sind.
 *
 * Zweisprachig seit dem 26.09.2026: Texte in `lib/handbuch/seitenTexte.ts`,
 * Zahlen und Diagramme in der Sprache der Seite (`inSprache`). Die
 * Kundenstimmen bleiben wörtlich deutsch, mit Vermerk.
 */
import "@/styles/handbuchSeite.css";
import "@/styles/handbuchSeiteLiquid.css";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Clock,
  Euro,
  FileText,
  Home,
  KeyRound,
  Landmark,
  Lock,
  Mail,
  PenLine,
  Percent,
  Phone,
  Plus,
  Quote,
  ShieldCheck,
  Star,
  User,
  Users,
  X,
  Zap,
} from "lucide-react";
import heldenBild from "@/assets/login-hero-building.webp";
import ObjektClip from "@/components/landing/ObjektClip";
import { MIKROSEITE_TEXTE } from "@/components/landing/mikroseiteTexte";
import { SeitenSpracheProvider, useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { HandbuchHeft } from "@/components/handbuch/HandbuchHeft";
import { HandbuchFuss, HandbuchKopf, useBeraterAusKuerzel, type HandbuchBerater } from "@/components/handbuch/Rahmen";
import christianKurzFoto from "@/assets/handbuch/christian-kurz.webp";
import { anteilig, Diagramm, Hochzaehlen, useEinblenden, useHandbuchThema, useSeitenTitel } from "@/components/handbuch/teile";
import { useMetaPixelMitEinwilligung } from "@/hooks/useMetaPixelMitEinwilligung";
import {
  annahmenText,
  BASIS_KAUFPREIS,
  erstesJahr,
  handbuchAuswertung,
  rechneModell,
  wartenWerte,
  zveZuBrutto,
  grenzsatzProzent,
} from "@/lib/handbuch/modell";
import { diagrammHaushalt, diagrammSteuerNachEinkommen, diagrammVermoegen, diagrammWarten, kapitelListe } from "@/lib/handbuch/inhalt";
import { euroIn, inSprache, rahmenSpanne } from "@/lib/handbuch/diagramme";
import { rahmenTextIn } from "@/lib/handbuch/fragenSprache";
import { zaehleHandbuch } from "@/lib/handbuch/ereignisse";
import { konfiguratorPfad } from "@/lib/handbuch/wege";
import { HANDBUCH_SEITEN_TEXTE } from "@/lib/handbuch/seitenTexte";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import {
  FIRMEN_ANSPRECHPARTNER,
  FIRMEN_ANSPRECHPARTNER_EN,
  FIRMEN_KENNZAHLEN,
  FIRMEN_KENNZAHLEN_EN,
  KUNDENSTIMMEN,
  MOREIMMO_WARUM,
  MOREIMMO_WARUM_EN,
  MOREIMMO_WERTE,
  MOREIMMO_WERTE_EN,
} from "@/lib/handbuch/firma";
import type { HandbuchAntworten } from "../../supabase/functions/_shared/handbuch-funnel.ts";
import type { KonfiguratorErgebnis } from "@/components/handbuch/Konfigurator";

export interface HandbuchErgebnisZustand extends KonfiguratorErgebnis {
  beraterSlug: string | null;
}

/** Das Beispielprofil im Einstieg. Rechnet über denselben Kern wie das Handbuch. */
export const BEISPIEL_ANTWORTEN: HandbuchAntworten = {
  ziel: "vermoegen",
  beruf: "angestellt",
  brutto: "80_120",
  ueberschuss: "1000_1500",
  eigenkapital: "30_60",
  start: "drei_monate",
};

/** Die drei Modelle mit den Videos der Berater-Mikroseite (gleiche Dateien in /public/video). Texte in `seitenTexte.ts`. */
const MODELLE = [
  { clip: "typ-bestand", welt: 1, Icon: Home },
  { clip: "typ-neubau", welt: 0, Icon: Zap },
  { clip: "typ-wg", welt: 2, Icon: Users },
];

const ZEITLEISTE_SYMBOLE = [FileText, PenLine, User, KeyRound, Landmark, Mail, Landmark, Home];

/** Was beim Scrollen einblendet (`useEinblenden`): Köpfe, Karten, Reihen. */
const EINBLENDEN = [
  ".hb-augenbraue", ".hb-h2", ".hb-lead", ".hb-vergleich > div", ".hb-vier > *", ".hb-stimme", ".hb-zp",
  ".hb-kapitel-auswahl > li", ".hb-punkte > li", ".hb-diagramm", ".hb-bankband", ".hb-zwischen", ".hb-grosse-zahl",
  ".hb-cta", ".hb-frage", ".hb-hinweise", ".hb-annahmen", ".hb-berater", ".hb-zwei.gleich > .hb-karte", ".hb-ergebnis > div",
  ".hb-heft",
]
  .map((ziel) => `.hb-abschnitt ${ziel}`)
  .join(", ");

export default function HandbuchLanding() {
  return (
    <SeitenSpracheProvider>
      <Landing />
    </SeitenSpracheProvider>
  );
}

function Landing() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const { search } = useLocation();
  const thema = useHandbuchThema();
  const sprache = useSeitenSprache();
  const t = useSeitenTexte(HANDBUCH_SEITEN_TEXTE);
  const L = t.landing;
  const stand = useBeraterAusKuerzel(slug);
  const berater = stand.status === "ok" ? stand.berater : null;
  const beraterId = berater?.userId || null;
  // Das Kürzel aus der Adresse, auch solange der Partner noch lädt. Die
  // Zuordnung entscheidet ohnehin der Server. `mitSeitenSprache` hängt
  // `lang=en` an, falls die Adresse es noch nicht trägt.
  const wizard = mitSeitenSprache(konfiguratorPfad(berater?.slug ?? slug ?? null, search), sprache);
  const e = (n: number) => euroIn(n, sprache);

  useSeitenTitel(L.titel(berater?.name ?? ""), L.beschreibung);
  useMetaPixelMitEinwilligung(berater);
  useEinblenden(EINBLENDEN);

  useEffect(() => {
    if (stand.status === "laden") return;
    void zaehleHandbuch("hb_seite_geoeffnet", beraterId);
  }, [stand.status, beraterId]);

  const zve = useMemo(() => zveZuBrutto("80_120"), []);
  const muster = useMemo(() => {
    const m = rechneModell(BASIS_KAUFPREIS, { zve });
    return { e: m, j1: erstesJahr(m) };
  }, [zve]);
  const beispiel = useMemo(() => handbuchAuswertung(BEISPIEL_ANTWORTEN), []);
  const warten = useMemo(() => wartenWerte(zve, BASIS_KAUFPREIS), [zve]);
  const gs = grenzsatzProzent(zve);
  const d = useMemo(
    () =>
      inSprache(sprache, () => ({
        steuer: diagrammSteuerNachEinkommen(BASIS_KAUFPREIS, 2),
        steuerSchmal: diagrammSteuerNachEinkommen(BASIS_KAUFPREIS, 2, true),
        haushalt: diagrammHaushalt(1080, 300),
        haushaltSchmal: diagrammHaushalt(560, 340),
        vermoegen: diagrammVermoegen(BASIS_KAUFPREIS, zve, 640, 330),
        vermoegenSchmal: diagrammVermoegen(BASIS_KAUFPREIS, zve, 400, 320),
        warten: diagrammWarten(BASIS_KAUFPREIS, zve, 640),
        wartenSchmal: diagrammWarten(BASIS_KAUFPREIS, zve, 420),
        rahmenVorschau: rahmenSpanne(beispiel.rahmen, 560, 110),
        // Schmaler gezeichnet, sonst schrumpft die Beschriftung am Handy auf 6 px.
        rahmenVorschauSchmal: rahmenSpanne(beispiel.rahmen, 360, 110),
        annahmen: annahmenText(BASIS_KAUFPREIS),
      })),
    [zve, beispiel, sprache],
  );
  const kapitel = useMemo(() => kapitelListe(sprache), [sprache]);

  const zumWizard = () => navigate(wizard);
  const wartenDifferenz = warten[0].vermoegen - warten[2].vermoegen;
  const welten = MIKROSEITE_TEXTE[sprache].investmentwelten.welten;

  return (
    <div className="hb hb-mit-mobil-cta" data-thema={thema}>
      <HandbuchKopf thema={thema} berater={berater} aktion={{ text: t.kopf.aktion, onClick: zumWizard }} />

      {/* 1 Einstieg: das Versprechen und ein Beispielergebnis */}
      <section className="hb-umschlag" aria-labelledby="hb-titel">
        <div className="hb-wrap">
          <div>
            <span className="hb-augenbraue">{L.augenbraue}</span>
            <h1 id="hb-titel">
              {L.h1a}
              <br />
              <span className="hb-verlauf">{L.h1b}</span>
            </h1>
            <div className="hb-akzentlinie" aria-hidden="true" />
            <p className="hb-lead">{L.lead}</p>
            <ul className="hb-nutzen">
              {L.nutzen.map((n) => (
                <li key={n}>
                  <Check aria-hidden="true" />
                  {n}
                </li>
              ))}
            </ul>
            <div className="hb-knoepfe">
              <Link className="hb-knopf hb-orange" to={wizard}>
                {L.knopfRahmen} <ArrowRight aria-hidden="true" />
              </Link>
              <a className="hb-knopf hb-zweit" href="#handbuch">
                {L.knopfWasSteht}
              </a>
            </div>
            <Vertrauen texte={t.vertrauen} />
          </div>
          <figure className="hb-held-bild">
            {/* Vorhandenes Motiv aus dem Projekt (Anmeldeseite), keine Personen. */}
            <img src={heldenBild} alt={L.heldAlt} loading="eager" fetchPriority="high" />
            <figcaption className="hb-beispiel hb-karte">
              <div className="kopf">
                <b>{L.beispielKopf}</b>
                <span>{L.beispiel}</span>
              </div>
              <div className="spanne">
                <Hochzaehlen auchSichtbar text={(a) => rahmenTextIn({ von: anteilig(beispiel.rahmen.von, a), bis: anteilig(beispiel.rahmen.bis, a) }, sprache)} />
              </div>
              <div className="hb-klein" style={{ margin: 0 }}>
                {L.rahmenModell}
              </div>
              <Diagramm className="hb-nur-desktop" zeichnung={d.rahmenVorschau} />
              <Diagramm className="hb-nur-handy" zeichnung={d.rahmenVorschauSchmal} />
              <div className="zeile">
                <span>{L.eigenaufwandJahr1}</span>
                <b>{e(-beispiel.jahr1.nachSteuer)}</b>
              </div>
              <div className="fuss">{L.beispielFuss(e(beispiel.kaufpreis))}</div>
            </figcaption>
          </figure>
        </div>
      </section>

      {/* 2 Der richtige Weg: erst das Problem */}
      <section className="hb-abschnitt hb-zweiter">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{L.weg.augenbraue}</span>
          <h2 className="hb-h2">{L.weg.h2}</h2>
          <p className="hb-lead">{L.weg.lead}</p>
          <div className="hb-vergleich">
            <div className="vorher">
              <div className="kl">{L.weg.umwegTitel}</div>
              <ol>
                {L.weg.umweg.map((p) => (
                  <li key={p}>
                    <X aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ol>
              <p className="schluss">{L.weg.umwegSchluss}</p>
            </div>
            <div className="nachher">
              <div className="kl">{L.weg.unserTitel}</div>
              <ol>
                {L.weg.unser.map((p) => (
                  <li key={p}>
                    <Check aria-hidden="true" />
                    {p}
                  </li>
                ))}
              </ol>
              <p className="schluss">{L.weg.unserSchluss}</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3 Was im Handbuch steht */}
      <section className="hb-abschnitt hb-vorschau" id="handbuch">
        <div className="hb-wrap">
          <HandbuchHeft kapitelAnzahl={kapitel.length} />
          <div>
            <span className="hb-augenbraue">{L.vorschau.augenbraue}</span>
            <h2 className="hb-h2">{L.vorschau.h2}</h2>
            <p className="hb-lead" style={{ fontSize: 18 }}>
              {L.vorschau.lead}
            </p>
            <ul className="hb-kapitel-auswahl">
              {L.vorschau.kapitelAuswahl.map((k) => (
                <li key={k.nr}>
                  <span className="n">{k.nr}</span>
                  <div>
                    <b>{k.titel}</b>
                    <span className="x">{k.nutzen}</span>
                  </div>
                </li>
              ))}
            </ul>
            <details className="hb-aufklapper">
              <summary>
                {L.vorschau.alleKapitel(kapitel.length)} <ChevronDown aria-hidden="true" />
              </summary>
              <ol className="hb-kapitel">
                {kapitel.map((k) => (
                  <li key={k.nr}>
                    <b>{k.nr}</b>
                    {k.titel}
                  </li>
                ))}
              </ol>
            </details>
            <Link className="hb-knopf hb-orange" to={wizard}>
              {L.vorschau.knopf} <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        </div>
      </section>

      {/* 4 Wer dahinter steht */}
      <WerDahinterSteht berater={berater} />

      {/* 5 Steuerwirkung */}
      <section className="hb-abschnitt">
        <div className="hb-wrap hb-zwei">
          <div>
            <span className="hb-augenbraue">{L.steuer.augenbraue}</span>
            <h2 className="hb-h2">{L.steuer.h2}</h2>
            <p className="hb-lead" style={{ fontSize: 18 }}>
              {L.steuer.lead}
            </p>
            <ul className="hb-punkte">
              {L.steuer.punkte.map((p, i) => {
                const Icon = [Home, Percent, FileText][i];
                return (
                  <li key={p.t}>
                    <span className="hb-rund">
                      <Icon aria-hidden="true" />
                    </span>
                    <div>
                      <b>{p.t}</b>
                      <span>{p.x}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <figure className="hb-diagramm hb-karte" style={{ margin: 0 }}>
            <div className="titel">{L.steuer.diagrammTitel}</div>
            <div className="unter">{L.steuer.diagrammUnter(e(BASIS_KAUFPREIS))}</div>
            <Diagramm className="hb-nur-desktop" zeichnung={d.steuer} />
            <Diagramm className="hb-nur-handy" zeichnung={d.steuerSchmal} />
            <figcaption className="hb-fussnote">{L.steuer.fussnote}</figcaption>
          </figure>
        </div>
      </section>

      {/* 6 Wie eine Bank entscheidet */}
      <section className="hb-abschnitt hb-zweiter">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{L.bank.augenbraue}</span>
          <h2 className="hb-h2">{L.bank.h2}</h2>
          <p className="hb-lead">{L.bank.lead}</p>
          <div className="hb-vier">
            {L.bank.vier.map(({ t: titel, x }, i) => {
              const Icon = [User, Euro, KeyRound, Home][i];
              return (
                <div className="hb-kachel-karte hb-karte" key={titel}>
                  <span className="hb-rund">
                    <Icon aria-hidden="true" />
                  </span>
                  <h3>{titel}</h3>
                  <p>{x}</p>
                </div>
              );
            })}
          </div>
          <figure className="hb-diagramm hb-karte" style={{ margin: 0 }}>
            <div className="titel">{L.bank.diagrammTitel}</div>
            <div className="unter">{L.bank.diagrammUnter}</div>
            <Diagramm className="hb-nur-desktop" zeichnung={d.haushalt} />
            <Diagramm className="hb-nur-handy" zeichnung={d.haushaltSchmal} />
            <figcaption className="hb-fussnote">{L.bank.fussnote}</figcaption>
          </figure>
          <ZwischenAufruf wizard={wizard} titel={L.bank.zwischenTitel} unter={L.bank.zwischenUnter} knopf={L.knopfRahmen} />
        </div>
      </section>

      {/* 7 So arbeiten wir: drei Modelle und die Bank */}
      <section className="hb-abschnitt" id="so-arbeiten-wir">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{L.arbeit.augenbraue}</span>
          <h2 className="hb-h2">{L.arbeit.h2}</h2>
          <p className="hb-lead">{L.arbeit.lead}</p>
          <div className="hb-vier drei">
            {MODELLE.map(({ clip, welt, Icon }, i) => {
              const m = L.arbeit.modelle[i];
              return (
                <div className="hb-kachel-karte hb-karte hb-modell" key={clip}>
                  <ObjektClip name={clip} alt={welten[welt]?.clipAlt ?? m.t} lazy className="hb-modell-video" />
                  <div className="innen">
                    <span className="hb-rund">
                      <Icon aria-hidden="true" />
                    </span>
                    <h3>{m.t}</h3>
                    <p>{m.x}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="hb-bankband hb-karte">
            <div>
              <span className="hb-augenbraue">{L.arbeit.bankAugenbraue}</span>
              <h3 style={{ fontSize: 26, marginBottom: 8 }}>{L.arbeit.bankTitel}</h3>
              <p style={{ fontSize: 16, color: "var(--hb-text2)", margin: 0 }}>{L.arbeit.bankText}</p>
            </div>
            <div className="hb-wege">
              {L.arbeit.wege.map((w) => (
                <div key={w.b}>
                  <b>{w.b}</b>
                  {w.x}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 8 Musterrechnung */}
      <section className="hb-abschnitt hb-zweiter" id="musterrechnung">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{L.muster.augenbraue}</span>
          <h2 className="hb-h2">{L.muster.h2}</h2>
          <div className="hb-zwei gleich" style={{ marginTop: 30 }}>
            <div className="hb-karte" style={{ padding: "26px 28px" }}>
              <div style={{ fontWeight: 700, color: "var(--hb-tinte)", marginBottom: 6 }}>{L.muster.erstesJahr}</div>
              <table className="hb-rechnung">
                <tbody>
                  <tr className="plus">
                    <td className="lbl">{L.muster.kaltmiete}</td>
                    <td>+{e(muster.j1.miete)}</td>
                  </tr>
                  <tr className="minus">
                    <td className="lbl">{L.muster.kosten}</td>
                    <td>{e(-muster.j1.kosten)}</td>
                  </tr>
                  <tr className="minus">
                    <td className="lbl">{L.muster.ruecklage}</td>
                    <td>{e(-muster.j1.ruecklage)}</td>
                  </tr>
                  <tr className="minus">
                    <td className="lbl">{L.muster.zins}</td>
                    <td>{e(-muster.j1.zins)}</td>
                  </tr>
                  <tr className="minus">
                    <td className="lbl">{L.muster.tilgung}</td>
                    <td>{e(-muster.j1.tilgung)}</td>
                  </tr>
                  <tr className="summe">
                    <td>{L.muster.vorSteuer}</td>
                    <td>{e(muster.j1.vorSteuer)}</td>
                  </tr>
                  <tr className="plus">
                    <td className="lbl">{L.muster.steuerwirkung(gs)}</td>
                    <td>+{e(muster.j1.steuerwirkung)}</td>
                  </tr>
                  <tr className="summe">
                    <td>{L.muster.nachSteuer}</td>
                    <td>{e(muster.j1.nachSteuer)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="hb-ergebnis">
                <div>
                  <b>{e(muster.e.purchaseCosts)}</b>
                  <span>{L.muster.ekNebenkosten}</span>
                </div>
                <div>
                  <b>{e(-muster.j1.nachSteuer)}</b>
                  <span>{L.muster.imMonat}</span>
                </div>
                <div>
                  <b>{e(muster.j1.tilgung)}</b>
                  <span>{L.muster.davonTilgung}</span>
                </div>
              </div>
            </div>
            <figure className="hb-diagramm hb-karte" style={{ margin: 0 }}>
              <div className="titel">{L.muster.diagrammTitel}</div>
              <div className="unter">{L.muster.diagrammUnter}</div>
              <Diagramm className="hb-nur-desktop" zeichnung={d.vermoegen} />
              <Diagramm className="hb-nur-handy" zeichnung={d.vermoegenSchmal} />
              <figcaption className="hb-fussnote">
                {L.muster.diagrammFuss(e(muster.e.years[muster.e.years.length - 1].propertyEquity), e(muster.e.eigenkapitalBasis))}
              </figcaption>
            </figure>
          </div>
          <div className="hb-annahmen">
            <b style={{ color: "var(--hb-tinte)" }}>{L.muster.annahmen}</b> {d.annahmen} {L.muster.annahmenZusatz}
          </div>
          <ZwischenAufruf wizard={wizard} titel={L.muster.zwischenTitel} unter={L.muster.zwischenUnter} knopf={L.knopfRahmen} />
        </div>
      </section>

      {/* 9 Der Preis des Wartens */}
      <section className="hb-abschnitt">
        <div className="hb-wrap hb-zwei">
          <div>
            <span className="hb-augenbraue">{L.warten.augenbraue}</span>
            <h2 className="hb-h2">{L.warten.h2}</h2>
            <p className="hb-lead" style={{ fontSize: 18 }}>
              {L.warten.lead}
            </p>
            <div className="hb-grosse-zahl">
              <b>
                <Hochzaehlen text={(a) => e(anteilig(wartenDifferenz, a, 100))} />
              </b>
              <span>{L.warten.grosseZahl}</span>
              <span className="marke">{L.warten.marke}</span>
            </div>
            <p className="hb-fussnote" style={{ marginTop: 6 }}>
              {L.warten.annahmen(e(BASIS_KAUFPREIS), e(warten[0].vermoegen), e(warten[2].vermoegen))}
            </p>
            <p style={{ fontSize: 16, color: "var(--hb-text2)" }}>{L.warten.text}</p>
          </div>
          <figure className="hb-diagramm hb-karte" style={{ margin: 0 }}>
            <div className="titel">{L.warten.diagrammTitel}</div>
            <div className="unter">{L.warten.diagrammUnter}</div>
            <Diagramm className="hb-nur-desktop" zeichnung={d.warten} />
            <Diagramm className="hb-nur-handy" zeichnung={d.wartenSchmal} />
            <figcaption className="hb-fussnote">{L.warten.fussnote}</figcaption>
          </figure>
        </div>
        <div className="hb-wrap">
          <ZwischenAufruf wizard={wizard} titel={L.warten.zwischenTitel} unter={L.warten.zwischenUnter} knopf={L.knopfRahmen} />
        </div>
      </section>

      {/* 10 Ablauf: eine Zeitleiste */}
      <section className="hb-abschnitt hb-zweiter" id="ablauf">
        <div className="hb-wrap">
          <span className="hb-augenbraue">{L.ablauf.augenbraue}</span>
          <h2 className="hb-h2">{L.ablauf.h2}</h2>
          <p className="hb-lead">{L.ablauf.lead}</p>
          <ol className="hb-zeit acht" style={{ listStyle: "none", padding: 0 }}>
            {L.ablauf.schritte.map(({ d: dauer, t: titel, x }, i) => {
              const Icon = ZEITLEISTE_SYMBOLE[i];
              return (
                <li className={`hb-zp${i === 0 ? " jetzt" : ""}`} key={titel}>
                  <div className="punkt">
                    <Icon aria-hidden="true" />
                  </div>
                  <div className="dauer">{dauer}</div>
                  <b>{titel}</b>
                  <span>{x}</span>
                </li>
              );
            })}
          </ol>
          <p className="hb-fussnote" style={{ marginTop: 26 }}>
            {L.ablauf.fussnote}
          </p>
        </div>
      </section>

      {/* 11 Handbuch anfordern */}
      <section className="hb-abschnitt">
        <div className="hb-wrap">
          <div className="hb-cta" style={{ gridTemplateColumns: "1fr" }}>
            <div>
              <span className="hb-augenbraue">{L.cta.augenbraue}</span>
              <h2 className="hb-h2">{L.cta.h2}</h2>
              <p style={{ fontSize: 18, maxWidth: 720 }}>{L.cta.text}</p>
              <Link className="hb-knopf hb-orange" style={{ marginTop: 10 }} to={wizard}>
                {L.cta.knopf} <ArrowRight aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 12 Häufige Fragen und Hinweise */}
      <section className="hb-abschnitt hb-zweiter" id="fragen">
        <div className="hb-wrap">
          <div className="hb-faq">
            <div className="hb-faq-kopf">
              <span className="hb-augenbraue">{L.faq.augenbraue}</span>
              <h2 className="hb-h2">{L.faq.h2}</h2>
              <p style={{ color: "var(--hb-text2)" }}>{L.faq.text}</p>
            </div>
            <div>
              {L.faq.fragen.map(([f, a], i) => (
                <details className="hb-frage hb-karte" key={f} open={i < 2}>
                  <summary>
                    {f}
                    <Plus aria-hidden="true" />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </div>
          <div className="hb-hinweise">
            <b>{L.faq.hinweiseLabel}</b> {L.faq.hinweise}
          </div>
        </div>
      </section>

      <HandbuchFuss konfigurator={wizard} />
      <MobilerAufruf wizard={wizard} knopf={L.knopfRahmen} />
    </div>
  );
}

/** Die drei Vertrauenssätze unter den Knöpfen, auch im Wizard. */
export function Vertrauen({ texte, stil }: { texte: string[]; stil?: CSSProperties }) {
  const symbole = [ShieldCheck, Clock, Lock];
  return (
    <div className="hb-vertrauen" style={stil}>
      {texte.map((text, i) => {
        const Icon = symbole[i] ?? ShieldCheck;
        return (
          <span key={text}>
            <Icon aria-hidden="true" />
            {text}
          </span>
        );
      })}
    </div>
  );
}

function ZwischenAufruf({ wizard, titel, unter, knopf }: { wizard: string; titel: string; unter: string; knopf: string }) {
  return (
    <div className="hb-zwischen">
      <p>
        {titel}
        <span>{unter}</span>
      </p>
      <Link className="hb-knopf hb-orange" to={wizard}>
        {knopf} <ArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Der feste Knopf unten auf dem Handy. Er blendet sich aus, solange die
 * Knöpfe im Einstieg sichtbar sind und sobald der Fuß ins Bild kommt, damit
 * er weder doppelt steht noch Impressum und Datenschutz verdeckt.
 */
function MobilerAufruf({ wizard, knopf }: { wizard: string; knopf: string }) {
  const [verdeckt, setVerdeckt] = useState(true);
  const sichtbar = useRef(new Set<Element>());
  useEffect(() => {
    const ziele = [document.querySelector(".hb-umschlag .hb-knoepfe"), document.querySelector(".hb-fuss")].filter(Boolean) as Element[];
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
      <Link className="hb-knopf hb-orange" to={wizard} tabIndex={verdeckt ? -1 : undefined}>
        {knopf} <ArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}

/**
 * Wer dahinter steht. Mit Partnerlink der Partner selbst, mit Bild und den
 * Kontaktdaten aus seinen Einstellungen (derselbe öffentliche Weg wie die
 * Mikroseite, `get-vp-microsite`). Ohne Partner der Inhaber mit seinem
 * Foto (fest im Projekt, `assets/handbuch/christian-kurz.webp`), ohne
 * Telefon und E-Mail.
 * Kennzahlen und Kundenstimmen nur so, wie sie auf more.immo stehen
 * (`lib/handbuch/firma.ts`). Die Kundenstimmen bleiben auch auf Englisch im
 * deutschen Wortlaut, weil es Zitate sind.
 */
function WerDahinterSteht({ berater }: { berater: HandbuchBerater | null }) {
  const en = useSeitenSprache() === "en";
  const W = useSeitenTexte(HANDBUCH_SEITEN_TEXTE).landing.wer;
  const kennzahlen = en ? FIRMEN_KENNZAHLEN_EN : FIRMEN_KENNZAHLEN;
  return (
    <section className="hb-abschnitt hb-zweiter" id="wer-wir-sind">
      <div className="hb-wrap">
        <div className="hb-zwei gleich hb-wer">
          <div>
            <span className="hb-augenbraue">{W.augenbraue}</span>
            <h2 className="hb-h2">MOREImmo.</h2>
            {(en ? MOREIMMO_WARUM_EN : MOREIMMO_WARUM).map((satz) => (
              <p key={satz} style={{ fontSize: 17, color: "var(--hb-text2)" }}>
                {satz}
              </p>
            ))}
            <p style={{ fontSize: 17, color: "var(--hb-text2)" }}>{en ? MOREIMMO_WERTE_EN : MOREIMMO_WERTE}</p>
            {/* Spaltenzahl als Variable statt fester Spalten, damit die Handy-Regel sie auf eine Spalte setzen kann. */}
            <div className="hb-ergebnis" style={{ "--hb-spalten": kennzahlen.length } as CSSProperties}>
              {kennzahlen.map((k) => (
                <div key={k.text} className="hb-karte" style={{ boxShadow: "none" }}>
                  <b>{k.wert}</b>
                  <span>{k.text}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="hb-wer-karte">{berater ? <PartnerKarte berater={berater} /> : <InhaberKarte />}</div>
        </div>
        {KUNDENSTIMMEN.length > 0 && (
          <div style={{ marginTop: 44 }}>
            <h3 style={{ fontSize: 22, marginBottom: 14 }}>{W.stimmenTitel}</h3>
            <div className="hb-stimmen" role="list">
              {KUNDENSTIMMEN.map((s) => (
                <figure className="hb-stimme hb-karte" key={s.name} role="listitem">
                  <div className="sterne" aria-label={W.stimme}>
                    {[0, 1, 2, 3, 4].map((i) => (
                      <Star key={i} aria-hidden="true" />
                    ))}
                  </div>
                  {/* Wörtliches Zitat, deshalb immer deutsch und als deutsch ausgezeichnet. */}
                  <blockquote lang="de">„{s.text}“</blockquote>
                  <figcaption>
                    <b>{s.name}</b>
                    <span>{s.ort}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
            <p className="hb-fussnote">{W.stimmenFuss}</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function PartnerKarte({ berater }: { berater: Pick<HandbuchBerater, "name" | "position" | "telefon" | "email" | "bild"> }) {
  const W = useSeitenTexte(HANDBUCH_SEITEN_TEXTE).landing.wer;
  return (
    <div className="hb-berater hb-karte">
      {berater.bild ? (
        <img src={berater.bild} alt={berater.name} />
      ) : (
        <span className="av">
          <User aria-hidden="true" />
        </span>
      )}
      <div style={{ minWidth: 0 }}>
        <div className="hb-klein">{W.deinBerater}</div>
        <b style={{ color: "var(--hb-tinte)", fontSize: 19 }}>{berater.name}</b>
        <div className="hb-klein">{berater.position}</div>
        <div className="kontakt">
          {berater.telefon && (
            <a href={`tel:${berater.telefon.replace(/\s+/g, "")}`}>
              <Phone aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 4 }} />
              {berater.telefon}
            </a>
          )}
          {berater.email && (
            <a href={`mailto:${berater.email}`}>
              <Mail aria-hidden="true" style={{ width: 14, height: 14, verticalAlign: "-2px", marginRight: 4 }} />
              {berater.email}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Der Kasten beim Firmenlink: Inhaber mit Foto, Initialen nur als Rückfall,
 * falls das Bild nicht lädt. Keine Kontaktdaten. Das Foto liegt seit dem
 * 26.09.2026 fest im Projekt (von Christian geliefert, geschärft).
 */
export function InhaberKarte() {
  const en = useSeitenSprache() === "en";
  const W = useSeitenTexte(HANDBUCH_SEITEN_TEXTE).landing.wer;
  const bild = christianKurzFoto;
  const [bildFehlt, setBildFehlt] = useState(false);
  const p = FIRMEN_ANSPRECHPARTNER;
  return (
    <div className="hb-berater hb-karte" style={{ alignItems: "flex-start", flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
        {bild && !bildFehlt ? (
          <img src={bild} alt={p.name} onError={() => setBildFehlt(true)} />
        ) : (
          <span className="av" aria-hidden="true" style={{ fontWeight: 700, fontSize: 24 }}>
            {p.initialen}
          </span>
        )}
        <div>
          <b style={{ color: "var(--hb-tinte)", fontSize: 19 }}>{p.name}</b>
          <div className="hb-klein">{en ? FIRMEN_ANSPRECHPARTNER_EN.rolle : p.rolle}</div>
        </div>
      </div>
      <blockquote className="hb-zitat">
        <Quote aria-hidden="true" />
        {en ? FIRMEN_ANSPRECHPARTNER_EN.zitat : p.zitat}
      </blockquote>
      <div className="hb-klein">{W.inhaberHinweis}</div>
    </div>
  );
}
