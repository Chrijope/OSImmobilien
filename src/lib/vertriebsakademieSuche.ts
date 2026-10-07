import {
  VERTRIEBSAKADEMIE_KAPITEL,
  type AkademieAufgabe,
  type AkademieKapitel,
  type AkademieSection,
  type AkademieVisual,
} from "@/lib/vertriebsakademieContent";
import { besteFrage, bewerte, normalisiere, seltenheitsGewicht, textAusschnittAus, zerlegeFrage } from "@/lib/sucheKern";

/**
 * Die Suche in der Vertriebsakademie.
 *
 * Sie benutzt denselben Kern wie das Vertriebshandbuch
 * (`src/lib/sucheKern.ts`): Füllwörter fliegen raus, die Frage wiegt schwerer
 * als der Fließtext, wer mehrere Wörter der Frage trifft, gewinnt. Eine
 * zweite, eigene Lösung wäre nach der ersten Änderung von der ersten
 * abgewichen, und dann fände dieselbe Frage an zwei Stellen Verschiedenes.
 *
 * Was hier dazukommt, ist die Zuordnung der Akademie-Felder auf die fünf
 * Rollen des Kerns. Die Akademie hat kein Feld "Frage" wie das Handbuch,
 * aber sie hat etwas Besseres: die Einwände stehen dort wörtlich so, wie der
 * Kunde sie sagt, und die Quizfragen so, wie ein Partner sie stellt. Genau
 * das sucht jemand, der "wie gehe ich mit dem Einwand zu teuer um" eintippt.
 * Deshalb zählen sie als Frage.
 *
 * Es gibt zwei Einstiege, und der Unterschied ist der ganze Sinn der Sache:
 * `sucheInAkademie` geht über alle Kapitel, `sucheImKapitel` bleibt in einem.
 */

/** Eine Fundstelle: immer ein Abschnitt, denn dorthin springt die Seite. */
export interface AkademieTreffer {
  kapitel: AkademieKapitel;
  abschnitt: AkademieSection;
  /** Je höher, desto besser passend. */
  punkte: number;
  /** Die Wörter aus der Frage, die wirklich getroffen haben. */
  getroffen: string[];
  /** Der rohe Text des Abschnitts, für den Ausschnitt in der Trefferliste. */
  roh: string;
}

/** Die vorbereiteten Felder eines Abschnitts, damit nicht jede Taste neu normalisiert. */
interface AbschnittIndex {
  /** Jede Frage einzeln, nicht aneinandergehängt. Siehe `besteFrage`. */
  fragen: string[];
  titel: string;
  schlagworte: string;
  text: string;
  roh: string;
}

/*
  Der Index wird einmal je Abschnitt gebaut und danach behalten. Die Akademie
  hat rund 140 Abschnitte mit zusammen mehreren hunderttausend Zeichen; das bei
  jedem Tastendruck neu kleinzuschreiben wäre spürbar. Die WeakMap hängt am
  Abschnittsobjekt, deshalb funktioniert sie auch für Testdaten und hält nichts
  fest, was sonst weggeräumt würde.
*/
const abschnittsIndex = new WeakMap<AkademieSection, AbschnittIndex>();
const kapitelIndex = new WeakMap<AkademieKapitel, string>();

/**
 * Text einer Aufgabe, so weit er für die Suche etwas hergibt.
 *
 * Aufgaben zählen bewusst nur als Fließtext, auch die Quizfragen. Sie sehen
 * zwar aus wie Fragen, sind aber Prüfungsfragen mit einer ganzen Szene darin
 * ("Der Kunde wird während der Verlesung unruhig. Was tust du?"). Als Frage
 * gewertet ziehen sie über einzelne zufällig passende Wörter Treffer an sich,
 * die inhaltlich woanders hingehören.
 */
