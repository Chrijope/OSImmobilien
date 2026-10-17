import type { Aussehen, Dachflaeche, Grundriss3dPlan, Oeffnung, Punkt, Raum, RaumTyp, Wand } from "./plan";

/*
 * Mehrfamilienhaus Marktstraße 6, 14822 Brück OT Neuendorf (17.10.2026).
 *
 * Quelle: Aufteilungspläne EG, 1.OG, DG (Allplan-Vektor-PDF, 1:100, Stand
 * 14.04.2025). Die Raumflächen sind die farbigen Raumflächen dieser Pläne,
 * also auf den Zentimeter wie gezeichnet. Im EG gilt rechts vom Treppenhaus
 * der Umbaustand des Abgeschlossenheitsplans (Grundriss EG, 17.12.2025,
 * Scan): Aus der Büroeinheit werden WE 2 und WE 3. Diese Wände und Räume
 * sind von Hand nach dem Scan gesetzt, Genauigkeit etwa 10 cm.
 * Wohnungsnummern nach Teilungserklärung vom 05.06.2026 (WE 1 bis WE 11).
 *
 * Vertriebsliste mit 12 Einheiten (65 / 25 / 46 / 25 / 90 / 50 / 48 / 80 /
 * 30 / 60 / 56,05 / 35 m², Summe 610,05): lässt sich den Plänen nicht
 * eindeutig zuordnen, daher bleiben die Nummern der Teilungserklärung.
 * - Pläne, Teilungserklärung, Abgeschlossenheitsbescheinigung, Wirtschafts-
 *   plan 2027 und Exposé kennen nur 11 abgeschlossene Einheiten (EG 4, 1.OG 4,
 *   DG 3) mit 57,18 / 71,54 / 45,38 / 28,03 / 39,01 / 23,92 / 98,40 / 42,67 /
 *   91,79 / 31,94 / 88,67 m². Eine zwölfte Einheit gibt es in keinem Plan.
 * - Die Listenwerte sind gerundet und weichen bis über 10 % ab. Klar passt nur
 *   46 ≈ 45,38 (WE 3 EG) und 56,05 ≈ 57,18 (WE 1); 90 könnte WE 9 (91,79) oder
 *   WE 7 (98,40) sein, 80 ≈ 88,67 (WE 11) nur grob. Die beiden 25er passen auf
 *   WE 4 (28,03) und WE 6 (23,92), aber ohne Lageangabe nicht in welcher
 *   Reihenfolge. Für 60 und 65 gibt es keinen passenden Plan (nächste: 57,18,
 *   71,54). 48 + 50 = 98 träfe WE 7 als geteilte Einheit, dafür gibt es keinen
 *   Plan. Die Liste hat weder Geschoss noch Lage.
 * - Umbau in der Liste: Nr. 11 (56,05) und Nr. 12 (35). Umgebaut wird nach dem
 *   Abgeschlossenheitsplan die EG-Büroeinheit zu WE 2 (71,54) und WE 3
 *   (45,38); die Flächen passen nicht.
 * Für eine Zuordnung braucht es Geschoss und Lage je Listennummer, etwa
 * aus den Mietverträgen.
 *
 * Maßstab: Außenmaß 24,00 × 11,26 m laut Maßketten, auf allen Geschossen
 * gleich. Ursprung ist die Außenecke oben links (Nordwesten), die Geschosse
 * liegen deckungsgleich übereinander (Treppenhaus x 9,3 bis 12,0 m).
 * Wände: Mittellinien aus den Raumkanten, Dicke = Abstand der Raumkanten
 * (außen 0,38 m, DG-Giebel 0,25 m). Türen und Fenster aus den Türbögen der
 * Pläne; im DG Gauben-, Zwerchgiebel-, Turm- und Ostgiebelfenster nach
 * Ansichten, Dachflächenfenster und die kleinen Dreiecksfenster fehlen. Schornsteine und Schächte sind als dicke Wandstücke eingetragen.
 *
 * Dach: siehe DACH unten. Farben gemittelt aus den Drohnenfotos
 * (Upload Investagon, 01, 02 Außen); der Putz ist auf allen Fotos weiß, gemessen wirkte er in der Abendsonne grau, daher weiß gesetzt.
 */

