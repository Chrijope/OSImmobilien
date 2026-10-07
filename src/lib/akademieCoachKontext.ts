// Kapitelkontext für den KI-Coach der Vertriebsakademie.
//
// Der Coach ist das Werkzeug gegen „das muss ich nebenbei nachschlagen".
// Vorher kannte er nur `intro`, `absaetze`, `bullets`, `profiTipp` und
// `einwaende`, also weniger als die Hälfte des Kapitels. Hier steht, was er
// stattdessen bekommt und wie gekürzt wird, wenn der Platz nicht reicht.

import type {
  AkademieAufgabe, AkademieKapitel, AkademieSection, AkademieVisual,
} from "@/lib/vertriebsakademieContent";

/**
 * Obergrenze für den Kapitelkontext.
 *
 * Die Edge Function `ki-assistant` schneidet den Kontext bei 8.000 Zeichen ab
 * (`kapitelContext.slice(0, 8000)`). Alles darüber wird nicht übertragen,
 * sondern verworfen — und zwar am Ende, also fielen bisher die späteren
 * Abschnitte eines langen Kapitels stillschweigend weg. Deshalb kürzen wir
 * hier selbst und verteilen den Platz auf alle Abschnitte, statt die ersten
 * vollständig zu senden und den Rest zu verlieren.
 */
const KONTEXT_MAX = 7800;

function visualZuText(v: AkademieVisual): string[] {
  const zeilen: string[] = [];
  if (v.kpis?.length) {
    zeilen.push(`Kennzahlen: ${v.kpis.map((k) => `${k.label} = ${k.wert}${k.hinweis ? ` (${k.hinweis})` : ""}`).join("; ")}`);
  }
  if (v.beispielrechnung) {
    const b = v.beispielrechnung;
    zeilen.push(
      `Rechenbeispiel „${b.titel}": ${b.zeilen.map((z) => `${z.label} ${z.op ?? ""} ${z.wert}`.trim()).join("; ")}` +
      (b.fazit ? ` — Fazit: ${b.fazit}` : ""),
    );
  }
  if (v.barchart) {
    zeilen.push(`Diagramm „${v.barchart.titel}": ${v.barchart.daten.map((d) => `${d.label} = ${d.wert}${v.barchart?.einheit ?? ""}`).join("; ")}`);
  }
  if (v.donut) {
    zeilen.push(`Verteilung „${v.donut.titel}": ${v.donut.daten.map((d) => `${d.label} = ${d.wert}`).join("; ")}`);
  }
  if (v.timeline) {
    zeilen.push(`Ablauf „${v.timeline.titel}": ${v.timeline.schritte.map((s) => `${s.label}${s.dauer ? ` (${s.dauer})` : ""}`).join(" → ")}`);
  }
  if (v.vergleich) {
    const g = v.vergleich;
    zeilen.push(
      `Vergleich „${g.titel}": ${g.optionA.label} (${g.optionA.punkte.join(", ")}) gegen ${g.optionB.label} (${g.optionB.punkte.join(", ")})` +
      (g.fazit ? ` — Fazit: ${g.fazit}` : ""),
    );
  }
  return zeilen;
}

function aufgabeZuText(a: AkademieAufgabe): string {
  switch (a.typ) {
    case "quiz":
      return `Quiz „${a.titel}": ${a.fragen
        .map((f) => `${f.frage} Richtig: ${f.optionen[f.korrekt]}. ${f.aufloesung}`)
        .join(" | ")}`;
    case "sortieren":
      return `Reihenfolge „${a.titel}": ${a.schritte.join(" → ")}`;
    case "zuordnen":
      return `Zuordnung „${a.titel}": ${a.paare.map((p) => `${p.links} = ${p.rechts}`).join("; ")}`;
    case "rechnen":
      return `Rechenaufgabe „${a.titel}": ${a.fall} Gesucht: ${a.gesucht}. Lösung: ${a.zielwert}${a.einheit ? ` ${a.einheit}` : ""}`;
    case "szenario":
      return `Fallübung „${a.titel}": ${a.szenen.find((s) => s.id === a.startSzene)?.text ?? ""}`;
    default:
      return "";
  }
}

/**
 * Wie viel Feinheit ein Abschnitt mitbringt. Gekürzt wird von hinten:
 * zuerst fallen Visuals und Aufgaben weg, dann die Begründungen.
 */
interface Tiefe {
  /** Begründungen von Skripten und Einwandantworten mitschicken. */
  warum: boolean;
  /** Visuals und Aufgaben mitschicken. */
  extras: boolean;
}

const VOLL: Tiefe = { warum: true, extras: true };
const MITTEL: Tiefe = { warum: true, extras: false };
const KOMPAKT: Tiefe = { warum: false, extras: false };

