import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { Building2, MapPin, Compass, ClipboardList, LayoutGrid, Calculator, Building, ArrowUpRight, CalendarDays, ShieldCheck, FileText, Phone, Download, Loader2, ChevronLeft, ChevronRight, X, Users, TrendingUp, TrendingDown, Check, Euro, Maximize2, DoorOpen, KeyRound, Percent, Sun, Zap, Car, BarChart3, type LucideIcon } from "lucide-react";
import { springeZuAbschnitt, useAktiverAbschnitt } from "./useAktiverAbschnitt";
import { AbschnittObjektdaten, AbschnittKontakt } from "./ExposeAbschnitte";
import { Partnerkasten } from "@/components/kundenansicht/Partnerkasten";
import { ExposeRechner, type ExposeRechnerProps } from "./ExposeRechner";
import { Mikrolage } from "./Mikrolage";
import { GrundrissVorschau } from "./GrundrissVorschau";
import { grundrisseFuerAnsicht } from "./grundrissAuswahl";
import { GrundrissStreifen } from "./GrundrissStreifen";
import { abschnittAnker, exposeAbschnitte, marktQuelleHinweis, mikrolageZeigen, ohneDoppelte, sichtbareZeilen, verwaltungKostenText, type ExposeAbschnittId, type ExposeInhalt, type Person } from "@/lib/exposeInhalt";
import { eur0, dez, zimmerText } from "@/lib/objektKennzahlen";
import { resolveImageUrl } from "@/lib/objekteImages";
import { datumText } from "@/lib/sprachFormat";
import { useAnzeigeSprache } from "@/lib/seitenSpracheKontext";
import { NurDeutschHinweis } from "@/components/kundensprache/NurDeutschHinweis";
import { LEERE_ERGAENZUNG, ohneWidersprueche, zeilenErgaenzen, type InvestagonErgaenzung } from "./exposeInvestagon";
import { EXPOSE_SEITEN_TEXTE, exposeSeitenTexte } from "./exposeTexte";
import { exposeInhaltTexte } from "@/lib/exposeInhaltTexte";
import { toast } from "sonner";
import { exposePdfHerunterladen } from "@/lib/exposePdfHerunterladen";
import "./premiumExpose.css";

export interface ExposeAnsichtProps {
  inhalt: ExposeInhalt;
  rechner: Omit<ExposeRechnerProps, "objektdaten">;
  kopfRechts?: ReactNode;
  leisteObenLinks?: ReactNode;
  rechnerHinweis?: ReactNode;
  fussText?: string;
  pdfAktiv?: boolean;
  onPdf?: () => void;
  pdfLaeuft?: boolean;
  /**
   * Was zusaetzlich aus den Investagon-Rohdaten kommt: Grundrisse, Freitexte,
   * Merkmale und fehlende Objektangaben. Siehe `exposeInvestagon.ts`. Fehlt
   * die Angabe, sieht das Exposé genauso aus wie vorher.
   */
  investagon?: InvestagonErgaenzung;
  /**
   * Nur im Exposé für einen Kunden: Der Vertriebspartner steht dann ganz
   * oben, über den Bildern und über die ganze Breite, mit Bild, Name,
   * Telefon und E-Mail. Ohne Kunden bleibt der Kasten weg.
   */
  kundenAnsprechpartner?: Person;
  /**
   * Adresse des Exposés einer Einheit aus der Einheitentabelle. Ohne Angabe
   * der öffentliche Link; die interne Objektansicht verlinkt ins CRM.
   */
  einheitLink?: (wohnungId: string) => string;
}
const icons = [Building2, MapPin, Compass, ClipboardList, LayoutGrid, Calculator, Building, ArrowUpRight, CalendarDays, ShieldCheck, FileText, Phone];

/**
 * Art einer Kennzahl im Kopf, nach ihrer Beschriftung statt nach ihrer
 * Stelle: Fehlte eine Kennzahl, rutschten die Symbole bisher um eins weiter.
 * Die Art steuert Symbol und Farbe des Symbols. Die Zahlen selbst stehen seit
 * dem 23.09.2026 alle in der dunklen Textfarbe, auch Kaufpreis und Rendite.
 */
type KennzahlArt = "preis" | "rendite" | "flaeche" | "zimmer" | "miete" | "haus";
function kennzahlArt(label: string): KennzahlArt {
  // Deutsch und Englisch (Kundensprache, Etappe 3).
  if (/rendite|yield/i.test(label)) return "rendite";
  if (/kaufpreis|purchase price/i.test(label)) return "preis";
  if (/fläche|living space/i.test(label)) return "flaeche";
  if (/zimmer|rooms/i.test(label)) return "zimmer";
  if (/miete|rent/i.test(label)) return "miete";
  return "haus";
}
const KENNZAHL_SYMBOL: Record<KennzahlArt, LucideIcon> = { preis: Euro, rendite: Percent, flaeche: Maximize2, zimmer: DoorOpen, miete: KeyRound, haus: Building2 };