/** Wand von (x1,y1) nach (x2,y2) in Metern; Öffnungen als [Art, von, bis] auf der Hauptachse der Wand. */
function bauer() {
  const waende: Wand[] = [], oeffnungen: Oeffnung[] = [], raeume: Raum[] = [];
  const api = {
    wand(x1: number, y1: number, x2: number, y2: number, dicke: number, ...oeff: Array<["tuer" | "fenster", number, number]>) {
      const id = `w${waende.length + 1}`;
      waende.push({ id, a: { x: x1, y: y1 }, b: { x: x2, y: y2 }, dicke });
      const laengs = Math.abs(x2 - x1) >= Math.abs(y2 - y1);
      const start = laengs ? x1 : y1, spanne = (laengs ? x2 : y2) - start;
      const laenge = Math.hypot(x2 - x1, y2 - y1);
      // Auch schräge Wände: Anteil auf der Hauptachse mal wahre Wandlänge.
      for (const [art, von, bis] of oeff) {
        oeffnungen.push({ id: `${id}${art[0]}${oeffnungen.length}`, wandId: id, art,
          position: (((von + bis) / 2 - start) / spanne) * laenge, breite: (Math.abs(bis - von) / Math.abs(spanne)) * laenge });
      }
      return api;
    },
    raum(name: string, typ: RaumTyp, ...koord: number[]) {
      const punkte: Punkt[] = [];
      for (let i = 0; i < koord.length; i += 2) punkte.push({ x: koord[i], y: koord[i + 1] });
      raeume.push({ id: `r${raeume.length + 1}`, name, typ, punkte });
      return api;
    },
    plan(geschoss: number): Grundriss3dPlan {
      // Norden nach Nordpfeil des Abgeschlossenheitsplans etwa 45° rechts von „oben“.
      return { version: 1, nordWinkel: 45, geschoss, waende, oeffnungen, raeume };
    },
  };
  return api;
}

const EG = bauer()
  .wand(0.19, 0.19, 23.81, 0.19, 0.38, ["fenster", 4.502, 5.497], ["fenster", 7.402, 8.397], ["fenster", 10.302, 11.297], ["fenster", 13.202, 14.197], ["fenster", 16.902, 17.897], ["fenster", 20.602, 21.597])
  .wand(0.19, 0.19, 0.19, 11.07, 0.38, ["tuer", 2.975, 3.845], ["fenster", 7.362, 8.357])
  .wand(23.81, 0.19, 23.81, 11.07, 0.38, ["fenster", 2.075, 3.185], ["tuer", 5.701, 6.565], ["fenster", 8.075, 9.185])
  .wand(0.19, 11.07, 23.81, 11.07, 0.38, ["tuer", 1.445, 2.315], ["fenster", 4.565, 5.435], ["fenster", 7.402, 8.397], ["tuer", 10.24, 11.11], ["fenster", 14.481, 15.476], ["fenster", 17.912, 18.907])
  .wand(6.366, 0.19, 6.366, 4.55, 0.25)
  .wand(6.366, 4.55, 6, 5.689, 0.25, ["tuer", 4.589, 5.439])
  .wand(0.19, 5.689, 6, 5.689, 0.25)
  .wand(6.283, 5.689, 6.283, 11.07, 0.4)
  .wand(6.366, 4.685, 9.21, 4.685, 0.125, ["tuer", 6.873, 7.758])
  .wand(9.21, 0.19, 9.21, 11.07, 0.125, ["tuer", 7.289, 8.174])
  .wand(6.283, 8.713, 9.21, 8.713, 0.125, ["tuer", 8.382, 9.017])
  .wand(3.634, 8.713, 6.283, 8.713, 0.125)
  .wand(3.634, 8.713, 3.634, 11.07, 0.125, ["tuer", 9.745, 10.38])
  .wand(9.21, 4.71, 21.986, 4.71, 0.25, ["tuer", 13.512, 14.397], ["tuer", 16.877, 17.762], ["tuer", 20.77, 21.655])
  .wand(21.986, 4.48, 23.81, 4.48, 0.32)
  .wand(21.986, 4.48, 21.986, 6.76, 0.38, ["tuer", 4.997, 6.247])
  .wand(20.62, 6.76, 23.81, 6.76, 0.4, ["tuer", 22.426, 23.299])
  .wand(12.07, 4.71, 12.07, 11.07, 0.125)
  .wand(12.07, 6.535, 21.986, 6.535, 0.25)
  .wand(13.1, 0.19, 13.1, 4.71, 0.12, ["tuer", 3.6, 4.45])
  .wand(13.1, 3.39, 15.28, 3.39, 0.2, ["tuer", 13.9, 14.75])
  .wand(15.28, 0.19, 15.28, 4.71, 0.125)
  .wand(15.685, 2.7, 15.685, 4.71, 0.686)
  .wand(13.45, 4.71, 13.45, 6.535, 0.12, ["tuer", 5.5, 6.3])
  .wand(15.66, 6.535, 15.66, 11.07, 0.12, ["tuer", 8.9, 9.75])
  .wand(20.62, 6.76, 20.62, 11.07, 0.12, ["tuer", 7.5, 8.4])
  .wand(19.86, 7.01, 20.56, 7.01, 0.7)
  .wand(20.62, 8.58, 21.42, 8.58, 0.12)
  .wand(21.42, 8.58, 21.42, 9.2, 0.12)
  .wand(21.42, 9.2, 23.81, 9.2, 0.12, ["tuer", 21.6, 22.4])
  .raum("Flur (WE 1)", "flur", 9.145, 8.65, 9.145, 4.747, 6.785, 4.747, 6.361, 4.624, 6.088, 5.564, 6.486, 5.564, 6.486, 6.424, 6.81, 6.424, 6.81, 7.274, 6.486, 7.274, 6.486, 8.65)
  .raum("Schlafen (WE 1)", "schlafen", 6.491, 0.38, 6.491, 4.259, 6.785, 4.259, 6.785, 4.622, 9.145, 4.622, 9.145, 0.38)
  .raum("Wohnen (WE 1)", "wohnen", 5.958, 5.564, 6.241, 4.589, 6.241, 0.38, 0.38, 0.38, 0.38, 5.564)
  .raum("Bad (WE 1)", "bad", 6.486, 8.775, 6.486, 10.51, 6.748, 10.51, 6.748, 10.88, 8.757, 10.88, 9.145, 10.492, 9.145, 8.775)
  .raum("Wohnen (WE 4)", "wohnen", 0.38, 5.814, 0.38, 10.88, 3.571, 10.88, 3.571, 8.65, 6.081, 8.65, 6.081, 5.814)
  .raum("Bad (WE 4)", "bad", 3.696, 10.88, 6.081, 10.88, 6.081, 8.775, 3.696, 8.775)
  .raum("Terrasse (WE 1)", "balkon", -2.49, 0.41, 0, 0.41, 0, 7.27, -2.49, 7.27)
  .raum("Schlafen (WE 2)", "schlafen", 9.27, 0.627, 9.517, 0.627, 9.517, 0.38, 13.04, 0.38, 13.04, 4.584, 9.27, 4.584)
  .raum("Bad (WE 2)", "bad", 13.16, 0.38, 15.217, 0.38, 15.217, 3.29, 13.16, 3.29)
  .raum("Flur (WE 2)", "flur", 13.16, 3.49, 15.217, 3.49, 15.217, 4.584, 13.16, 4.584)
  .raum("Wohnen (WE 2)", "wohnen", 15.342, 0.38, 23.62, 0.38, 23.62, 4.322, 21.796, 4.322, 21.796, 4.584, 16.028, 4.584, 16.028, 2.702, 15.342, 2.702)
  .raum("Kammer (WE 2)", "abstell", 12.13, 4.834, 13.39, 4.834, 13.39, 6.41, 12.13, 6.41)
  .raum("Flur (WE 2)", "flur", 13.51, 4.834, 21.796, 4.834, 21.796, 6.41, 13.51, 6.41)
  .raum("Schlafen (WE 3)", "schlafen", 12.13, 6.66, 15.6, 6.66, 15.6, 10.88, 12.13, 10.88)
  .raum("Wohnen (WE 3)", "wohnen", 15.72, 6.66, 19.86, 6.66, 19.86, 7.36, 20.56, 7.36, 20.56, 10.88, 15.72, 10.88)
  .raum("Flur (WE 3)", "flur", 20.68, 6.96, 23.62, 6.96, 23.62, 9.14, 21.48, 9.14, 21.48, 8.52, 20.68, 8.52)
  .raum("Bad (WE 3)", "bad", 20.68, 8.64, 21.36, 8.64, 21.36, 9.26, 23.62, 9.26, 23.62, 10.88, 20.68, 10.88)
  .raum("Treppenhaus", "treppenhaus", 9.27, 4.834, 12.005, 4.834, 12.005, 10.88, 9.27, 10.88)
  .raum("Flur Seiteneingang", "treppenhaus", 22.176, 4.878, 23.62, 4.644, 23.62, 6.558, 22.176, 6.32)
  .plan(0);

