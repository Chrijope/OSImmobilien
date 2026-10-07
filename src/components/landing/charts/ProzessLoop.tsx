/**
 * Der Prozess als Kreislauf.
 *
 * Die Schritte sitzen als Punkte auf dem Rand, beschriftet nach außen. Der
 * aktive Punkt ist groß und hell, die übrigen bleiben klein und ruhig. Der
 * Bogen wächst mit dem Fortschritt, ein Leuchtpunkt wandert auf ihm mit. Beim
 * Hochscrollen läuft beides von selbst zurück.
 *
 * Farben wie in der übrigen Microseite: Primärblau für alles Aktive,
 * hsl(220 10% 46%) für Beschriftungen (4,89:1 auf Weiß).
 */

import { useSeitenTexte } from "@/components/SeitenSprache";
import { MIKROSEITE_ABSCHLUSS_TEXTE } from "../mikroseiteAbschlussTexte";

const MITTE_X = 300;
const MITTE_Y = 196;
const RADIUS = 118;

const FARBE_AKTIV = "hsl(var(--primary))";
const FARBE_RUHIG = "hsl(220 10% 46%)";
const FARBE_RING = "hsl(214 24% 88%)";

/** Winkel der Station i in Grad: oben beginnen, im Uhrzeigersinn weiter. */
const winkelGrad = (i: number, anzahl: number) => -90 + (i * 360) / anzahl;
const alsBogen = (grad: number) => (grad * Math.PI) / 180;
const aufDemRing = (grad: number, r: number) => ({
  x: MITTE_X + r * Math.cos(alsBogen(grad)),
  y: MITTE_Y + r * Math.sin(alsBogen(grad)),
});

/**
 * Drei Maßsätze, einer je Zuschnitt der Bühne.
 *
 * „gross" ist die Fassung für die rechte Spalte am Rechner, daneben steht die
 * Schrittliste. „tablet" steht ohne Liste da: Die Namen am Ring sind dann die
 * einzige Zuordnung und müssen größer sein, deshalb die kurzen Namen — mit
 * „Investmentstrategie" liefe die Beschriftung rechts aus dem Bild.
 * „schmal" ist die Handyfassung: Für Namen rundherum bräuchte es gut 600
 * Pixel Breite. Dort tragen die Nummern in den Punkten die Zuordnung, der
 * Ausschnitt rückt eng an den Kreis, und die Namen stehen in der Textkarte
 * darunter.
 */
const MASSE = {
  gross: {
    ausschnitt: "0 0 600 400",
    beschriftung: 140,
    name: 14,
    marke: 22,
    unterzeile: 10,
    sperrung: "0.18em",
    punkt: 11,
    ruhepunkt: 5,
    nummer: 11,
    zeigeNamen: true,
    kurzeNamen: false,
    zeigeSchrittzeile: true,
  },
  tablet: {
    ausschnitt: "0 0 600 400",
    beschriftung: 142,
    name: 20,
    marke: 24,
    unterzeile: 12,
    sperrung: "0.14em",
    punkt: 13,
    ruhepunkt: 6,
    nummer: 13,
    zeigeNamen: true,
    kurzeNamen: true,
    zeigeSchrittzeile: false,
  },
  schmal: {
    // Eng um den Kreis: 154…446 waagerecht, 50…342 senkrecht. Die 28 Pixel
    // Luft rundherum fangen den Schein des Leuchtpunkts ab.
    ausschnitt: "154 50 292 292",
    beschriftung: 0,
    name: 0,
    marke: 24,
    unterzeile: 11,
    sperrung: "0.12em",
    punkt: 15,
    ruhepunkt: 15,
    nummer: 15,
    zeigeNamen: false,
    kurzeNamen: true,
    zeigeSchrittzeile: false,
  },
} as const;

export type LoopZuschnitt = keyof typeof MASSE;

interface Props {
  /** Kurze Namen der Schritte, in der Reihenfolge des Prozesses. */
  namen: string[];
  /**
   * Noch kuerzere Namen fuer Tablet und Handy. Am Kreisrand ist dort so wenig
   * Platz, dass die Schrift sich nach dem laengsten Namen richten muss. Fehlen
   * sie, wird `namen` genommen.
   */
  namenKompakt?: string[];
  aktiv: number;
  /** Falsch heißt: alles gleichwertig zeigen, nichts hervorheben. */
  gesteuert: boolean;
  /**
   * 0 bis 1, stufenlos. Steuert Bogen und Leuchtpunkt. Muss aus derselben
   * Quelle stammen wie `aktiv` (`bandFortschritt` aus `useScrollAbschnitt`),
   * sonst laufen Punkt und Hervorhebung auseinander.
   */
  fortschritt: number;
  zuschnitt?: LoopZuschnitt;
}

