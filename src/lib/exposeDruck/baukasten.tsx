import { Children, type ReactNode } from "react";
import { Font, Image, Svg, Rect, Line, Text as SvgText, Circle, Path, Text, View, type Styles } from "@react-pdf/renderer";
import type { DruckBild, DruckDaten, Tabelle, Zeile } from "./daten";

/**
 * Gemeinsame Bausteine der sechs Exposé-Entwürfe (01.10.2026).
 *
 * Jeder Entwurf bringt seinen `Stil` mit (Farben, Ecken, Kartenart) und
 * setzt die Bausteine in sein eigenes Raster. Die Bausteine kennen keine
 * Seitenmaße; Umbrüche steuern sie über `wrap={false}` (eine Karte bricht nie)
 * und `minPresenceAhead` (eine Überschrift steht nie allein unten).
 */

type Stilblatt = Styles[string];

export const SCHRIFT = "Jakarta";

let registriert = false;
/**
 * Die Hausschrift Plus Jakarta Sans einbetten. `basis` ist im Browser leer
 * (Adresse `/fonts/…`), in Node der Pfad zu `public`.
 */
export function registriereHausschrift(basis = ""): void {
  if (registriert) return;
  Font.register({
    family: SCHRIFT,
    fonts: [
      { src: `${basis}/fonts/PlusJakartaSans-Regular.ttf`, fontWeight: 400 },
      { src: `${basis}/fonts/PlusJakartaSans-Bold.ttf`, fontWeight: 700 },
    ],
  });
  // Keine Silbentrennung: Die eingebaute ist englisch und trennt deutsche Wörter falsch.
  Font.registerHyphenationCallback((wort) => [wort]);
  registriert = true;
}

export interface Stil {
  tinte: string;
  text: string;
  leise: string;
  linie: string;
  flaeche: string;
  akzent: string;
  akzentWeich: string;
  /** Farbe großer Zahlen. */
  zahl: string;
  /** Karten: null heißt offen gesetzt, ohne Kasten. */
  karte: { grund: string; radius: number; rand?: string; polster: number; tablett?: string } | null;
  /** Zahlungsstationen im Zeitplan. */
  zahlung: { grund: string; schrift: string; rand: string };
}

/* ── Typografie ─────────────────────────────────────────────────────── */

export function Kicker({ s, children, farbe, style }: { s: Stil; children: ReactNode; farbe?: string; style?: Stilblatt }) {
  return <Text style={[{ fontSize: 6.8, fontWeight: 700, letterSpacing: 1.3, textTransform: "uppercase", color: farbe ?? s.akzent }, style ?? {}]}>{children}</Text>;
}

export function Titel({ s, children, groesse = 11, style }: { s: Stil; children: ReactNode; groesse?: number; style?: Stilblatt }) {
  return <Text minPresenceAhead={40} style={[{ fontSize: groesse, fontWeight: 700, color: s.tinte, lineHeight: 1.3, marginBottom: 6 }, style ?? {}]}>{children}</Text>;
}

export function Absatz({ s, children, groesse = 9, style }: { s: Stil; children: ReactNode; groesse?: number; style?: Stilblatt }) {
  return <Text orphans={3} widows={3} style={[{ fontSize: groesse, color: s.text, lineHeight: 1.55 }, style ?? {}]}>{children}</Text>;
}

export function Notiz({ s, children, style }: { s: Stil; children: ReactNode; style?: Stilblatt }) {
  return <Text style={[{ fontSize: 6.8, color: s.leise, lineHeight: 1.5, marginTop: 6 }, style ?? {}]}>{children}</Text>;
}

/* ── Flächen ────────────────────────────────────────────────────────── */

/** Eine Karte im Stil des Entwurfs. Bricht nie über eine Seite. */
export function Karte({ s, children, style, wrap = false, grund }: { s: Stil; children: ReactNode; style?: Stilblatt; wrap?: boolean; grund?: string }) {
  const k = s.karte;
  if (!k) return <View wrap={wrap} style={style ?? {}}>{children}</View>;
  const innen = (
    <View wrap={wrap} style={{ backgroundColor: grund ?? k.grund, borderRadius: k.tablett ? k.radius - 3 : k.radius, padding: k.polster, ...(k.rand ? { borderWidth: 0.6, borderColor: k.rand } : {}), flexGrow: 1 }}>
      {children}
    </View>
  );
  if (!k.tablett) return <View wrap={wrap} style={[{ flexDirection: "column" }, style ?? {}]}>{innen}</View>;
  return <View wrap={wrap} style={[{ backgroundColor: k.tablett, borderRadius: k.radius, padding: 3 }, style ?? {}]}>{innen}</View>;
}