const OG = bauer()
  .wand(0.19, 0.19, 23.81, 0.19, 0.38, ["fenster", 4.503, 5.498], ["fenster", 7.403, 8.398], ["fenster", 10.303, 11.298], ["fenster", 13.203, 14.198], ["fenster", 16.903, 17.898], ["fenster", 20.603, 21.598])
  .wand(0.19, 0.19, 0.19, 11.07, 0.38, ["fenster", 2.072, 3.942], ["fenster", 7.362, 9.232])
  .wand(23.81, 0.19, 23.81, 11.07, 0.38, ["fenster", 2.075, 3.185], ["fenster", 5.592, 6.065], ["fenster", 8.075, 9.185])
  .wand(0.19, 11.07, 23.81, 11.07, 0.38, ["fenster", 4.565, 5.435], ["fenster", 7.403, 8.398], ["fenster", 10.14, 11.135], ["fenster", 14.482, 15.477], ["fenster", 17.913, 18.908])
  .wand(6.38, 0.19, 6.38, 1.825, 0.24)
  .wand(6.38, 1.825, 8.29, 1.825, 0.125, ["tuer", 6.636, 7.521])
  .wand(8.29, 1.825, 8.29, 2.705, 0.125)
  .wand(8.29, 2.705, 9.21, 2.705, 0.125)
  .wand(6.38, 3.38, 6.38, 4.72, 0.24)
  .wand(9.21, 0.19, 9.21, 4.708, 0.125)
  .wand(9.21, 6.57, 9.21, 11.07, 0.125)
  .wand(0.19, 4.72, 6.38, 4.72, 0.125)
  .wand(6.38, 4.708, 20.23, 4.708, 0.25, ["tuer", 9.535, 10.42], ["tuer", 16.877, 17.762])
  .wand(4.606, 4.72, 4.606, 6.57, 0.125)
  .wand(6.32, 4.72, 6.32, 6.57, 0.12, ["tuer", 5.194, 6.079])
  .wand(4.606, 6.57, 9.21, 6.57, 0.125, ["tuer", 6.902, 7.787])
  .wand(3.186, 7.568, 6.38, 7.568, 0.125)
  .wand(3.186, 7.568, 3.186, 11.07, 0.125, ["tuer", 9.895, 10.78])
  .wand(6.38, 7.568, 6.38, 11.07, 0.24)
  .wand(7.93, 6.57, 7.93, 11.07, 0.125)
  .wand(6.38, 8.713, 7.93, 8.713, 0.125, ["tuer", 7.137, 7.772])
  .wand(12.07, 4.708, 12.07, 11.07, 0.125, ["tuer", 5.073, 5.958])
  .wand(12.07, 6.489, 23.81, 6.489, 0.25, ["tuer", 13.419, 14.429], ["tuer", 16.864, 17.749], ["tuer", 20.708, 21.593])
  .wand(15.94, 6.489, 15.94, 11.07, 0.125)
  .wand(19.77, 6.489, 19.77, 11.07, 0.125)
  .wand(15.228, 6.76, 15.875, 6.76, 0.3)
  .wand(19.83, 6.78, 20.365, 6.78, 0.34)
  .wand(13.65, 0.19, 13.65, 2.845, 0.125, ["tuer", 1.496, 2.246])
  .wand(13.65, 2.845, 15.22, 2.845, 0.125)
  .wand(15.22, 0.19, 15.22, 4.708, 0.1)
  .wand(15.616, 2.662, 15.616, 4.708, 0.687)
  .wand(18.7, 0.19, 18.7, 3.68, 0.125)
  .raum("Bad (WE 5)", "bad", 6.502, 0.38, 6.502, 1.762, 8.357, 1.762, 8.357, 2.642, 9.145, 2.642, 9.145, 0.38)
  .raum("Flur (WE 5)", "flur", 4.668, 6.509, 6.144, 6.509, 6.144, 6.45, 6.262, 6.45, 6.262, 4.829, 6.115, 4.829, 6.115, 4.656, 4.668, 4.656)
  .raum("Küche (WE 5)", "kueche", 9.145, 4.583, 9.145, 2.767, 8.232, 2.767, 8.232, 1.887, 6.262, 1.887, 6.262, 3.382, 6.502, 3.382, 6.502, 4.583)
  .raum("Schlafen (WE 8)", "schlafen", 3.248, 10.88, 6.262, 10.88, 6.262, 7.63, 3.248, 7.63)
  .raum("Bad (WE 8)", "bad", 6.502, 8.775, 6.502, 10.44, 6.742, 10.44, 6.742, 10.88, 7.865, 10.88, 7.865, 8.775)
  .raum("Küche (WE 8)", "kueche", 7.99, 10.88, 9.145, 10.88, 9.145, 6.66, 7.99, 6.66)
  .raum("Flur (WE 8)", "flur", 4.543, 7.505, 6.502, 7.505, 6.502, 8.65, 7.99, 8.65, 7.99, 6.66, 6.262, 6.66, 6.262, 6.67, 6.144, 6.67, 6.144, 6.634, 4.543, 6.634)
  .raum("Bad (WE 7)", "bad", 15.273, 0.38, 15.273, 2.662, 15.96, 2.662, 15.96, 4.583, 18.641, 4.583, 18.641, 0.38)
  .raum("Wohnen (WE 7)", "wohnen", 18.766, 0.38, 18.766, 3.683, 19.063, 3.683, 19.694, 4.257, 20.128, 4.257, 20.128, 4.583, 20.331, 4.583, 20.331, 4.833, 23.62, 4.833, 23.62, 0.38)
  .raum("Flur (WE 7)", "flur", 12.13, 4.833, 12.13, 6.364, 23.62, 6.364, 23.62, 4.833)
  .raum("Küche (WE 7)", "kueche", 12.13, 6.614, 12.13, 10.617, 12.27, 10.617, 12.27, 10.88, 15.875, 10.88, 15.875, 6.913, 15.228, 6.913, 15.228, 6.614)
  .raum("Schlafen (WE 7)", "schlafen", 16, 10.88, 19.705, 10.88, 19.705, 6.614, 16, 6.614)
  .raum("Schlafen (WE 7)", "schlafen", 19.83, 10.88, 23.62, 10.88, 23.62, 6.614, 20.365, 6.614, 20.365, 6.951, 19.83, 6.951)
  .raum("Wohnen (WE 6)", "wohnen", 9.27, 4.583, 15.172, 4.583, 15.172, 2.907, 13.586, 2.907, 13.586, 0.38, 9.518, 0.38, 9.518, 0.627, 9.27, 0.627)
  .raum("Bad (WE 6)", "bad", 13.711, 2.782, 15.033, 2.782, 15.033, 0.38, 13.711, 0.38)
  .raum("Wohnen (WE 8)", "wohnen", 4.543, 4.781, 0.38, 4.781, 0.38, 10.88, 3.123, 10.88, 3.123, 7.505, 4.543, 7.505)
  .raum("Wohnen (WE 5)", "wohnen", 4.668, 4.656, 6.115, 4.656, 6.115, 4.617, 6.262, 4.617, 6.262, 0.38, 0.38, 0.38, 0.38, 4.656)
  .raum("Treppenhaus", "treppenhaus", 6.38, 4.833, 12.005, 4.833, 12.005, 10.88, 9.27, 10.88, 9.27, 6.509, 6.38, 6.509)
  .plan(1);

