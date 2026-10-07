import type { ReactNode } from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { DruckDaten } from "./daten";
import {
  Absatz, Arbeitgeber, Karo, Argumente, ChanceRisiko, Chips, EnergieBand, Foto, GrundrissBlock, Hinweise, Karte, KartenBlock, Kicker, Leistungen, Logo, Notiz,
  OrtsGruppe, Person, Saeulen, ortsGewicht, Raster, Reihe, SCHRIFT, TabelleBlock, Titel, VermoegenDiagramm, Werte, Zahl, Zeitplan, abschnitt, fotoNr, type Stil,
} from "./baukasten";

/**
 * Das Exposé als PDF, Design H3 „Nachtblau“, A4 hoch (gewählt von
 * Christian am 01.10.2026 aus sechs Entwürfen).
 *
 * Nah am Online-Exposé: Deckblatt in Nachtblau mit eingesetztem Foto und
 * Kennzahlen auf dunklen Kacheln. Innen ein heller, leicht kühler Grund, die
 * Inhalte auf weißen Karten mit Doppelrand (Karte im Tablett). Jedes Kapitel
 * öffnet mit einem dunklen Band, Überschrift in Versalien wie auf der Seite.
 * Auf allen dunklen Flächen liegt das feine Karo der Haus-PDFs (`Karo`).
 *
 * „Nächste Schritte und Zeitplan“ ist seit dem 01.10.2026 ein Kapitel wie
 * online: Zeitstrahl mit Plakette und Erklärung je Station.
 */

const NACHT = "#0F1621";
const HELLBLAU = "#88CFFF";
const S: Stil = {
  tinte: NACHT,
  text: "#33414F",
  leise: "#6F7D8E",
  linie: "#E4EAF0",
  flaeche: "#F3F6F9",
  akzent: "#087AC7",
  akzentWeich: "#EDF7FD",
  zahl: NACHT,
  karte: { grund: "#ffffff", radius: 14, polster: 16, tablett: "#E7EDF3" },
  zahlung: { grund: "#E6F2FB", schrift: "#04669F", rand: "#9CCBEB" },
};
const GRUND = "#F5F7FA";
const RAND = 38;
const SEITE = { breite: 595.28, hoehe: 841.89 };
const BREITE = SEITE.breite - 2 * RAND;
const BAND_HOEHE = 84;
const KONTAKT_HOEHE = SEITE.hoehe - 58 - 54 - 4;
/** Höhe eines Fotos im Raster der Einblicke: halbe Breite (Abstand 8) im Verhältnis 3:2. */
const EINBLICK_HOEHE = Math.round((BREITE - 8) / 2 / 1.5);