/** Kinder nebeneinander, gleich breit, oder nach `anteile`. */
export function Reihe({ children, abstand = 12, anteile, style, wrap = true }: { children: ReactNode; abstand?: number; anteile?: number[]; style?: Stilblatt; wrap?: boolean }) {
  const liste = Children.toArray(children);
  return (
    <View wrap={wrap} style={[{ flexDirection: "row", alignItems: "stretch" }, style ?? {}]}>
      {liste.map((kind, i) => (
        <View key={i} style={{ flexGrow: anteile?.[i] ?? 1, flexBasis: 0, marginLeft: i ? abstand : 0, flexDirection: "column" }}>{kind}</View>
      ))}
    </View>
  );
}

/** Liste in Zeilen zu `spalten` Stück; jede Zeile bricht nicht. */
export function Raster<T>({ liste, spalten, abstand = 10, zeilenAbstand, render }: { liste: T[]; spalten: number; abstand?: number; zeilenAbstand?: number; render: (x: T, i: number) => ReactNode }) {
  const zeilen: T[][] = [];
  for (let i = 0; i < liste.length; i += spalten) zeilen.push(liste.slice(i, i + spalten));
  return (
    <View>
      {zeilen.map((z, zi) => (
        <View key={zi} wrap={false} style={{ flexDirection: "row", marginTop: zi ? zeilenAbstand ?? abstand : 0 }}>
          {Array.from({ length: spalten }, (_, i) => (
            <View key={i} style={{ flexGrow: 1, flexBasis: 0, marginLeft: i ? abstand : 0, flexDirection: "column" }}>{z[i] !== undefined ? render(z[i], zi * spalten + i) : null}</View>
          ))}
        </View>
      ))}
    </View>
  );
}

/**
 * Liste auf `spalten` Säulen verteilt, jeweils in die bisher kürzeste, nach
 * `gewicht` (etwa Zeilenzahl). Für ungleich lange Blöcke wie die Orte der
 * Umgebung: Ein Zeilenraster ließe dort große Lücken.
 */
export function Saeulen<T>({ liste, spalten, abstand = 14, gewicht, render }: { liste: T[]; spalten: number; abstand?: number; gewicht: (x: T) => number; render: (x: T, i: number) => ReactNode }) {
  const saeulen: Array<Array<{ x: T; i: number }>> = Array.from({ length: spalten }, () => []);
  const hoehe = new Array(spalten).fill(0);
  liste.forEach((x, i) => {
    const ziel = hoehe.indexOf(Math.min(...hoehe));
    saeulen[ziel].push({ x, i });
    hoehe[ziel] += gewicht(x);
  });
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
      {saeulen.map((saeule, si) => (
        <View key={si} style={{ flexGrow: 1, flexBasis: 0, marginLeft: si ? abstand : 0 }}>
          {saeule.map(({ x, i }, k) => <View key={i} wrap={false} style={{ marginTop: k ? abstand : 0 }}>{render(x, i)}</View>)}
        </View>
      ))}
    </View>
  );
}

/** Gewicht einer Umgebungsgruppe für `Saeulen`: Zeilen plus Kopf. */
export const ortsGewicht = (g: NonNullable<DruckDaten["mikrolage"]>["gruppen"][number]) => 2 + g.teile.reduce((n, t) => n + t.orte.length + (t.titel ? 1.3 : 0), 0);

/**
 * Das feine Karo der Haus-PDFs auf dunklen Flächen (Christian, 01.10.2026).
 *
 * Werte wie auf dem Deckblatt aller Haus-PDFs (`addCoverPage` in
 * `pdfBranding.ts`): 16 mm Raster, weiße Linien 0,2 mm, höchstens 10 Prozent
 * Deckkraft, am dichtesten um einen Mittelpunkt links der Mitte und nach außen
 * auslaufend. Wie dort in zehn Stufen aus 8 mm langen Teilstücken, hier je
 * Stufe ein Pfad. Liegt als erstes Kind hinter dem Inhalt.
 */
const MM = 72 / 25.4;
export const KARO = { abstand: 16 * MM, stueck: 8 * MM, linie: 0.2 * MM, deckkraft: 0.1, stufen: 10 } as const;