/** Ein Abschnitt als Text. */
function abschnittZuText(s: AkademieSection, tiefe: Tiefe): string {
  const teile: string[] = [`### ${s.ueberschrift}`];
  if (s.intro) teile.push(s.intro);
  if (s.absaetze) teile.push(...s.absaetze);
  if (s.bullets) teile.push(...s.bullets.map((b) => `• ${b}`));
  if (s.profiTipp) teile.push(`Profi-Tipp: ${s.profiTipp}`);
  if (s.quereinsteigerHinweis) teile.push(`Für Quereinsteiger: ${s.quereinsteigerHinweis}`);
  if (s.goldNugget) {
    teile.push(`Gold-Nugget „${s.goldNugget.titel}": ${s.goldNugget.text}`);
    if (s.goldNugget.bullets?.length) teile.push(...s.goldNugget.bullets.map((b) => `• ${b}`));
    if (s.goldNugget.skript) {
      teile.push(`Skript „${s.goldNugget.skript.titel}": ${s.goldNugget.skript.text}`);
      if (tiefe.warum && s.goldNugget.skript.warum) teile.push(`Warum: ${s.goldNugget.skript.warum}`);
    }
  }
  for (const sk of s.skripte ?? []) {
    teile.push(`Skript „${sk.titel}"${sk.kontext ? ` (${sk.kontext})` : ""}: ${sk.text}`);
    if (tiefe.warum && sk.warum) teile.push(`Warum: ${sk.warum}`);
  }
  for (const e of s.einwaende ?? []) {
    teile.push(`Einwand „${e.einwand}"${e.technik ? ` (Technik: ${e.technik})` : ""}: ${e.antwort}`);
    if (tiefe.warum && e.warum) teile.push(`Warum: ${e.warum}`);
  }
  if (s.checkliste?.length) teile.push(`Checkliste: ${s.checkliste.join("; ")}`);
  if (tiefe.extras) {
    for (const v of s.visuals ?? []) teile.push(...visualZuText(v));
    for (const a of s.aufgaben ?? []) teile.push(aufgabeZuText(a));
  }
  return teile.join("\n");
}

/**
 * Verteilt ein Zeichenbudget auf die Abschnitte. Kurze Abschnitte geben ihren
 * ungenutzten Anteil an die längeren ab, damit möglichst wenig abgeschnitten
 * wird und trotzdem jeder Abschnitt vorkommt.
 */
function verteileBudget(bloecke: string[], budget: number): string[] {
  const ergebnis = new Array<string>(bloecke.length);
  const reihenfolge = bloecke
    .map((_, i) => i)
    .sort((a, b) => bloecke[a].length - bloecke[b].length);
  let uebrig = budget;
  let offen = bloecke.length;
  for (const i of reihenfolge) {
    const anteil = Math.max(0, Math.floor(uebrig / offen));
    const text = bloecke[i];
    ergebnis[i] = text.length <= anteil
      ? text
      : text.slice(0, Math.max(0, anteil - 2)).trimEnd() + " …";
    uebrig -= ergebnis[i].length;
    offen--;
  }
  return ergebnis;
}

/**
 * Baut den Kapitelkontext für den KI-Coach.
 *
 * Vorher kannte der Coach nur `intro`, `absaetze`, `bullets`, `profiTipp` und
 * `einwaende`, also weniger als die Hälfte des Kapitels. Jetzt kommen Skripte
 * samt Begründung, Gold-Nugget, Quereinsteiger-Hinweis, Checklisten, Visuals
 * und Aufgaben dazu.
 */
export function buildKapitelContext(kap?: AkademieKapitel): string {
  if (!kap) return "";
  const kopf = [`Kapitel ${kap.nummer}: ${kap.titel}`, `Ziel: ${kap.ziel || ""}`].join("\n");
  const sektionen = kap.sections || [];

  for (const tiefe of [VOLL, MITTEL]) {
    const gesamt = [kopf, ...sektionen.map((s) => abschnittZuText(s, tiefe))].join("\n\n");
    if (gesamt.length <= KONTEXT_MAX) return gesamt;
  }

  const kompakt = sektionen.map((s) => abschnittZuText(s, KOMPAKT));
  const gesamtKompakt = [kopf, ...kompakt].join("\n\n");
  if (gesamtKompakt.length <= KONTEXT_MAX) return gesamtKompakt;

  // Reicht auch das nicht, bekommt jeder Abschnitt seinen Anteil. Der Coach
  // soll wenigstens von jedem Abschnitt wissen, statt die Hälfte des Kapitels
  // gar nicht zu sehen.
  const budget = KONTEXT_MAX - kopf.length - 2 * sektionen.length - 80;
  const gekuerzt = verteileBudget(kompakt, Math.max(0, budget));
  return [kopf, ...gekuerzt].join("\n\n") +
    "\n\n(Kapitelauszug gekürzt. Frag nach einem Abschnitt, wenn du mehr Einzelheiten brauchst.)";
}