const DG = bauer()
  .wand(0.125, 0.19, 23.875, 0.19, 0.38, ["fenster", 4.18, 7.13], ["fenster", 10.76, 13.71], ["fenster", 17.52, 20.47])
  .wand(0.125, 0.19, 0.125, 11.07, 0.25, ["fenster", 4.1, 6.3])
  .wand(23.875, 0.19, 23.875, 11.07, 0.25, ["fenster", 4.2, 5.3], ["fenster", 6, 7])
  .wand(0.125, 11.07, 9.365, 11.07, 0.38, ["fenster", 3.6, 6.1])
  .wand(15.225, 11.07, 23.875, 11.07, 0.38, ["fenster", 17.9, 20.4])
  .wand(9.365, 0.19, 9.365, 11.07, 0.25, ["tuer", 6.239, 7.246])
  .wand(0.125, 6.668, 5.72, 6.668, 0.15)
  .wand(5.72, 6.668, 6.51, 5.297, 0.15, ["tuer", 5.742, 6.4])
  .wand(6.51, 5.297, 9.365, 5.297, 0.15)
  .wand(5.659, 6.743, 6.333, 7.45, 0.15, ["tuer", 6.868, 7.405])
  .wand(6.333, 7.45, 6.333, 11.07, 0.15)
  .wand(6.333, 7.525, 9.365, 7.525, 0.15, ["tuer", 6.582, 7.207])
  .wand(13.964, 0.19, 13.964, 2.955, 0.15, ["tuer", 1.38, 2.005])
  .wand(13.964, 2.955, 15.495, 2.955, 0.15)
  .wand(15.495, 0.19, 15.495, 3, 0.25)
  .wand(15.365, 3, 15.365, 6.108, 0.25)
  .wand(15.62, 3.323, 16.54, 3.323, 1.02)
  .wand(16.54, 3.04, 17.318, 3.04, 0.25, ["tuer", 16.54, 17.115])
  .wand(17.318, 0.19, 17.318, 3.04, 0.25)
  .wand(9.365, 6.108, 15.365, 6.108, 0.25, ["tuer", 11.014, 12.024])
  .wand(13.365, 6.108, 13.365, 9.645, 0.25, ["tuer", 6.388, 7.148])
  .wand(13.365, 9.645, 15.225, 9.645, 0.25)
  .wand(15.225, 9.645, 15.225, 11.07, 0.25)
  .wand(13.365, 7.475, 23.875, 7.475, 0.15, ["tuer", 16.374, 17.134], ["tuer", 18.632, 19.517])
  .wand(17.244, 7.475, 17.244, 11.07, 0.15)
  .wand(9.365, 9.715, 10, 9.715, 0.25)
  .wand(10, 9.715, 10.9, 10.69, 0.25, ["fenster", 9.95, 10.45])
  .wand(10.9, 10.69, 12.45, 10.69, 0.25, ["fenster", 11.25, 12.1])
  .wand(12.45, 10.69, 13.365, 9.645, 0.25, ["fenster", 9.9, 10.4])
  .raum("Wohnen (WE 9)", "wohnen", 9.24, 5.222, 9.24, 0.38, 0.25, 0.38, 0.25, 6.593, 5.679, 6.593, 6.47, 5.222)
  .raum("Flur (WE 9)", "flur", 9.24, 5.372, 6.557, 5.372, 5.765, 6.743, 6.472, 7.45, 9.24, 7.45)
  .raum("Schlafen (WE 9)", "schlafen", 6.258, 7.45, 5.553, 6.743, 0.25, 6.743, 0.25, 10.88, 6.258, 10.88)
  .raum("Bad (WE 9)", "bad", 9.24, 7.6, 6.408, 7.6, 6.408, 10.88, 9.24, 10.88)
  .raum("Bad (WE 10)", "bad", 14.039, 2.88, 15.37, 2.88, 15.37, 0.38, 14.039, 0.38)
  .raum("Wohnen (WE 10)", "wohnen", 14.039, 3.03, 13.889, 3.03, 13.889, 0.38, 9.49, 0.38, 9.49, 5.983, 15.24, 5.983, 15.24, 3.03)
  .raum("Schlafen (WE 11)", "schlafen", 23.75, 10.88, 23.75, 7.55, 17.319, 7.55, 17.319, 10.88)
  .raum("Bad (WE 11)", "bad", 13.494, 7.55, 13.494, 9.521, 15.354, 9.521, 15.354, 10.88, 17.169, 10.88, 17.169, 7.55)
  .raum("Flur (WE 11)", "flur", 20.643, 2.52, 20.503, 2.52, 20.503, 3.166, 16.54, 3.166, 16.54, 3.833, 15.49, 3.833, 15.49, 7.4, 23.75, 7.4, 23.75, 0.38, 20.503, 0.38, 20.503, 2.38, 20.643, 2.38)
  .raum("Küche / Essen (WE 11)", "kueche", 17.443, 3.166, 20.503, 3.166, 20.503, 0.38, 17.443, 0.38)
  .raum("Abstellraum (WE 11)", "abstell", 15.62, 0.38, 15.62, 2.813, 16.54, 2.813, 16.54, 2.916, 17.193, 2.916, 17.193, 0.38)
  .raum("Flur (WE 11)", "flur", 13.494, 7.4, 15.49, 7.4, 15.49, 6.233, 13.494, 6.233)
  .raum("Treppenhaus", "treppenhaus", 9.49, 6.233, 13.24, 6.233, 13.24, 9.7, 12.4, 10.56, 10.97, 10.56, 10.05, 9.84, 9.49, 9.84)
  .plan(2);