export function karoPfade(breite: number, hoehe: number): Array<{ d: string; deckkraft: number }> {
  const kx = breite * 0.42, ky = hoehe * 0.5, rx = breite * 0.66, ry = hoehe * 0.48;
  const staerke = (x: number, y: number) => {
    const d = Math.hypot((x - kx) / rx, (y - ky) / ry);
    return d >= 1 ? 0 : Math.pow(1 - d, 1.5);
  };
  const eimer: string[][] = Array.from({ length: KARO.stufen }, () => []);
  const stueck = (x1: number, y1: number, x2: number, y2: number) => {
    const st = staerke((x1 + x2) / 2, (y1 + y2) / 2);
    if (st <= 0.02) return;
    eimer[Math.min(KARO.stufen - 1, Math.floor(st * KARO.stufen))].push(`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  };
  for (let x = 0; x <= breite; x += KARO.abstand) for (let y = 0; y < hoehe; y += KARO.stueck) stueck(x, y, x, Math.min(y + KARO.stueck, hoehe));
  for (let y = 0; y <= hoehe; y += KARO.abstand) for (let x = 0; x < breite; x += KARO.stueck) stueck(x, y, Math.min(x + KARO.stueck, breite), y);
  return eimer.flatMap((teile, stufe) => (teile.length ? [{ d: teile.join(""), deckkraft: KARO.deckkraft * ((stufe + 0.5) / KARO.stufen) }] : []));
}

export function Karo({ breite, hoehe }: { breite: number; hoehe: number }) {
  return (
    <Svg width={breite} height={hoehe} style={{ position: "absolute", left: 0, top: 0 }}>
      {karoPfade(breite, hoehe).map((p, i) => <Path key={i} d={p.d} stroke="#FFFFFF" strokeWidth={KARO.linie} strokeOpacity={p.deckkraft} fill="none" />)}
    </Svg>
  );
}

/* ── Bilder ─────────────────────────────────────────────────────────── */

export function Foto({ bild, hoehe, breite, radius = 0, style, enthalten = false }: { bild: DruckBild; hoehe: number; breite?: number | string; radius?: number; style?: Stilblatt; enthalten?: boolean }) {
  return (
    <View style={[{ height: hoehe, width: breite ?? "100%", borderRadius: radius, overflow: "hidden" }, style ?? {}]}>
      <Image src={bild.src} style={{ width: "100%", height: "100%", objectFit: enthalten ? "contain" : "cover" }} />
    </View>
  );
}

export function Logo({ bild, hoehe }: { bild?: DruckBild | null; hoehe: number }) {
  if (!bild) return <Text style={{ fontSize: hoehe * 0.8, fontWeight: 700 }}>MOREImmo</Text>;
  return <Image src={bild.src} style={{ height: hoehe, width: (hoehe * bild.breite) / bild.hoehe }} />;
}

/* ── Werte und Tabellen ─────────────────────────────────────────────── */

export function Werte({ s, zeilen, groesse = 8.6, linie = true }: { s: Stil; zeilen: Zeile[]; groesse?: number; linie?: boolean }) {
  return (
    <View>
      {zeilen.map((z, i) => (
        <View key={i} wrap={false} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingVertical: 4.2, borderTopWidth: linie && i > 0 ? 0.5 : 0, borderTopColor: z.fett ? s.tinte : s.linie }}>
          <View style={{ flexShrink: 1, paddingRight: 10 }}>
            <Text style={{ fontSize: groesse, color: z.fett ? s.tinte : s.text, fontWeight: z.fett ? 700 : 400, lineHeight: 1.35 }}>{z.label}</Text>
            {z.unter ? <Text style={{ fontSize: groesse - 1.8, color: s.leise, marginTop: 1 }}>{z.unter}</Text> : null}
          </View>
          <Text style={{ fontSize: groesse, color: s.tinte, fontWeight: z.fett ? 700 : 400, textAlign: "right" }}>{z.wert}</Text>
        </View>
      ))}
    </View>
  );
}

export function TabelleBlock({ s, t, groesse = 7.6, kopfGrund }: { s: Stil; t: Tabelle; groesse?: number; kopfGrund?: string }) {
  const summe = t.spalten.reduce((a, b) => a + b.anteil, 0);
  const zelle = (inhalt: string, i: number, kopf: boolean) => (
    <Text key={i} style={{ width: `${(t.spalten[i].anteil / summe) * 100}%`, textAlign: t.spalten[i].rechts ? "right" : "left", paddingHorizontal: 4, fontSize: kopf ? groesse - 0.9 : groesse, fontWeight: kopf ? 700 : 400, color: kopf ? s.leise : s.text, textTransform: kopf ? "uppercase" : "none", letterSpacing: kopf ? 0.5 : 0, lineHeight: 1.35 }}>{inhalt}</Text>
  );
  return (
    <View>
      <View fixed={false} style={{ flexDirection: "row", paddingVertical: 4.5, backgroundColor: kopfGrund ?? "transparent", borderBottomWidth: 0.8, borderBottomColor: s.tinte }}>
        {t.spalten.map((sp, i) => zelle(sp.titel, i, true))}
      </View>
      {t.zeilen.map((z, zi) => (
        <View key={zi} wrap={false} style={{ flexDirection: "row", paddingVertical: 3.8, borderBottomWidth: 0.5, borderBottomColor: s.linie }}>
          {z.map((w, i) => zelle(w, i, false))}
        </View>
      ))}
    </View>
  );
}

/** Große Zahl mit Beschriftung. */
export function Zahl({ s, z, groesse = 17, farbe, labelOben = false }: { s: Stil; z: Zeile; groesse?: number; farbe?: string; labelOben?: boolean }) {
  const label = <Text style={{ fontSize: 7, color: s.leise, marginTop: labelOben ? 0 : 3, marginBottom: labelOben ? 3 : 0, lineHeight: 1.35 }}>{z.label}{z.unter ? ` · ${z.unter}` : ""}</Text>;
  return (
    <View wrap={false}>
      {labelOben ? label : null}
      <Text style={{ fontSize: groesse, fontWeight: 700, color: farbe ?? s.zahl, letterSpacing: -0.3 }}>{z.wert}</Text>
      {labelOben ? null : label}
    </View>
  );
}

export function Chips({ s, chips, grund, schrift, rand }: { s: Stil; chips: string[]; grund?: string; schrift?: string; rand?: string }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {chips.map((c) => (
        <Text key={c} style={{ fontSize: 7, color: schrift ?? s.akzent, backgroundColor: grund ?? s.akzentWeich, borderWidth: 0.5, borderColor: rand ?? s.akzentWeich, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3, marginRight: 4, marginBottom: 4 }}>{c}</Text>
      ))}
    </View>
  );
}

/* ── Inhaltsbausteine ───────────────────────────────────────────────── */

/** Punkte mit Marke: Nummer im Kreis oder (ohne Nummer) ein Balken. */
export function Argumente({ s, punkte, nummeriert = true, spalten = 1, markeFarbe }: { s: Stil; punkte: Array<{ titel: string; text: string }>; nummeriert?: boolean; spalten?: number; markeFarbe?: string }) {
  return (
    <Raster liste={punkte} spalten={spalten} abstand={16} zeilenAbstand={11} render={(a, i) => (
      <View wrap={false} style={{ flexDirection: "row" }}>
        {nummeriert
          ? <Text style={{ width: 20, fontSize: 13, fontWeight: 700, color: markeFarbe ?? s.akzent, lineHeight: 1.1 }}>{i + 1}</Text>
          : <View style={{ width: 2, backgroundColor: markeFarbe ?? s.akzent, marginRight: 10, borderRadius: 1 }} />}
        <View style={{ flexShrink: 1, flexGrow: 1 }}>
          <Text style={{ fontSize: 9, fontWeight: 700, color: s.tinte, marginBottom: 2.5, lineHeight: 1.3 }}>{a.titel}</Text>
          {a.text ? <Text style={{ fontSize: 8.2, color: s.text, lineHeight: 1.5 }}>{a.text}</Text> : null}
        </View>
      </View>
    )} />
  );
}

export function Arbeitgeber({ s, liste, spalten = 2 }: { s: Stil; liste: Array<{ name: string; unter: string }>; spalten?: number }) {
  return (
    <Raster liste={liste} spalten={spalten} abstand={14} zeilenAbstand={7} render={(a, i) => (
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Text style={{ width: 16, fontSize: 7.5, fontWeight: 700, color: s.leise, marginTop: 1 }}>{String(i + 1).padStart(2, "0")}</Text>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: 8.4, fontWeight: 700, color: s.tinte }}>{a.name}</Text>
          {a.unter ? <Text style={{ fontSize: 7, color: s.leise, marginTop: 1 }}>{a.unter}</Text> : null}
        </View>
      </View>
    )} />
  );
}

export function EnergieBand({ s, e, radius = 2 }: { s: Stil; e: DruckDaten["objektdaten"]["energie"]; radius?: number }) {
  return (
    <View wrap={false}>
      <Text style={{ fontSize: 7.4, color: s.leise, marginBottom: 8 }}>{e.kopf}</Text>
      <View style={{ flexDirection: "row", height: 18 }}>
        {e.stufen.map((st, i) => (
          <View key={st.klasse} style={{ flexGrow: 1, flexBasis: 0, marginLeft: i ? 1.5 : 0, backgroundColor: st.farbe, borderRadius: radius, justifyContent: "center", alignItems: "center", borderWidth: st.aktiv ? 1.4 : 0, borderColor: s.tinte, transform: st.aktiv ? "scaleY(1.25)" : undefined }}>
            <Text style={{ fontSize: st.aktiv ? 8 : 6.6, fontWeight: 700, color: "#ffffff" }}>{st.klasse}</Text>
          </View>
        ))}
      </View>
      <View style={{ height: 22, position: "relative", marginTop: 3 }}>
        {e.positionProzent !== undefined && e.kennwert ? (
          <View style={{ position: "absolute", left: `${Math.min(88, Math.max(0, e.positionProzent - 6))}%`, top: 0, width: "16%", alignItems: e.positionProzent > 85 ? "flex-end" : e.positionProzent < 8 ? "flex-start" : "center" }}>
            <Svg width={7} height={5}><Path d="M3.5 0 L7 5 L0 5 Z" fill={s.tinte} /></Svg>
            <Text style={{ fontSize: 7, fontWeight: 700, color: s.tinte }}>{e.kennwert}</Text>
          </View>
        ) : <Text style={{ fontSize: 7, color: s.leise }}>{e.ohneKennwert}</Text>}
      </View>
      {e.hinweis ? <Notiz s={s}>{e.hinweis}</Notiz> : null}
    </View>
  );
}

/** Kartenbild mit Legende. */
export function KartenBlock({ s, m, hoehe, radius = 0 }: { s: Stil; m: NonNullable<DruckDaten["mikrolage"]>; hoehe: number; radius?: number }) {
  if (!m.karte) return m.genauigkeit ? <Notiz s={s}>{m.genauigkeit}</Notiz> : null;
  return (
    <View wrap={false}>
      <Foto bild={m.karte} hoehe={hoehe} radius={radius} />
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 7 }}>
        <View style={{ flexDirection: "row", alignItems: "center", marginRight: 11, marginBottom: 3 }}>
          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#E5484D", marginRight: 4 }} />
          <Text style={{ fontSize: 6.8, color: s.text, fontWeight: 700 }}>{m.objektLabel}</Text>
        </View>
        {m.legende.map((l) => (
          <View key={l.titel} style={{ flexDirection: "row", alignItems: "center", marginRight: 11, marginBottom: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: l.farbe, marginRight: 4 }} />
            <Text style={{ fontSize: 6.8, color: s.text }}>{l.titel}</Text>
          </View>
        ))}
      </View>
      {m.genauigkeit ? <Notiz s={s}>{m.genauigkeit}</Notiz> : null}
    </View>
  );
}

export function OrtsGruppe({ s, g }: { s: Stil; g: NonNullable<DruckDaten["mikrolage"]>["gruppen"][number] }) {
  return (
    <View wrap={false}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 5 }}>
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: g.farbe, marginRight: 5 }} />
        <Text style={{ fontSize: 8.4, fontWeight: 700, color: s.tinte }}>{g.titel}</Text>
      </View>
      {g.teile.map((t, ti) => (
        <View key={ti} wrap={false} style={{ marginTop: ti ? 4 : 0 }}>
          {t.titel ? <Text style={{ fontSize: 6.4, fontWeight: 700, color: s.leise, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 2 }}>{t.titel}</Text> : null}
          {t.orte.map((o, oi) => (
            <View key={oi} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.6, borderTopWidth: oi ? 0.4 : 0, borderTopColor: s.linie }}>
              <Text style={{ fontSize: 7.2, color: s.text, flexShrink: 1, paddingRight: 6 }}>{o.name}</Text>
              <Text style={{ fontSize: 7.2, color: s.leise }}>{o.weg}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

export function GrundrissBlock({ s, g, hoehe, radius = 0, rahmen }: { s: Stil; g: NonNullable<DruckDaten["grundriss"]>; hoehe: number; radius?: number; rahmen?: string }) {
  const mitBild = g.plaene.filter((p) => p.bild);
  if (!mitBild.length) return <Absatz s={s}>{g.dateiText}</Absatz>;
  const spalten = mitBild.length === 1 ? 1 : mitBild.length <= 4 ? 2 : 3;
  const zellH = mitBild.length === 1 ? hoehe : Math.max(110, (hoehe - (Math.ceil(mitBild.length / spalten) - 1) * 10) / Math.ceil(mitBild.length / spalten));
  return (
    <View>
      {g.ersatz ? <Notiz s={s} style={{ marginTop: 0, marginBottom: 8 }}>{g.ersatz}</Notiz> : null}
      <Raster liste={mitBild} spalten={spalten} render={(p) => (
        <View wrap={false} style={{ borderWidth: rahmen ? 0.6 : 0, borderColor: rahmen ?? "transparent", borderRadius: radius, padding: rahmen ? 10 : 0, backgroundColor: "#ffffff" }}>
          <Foto bild={p.bild as DruckBild} hoehe={zellH - (mitBild.length > 1 ? 14 : 0)} enthalten />
          {mitBild.length > 1 ? <Text style={{ fontSize: 7, color: s.leise, textAlign: "center", marginTop: 4 }}>{p.name}</Text> : null}
        </View>
      )} />
      <Notiz s={s}>{g.hinweis}</Notiz>
    </View>
  );
}

/** Balkendiagramm Vermögensaufbau: je Horizont Immobilienwert, Restschuld, Vermögen. */
export function VermoegenDiagramm({ s, v, breite, hoehe, farben }: { s: Stil; v: NonNullable<NonNullable<DruckDaten["finanzen"]>["vermoegen"]>; breite: number; hoehe: number; farben: [string, string, string] }) {
  const links = 40, unten = 18, oben = 6;
  const diagH = hoehe - unten - oben;
  const max = Math.max(1, ...v.balken.flatMap((b) => b.werte));
  const roh = max / 4;
  const zehner = Math.pow(10, Math.floor(Math.log10(roh)));
  const schritt = [1, 2, 5, 10].map((f) => f * zehner).find((x) => x >= roh) ?? zehner * 10;
  const achseMax = Math.ceil(max / schritt) * schritt;
  const y = (w: number) => oben + diagH - (w / achseMax) * diagH;
  const gruppeB = (breite - links) / v.balken.length;
  const balkenB = Math.min(18, (gruppeB - 16) / 3);
  const linien: number[] = [];
  for (let w = 0; w <= achseMax + 0.001; w += schritt) linien.push(w);
  return (
    <View wrap={false}>
      <Svg width={breite} height={hoehe}>
        {linien.map((w) => (
          <Line key={`l${w}`} x1={links} x2={breite} y1={y(w)} y2={y(w)} stroke={s.linie} strokeWidth={0.5} />
        ))}
        {linien.map((w) => (
          <SvgText key={`t${w}`} x={links - 5} y={y(w) + 2.2} style={{ fontSize: 6, fill: s.leise, fontFamily: SCHRIFT }} textAnchor="end">{v.achse(w)}</SvgText>
        ))}
        {v.balken.map((b, gi) => {
          const gx = links + gi * gruppeB + (gruppeB - 3 * balkenB - 6) / 2;
          return b.werte.map((w, bi) => (
            <Rect key={`${gi}-${bi}`} x={gx + bi * (balkenB + 3)} y={y(w)} width={balkenB} height={Math.max(0.5, oben + diagH - y(w))} fill={farben[bi]} rx={1.5} ry={1.5} />
          ));
        })}
        {v.balken.map((b, gi) => (
          <SvgText key={`x${gi}`} x={links + gi * gruppeB + gruppeB / 2} y={hoehe - 5} style={{ fontSize: 6.6, fill: s.tinte, fontFamily: SCHRIFT, fontWeight: 700 }} textAnchor="middle">{b.label}</SvgText>
        ))}
        <Line x1={links} x2={breite} y1={oben + diagH} y2={oben + diagH} stroke={s.tinte} strokeWidth={0.6} />
      </Svg>
      <View style={{ flexDirection: "row", marginTop: 4, marginLeft: links }}>
        {v.legende.map((l, i) => (
          <View key={l} style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
            <View style={{ width: 7, height: 7, borderRadius: 1.5, backgroundColor: farben[i], marginRight: 4 }} />
            <Text style={{ fontSize: 6.8, color: s.text }}>{l}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export function Leistungen({ s, liste, spalten = 2 }: { s: Stil; liste: string[]; spalten?: number }) {
  return (
    <Raster liste={liste} spalten={spalten} abstand={14} zeilenAbstand={5} render={(l) => (
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Svg width={10} height={10} style={{ marginRight: 6, marginTop: 1 }}>
          <Circle cx={5} cy={5} r={5} fill={s.akzentWeich} />
          <Path d="M2.8 5.2 L4.4 6.7 L7.3 3.6" stroke={s.akzent} strokeWidth={1} fill="none" />
        </Svg>
        <Text style={{ fontSize: 8.2, color: s.text, lineHeight: 1.45, flexShrink: 1 }}>{l}</Text>
      </View>
    )} />
  );
}

/**
 * Nächste Schritte und Zeitplan (01.10.2026): ein senkrechter Zeitstrahl. Je
 * Station Titel, rechts die Zeitangabe als Plakette (Zahlungen kräftiger),
 * darunter die Erklärung. Vorneweg die erledigten Schritte, grün abgehakt.
 * Keine Station bricht über eine Seite.
 */
export function Zeitplan({ s, z }: { s: Stil; z: DruckDaten["zeitplan"] }) {
  const gruen = "#1F8A4C";
  const gruenHell = "#EAF6EF";
  const zeilen = [
    ...z.erledigt.map((e) => ({ key: `e-${e.titel}`, nr: null as number | null, titel: e.titel, text: e.text, frist: undefined as string | undefined, zahlung: false })),
    ...z.stationen.map((st) => ({ key: `s-${st.nr}`, nr: st.nr as number | null, titel: st.titel, text: st.text, frist: st.frist, zahlung: st.zahlung })),
  ];
  const plakette = (frist: string, zahlung: boolean) => (
    <Text style={{ fontSize: 7.4, fontWeight: 700, color: zahlung ? s.zahlung.schrift : s.text, backgroundColor: zahlung ? s.zahlung.grund : s.flaeche, borderWidth: 0.6, borderColor: zahlung ? s.zahlung.rand : s.linie, borderRadius: 9, paddingHorizontal: 8, paddingVertical: 2.5, marginLeft: 10 }}>{frist}</Text>
  );
  return (
    <View>
      {zeilen.map((st, i) => {
        const erledigt = st.nr === null;
        const letzte = i === zeilen.length - 1;
        return (
          <View key={st.key} wrap={false} style={{ flexDirection: "row" }}>
            <View style={{ width: 18, alignItems: "flex-end", paddingTop: 1 }}>
              {erledigt
                ? <Svg width={10} height={10}><Path d="M1.6 5.2 L4 7.6 L8.6 2.6" stroke={gruen} strokeWidth={1.5} fill="none" /></Svg>
                : <Text style={{ fontSize: 9.4, fontWeight: 700, color: s.akzent }}>{String(st.nr)}</Text>}
            </View>
            <View style={{ width: 22, alignItems: "center" }}>
              <View style={{ width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.4, borderColor: erledigt ? gruen : s.akzent, backgroundColor: erledigt ? gruen : "#ffffff", marginTop: 3 }} />
              {letzte ? null : <View style={{ width: 1, flexGrow: 1, backgroundColor: s.linie, marginTop: 2 }} />}
            </View>
            <View style={{ flexGrow: 1, flexShrink: 1, paddingBottom: letzte ? 2 : 18 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: erledigt ? "flex-start" : "space-between" }}>
                <Text style={{ fontSize: 10.6, fontWeight: 700, color: erledigt ? s.leise : s.tinte, flexShrink: 1, lineHeight: 1.35 }}>{st.titel}</Text>
                {erledigt
                  ? <Text style={{ fontSize: 7, fontWeight: 700, color: gruen, backgroundColor: gruenHell, borderRadius: 9, paddingHorizontal: 7, paddingVertical: 2, marginLeft: 8 }}>{z.erledigtLabel}</Text>
                  : st.frist ? plakette(st.frist, st.zahlung) : null}
              </View>
              {st.text ? <Text style={{ fontSize: 8.8, color: erledigt ? s.leise : s.text, lineHeight: 1.6, marginTop: 5, maxWidth: 400 }}>{st.text}</Text> : null}
            </View>
          </View>
        );
      })}
      <Notiz s={s} style={{ marginTop: 14, marginLeft: 40 }}>{z.notiz}</Notiz>
    </View>
  );
}

export function ChanceRisiko({ s, t, c, chanceFarbe, risikoFarbe }: { s: Stil; t: DruckDaten["chancen"]["themen"][number]; c: DruckDaten["chancen"]; chanceFarbe?: string; risikoFarbe?: string }) {
  const seite = (label: string, text: string, farbe: string, grund: string) => (
    <View style={{ flexGrow: 1, flexBasis: 0, backgroundColor: grund, borderRadius: 4, padding: 8, borderLeftWidth: 2, borderLeftColor: farbe }}>
      <Text style={{ fontSize: 6.2, fontWeight: 700, color: farbe, letterSpacing: 1, textTransform: "uppercase", marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 7.6, color: s.text, lineHeight: 1.45 }}>{text}</Text>
    </View>
  );
  return (
    <View wrap={false}>
      <Text style={{ fontSize: 9, fontWeight: 700, color: s.tinte, marginBottom: 5 }}>{t.titel}</Text>
      <View style={{ flexDirection: "row" }}>
        {seite(c.chance, t.chance, chanceFarbe ?? s.akzent, s.akzentWeich)}
        <View style={{ width: 6 }} />
        {seite(c.risiko, t.risiko, risikoFarbe ?? s.tinte, s.flaeche)}
      </View>
    </View>
  );
}

export function Hinweise({ s, r, spalten = 1 }: { s: Stil; r: DruckDaten["rechtliches"]; spalten?: number }) {
  return (
    <View>
      {r.entwurf ? (
        <View wrap={false} style={{ backgroundColor: s.flaeche, padding: 8, borderRadius: 3, marginBottom: 10 }}>
          <Text style={{ fontSize: 8, fontWeight: 700, color: s.tinte }}>{r.entwurf.titel}</Text>
          <Text style={{ fontSize: 7.4, color: s.text, marginTop: 2, lineHeight: 1.45 }}>{r.entwurf.text}</Text>
        </View>
      ) : null}
      <View style={spalten > 1 ? { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" } : {}}>
        {r.hinweise.map((h) => (
          <View key={h.titel} style={{ width: spalten > 1 ? `${100 / spalten - 2}%` : "100%", marginBottom: 9 }}>
            <Text minPresenceAhead={24} style={{ fontSize: 7.8, fontWeight: 700, color: s.tinte, marginBottom: 2 }}>{h.titel}</Text>
            <Text orphans={3} widows={3} style={{ fontSize: 7.1, color: s.text, lineHeight: 1.5 }}>{h.text}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Kontaktblock: Person mit Bild oder Initialen und den Wegen zu ihr. */
export function Person({ s, k, dunkel = false, gross = false }: { s: Stil; k: DruckDaten["kontakt"]; dunkel?: boolean; gross?: boolean }) {
  const p = k.person;
  const d = gross ? 54 : 40;
  const vorne = dunkel ? "#ffffff" : s.tinte;
  const hinten = dunkel ? "#C9D3E0" : s.leise;
  return (
    <View wrap={false}>
      <Kicker s={s} farbe={hinten}>{k.personTitel}</Kicker>
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 9 }}>
        {p.bild
          ? <Foto bild={p.bild} hoehe={d} breite={d} radius={d / 2} />
          : <View style={{ width: d, height: d, borderRadius: d / 2, backgroundColor: s.akzent, alignItems: "center", justifyContent: "center" }}><Text style={{ fontSize: d * 0.32, fontWeight: 700, color: "#ffffff" }}>{p.initialen}</Text></View>}
        <View style={{ marginLeft: 12 }}>
          <Text style={{ fontSize: gross ? 15 : 12, fontWeight: 700, color: vorne }}>{p.name}</Text>
          <Text style={{ fontSize: 7.6, color: hinten, marginTop: 2 }}>{p.rolle}</Text>
        </View>
      </View>
      <View style={{ marginTop: 10 }}>
        {p.zeilen.map((z) => <Text key={z} style={{ fontSize: 8.4, color: vorne, marginTop: 3 }}>{z}</Text>)}
      </View>
    </View>
  );
}

/** Seitenzahl als Text, gezählt ohne Deckblatt. */
export function seitenzahl(pageNumber: number, totalPages: number, w: DruckDaten["w"], form: "kurz" | "lang" = "kurz"): string {
  const nr = String(pageNumber).padStart(2, "0");
  return form === "kurz" ? nr : `${w.seite} ${pageNumber} / ${totalPages}`;
}

/** Abschnitt nach Kennung, falls es ihn in diesem Exposé gibt. */
export function abschnitt(d: DruckDaten, id: DruckDaten["abschnitte"][number]["id"]) {
  return d.abschnitte.find((a) => a.id === id);
}

/** Fotos reihum verwenden, damit auch bei wenigen Fotos jede Bildfläche gefüllt ist. */
export function fotoNr(d: DruckDaten, i: number): DruckBild | undefined {
  return d.fotos.length ? d.fotos[i % d.fotos.length] : undefined;
}