function aufgabenTexte(a: AkademieAufgabe): string[] {
  const text: string[] = [a.titel, a.hinweis || ""];
  switch (a.typ) {
    case "quiz":
      for (const f of a.fragen) text.push(f.frage, ...f.optionen, f.aufloesung);
      break;
    case "sortieren":
      text.push(...a.schritte);
      break;
    case "zuordnen":
      text.push(...a.paare.flatMap((p) => [p.links, p.rechts]), ...(a.ablenker || []));
      break;
    case "rechnen":
      text.push(a.gesucht, a.fall, a.rechenweg.titel, ...a.rechenweg.zeilen.map((z) => `${z.label} ${z.wert}`));
      break;
    case "szenario":
      text.push(...a.szenen.flatMap((s) => [s.text, s.fazit || "", ...(s.optionen || []).map((o) => o.text)]));
      break;
    case "wahrfalsch":
      text.push(...a.karten.flatMap((k) => [k.aussage, k.aufloesung]));
      break;
  }
  return text;
}

/** Text einer Grafik. Die Beschriftungen tragen oft genau den gesuchten Begriff. */
function visualTexte(v: AkademieVisual): string[] {
  const t: string[] = [];
  for (const k of v.kpis || []) t.push(k.label, k.wert, k.hinweis || "");
  if (v.beispielrechnung) {
    t.push(v.beispielrechnung.titel, v.beispielrechnung.untertitel || "", v.beispielrechnung.fazit || "");
    for (const z of v.beispielrechnung.zeilen) t.push(z.label, z.wert, z.hinweis || "");
  }
  if (v.barchart) t.push(v.barchart.titel, v.barchart.untertitel || "", ...v.barchart.daten.map((d) => d.label));
  if (v.donut) t.push(v.donut.titel, v.donut.untertitel || "", ...v.donut.daten.map((d) => d.label));
  if (v.timeline) t.push(v.timeline.titel, ...v.timeline.schritte.flatMap((s) => [s.label, s.beschreibung || ""]));
  if (v.vergleich) {
    t.push(v.vergleich.titel, v.vergleich.untertitel || "", v.vergleich.fazit || "");
    for (const o of [v.vergleich.optionA, v.vergleich.optionB]) t.push(o.label, ...o.punkte, o.ergebnis || "");
  }
  return t;
}

function baueIndex(sec: AkademieSection): AbschnittIndex {
  const vorhanden = abschnittsIndex.get(sec);
  if (vorhanden) return vorhanden;

  /*
    Die Fragen: die Einwände, denn sie stehen wörtlich so da, wie der Kunde
    sie sagt. Wer "was sage ich wenn der Kunde den Preis pro Quadratmeter
    vergleicht" eintippt, sucht genau diesen Satz und keinen Fließtext.
  */
  const fragen: string[] = [...(sec.einwaende || []).map((e) => e.einwand)];
  /*
    Die Schlagworte: die kurzen Etiketten im Abschnitt. Skripttitel, der
    Kontext eines Skripts, die Überschrift des Gold-Nuggets. Sie sind die
    andere Wortwahl für dieselbe Sache und leisten hier das, was im Handbuch
    das Feld `schlagworte` leistet.
  */
  const schlagworte: string[] = [
    ...(sec.skripte || []).flatMap((s) => [s.titel, s.kontext || ""]),
    ...(sec.einwaende || []).map((e) => e.technik || ""),
    sec.goldNugget?.titel || "",
    ...(sec.links || []).map((l) => l.label),
  ];
  const text: string[] = [
    sec.ueberschrift,
    sec.intro || "",
    ...(sec.absaetze || []),
    ...(sec.bullets || []),
    sec.profiTipp || "",
    sec.quereinsteigerHinweis || "",
    sec.goldNugget?.text || "",
    ...(sec.goldNugget?.bullets || []),
    ...(sec.skripte || []).flatMap((s) => [s.text, s.warum || ""]),
    ...(sec.einwaende || []).flatMap((e) => [e.antwort, e.warum || ""]),
    ...(sec.checkliste || []),
    ...(sec.uebungen || []).flatMap((u) => [u.titel, u.beschreibung]),
    ...(sec.visuals || []).flatMap(visualTexte),
  ];
  for (const a of sec.aufgaben || []) text.push(...aufgabenTexte(a));
  // Die Einwände zählen zusätzlich als Fließtext. Sonst verliert ein Wort, das
  // in einem anderen Einwand desselben Abschnitts steht, jede Wertung.
  text.push(...fragen);

  /*
    Der rohe Text für den Ausschnitt in der Trefferliste. Er nimmt bewusst nur
    das, was ein Mensch als zusammenhängenden Satz liest, also keine
    Tabellenzellen und keine Antwortoptionen.
  */
  const roh = [sec.intro || "", ...(sec.absaetze || []), ...(sec.bullets || [])]
    .filter(Boolean)
    .join(" ");

  const eintrag: AbschnittIndex = {
    fragen: fragen.filter(Boolean).map(normalisiere),
    titel: normalisiere(sec.ueberschrift),
    schlagworte: normalisiere(schlagworte.join(" ")),
    text: normalisiere(text.join(" ")),
    roh,
  };
  abschnittsIndex.set(sec, eintrag);
  return eintrag;
}