/*
 * Dach eins zu eins als ebene Flächen (Höhe h über DG-Fußboden), nach den
 * Fotos 01–06 (Upload Investagon) und den Maßen aus Schnitt A und den
 * Ansichten Nord/West und Süd/Ost (1:100):
 * - Hauptdach 35°, Dachfläche an der Außenwandflucht 0,15 m über DG-Boden,
 *   First 4,09 m, Traufüberstand 0,3 m, Ortgang 0,2 m. Giebel an beiden
 *   Enden: Ost (Seiteneingang, Foto 04) und West. Für West sprechen die
 *   Ansicht Süd/West (Giebel mit Fenster), der DG-Plan (Giebelfenster, keine
 *   Gratlinien) und die Fotos 02/03 (gerader Ortgang am Westende, keine
 *   Walmfläche).
 * - Oben (Nordwest) drei Gauben bündig auf der Fassade, Mitten x 5,65 / 12,23
 *   / 18,99: unten steil (Fuß 5,1 m breit an der Traufe), Knick bei 2,35 m
 *   (3,7 m breit), First 3,55 m, vorn kleiner Krüppelwalm ab 3,1 m (45°).
 *   Ihre Kehlen enden bei y ≈ 4,8 wie die Linien im DG-Plan.
 * - Unten (Südost) zwei Zwerchgiebel x 1,0–8,8 und 15,1–22,9, 35°, Traufe
 *   0,85 / 0,89 m, First 3,58 / 3,62 m (gut 0,5 m unter dem Hauptfirst, Ansicht
 *   Süd/Ost); Kehlen wie die Linien im DG-Plan.
 * - Dazwischen der achteckige Treppenturm (3,4 m breit, Front y 10,82) mit
 *   Zeltdach, Traufe 2,33 m, Spitze 3,6 m.
 * - Vordächer zeigen weder Ansichten noch Fotos, daher keine.
 * Verschnitten ist rechnerisch: Jede Fläche endet dort, wo ein anderer
 * Dachkörper höher liegt, also genau an Kehle und Grat. Giebeldreiecke,
 * Gauben- und Zwerchgiebelwände und die Turmwände sind „fassade“, die
 * Giebelwände 2 cm vor der Wandflucht, damit sie nicht mit den DG-Wänden
 * flimmern. Ausgerechnet mit dach.py im Scratchpad (Ordner brueck).
 */