/**
 * Satz über dem Rechner, wenn nichts gespeichert wird: im Kundenlink und in
 * der Kundenansicht. Dort rechnet das Exposé immer mit den Standardwerten,
 * jede Änderung an den Reglern gilt nur, solange die Seite offen ist
 * (`ExposePublic.tsx`, `aenderungen` im Zustand der Seite). Die interne
 * Ansicht bringt über `rechnerHinweis` ihren eigenen Stand mit.
 */
export const RECHNER_HINWEIS_OHNE_SPEICHERN = EXPOSE_SEITEN_TEXTE.de.rechnerHinweisOhneSpeichern;

/** Symbol zu einem Merkmal-Chip. */
function chipSymbol(chip: string): LucideIcon {
  if (/balkon|balcony|terrasse|terrace|loggia/i.test(chip)) return Sun;
  if (/energie|energy/i.test(chip)) return Zap;
  if (/stellplatz|parking/i.test(chip)) return Car;
  if (/abschreibung|depreciation/i.test(chip)) return TrendingDown;
  if (/verwaltung|management/i.test(chip)) return ShieldCheck;
  if (/vermietet|let since/i.test(chip)) return KeyRound;
  return Check;
}

/** Same live contents for internal, public, unit and whole-property exposés. No demo data. */
export function ExposeAnsicht(p: ExposeAnsichtProps) {
  const { inhalt: c } = p;
  const sprache = useAnzeigeSprache();
  const t = exposeSeitenTexte(sprache);
  const abschnitte = exposeAbschnitte(sprache);
  const aktiv = useAktiverAbschnitt();
  const location = useLocation();
  const [idx, setIdx] = useState(0);
  const [lightbox, setLightbox] = useState<{ url: string; alt: string } | null>(null);
  const [offeneThemen, setOffeneThemen] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const bilder = c.start.bilder.filter(b => b.url);
  const aktuell = bilder[idx % (bilder.length || 1)];
  const next = bilder[(idx + 1) % (bilder.length || 1)];
  const global = c.struktur === "globalobjekt";

  /*
   * Die Grundrisse. Im Kundenlink kommt die vom Server geprüfte Liste mit
   * befristeten Adressen (`investagon.grundrisse`), sie geht vor. Sonst die
   * Auswahl aus `grundrisseFuerExpose`, nach derselben Regel. Beides zu
   * mischen, zeigte denselben Plan zweimal unter verschiedenen Adressen.
   */
  const zusatz = p.investagon ?? LEERE_ERGAENZUNG;
  const plaene = grundrisseFuerAnsicht((zusatz.grundrisse.length ? zusatz.grundrisse : c.grundriss.dokumente)
    .filter((d, i, alle) => !!d.url && alle.findIndex(a => a.url === d.url) === i), c.ansicht);
  // Die übrigen Unterlagen stehen unter den Objektdaten, ohne die Pläne, die schon oben als Grundriss stehen.
  const alsPlan = (d: { id: string; url: string }) => [...plaene, ...c.grundriss.dokumente].some(g => g.url === d.url || g.id === d.id);
  const weitereUnterlagen = (c.dokumente ?? []).filter(d => !alsPlan(d));
  // Erst ergänzen, dann „Keine Angabe“ herausnehmen: Die Ergänzung füllt
  // leere Zeilen an ihrer Stelle, was danach noch leer ist, bleibt weg.
  const objektzeilen = sichtbareZeilen(zeilenErgaenzen(c.objektdaten.zeilen, ohneWidersprueche(zusatz.zeilen, c.objektdaten.energie)));

  /*
   * Ein Abschnitt ohne Inhalt wird nicht gezeigt. Ein leerer Kasten mit der
   * Ueberschrift „Der Grundriss" verspricht etwas, was nicht da ist, und der
   * Leser sucht danach. Dasselbe gilt für einen Standort, zu dem gar nichts
   * vorliegt. Die Mikrolage steht seit dem 23.09.2026 auch ohne gemessene
   * Analyse da, sobald die Adresse für die Karte reicht (`mikrolageZeigen`).
   */
  const markt = c.standort.marktargumente;
  const standortZeigen = c.standort.kennzahlen.length > 0 || c.standort.argumente.length > 0 || markt.length > 0 || c.standort.arbeitgeber.length > 0;
  const zeigen: Partial<Record<ExposeAbschnittId, boolean>> = {
    standort: standortZeigen,
    mikrolage: mikrolageZeigen(c.mikrolage),
    // Nur mit Plan. Die übrigen Unterlagen hielten den Abschnitt bis zum 23.09.2026 offen, auch ganz ohne Grundriss.
    grundriss: plaene.length > 0,
  };
  const sichtbareAbschnitte = abschnitte.filter(a => zeigen[a.id] !== false);

  const nr = Math.max(1, sichtbareAbschnitte.findIndex(a => a.id === aktiv) + 1);

  /*
   * „Exposé herunterladen“ (01.10.2026): eine echte PDF-Datei statt des
   * Druckdialogs. Hat die Seite einen eigenen Weg (`onPdf`, die interne
   * Einheitenansicht mit Preisstand und englischem Nachladen), gilt der.
   * Sonst baut das Exposé das PDF selbst, mit dem Inhalt, den es gerade
   * zeigt: ergänzte Objektdaten und dieselben Pläne wie auf der Seite.
   */
  const [pdfLaeuftSelbst, setPdfLaeuftSelbst] = useState(false);
  const pdfLaeuft = !!p.pdfLaeuft || pdfLaeuftSelbst;
  const pdfLaden = async () => {
    if (pdfLaeuft) return;
    if (p.onPdf) { p.onPdf(); return; }
    setPdfLaeuftSelbst(true);
    try {
      await exposePdfHerunterladen({
        inhalt: { ...c, objektdaten: { ...c.objektdaten, zeilen: objektzeilen }, grundriss: { ...c.grundriss, dokumente: plaene } },
        annahmen: p.rechner.annahmen,
        herkunft: p.rechner.herkunft,
        eigenkapitalEuro: p.rechner.eigenkapitalEuro,
        sprache,
        zusatz: { beschreibungen: zusatz.beschreibungen, merkmale: zusatz.merkmale },
      });
    } catch (e) {
      console.error("[Exposé] PDF fehlgeschlagen", e);
      toast.error(t.pdfFehler);
    } finally {
      setPdfLaeuftSelbst(false);
    }
  };
  const PdfSymbol = pdfLaeuft ? Loader2 : Download;
  const pdfText = pdfLaeuft ? t.pdfLaeuft : t.pdfHerunterladen;
  const detailsBeforePrint = useRef<boolean[]>([]);
  useEffect(() => {
    if (lightbox) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [lightbox]);
  useEffect(() => {
    const before = () => {
      const all = [...(root.current?.querySelectorAll("details") || [])];
      detailsBeforePrint.current = all.map(d => d.open);
      all.forEach(d => { d.open = true; });
    };
    const after = () => root.current?.querySelectorAll("details").forEach((d, i) => { d.open = detailsBeforePrint.current[i] ?? false; });
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, []);
  const header = (id: Exclude<ExposeAbschnittId, "start">) => <div className="section-head"><span>{t.koepfe[id][0]}</span><h2>{id === "standort" ? c.standort.ort : t.koepfe[id][1]}</h2></div>;
  const unitUrl = (id: string) => {
    if (p.einheitLink) return p.einheitLink(id);
    const query = new URLSearchParams();
    const adresse = new URLSearchParams(location.search);
    const berater = adresse.get("berater");
    if (berater) query.set("berater", berater);
    /*
     * Der persönliche Schlüssel geht mit (Christian, 25.09.2026): Der Kunde
     * kommt so mit Partner und Sprache direkt in die Einheit. `get-expose`
     * lässt einen Objekt-Schlüssel nur für Einheiten desselben Objekts gelten
     * (`linkBereich` in `_shared/expose-kundenlink.ts`). `vorschau` geht mit,
     * damit die Vorschau des Partners auch dort nicht zählt; `lang` bleibt
     * stehen, wenn es die Adresse vorgibt. Kein `aufruf`: Das setzt die Seite
     * selbst, und die Glocke läutet ohnehin nur beim ersten Aufruf des Links.
     */
    for (const schluessel of ["token", "vorschau", "lang"]) {
      const wert = adresse.get(schluessel);
      if (wert) query.set(schluessel, wert);
    }
    // `query.size` kennen ältere Browser nicht; dort ging die Abfrage samt Schlüssel still verloren.
    const abfrage = query.toString();
    return `/expose/${encodeURIComponent(c.objektId || "")}/wohnung/${encodeURIComponent(id)}${abfrage ? `?${abfrage}` : ""}`;
  };
  /*
   * Kopf nach der Vorlage: groß die Adresse mit Wohneinheit, darunter die
   * Ortszeile. Bis zum 23.09.2026 stand groß nur der Teil der Adresse vor dem
   * ersten Komma (bei einer Adresse ohne Straße also „9a“) und rechts ein
   * eigener Kasten mit der Wohneinheit. Die Rückfälle gelten für Inhalte
   * ohne die neuen Felder.
   */
  const ueberschrift = c.kopf.ueberschrift || [c.kopf.adresse, c.kopf.titel].filter(Boolean).join(", ");
  const ortszeile = c.kopf.ortszeile ?? ohneDoppelte([c.kopf.ort, ...c.kopf.untertitel.split(" · ")]);
  const einwohner = typeof c.start.einwohner === "number" && c.start.einwohner > 0 ? c.start.einwohner : undefined;
  const wachstum = typeof c.start.wachstumProzent === "number" && Number.isFinite(c.start.wachstumProzent) ? c.start.wachstumProzent : undefined;
  const alleOffen = c.chancenRisiken.length > 0 && offeneThemen.length === c.chancenRisiken.length;
  const verwaltungZeile = [c.verwaltung.zusatz, c.verwaltung.art, verwaltungKostenText(c.verwaltung, sprache)].filter(Boolean).join(" · ");
  // Ganze Zahlen im Text: auf Englisch mit Komma als Tausendertrenner.
  const keineAngabe = exposeInhaltTexte(sprache).keineAngabe;
  const ganzeZahl = (n: number) => (sprache === "en" ? dez(n, 0, sprache) : new Intl.NumberFormat("de-DE").format(n));
  const nurDeutsch = c.nurDeutsch ?? { beschreibung: false, standortargumente: false, marktargumente: false };

  return <div className="premium-expose" ref={root}>
    <header><img src="/images/moreimmo-logo.png" alt="OS Immobilien" /><span>{t.slogan}</span><button type="button" className="btn primary" onClick={pdfLaden} disabled={pdfLaeuft} aria-busy={pdfLaeuft} data-testid="expose-pdf"><PdfSymbol size={14} className={pdfLaeuft ? "animate-spin" : undefined} /> {pdfText}</button></header>
    {(p.leisteObenLinks || p.kopfRechts) && <div className="expose-editor-bar">{p.leisteObenLinks}{p.kopfRechts}</div>}
    <nav aria-label={t.navLabel}>{abschnitte.map((a, i) => { const Icon = icons[i]; if (!sichtbareAbschnitte.includes(a)) return null; return <button key={a.id} className={aktiv === a.id ? "active" : ""} aria-current={aktiv === a.id ? "location" : undefined} aria-label={a.titel} title={a.titel} onClick={() => springeZuAbschnitt(a.id)}><Icon size={19} /><span className="nav-tip">{a.titel}</span></button>; })}<button type="button" title={pdfText} aria-label={pdfText} onClick={pdfLaden} disabled={pdfLaeuft} data-testid="expose-pdf-leiste"><PdfSymbol size={18} className={pdfLaeuft ? "animate-spin" : undefined} /></button></nav>
    <span className="sr-only" data-testid="leiste-zaehler">{nr} / {sichtbareAbschnitte.length}</span>
    <main>
      {p.kundenAnsprechpartner && <Partnerkasten person={p.kundenAnsprechpartner} />}
      <section className="hero" id={abschnittAnker("start")} data-testid="abschnitt-start">
        <div className={`photos ${bilder.length < 2 ? "single-photo" : ""}`}>
          {aktuell ? <img src={resolveImageUrl(aktuell.url)} alt={aktuell.alt || c.kopf.adresse} fetchPriority="high" /> : <div className="no-photo"><Building2 size={48} /><span>{t.keinBild}</span></div>}
          {bilder.length > 1 && <img src={resolveImageUrl(next.url)} alt={next.alt || c.kopf.titel} />}
          {bilder.length > 0 && <><div className="image-label"><b>OS Immobilien</b> · {t.ansichtenDerImmobilie}</div><div className="image-counter">{String(idx % bilder.length + 1).padStart(2, "0")} / {String(bilder.length).padStart(2, "0")}</div></>}
          {bilder.length > 1 && <><button className="prev" aria-label={t.vorherigesBild} onClick={() => setIdx((idx - 1 + bilder.length) % bilder.length)}><ChevronLeft size={18} /></button><button className="next" aria-label={t.naechstesBild} onClick={() => setIdx((idx + 1) % bilder.length)}><ChevronRight size={18} /></button></>}
        </div>
        <div className="hero-card">
          <div className="eyebrow">{c.ansicht === "objekt" ? t.eyebrowObjekt : t.eyebrowEinheit}</div>
          <h1 data-testid="kopf-ueberschrift">{ueberschrift}</h1>
          {ortszeile.length > 0 && <div className="hero-location" data-testid="kopf-ortszeile">{ortszeile.map((teil, i) => <Fragment key={i}>{i > 0 && <i />}{teil}</Fragment>)}</div>}
          <div className="hero-facts">
            <div className="stats" data-testid="start-kennzahlen">
              {c.start.kennzahlen.map((k) => { const art = kennzahlArt(k.label); const Icon = KENNZAHL_SYMBOL[art]; return <div className={`stat stat-${art}`} key={k.label}><span className="round"><Icon size={18} /></span><div><strong>{k.wert}</strong><small>{k.label}{k.unter && ` · ${k.unter}`}</small></div></div>; })}
              {/* „Karte öffnen“ wie eine Kennzahl-Kachel, springt zur Karte im Abschnitt Mikrolage. Im Druck fällt der Knopf weg. */}
              {zeigen.mikrolage && <button type="button" className="stat stat-link screen-only" onClick={() => springeZuAbschnitt("mikrolage")} data-testid="start-karte"><span className="round"><MapPin size={18} /></span><span className="stat-link-inhalt"><strong>{t.karteOeffnen}</strong><small>{t.lageUndUmgebung}</small></span></button>}
            </div>
            {(einwohner !== undefined || wachstum !== undefined) && <div className="stats stats-ort" data-testid="start-standort">
              {einwohner !== undefined && <div className="stat" data-testid="start-einwohner"><span className="round"><Users size={18} /></span><div><strong>{ganzeZahl(einwohner)}</strong><small>{t.einwohnerIn(c.standort.ort)}</small></div></div>}
              {wachstum !== undefined && <div className={`stat ${wachstum >= 0 ? "stat-plus" : "stat-minus"}`} data-testid="start-wachstum"><span className="round">{wachstum >= 0 ? <TrendingUp size={18} /> : <TrendingDown size={18} />}</span><div><strong>{wachstum > 0 ? "+" : ""}{sprache === "en" ? `${dez(wachstum, 1, sprache)}%` : `${dez(wachstum, 1)} %`}</strong><small>{t.entwicklungFuenfJahre}</small></div></div>}
            </div>}
          </div>
          {c.start.chips.length > 0 && <div className="chips" data-testid="start-chips">{c.start.chips.map(chip => { const Icon = chipSymbol(chip); return <span className={`chip${/erhöhte abschreibung|increased depreciation/i.test(chip) ? " chip-betont" : ""}`} key={chip}><Icon size={12} aria-hidden="true" />{chip}</span>; })}</div>}
        </div>
        {/*
          Die Beschreibung steht seit dem 23.09.2026 nicht mehr in der Kopfkarte,
          sondern als eigener Textblock unter ihr, direkt vor dem Standort. Noch
          im Kopfabschnitt, damit sie im Druck auf der ersten Seite bleibt.
        */}
        {c.beschreibung && <div className="expose-beschreibung" data-testid="beschreibung-block">
          <p className="property-description" data-testid="beschreibung">{c.beschreibung}</p>
          {nurDeutsch.beschreibung && <NurDeutschHinweis />}
        </div>}
      </section>
      {standortZeigen && <section className="section alt" id={abschnittAnker("standort")} data-testid="abschnitt-standort">{header("standort")}
        {c.standort.kennzahlen.length > 0 && <div className="standort-stats">{c.standort.kennzahlen.map(k => <div key={k.label}><strong>{k.wert}</strong><span>{k.label}</span></div>)}</div>}
        {/* Die Argumente untereinander, nummeriert: bei fünf Stück bliebe im Raster zu zweit eine Lücke. */}
        {c.standort.argumente.length > 0 && <ol className="argumente" data-testid="standort-argumente">{c.standort.argumente.map((a, i) => <li className="argument-zeile" key={i}><span className="argument-nr" aria-hidden="true">{i + 1}</span><div><h3>{a.titel}</h3>{a.text && <p>{a.text}</p>}</div></li>)}</ol>}
        {c.standort.argumente.length > 0 && nurDeutsch.standortargumente && <NurDeutschHinweis className="justify-center" />}
        {/* Markt und Standort: Symbol statt Nummer, damit sie nicht als sechstes bis achtes Standortargument gelesen werden. */}
        {markt.length > 0 && <div className="markt-standort" data-testid="markt-und-standort"><h3 className="subhead">{t.marktUndStandort}</h3>
          <ul className="argumente" data-testid="markt-argumente">{markt.map((a, i) => <li className="argument-zeile markt-zeile" key={i}><span className="markt-symbol" aria-hidden="true"><BarChart3 size={16} /></span><div><h3>{a.titel}</h3>{a.text && <p>{a.text}</p>}</div></li>)}</ul>
          {nurDeutsch.marktargumente && <NurDeutschHinweis className="justify-center" />}
          <p className="quellenzeile" data-testid="markt-quelle">{marktQuelleHinweis(sprache)}</p>
        </div>}
        {/* Eine Liste statt zweier Spalten: Sie sieht bei einem wie bei vier Arbeitgebern ausgewogen aus. */}
        {c.standort.arbeitgeber.length > 0 && <div className="employers"><h3 className="subhead">{t.namhafteArbeitgeber}</h3><ol className="arbeitgeber-liste" data-testid="standort-arbeitgeber">{c.standort.arbeitgeber.map((a, i) => <li key={a.name}><span className="arbeitgeber-nr" aria-hidden="true">{i + 1}</span><span className="arbeitgeber-name"><b>{a.name}</b>{a.branche && <small>{a.branche}</small>}</span>{!!a.mitarbeiter && a.mitarbeiter > 0 && <span className="arbeitgeber-zahl">{t.beschaeftigte(sprache === "en" ? ganzeZahl(a.mitarbeiter) : a.mitarbeiter.toLocaleString("de-DE"))}</span>}</li>)}</ol></div>}
        <p className="quellenzeile" data-testid="standort-quelle">{t.quelle(c.standort.quelle)}</p>
      </section>}
      {zeigen.mikrolage && <section className="section" id={abschnittAnker("mikrolage")} data-testid="abschnitt-mikrolage">{header("mikrolage")}<Mikrolage mikrolage={c.mikrolage} titel={c.kopf.adresse || c.kopf.titel} /></section>}
      <section className="section alt" id={abschnittAnker("objektdaten")} data-testid="abschnitt-objektdaten">{header("objektdaten")}<div className="data"><AbschnittObjektdaten objektdaten={{ ...c.objektdaten, zeilen: objektzeilen }} /></div>
        {/* Besonderheiten und Merkmale als weiße Karten wie die übrigen, sonst gingen sie auf dem grauen Grund unter. */}
        {!!zusatz.beschreibungen.length && <div className="expose-freitexte" data-testid="investagon-beschreibung"><h3 className="subhead">{t.besonderheiten}</h3><div className="expose-karte">{zusatz.beschreibungen.map((text, i) => <p className="freitext" key={i}>{text}</p>)}{sprache === "en" && <NurDeutschHinweis className="mb-2" />}<p className="quellenzeile">{t.quelleAnbieter}</p></div></div>}
        {/* Immer untereinander: Das Raster zu zweit sah bei zwei Merkmalen verloren aus. */}
        {!!zusatz.merkmale.length && <div className="merkmale" data-testid="investagon-merkmale"><h3 className="subhead">{t.ausstattung}</h3><div className="expose-karte"><ul className="merkmal-liste">{zusatz.merkmale.map((m, i) => <li key={`${m.bezeichnung}-${i}`}><span className="merkmal-haken" aria-hidden="true"><Check size={12} strokeWidth={3} /></span><span>{m.wert ? <><b>{m.bezeichnung}</b> {m.wert}</> : m.bezeichnung}</span></li>)}</ul><p className="quellenzeile">{t.quelleAnbieter}</p></div></div>}
        {!!c.einheiten?.length && (global
          ? <div className="unit-table" data-testid="einheiten-mietenspiegel"><h3 className="subhead">{t.mietenspiegelTitel}</h3><div className="table-scroll"><table><thead><tr><th>{t.spalteEinheit}</th><th>{t.spalteLage}</th><th>{t.spalteWohnflaeche}</th><th>{t.spalteZimmer}</th><th>{t.spalteKaltmiete}</th><th>{t.spalteVermietung}</th></tr></thead><tbody>{c.einheiten.map(w => <tr key={w.id}><td>{w.nummer || t.einheit}</td><td>{w.lage || keineAngabe}</td><td>{w.flaeche > 0 ? `${dez(w.flaeche,1,sprache)} m²` : keineAngabe}</td><td>{w.zimmer ? zimmerText(w.zimmer, sprache) : keineAngabe}</td><td>{w.miete && w.miete > 0 ? eur0(w.miete, sprache) : keineAngabe}</td><td>{w.vermietet ? t.vermietet : t.frei}</td></tr>)}</tbody></table></div><p className="caption">{t.hausImGanzen}</p></div>
          : <div className="unit-table" data-testid="einheiten-tabelle"><h3 className="subhead">{t.einheitenUeberblick}</h3><div className="table-scroll"><table><thead><tr><th>{t.spalteEinheit}</th><th>{t.spalteWohnflaeche}</th><th>{t.spalteZimmer}</th><th>{t.spalteKaufpreis}</th><th>{t.spalteStatus}</th><th className="screen-only">{t.spalteExpose}</th></tr></thead><tbody>{c.einheiten.map(w => <tr key={w.id}><td>{w.nummer}</td><td>{w.flaeche > 0 ? `${dez(w.flaeche,1,sprache)} m²` : keineAngabe}</td><td>{w.zimmer ? zimmerText(w.zimmer, sprache) : keineAngabe}</td><td>{w.preis > 0 ? eur0(w.preis, sprache) : keineAngabe}</td><td>{w.status === "frei" ? t.statusVerfuegbar : w.status === "reserviert" ? t.statusReserviert : t.statusVerkauft}</td><td className="screen-only"><Link to={unitUrl(w.id)} aria-label={t.exposeEinheit(w.nummer)}>{t.ansehen} <ArrowUpRight size={13} /></Link></td></tr>)}</tbody></table></div></div>)}
        {/* Die übrigen Unterlagen zur Immobilie. Bis zum 23.09.2026 standen sie im Abschnitt Grundriss und hielten ihn offen, auch ganz ohne Plan. */}
        {!!weitereUnterlagen.length && <div className="document-list" data-testid="objekt-unterlagen"><h3 className="subhead">{t.unterlagen}</h3>{weitereUnterlagen.map(d => <a key={d.url} href={d.url} target="_blank" rel="noreferrer"><FileText size={16}/><span>{d.name}</span><Download size={14}/></a>)}</div>}
      </section>
      {zeigen.grundriss && <section className="section" id={abschnittAnker("grundriss")} data-testid="abschnitt-grundriss">{header("grundriss")}
        <div className="grundriss-plaene" data-testid="grundriss-plaene">{plaene.length > 1 ? <GrundrissStreifen plaene={plaene} onZoom={setLightbox} /> : plaene.map(d => <GrundrissVorschau key={d.url} dokument={d} onZoom={setLightbox} />)}</div>
        <p className="caption grundriss-hinweis">{t.grundrissHinweis}</p>
      </section>}
      <section className="section alt" id={abschnittAnker("wirtschaftlichkeit")} data-testid="abschnitt-wirtschaftlichkeit">{header("wirtschaftlichkeit")}<div className="finance">
        {/* Der Satz zum Speichern steht zentriert über dem Rechner. Ohne eigenen Hinweis der Seite gilt: Hier wird nichts gespeichert. */}
        {p.rechnerHinweis
          ? <div className="rechner-hinweis">{p.rechnerHinweis}</div>
          : c.wirtschaftlichkeit.verfuegbar !== false && !p.rechner.gesperrt && <p className="rechner-hinweis-satz screen-only" data-testid="rechner-hinweis">{t.rechnerHinweisOhneSpeichern}</p>}
        {c.wirtschaftlichkeit.verfuegbar === false ? <div className="card" data-testid="rechner-nicht-verfuegbar"><h3>{c.ansicht === "objekt" && !global ? t.passendeEinheitTitel : t.berechnungNichtVerfuegbar}</h3><p>{c.ansicht === "objekt" && !global && c.einheiten?.length ? t.passendeEinheitText : t.ohneKaufpreisText}</p><button className="btn" onClick={() => springeZuAbschnitt("objektdaten")}>{t.zuDenObjektdaten}</button></div> : <ExposeRechner objektdaten={c.wirtschaftlichkeit.objektdaten} {...p.rechner} kaufpreisLabel={c.ansicht === "objekt" ? t.kaufpreisLabelObjekt : t.kaufpreisLabelEinheit} />}</div></section>
      <section className="section" id={abschnittAnker("verwaltung")} data-testid="abschnitt-verwaltung">{header("verwaltung")}<h3 className="subhead">{c.verwaltung.bezeichnung}</h3>{verwaltungZeile && <p className="caption" data-testid="verwaltung-zeile">{verwaltungZeile}</p>}
        {c.verwaltung.leistungen.length > 0
          ? <div className="services" data-testid="verwaltung-leistungen">{c.verwaltung.leistungen.map(l => <div className="service" key={l}>{l}</div>)}</div>
          : <div className="card verwaltung-offen" data-testid="verwaltung-ohne-leistungen"><p>{t.verwaltungOffen}</p></div>}
        {bilder.length > 0 && <><h3 className="subhead" style={{marginTop:55}}>{t.einblicke}</h3><div className="gallery">{bilder.map((b,i) => <button key={b.url} onClick={() => setLightbox({url:resolveImageUrl(b.url),alt:b.alt || t.objektbild(i+1)})} aria-label={t.bildVergroessern(b.alt || String(i+1))}><img loading="lazy" src={resolveImageUrl(b.url)} alt={b.alt || t.objektbild(i+1)} /></button>)}</div></>}
      </section>
      {/* Seit 01.10.2026 ein Abschnitt: der Zeitstrahl mit Kasten je Station, darunter die Erklärung aus den früheren Schritt-Karten. Der erledigte Schritt (Beratung) steht abgehakt davor. */}
      <section className="section alt" id={abschnittAnker("zeitplan")} data-testid="abschnitt-zeitplan">{header("zeitplan")}
        <ol className="zeitplan mit-text" data-testid="zeitplan">
          {c.naechsteSchritte.filter(s => s.erledigt).map(s => <li className="zeitplan-station erledigt" key={`erledigt-${s.nr}`} data-testid="zeitplan-erledigt">
            <span className="zeitplan-nr" aria-hidden="true"><Check size={16} strokeWidth={3} /></span>
            <div className="zeitplan-inhalt">
              <div className="zeitplan-kopf"><h3>{s.titel}</h3><span className="step-status">{t.erledigt}</span></div>
              <p className="zeitplan-text">{s.text}</p>
            </div>
          </li>)}
          {c.zeitplan.map(s => <li className="zeitplan-station" key={s.nr} data-testid={`zeitplan-station-${s.nr}`}>
            <span className="zeitplan-nr" aria-hidden="true">{s.nr}</span>
            <div className="zeitplan-inhalt">
              <div className="zeitplan-kopf">
                <h3>{s.titel}</h3>
                {s.frist && <p className={`zeitplan-kasten${s.zahlung ? " zahlung" : ""}`} data-testid={s.zahlung ? "zeitplan-zahlung" : "zeitplan-kasten"}>{s.frist}</p>}
              </div>
              {s.text && <p className="zeitplan-text">{s.text}</p>}
            </div>
          </li>)}
        </ol>
        <p className="caption">{t.zeitplanHinweis}</p>
      </section>
      <section className="section" id={abschnittAnker("chancen-risiken")} data-testid="abschnitt-chancen-risiken">{header("chancen-risiken")}
        <div className="themen-leiste screen-only"><button type="button" className="btn" data-testid="alle-aufklappen" onClick={() => setOffeneThemen(alleOffen ? [] : c.chancenRisiken.map(thema => thema.id))}>{alleOffen ? t.alleEinklappen : t.alleAufklappen}</button></div>
        {c.chancenRisiken.map(thema => <details key={thema.id} open={offeneThemen.includes(thema.id)} onToggle={e => { const offen = (e.currentTarget as HTMLDetailsElement).open; setOffeneThemen(alt => offen ? (alt.includes(thema.id) ? alt : [...alt, thema.id]) : alt.filter(x => x !== thema.id)); }}><summary>{thema.titel}</summary><p><b>{t.chance}</b> {thema.chance}</p><p><b>{t.risiko}</b> {thema.risiko}</p></details>)}
      </section>
      <section className="section alt" id={abschnittAnker("rechtliches")} data-testid="abschnitt-rechtliches">{header("rechtliches")}<div className="card data">{c.rechtliches.entwurf && <p data-testid="rechtliches-entwurf"><b>{t.entwurf}</b></p>}{c.rechtliches.hinweise.map(h => <div key={h.titel}><h3>{h.titel}</h3><p>{h.text}</p></div>)}</div></section>
      <section className="section contact" id={abschnittAnker("kontakt")} data-testid="abschnitt-kontakt">{header("kontakt")}<AbschnittKontakt kontakt={c.kontakt} /></section>
    </main>
    <footer><span>OS Immobilien · {[c.kopf.adresse, c.kopf.titel].filter(Boolean).join(" · ")}</span><span>{t.stand(sprache === "en" ? datumText(new Date(), sprache) : new Date().toLocaleDateString("de-DE"))}{p.fussText ? ` · ${p.fussText}` : ""}<br/><Link to="/impressum">{t.impressum}</Link> · <Link to="/datenschutz">{t.datenschutz}</Link></span></footer>
    <dialog ref={dialog} onClose={() => setLightbox(null)}><button aria-label={t.bildSchliessen} onClick={() => setLightbox(null)}><X size={20}/></button>{lightbox && <img src={lightbox.url} alt={lightbox.alt}/>}</dialog>
  </div>;
}