function kapitelFeld(kap: AkademieKapitel): string {
  const vorhanden = kapitelIndex.get(kap);
  if (vorhanden) return vorhanden;
  const feld = normalisiere([kap.titel, kap.kicker, kap.teaser, kap.ziel || ""].join(" "));
  kapitelIndex.set(kap, feld);
  return feld;
}

/*
  Wie verbreitet ein Wort in der Akademie ist, ändert sich nur, wenn der Inhalt
  sich ändert. Deshalb wird es je Wort einmal ausgezählt und behalten.
*/
const gewichtProWort = new Map<string, number>();

/** Die Gewichte für die Wörter einer Frage, gemessen an der ganzen Akademie. */
function wortGewichte(woerter: string[]): (wort: string) => number {
  const alle = VERTRIEBSAKADEMIE_KAPITEL.flatMap((k) => k.sections || []);
  for (const wort of woerter) {
    if (gewichtProWort.has(wort)) continue;
    let mit = 0;
    for (const sec of alle) if (baueIndex(sec).text.includes(wort)) mit++;
    gewichtProWort.set(wort, seltenheitsGewicht(alle.length === 0 ? 0 : mit / alle.length));
  }
  return (wort) => gewichtProWort.get(wort) ?? 1;
}

/**
 * Sucht über alle Kapitel hinweg. Leere Eingabe gibt nichts zurück, nicht
 * alles: Eine Trefferliste mit der ganzen Akademie darin ist keine Antwort.
 */
export function sucheInAkademie(
  frage: string,
  quelle: AkademieKapitel[] = VERTRIEBSAKADEMIE_KAPITEL,
): AkademieTreffer[] {
  const woerter = zerlegeFrage(frage);
  if (woerter.length === 0) return [];

  /*
    Die Wortgewichte werden immer über die ganze Akademie bestimmt, auch bei
    der Suche in einem einzelnen Kapitel. Sonst wäre "Notar" im Notarkapitel
    plötzlich ein Allerweltswort und würde dort weggewichtet, obwohl der
    Partner genau danach gefragt hat.
  */
  const gewicht = wortGewichte(woerter);

  const treffer: AkademieTreffer[] = [];
  for (const kapitel of quelle) {
    const bereich = kapitelFeld(kapitel);
    for (const abschnitt of kapitel.sections || []) {
      const idx = baueIndex(abschnitt);
      const wertung = bewerte(woerter, {
        frage: besteFrage(woerter, idx.fragen),
        titel: idx.titel,
        schlagworte: idx.schlagworte,
        bereich,
        text: idx.text,
      }, gewicht);
      if (!wertung) continue;
      treffer.push({
        kapitel,
        abschnitt,
        punkte: wertung.punkte,
        getroffen: wertung.getroffen,
        roh: idx.roh,
      });
    }
  }
  return treffer.sort((a, b) => b.punkte - a.punkte);
}

/**
 * Sucht nur in einem Kapitel. Genau das ist der Zweck der zweiten Suche im
 * geöffneten Kapitel: Wer dort fragt, meint dieses Kapitel und will keine
 * Treffer aus den achtzehn anderen.
 */
export function sucheImKapitel(frage: string, kapitel: AkademieKapitel): AkademieTreffer[] {
  return sucheInAkademie(frage, [kapitel]);
}

/** Ein kurzer Ausschnitt um das erste getroffene Wort, für die Trefferliste. */
export function akademieAusschnitt(treffer: AkademieTreffer, wort: string, laenge = 160): string {
  return textAusschnittAus(treffer.roh, wort, laenge);
}