const fl = (material: Dachflaeche["material"], ...k: number[]): Dachflaeche => {
  const punkte: Array<[number, number, number]> = [];
  for (let i = 0; i < k.length; i += 3) punkte.push([k[i], k[i + 1], k[i + 2]]);
  return { geschoss: 2, material, punkte, ...(material === "ziegel" ? { farbe: "#d4524a" } : {}) };
};

const DACH: Dachflaeche[] = [
  fl("ziegel", 5.65, 4.86, 3.55, 3.8, 3.14, 2.35, 3.1, -0.3, -0.06, -0.2, -0.3, -0.06, -0.2, 5.63, 4.09, 24.2, 5.63, 4.09, 24.2, -0.3, -0.06, 21.54, -0.3, -0.06, 20.84, 3.14, 2.35, 18.99, 4.86, 3.55, 17.14, 3.14, 2.35, 16.44, -0.3, -0.06, 14.78, -0.3, -0.06, 14.08, 3.14, 2.35, 12.23, 4.86, 3.55, 10.38, 3.14, 2.35, 9.68, -0.3, -0.06, 8.2, -0.3, -0.06, 7.5, 3.14, 2.35),
  fl("ziegel", 0.8, 11.56, -0.06, 0.8, 10.46, 0.71, 4.9, 6.36, 3.58, 9, 10.46, 0.71, 9, 11.56, -0.06, 14.9, 11.56, -0.06, 14.9, 10.4, 0.75, 19, 6.3, 3.62, 23.1, 10.4, 0.75, 23.1, 11.56, -0.06, 24.2, 11.56, -0.06, 24.2, 5.63, 4.09, -0.2, 5.63, 4.09, -0.2, 11.56, -0.06),
  fl("ziegel", 4.9, 6.36, 3.58, 0.8, 10.46, 0.71, 0.8, 11.56, 0.71, 4.9, 11.56, 3.58),
  fl("ziegel", 9, 11.56, 0.71, 9, 10.46, 0.71, 4.9, 6.36, 3.58, 4.9, 11.56, 3.58),
  fl("ziegel", 14.9, 10.4, 0.75, 14.9, 11.56, 0.75, 19, 11.56, 3.62, 19, 6.3, 3.62),
  fl("ziegel", 23.1, 11.56, 0.75, 23.1, 10.4, 0.75, 19, 6.3, 3.62, 19, 11.56, 3.62),
  fl("ziegel", 3.1, -0.3, -0.06, 3.8, 3.14, 2.35, 3.8, -0.3, 2.35),
  fl("ziegel", 4.49, -0.3, 2.8, 3.8, -0.3, 2.35, 3.8, 3.14, 2.35, 5.65, 4.86, 3.55, 5.65, 0.45, 3.55),
  fl("ziegel", 8.2, -0.3, -0.06, 7.5, -0.3, 2.35, 7.5, 3.14, 2.35),
  fl("ziegel", 7.5, 3.14, 2.35, 7.5, -0.3, 2.35, 6.81, -0.3, 2.8, 5.65, 0.45, 3.55, 5.65, 4.86, 3.55),
  fl("ziegel", 6.81, -0.3, 2.8, 4.49, -0.3, 2.8, 5.65, 0.45, 3.55),
  fl("ziegel", 10.38, -0.3, 2.35, 9.68, -0.3, -0.06, 10.38, 3.14, 2.35),
  fl("ziegel", 10.38, 3.14, 2.35, 12.23, 4.86, 3.55, 12.23, 0.45, 3.55, 11.07, -0.3, 2.8, 10.38, -0.3, 2.35),
  fl("ziegel", 14.78, -0.3, -0.06, 14.08, -0.3, 2.35, 14.08, 3.14, 2.35),
  fl("ziegel", 12.23, 0.45, 3.55, 12.23, 4.86, 3.55, 14.08, 3.14, 2.35, 14.08, -0.3, 2.35, 13.39, -0.3, 2.8),
  fl("ziegel", 13.39, -0.3, 2.8, 11.07, -0.3, 2.8, 12.23, 0.45, 3.55),
  fl("ziegel", 17.14, 3.14, 2.35, 17.14, -0.3, 2.35, 16.44, -0.3, -0.06),
  fl("ziegel", 18.99, 0.45, 3.55, 17.83, -0.3, 2.8, 17.14, -0.3, 2.35, 17.14, 3.14, 2.35, 18.99, 4.86, 3.55),
  fl("ziegel", 20.84, 3.14, 2.35, 21.54, -0.3, -0.06, 20.84, -0.3, 2.35),
  fl("ziegel", 20.15, -0.3, 2.8, 18.99, 0.45, 3.55, 18.99, 4.86, 3.55, 20.84, 3.14, 2.35, 20.84, -0.3, 2.35),
  fl("ziegel", 20.15, -0.3, 2.8, 17.83, -0.3, 2.8, 18.99, 0.45, 3.55),
  fl("ziegel", 12.66, 11.2, 2.02, 13.83, 10.03, 2.02, 13.83, 9.98, 2.05, 11.75, 9.12, 3.6, 12.61, 11.2, 2.05),
  fl("ziegel", 13.83, 9.98, 2.05, 13.83, 8.55, 2.05, 13.63, 8.34, 2.19, 11.75, 9.12, 3.6),
  fl("ziegel", 12.31, 7.77, 2.59, 11.75, 9.12, 3.6, 13.63, 8.34, 2.19),
  fl("ziegel", 11.19, 7.77, 2.59, 11.75, 9.12, 3.6, 12.31, 7.77, 2.59),
  fl("ziegel", 11.19, 7.77, 2.59, 9.87, 8.34, 2.19, 11.75, 9.12, 3.6, 11.75, 9.12, 3.6),
  fl("ziegel", 9.67, 8.55, 2.05, 9.67, 9.98, 2.05, 11.75, 9.12, 3.6, 9.87, 8.34, 2.19),
  fl("ziegel", 9.67, 10.03, 2.02, 10.84, 11.2, 2.02, 10.89, 11.2, 2.05, 11.75, 9.12, 3.6, 9.67, 9.98, 2.05),
  fl("ziegel", 10.89, 11.2, 2.05, 12.61, 11.2, 2.05, 11.75, 9.12, 3.6, 11.75, 9.12, 3.6),
  fl("fassade", 24.02, 0, 0.15, 24.02, 2.81, 2.12, 24.02, 5.63, 4.09, 24.02, 11.26, 0.15),
  fl("fassade", -0.02, 0, 0.15, -0.02, 2.81, 2.12, -0.02, 5.63, 4.09, -0.02, 11.26, 0.15),
  fl("fassade", 1, 11.28, 0.85, 2.3, 11.28, 1.76, 4.9, 11.28, 3.58, 8.8, 11.28, 0.85, 8.8, 11.28, 0.15, 1, 11.28, 0.15),
  fl("fassade", 1, 11.26, 0.85, 1, 10.26, 0.85, 1, 11.26, 0.15),
  fl("fassade", 8.8, 11.26, 0.85, 8.8, 10.26, 0.85, 8.8, 11.26, 0.15),
  fl("fassade", 15.1, 11.28, 0.89, 15.75, 11.28, 1.34, 19, 11.28, 3.62, 22.9, 11.28, 0.89, 22.9, 11.28, 0.15, 15.1, 11.28, 0.15),
  fl("fassade", 15.1, 11.26, 0.89, 15.1, 10.2, 0.89, 15.1, 11.26, 0.15),
  fl("fassade", 22.9, 11.26, 0.89, 22.9, 10.2, 0.89, 22.9, 11.26, 0.15),
  fl("fassade", 3.16, -0.02, 0.15, 3.8, -0.02, 2.35, 4.95, -0.02, 3.1, 5, -0.02, 3.1, 6.3, -0.02, 3.1, 6.35, -0.02, 3.1, 7.5, -0.02, 2.35, 8.14, -0.02, 0.15),
  fl("fassade", 9.74, -0.02, 0.15, 10.38, -0.02, 2.35, 11.53, -0.02, 3.1, 11.58, -0.02, 3.1, 12.88, -0.02, 3.1, 12.93, -0.02, 3.1, 14.08, -0.02, 2.35, 14.72, -0.02, 0.15),
  fl("fassade", 16.5, -0.02, 0.15, 17.14, -0.02, 2.35, 18.29, -0.02, 3.1, 18.34, -0.02, 3.1, 19.64, -0.02, 3.1, 19.69, -0.02, 3.1, 20.84, -0.02, 2.35, 21.48, -0.02, 0.15),
  fl("fassade", 12.5, 10.82, 2.33, 13.45, 9.87, 2.33, 13.45, 9.87, 1.12, 12.5, 10.82, 0.46),
  fl("fassade", 13.45, 9.87, 2.33, 13.45, 8.37, 2.33, 13.45, 8.37, 2.17, 13.45, 9.87, 1.12),
  fl("fassade", 13.45, 8.37, 2.33, 13.37, 8.29, 2.33, 13.23, 8.15, 2.33, 13.45, 8.37, 2.17),
  fl("fassade", 10.27, 8.15, 2.33, 10.05, 8.37, 2.33, 10.05, 8.37, 2.17),
  fl("fassade", 10.05, 8.37, 2.33, 10.05, 9.87, 2.33, 10.05, 9.87, 1.12, 10.05, 8.37, 2.17),
  fl("fassade", 10.05, 9.87, 2.33, 11, 10.82, 2.33, 11, 10.82, 0.46, 10.05, 9.87, 1.12),
  fl("fassade", 11, 10.82, 2.33, 12.5, 10.82, 2.33, 12.5, 10.82, 0.46, 11, 10.82, 0.46),
];

const AUSSEHEN: Aussehen = {
  fassade: "#f2f0ea",
  dach: { art: "flaechen", flaechen: DACH },
  // Terrasse von WE 1 vor dem Westgiebel (17,28 m² laut Abgeschlossenheitsplan).
  balkone: [{ geschosse: [0], x: -2.49, y: 0.41, b: 2.49, t: 6.86 }],
};

export const BRUECK: { name: string; etagen: Array<{ geschoss: number; titel: string; plan: Grundriss3dPlan }>; aussehen: Aussehen } = {
  name: "Marktstraße 6, Brück",
  etagen: [
    { geschoss: 0, titel: "Erdgeschoss", plan: EG },
    { geschoss: 1, titel: "1. Obergeschoss", plan: OG },
    { geschoss: 2, titel: "Dachgeschoss", plan: DG },
  ],
  aussehen: AUSSEHEN,
};