export default function ProzessLoop({
  namen,
  namenKompakt,
  aktiv,
  gesteuert,
  fortschritt,
  zuschnitt = "gross",
}: Props) {
  /*
   * Der Bogen endet AM Leuchtpunkt, und der Leuchtpunkt erreicht Station k
   * genau in dem Augenblick, in dem Station k hell wird.
   *
   * Bis zum 16.09.2026 stand hier (aktiv + 1), damit war der Bogen immer einen
   * Schritt weiter als die Hervorhebung: Bei Schritt 1 lief er schon bis
   * Punkt 2. Christian: "Die Verbindungslinie ist immer ein Tick zu schnell."
   * Das bleibt behoben, denn `aktiv` ist der abgerundete Wert von
   * `fortschritt * Schrittzahl` — der Bogen ist nie weiter als die Nummer, die
   * er gerade erreicht hat.
   *
   * Neu ist, dass sich der Kreis am Ende schliesst: Waehrend des sechsten
   * Schritts laeuft der Punkt von 06 zurueck nach 01. Das ist hier die Aussage
   * des Abschnitts — nach dem letzten Schritt beginnt der naechste Zyklus.
   */
  const t = useSeitenTexte(MIKROSEITE_ABSCHLUSS_TEXTE).prozess.ring;
  const anteil = gesteuert ? Math.max(0, Math.min(1, fortschritt)) : 1;
  const m = MASSE[zuschnitt];
  // Gezeichnet wird die kurze Fassung, vorgelesen die lange: Wer die Seite
  // hoert, hat keinen Platzmangel und soll den vollen Namen bekommen.
  const beschriftungen =
    m.kurzeNamen && namenKompakt?.length === namen.length ? namenKompakt : namen;
  const leuchtpunkt = aufDemRing(-90 + anteil * 360, RADIUS);

  return (
    <svg
      viewBox={m.ausschnitt}
      className="w-full h-auto overflow-visible"
      role="img"
      aria-label={t.beschreibung(namen.length, namen.join(", "))}
    >
      <circle cx={MITTE_X} cy={MITTE_Y} r={RADIUS} fill="none" stroke={FARBE_RING} strokeWidth="1.5" />
      <circle
        cx={MITTE_X}
        cy={MITTE_Y}
        r={RADIUS}
        fill="none"
        stroke={FARBE_AKTIV}
        strokeWidth="2.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset={1 - anteil}
        transform={`rotate(-90 ${MITTE_X} ${MITTE_Y})`}
      />

      <text
        x={MITTE_X}
        y={MITTE_Y - 2}
        textAnchor="middle"
        fill="hsl(220 25% 10%)"
        fontSize={m.marke}
        fontWeight="600"
      >
        OS Immobilien
      </text>
      <text
        x={MITTE_X}
        y={MITTE_Y + m.marke - 2}
        textAnchor="middle"
        fill={FARBE_RUHIG}
        fontSize={m.unterzeile}
        letterSpacing={m.sperrung}
      >
        {t.unterzeile}
      </text>

      {/*
        Der Leuchtpunkt, bewusst VOR den Stationen gezeichnet.
        Kommt er an einer Station an, verschwindet er unter deren Punkt und geht
        sichtbar in ihr auf. Läge er darüber, verdeckte er genau dann die Nummer.
        Nur bei greifender Scrollsteuerung: Ohne sie steht der Ring still, und
        ein Punkt an einer beliebigen Stelle wäre dann sinnlos.
      */}
      {gesteuert && (
        <g>
          <circle cx={leuchtpunkt.x} cy={leuchtpunkt.y} r="16" fill={FARBE_AKTIV} fillOpacity="0.16" />
          <circle cx={leuchtpunkt.x} cy={leuchtpunkt.y} r="6" fill={FARBE_AKTIV} />
        </g>
      )}

      {beschriftungen.map((name, i) => {
        const grad = winkelGrad(i, beschriftungen.length);
        const bogen = alsBogen(grad);
        const punkt = aufDemRing(grad, RADIUS);
        const beschriftung = aufDemRing(grad, m.beschriftung);
        const oben = Math.sin(bogen) < -0.9;
        const unten = Math.sin(bogen) > 0.9;
        const anker = oben || unten ? "middle" : Math.cos(bogen) > 0 ? "start" : "end";
        const versatz = oben ? -m.name + 4 : unten ? m.name + 2 : 0;
        const istAktiv = !gesteuert || i === aktiv;
        // Ohne Namen am Ring trägt jeder Punkt seine Nummer, sonst nur der
        // aktive: Auf dem Handy ist die Nummer die einzige Zuordnung zur Karte.
        const zeigeNummer = istAktiv || !m.zeigeNamen;
        const nummer = String(i + 1).padStart(2, "0");

        return (
          <g key={name}>
            {istAktiv && gesteuert && (
              <circle cx={punkt.x} cy={punkt.y} r={m.punkt + 6} fill={FARBE_AKTIV} fillOpacity="0.14" />
            )}
            <circle
              cx={punkt.x}
              cy={punkt.y}
              r={istAktiv ? m.punkt : m.ruhepunkt}
              fill={istAktiv ? FARBE_AKTIV : m.zeigeNamen ? FARBE_RING : "white"}
              stroke={istAktiv || m.zeigeNamen ? "none" : FARBE_RING}
              strokeWidth="1.5"
              className="transition-all duration-300"
            />
            {zeigeNummer && (
              <text
                x={punkt.x}
                y={punkt.y + m.nummer / 3}
                textAnchor="middle"
                fill={istAktiv ? "white" : FARBE_RUHIG}
                fontSize={m.nummer}
                fontWeight="700"
              >
                {nummer}
              </text>
            )}
            {m.zeigeNamen && (
              <text
                x={beschriftung.x}
                y={beschriftung.y + versatz}
                textAnchor={anker}
                fill={istAktiv ? "hsl(220 25% 10%)" : FARBE_RUHIG}
                opacity={istAktiv ? 1 : 0.55}
                fontSize={m.name}
                fontWeight="600"
              >
                {name}
              </text>
            )}
            {m.zeigeSchrittzeile && (
              <text
                x={beschriftung.x}
                y={beschriftung.y + versatz + 14}
                textAnchor={anker}
                fill={FARBE_RUHIG}
                opacity={istAktiv ? 1 : 0.55}
                fontSize={9.5}
                letterSpacing="0.16em"
              >
                {t.schritt(nummer)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