function Kapitel({ d, id, children, neueSeite = true }: { d: DruckDaten; id: DruckDaten["abschnitte"][number]["id"]; children: ReactNode; neueSeite?: boolean }) {
  const a = abschnitt(d, id);
  if (!a) return null;
  return (
    <View break={neueSeite} style={{ marginTop: neueSeite ? 0 : 18 }}>
      <View wrap={false} minPresenceAhead={150} style={{ backgroundColor: NACHT, borderRadius: 16, minHeight: BAND_HOEHE, paddingVertical: 20, paddingHorizontal: 22, marginBottom: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", overflow: "hidden" }}>
        <Karo breite={BREITE} hoehe={BAND_HOEHE} />
        <View style={{ flexShrink: 1 }}>
          <Kicker s={S} farbe={HELLBLAU}>{a.claim}</Kicker>
          <Text style={{ fontSize: 20, fontWeight: 700, color: "#ffffff", letterSpacing: 0.4, textTransform: "uppercase", marginTop: 6 }}>{a.titel}</Text>
        </View>
        <Text style={{ fontSize: 34, fontWeight: 700, color: "#24344A", letterSpacing: -1, lineHeight: 1 }}>{a.nr}</Text>
      </View>
      {children}
    </View>
  );
}

function K({ children, style, wrap }: { children: ReactNode; style?: object; wrap?: boolean }) {
  return <Karte s={S} style={{ marginBottom: 10, ...(style ?? {}) }} wrap={wrap}>{children}</Karte>;
}

function Deckblatt({ d }: { d: DruckDaten }) {
  const bild = fotoNr(d, 0);
  return (
    <Page size="A4" style={{ fontFamily: SCHRIFT, backgroundColor: NACHT, padding: RAND }}>
      {/* Als feste Ebene: Ein seitenhohes Element im Fluss passte nicht in den Satzspiegel und schob eine Leerseite ein. */}
      <View fixed style={{ position: "absolute", left: 0, top: 0, width: SEITE.breite, height: SEITE.hoehe }} render={() => <Karo breite={SEITE.breite} hoehe={SEITE.hoehe} />} />
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <Logo bild={d.logoHell ?? d.logo} hoehe={18} />
        <Text style={{ fontSize: 6.8, color: "#8FA1B6", letterSpacing: 1.6, textTransform: "uppercase" }}>{d.meta.kennung}</Text>
      </View>
      {bild ? <Foto bild={bild} hoehe={430} radius={20} /> : <View style={{ height: 430, borderRadius: 20, backgroundColor: "#1A2534" }} />}
      <View style={{ marginTop: 26 }}>
        <Kicker s={S} farbe={HELLBLAU}>{d.kopf.eyebrow}</Kicker>
        <Text style={{ fontSize: 27, fontWeight: 700, color: "#ffffff", letterSpacing: -0.5, lineHeight: 1.18, marginTop: 8 }}>{d.kopf.titel}</Text>
        <View style={{ width: 36, height: 2.4, backgroundColor: HELLBLAU, borderRadius: 2, marginTop: 12 }} />
        <Text style={{ fontSize: 8.6, color: "#A9B8CA", marginTop: 10 }}>{d.kopf.ortszeile.join("   ·   ")}</Text>
      </View>
      <View style={{ flexDirection: "row", marginTop: 22 }}>
        {d.kennzahlen.slice(0, 4).map((z, i) => (
          <View key={z.label} style={{ flexGrow: 1, flexBasis: 0, marginLeft: i ? 8 : 0, backgroundColor: "#182231", borderWidth: 0.6, borderColor: "#2A3A4F", borderRadius: 12, padding: 11 }}>
            <Text style={{ fontSize: 13.5, fontWeight: 700, color: "#ffffff" }}>{z.wert}</Text>
            <Text style={{ fontSize: 6.6, color: "#8FA1B6", marginTop: 3 }}>{z.label}</Text>
          </View>
        ))}
      </View>
      <Text style={{ position: "absolute", left: RAND, right: RAND, bottom: 24, fontSize: 6.4, color: "#6F8197" }}>{`${d.meta.deckblattFuss}${d.meta.kunde ? `   ·   ${d.w.fuer} ${d.meta.kunde}` : ""}`}</Text>
    </Page>
  );
}

export function H3Nachtblau({ d }: { d: DruckDaten }) {
  const f = d.finanzen;
  const halb = <T,>(l: T[]): [T[], T[]] => [l.slice(0, Math.ceil(l.length / 2)), l.slice(Math.ceil(l.length / 2))];
  return (
    <Document title={d.meta.dokumentTitel} author="MOREImmo" language={d.sprache}>
      <Deckblatt d={d} />
      <Page size="A4" style={{ fontFamily: SCHRIFT, backgroundColor: GRUND, paddingTop: 58, paddingBottom: 54, paddingHorizontal: RAND, color: S.text }}>
        <View fixed style={{ position: "absolute", top: 22, left: RAND, right: RAND, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Logo bild={d.logo} hoehe={10} />
          <Text style={{ fontSize: 6.6, color: S.leise }}>{`${d.kopf.kurz} · ${d.kopf.einheit}`}</Text>
        </View>
        <View fixed style={{ position: "absolute", bottom: 20, left: RAND, right: RAND, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontSize: 5.8, color: S.leise }}>{d.meta.fussLinks}</Text>
          <Text style={{ fontSize: 7, fontWeight: 700, color: "#ffffff", backgroundColor: NACHT, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2.5 }} render={({ pageNumber }) => String(pageNumber)} />
        </View>

        {/* Auftakt */}
        <K>
          <Kicker s={S}>{d.kopf.eyebrow}</Kicker>
          <Text style={{ fontSize: 16, fontWeight: 700, color: NACHT, marginTop: 5, marginBottom: 10 }}>{d.kopf.titel}</Text>
          <Raster liste={[...d.kennzahlen, ...d.ortFakten]} spalten={4} abstand={10} zeilenAbstand={12} render={(z) => <Zahl s={S} z={z} groesse={14} />} />
          {d.chips.length ? <View style={{ marginTop: 12, borderTopWidth: 0.5, borderTopColor: S.linie, paddingTop: 10 }}><Chips s={S} chips={d.chips} /></View> : null}
        </K>
        {d.beschreibung ? (
          <K wrap>
            <Absatz s={S} groesse={9.2} style={{ lineHeight: 1.65 }}>{d.beschreibung.text}</Absatz>
            {d.beschreibung.hinweis ? <Notiz s={S}>{d.beschreibung.hinweis}</Notiz> : null}
          </K>
        ) : null}
        {d.fotos.length > 1 ? (
          <Reihe abstand={8} wrap={false}>
            {[<Foto key="a" bild={fotoNr(d, 1)!} hoehe={190} radius={14} />, <Foto key="b" bild={fotoNr(d, 2)!} hoehe={190} radius={14} />]}
          </Reihe>
        ) : null}

        {d.standort ? (
          <Kapitel d={d} id="standort">
            {d.standort.kennzahlen.length ? (
              <K><Raster liste={d.standort.kennzahlen} spalten={4} abstand={10} render={(z) => <Zahl s={S} z={z} groesse={14} farbe={S.akzent} />} /></K>
            ) : <K><Absatz s={S}>{d.standort.leerSatz}</Absatz></K>}
            <K wrap>
              <Titel s={S}>{d.standort.argumenteTitel}</Titel>
              {d.standort.argumente.length ? <Argumente s={S} punkte={d.standort.argumente} /> : <Absatz s={S}>{d.standort.argumenteLeer}</Absatz>}
            </K>
            {d.standort.markt ? (
              <K wrap>
                <Titel s={S}>{d.standort.markt.titel}</Titel>
                <Argumente s={S} punkte={d.standort.markt.punkte} nummeriert={false} spalten={d.standort.markt.punkte.length === 3 ? 3 : 1} />
                <Notiz s={S}>{d.standort.markt.quelle}</Notiz>
              </K>
            ) : null}
            {d.standort.arbeitgeber.length ? <K><Titel s={S}>{d.standort.arbeitgeberTitel}</Titel><Arbeitgeber s={S} liste={d.standort.arbeitgeber} spalten={3} /></K> : null}
            {d.standort.hinweise.map((h, i) => <Notiz key={i} s={S}>{h}</Notiz>)}
            <Notiz s={S} style={{ marginTop: 0 }}>{d.standort.quelle}</Notiz>
          </Kapitel>
        ) : null}

        {d.mikrolage ? (
          <Kapitel d={d} id="mikrolage">
            <K>
              <Text style={{ fontSize: 8, color: S.leise, marginBottom: 8 }}>{d.mikrolage.vorspann}</Text>
              <KartenBlock s={S} m={d.mikrolage} hoehe={(BREITE - 38) * 0.46} radius={10} />
              {d.mikrolage.leerText ? <Absatz s={S}>{`${d.mikrolage.leerText.titel}. ${d.mikrolage.leerText.text}`}</Absatz> : null}
            </K>
            {d.mikrolage.gruppen.length ? (
              <Saeulen liste={d.mikrolage.gruppen} spalten={3} abstand={10} gewicht={ortsGewicht} render={(g) => <Karte s={S} wrap style={{ flexGrow: 1 }}><OrtsGruppe s={S} g={g} /></Karte>} />
            ) : null}
            {d.mikrolage.makroText ? <K style={{ marginTop: 10 }}><Titel s={S} groesse={9}>{d.mikrolage.makroTitel}</Titel><Absatz s={S} groesse={8}>{d.mikrolage.makroText}</Absatz></K> : null}
            {d.mikrolage.fussnote ? <Notiz s={S}>{d.mikrolage.fussnote}</Notiz> : null}
          </Kapitel>
        ) : null}

        <Kapitel d={d} id="objektdaten">
          <K>
            <Reihe abstand={20}>{halb(d.objektdaten.zeilen).map((z, i) => <Werte key={i} s={S} zeilen={z} />)}</Reihe>
          </K>
          <K>
            <Titel s={S}>{d.objektdaten.energie.titel}</Titel>
            <EnergieBand s={S} e={d.objektdaten.energie} radius={3} />
            {d.objektdaten.pflichtFehlen ? <Notiz s={S}>{`${d.objektdaten.pflichtFehlen.titel}. ${d.objektdaten.pflichtFehlen.text}`}</Notiz> : null}
          </K>
          <K>
            <Titel s={S}>{d.objektdaten.sanierungenTitel}</Titel>
            {d.objektdaten.sanierungen ? <TabelleBlock s={S} t={d.objektdaten.sanierungen} /> : <Absatz s={S} groesse={8.4}>{d.objektdaten.sanierungenText}</Absatz>}
            {d.objektdaten.gemeinschaft ? <Notiz s={S}>{d.objektdaten.gemeinschaft}</Notiz> : null}
          </K>
          {d.objektdaten.besonderheiten ? (
            <K wrap>
              <Titel s={S}>{d.objektdaten.besonderheiten.titel}</Titel>
              {d.objektdaten.besonderheiten.texte.map((t, i) => <Absatz key={i} s={S} groesse={8.4} style={{ marginBottom: 5 }}>{t}</Absatz>)}
              <Notiz s={S}>{d.objektdaten.besonderheiten.quelle}</Notiz>
            </K>
          ) : null}
          {d.objektdaten.merkmale ? (
            <K>
              <Titel s={S}>{d.objektdaten.merkmale.titel}</Titel>
              <Leistungen s={S} liste={d.objektdaten.merkmale.liste.map((m) => (m.wert ? `${m.bezeichnung}: ${m.wert}` : m.bezeichnung))} />
              <Notiz s={S}>{d.objektdaten.merkmale.quelle}</Notiz>
            </K>
          ) : null}
          {d.objektdaten.einheiten ? (
            <K wrap>
              <Titel s={S}>{d.objektdaten.einheiten.titel}</Titel>
              <TabelleBlock s={S} t={d.objektdaten.einheiten.tabelle} />
              {d.objektdaten.einheiten.hinweis ? <Notiz s={S}>{d.objektdaten.einheiten.hinweis}</Notiz> : null}
            </K>
          ) : null}
        </Kapitel>

        {d.grundriss ? (
          <Kapitel d={d} id="grundriss">
            <K><GrundrissBlock s={S} g={d.grundriss} hoehe={500} /></K>
          </Kapitel>
        ) : null}

        {f ? (
          <Kapitel d={d} id="wirtschaftlichkeit">
            <Text style={{ fontSize: 8.2, color: S.leise, lineHeight: 1.5, marginBottom: 10, paddingHorizontal: 4 }}>{f.vorspann}</Text>
            <Reihe abstand={8} wrap={false} style={{ marginBottom: 10 }}>
              {f.hoehepunkte.map((z, i) => (
                <View key={z.label} style={{ backgroundColor: i === 2 ? NACHT : "#ffffff", borderRadius: 14, padding: 14, borderWidth: i === 2 ? 0 : 0.6, borderColor: S.linie }}>
                  <Text style={{ fontSize: 17, fontWeight: 700, color: i === 2 ? HELLBLAU : NACHT }}>{z.wert}</Text>
                  <Text style={{ fontSize: 6.8, color: i === 2 ? "#A9B8CA" : S.leise, marginTop: 3 }}>{z.label}</Text>
                </View>
              ))}
            </Reihe>
            <K>
              <Titel s={S}>{f.kaufTitel}</Titel>
              <Reihe abstand={20}>{[<Werte key="l" s={S} zeilen={f.kaufLinks} groesse={8.2} />, <Werte key="r" s={S} zeilen={f.kaufRechts} groesse={8.2} />]}</Reihe>
              <Notiz s={S}>{f.kaufNotiz}</Notiz>
            </K>
            <K>
              <Titel s={S}>{f.monatTitel}</Titel>
              <Reihe abstand={20}>
                {[
                  <View key="e"><Kicker s={S} style={{ marginBottom: 3 }}>{f.einnahmenTitel}</Kicker><Werte s={S} zeilen={f.einnahmen} groesse={8.2} /></View>,
                  <View key="a"><Kicker s={S} style={{ marginBottom: 3 }}>{f.ausgabenTitel}</Kicker><Werte s={S} zeilen={f.ausgaben} groesse={8.2} /></View>,
                ]}
              </Reihe>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: NACHT, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, marginTop: 10 }}>
                <Text style={{ fontSize: 9, fontWeight: 700, color: "#ffffff" }}>{f.ergebnis.label}</Text>
                <Text style={{ fontSize: 15, fontWeight: 700, color: HELLBLAU }}>{f.ergebnis.wert}</Text>
              </View>
            </K>
            {f.vermoegen ? (
              <>
                <K>
                  <Titel s={S}>{f.vermoegen.titel}</Titel>
                  <VermoegenDiagramm s={S} v={f.vermoegen} breite={BREITE - 38} hoehe={150} farben={["#B8E2FF", NACHT, S.akzent]} />
                  <View style={{ marginTop: 10 }}><TabelleBlock s={S} t={f.vermoegen.tabelle} groesse={6.9} /></View>
                </K>
                <K>
                  <Titel s={S}>{f.vermoegen.ekTitel}</Titel>
                  <Raster liste={f.vermoegen.ek} spalten={4} abstand={10} render={(z) => <Zahl s={S} z={z} groesse={14} farbe={S.akzent} labelOben />} />
                  <Notiz s={S}>{f.vermoegen.fuss}</Notiz>
                </K>
              </>
            ) : <K><Absatz s={S}>{f.vermoegenLeer}</Absatz></K>}
            {f.karten.length ? (
              <Reihe abstand={10} wrap={false}>
                {f.karten.map((k) => (
                  <Karte key={k.titel} s={S} style={{ flexGrow: 1, marginBottom: 10 }}>
                    <Text style={{ fontSize: 9, fontWeight: 700, color: NACHT }}>{k.titel}</Text>
                    <Text style={{ fontSize: 7.2, color: S.leise, marginTop: 3, marginBottom: 6, lineHeight: 1.45 }}>{k.text}</Text>
                    <Werte s={S} zeilen={k.zeilen} groesse={8} />
                  </Karte>
                ))}
              </Reihe>
            ) : null}
            <K>
              <Titel s={S}>{f.annahmenTitel}</Titel>
              <TabelleBlock s={S} t={f.annahmen} groesse={7} />
              {f.annahmenNotizen.map((n, i) => <Notiz key={i} s={S}>{n}</Notiz>)}
            </K>
          </Kapitel>
        ) : null}

        <Kapitel d={d} id="verwaltung">
          <K>
            <Titel s={S} groesse={12}>{d.verwaltung.titel}</Titel>
            {d.verwaltung.unter ? <Text style={{ fontSize: 8, color: S.leise, marginBottom: 10 }}>{d.verwaltung.unter}</Text> : null}
            {d.verwaltung.leistungen.length ? <Leistungen s={S} liste={d.verwaltung.leistungen} /> : <Absatz s={S}>{d.verwaltung.ohneLeistungen}</Absatz>}
            <Notiz s={S}>{d.verwaltung.notiz}</Notiz>
          </K>
          {/*
            Alle Fotos, wie die Galerie „Einblicke“ online (seit 05.10.2026,
            vorher fest vier). Zwei Spalten, jedes Bild 3:2; jede Zeile bleibt
            beisammen, das Raster läuft über so viele Seiten wie nötig.
          */}
          {d.fotos.length > 1 ? (
            <View>
              {/* Die Überschrift nie allein am Seitenende: mindestens eine Bildzeile muss folgen. */}
              <View minPresenceAhead={EINBLICK_HOEHE}>
                <Kicker s={S} farbe={S.leise} style={{ marginTop: 6, marginBottom: 8, marginLeft: 4 }}>{d.verwaltung.einblickeTitel}</Kicker>
              </View>
              <Raster liste={d.fotos} spalten={2} abstand={8} render={(bild) => <Foto bild={bild} hoehe={EINBLICK_HOEHE} radius={14} />} />
            </View>
          ) : null}
        </Kapitel>

        <Kapitel d={d} id="zeitplan">
          <K wrap><Zeitplan s={S} z={d.zeitplan} /></K>
        </Kapitel>

        <Kapitel d={d} id="chancen-risiken">
          <Text style={{ fontSize: 8.2, color: S.leise, lineHeight: 1.5, marginBottom: 10, paddingHorizontal: 4 }}>{d.chancen.vorspann}</Text>
          {d.chancen.themen.map((t) => <K key={t.titel}><ChanceRisiko s={S} t={t} c={d.chancen} /></K>)}
        </Kapitel>

        <Kapitel d={d} id="rechtliches">
          <K wrap><Hinweise s={S} r={d.rechtliches} spalten={2} /></K>
          <K>
            <Titel s={S}>{d.rechtliches.energieTitel}</Titel>
            <Reihe abstand={20}>{halb(d.rechtliches.energie).map((z, i) => <Werte key={i} s={S} zeilen={z} groesse={7.8} />)}</Reihe>
          </K>
        </Kapitel>

        <View break wrap={false} style={{ backgroundColor: NACHT, borderRadius: 18, padding: 28, height: KONTAKT_HOEHE, overflow: "hidden" }}>
          <Karo breite={BREITE} hoehe={KONTAKT_HOEHE} />
          <Kicker s={S} farbe={HELLBLAU}>{abschnitt(d, "kontakt")?.claim ?? d.kontakt.eyebrow}</Kicker>
          <Text style={{ fontSize: 24, fontWeight: 700, color: "#ffffff", marginTop: 8, letterSpacing: -0.4 }}>{d.kontakt.satz}</Text>
          <Text style={{ fontSize: 9, color: "#C3CFDC", marginTop: 10, lineHeight: 1.6, maxWidth: 400 }}>{d.kontakt.text}</Text>
          {d.fotos.length ? <Foto bild={fotoNr(d, d.fotos.length - 1)!} hoehe={260} radius={14} style={{ marginTop: 22 }} /> : null}
          <View style={{ flexDirection: "row", marginTop: 24, alignItems: "flex-start" }}>
            <View style={{ flexGrow: 1 }}><Person s={S} k={d.kontakt} dunkel gross /></View>
            <View style={{ width: 190, borderLeftWidth: 0.6, borderLeftColor: "#2A3A4F", paddingLeft: 16 }}>
              <Text style={{ fontSize: 8.2, fontWeight: 700, color: "#ffffff" }}>{d.kontakt.firma}</Text>
              <Text style={{ fontSize: 7, color: "#8FA1B6", marginTop: 4, lineHeight: 1.5 }}>{d.kontakt.erstellt}</Text>
            </View>
          </View>
          <View style={{ position: "absolute", left: 28, bottom: 24 }}><Logo bild={d.logoHell ?? d.logo} hoehe={14} /></View>
        </View>
      </Page>
    </Document>
  );
}
