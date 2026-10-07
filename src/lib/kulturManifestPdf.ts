// Das OS Immobilien Kultur-PDF: Unsere Kultur.
//
// Gleiche Aufmachung wie die übrigen System-PDFs (simpleDocPdf mit Logo,
// Kopf- und Fußzeile). Die Inhalte kommen aus dem zentralen Kultur-Modul,
// damit PDF, Kulturseite, Akademie-Kapitel und Dashboard nie auseinanderlaufen.
//
// Aufbau: Jeder Abschnitt beginnt auf einer eigenen Seite, damit man das
// Dokument auch abschnittsweise ausdrucken kann. Am Ende stehen die sieben
// Glaubenssätze als Plakatseiten, je ein Satz groß in einem Kasten.

import { type DocBlock, generateSimpleDocPdf } from "./simpleDocPdf";
import {
  KULTUR_WERTE,
  KULTUR_STANDARDS,
  KULTUR_FEINDBILDER,
  KULTUR_GLAUBENSSAETZE,
  KULTUR_VISION,
} from "./kulturContent";

export const generateKulturManifestPDF = () => {
  const intern = KULTUR_FEINDBILDER.filter((f) => f.richtung === "intern");
  const extern = KULTUR_FEINDBILDER.filter((f) => f.richtung === "extern");

  const blocks: DocBlock[] = [];

  /* ── Seite 1: Worum es geht und die Vision ─────────────────── */

  blocks.push(
    { type: "h2", text: "Worum es hier geht" },
    {
      type: "p",
      text: "Menschen vertrauen uns etwas an, das sie sich über Jahre erspart haben. Dieses Dokument hält fest, wie wir mit diesem Vertrauen umgehen: unsere Werte, unsere Standards, unsere Glaubenssätze und das, wogegen wir antreten. Nichts davon hängt an einer Wand, alles davon zeigt sich im Gespräch. Lies es regelmäßig, besonders vor wichtigen Terminen.",
    },
    {
      type: "list",
      items: [
        "Werte sagen, wie wir entscheiden, wenn eine Entscheidung unbequem wird.",
        "Standards sind unsere Versprechen an die Menschen, die mit uns arbeiten.",
        "Glaubenssätze sagen, wie wir mit uns selbst reden, besonders an schwachen Tagen.",
        "Feindbilder sagen, wogegen wir antreten, und das ist nie ein Mensch, sondern ein Verhalten.",
      ],
    },
    { type: "spacer", size: 3 },
    { type: "h2", text: "Ziele und Vision" },
  );

  if (KULTUR_VISION.entwurf) {
    blocks.push({
      type: "callout",
      variant: "warn",
      text: "Entwurfsfassung. Vision, Jahresziel und Warum werden von der Geschäftsführung final formuliert.",
    });
  }

  blocks.push(
    { type: "p", text: KULTUR_VISION.satz },
    { type: "p", text: KULTUR_VISION.warum },
    { type: "list", items: KULTUR_VISION.ziele },
  );

  /* ── Seite 2: Werte ────────────────────────────────────────── */

  blocks.push(
    { type: "pageBreak" },
    { type: "h2", text: "Unsere Werte" },
    {
      type: "p",
      text: "Vier Sätze, an denen wir uns messen lassen, wenn eine Entscheidung unbequem wird. Vier und nicht acht, denn wer acht Werte hat, hat keine. Der Test für den Alltag ist einfach: Welche der vier Überschriften passt auf diese Situation, und was würde sie mir raten?",
    },
    { type: "spacer", size: 2 },
  );

  KULTUR_WERTE.forEach((wert, i) => {
    blocks.push({
      type: "karte",
      nummer: String(i + 1).padStart(2, "0"),
      titel: wert.titel,
      text: wert.text,
    });
  });

  /* ── Seite 3: Standards ────────────────────────────────────── */

  blocks.push(
    { type: "pageBreak" },
    { type: "h2", text: "Unsere Standards" },
    {
      type: "p",
      text: "Sechs Versprechen an die Menschen, die mit uns arbeiten. Weil sie messbar sind, stehen sie im System und nicht auf einem Poster. Konsequenz ist dabei der Unterschied zwischen einem Standard und einem Vorsatz: Ein Standard, der nur meistens gilt, ist keiner.",
    },
    { type: "spacer", size: 2 },
    {
      type: "table",
      head: ["Nr.", "Standard", "Was unsere Kunden davon haben", "Im CRM messbar"],
      spalten: [6, 26, 54, 14],
      rows: KULTUR_STANDARDS.map((s, i) => [
        String(i + 1),
        s.titel,
        s.text,
        s.messbar ? "ja" : "nein",
      ]),
    },
    {
      type: "callout",
      variant: "success",
      text: "Fünf der sechs Standards hält das System selbst nach: Anfragealter, Dokumentationsdatum, Pipeline-Ampel, Selbstauskunft und Systemzahlen. Wer sie hochhält, merkt das nicht an Lob, sondern daran, dass Kunden zurückkommen und weiterempfehlen.",
    },
  );

  /* ── Seite 4: Feindbilder ──────────────────────────────────── */

  blocks.push(
    { type: "pageBreak" },
    { type: "h2", text: "Wogegen wir antreten" },
    {
      type: "p",
      text: "Nie gegen Menschen, also nicht gegen Wettbewerber, Berufsgruppen oder Kundentypen. Das wäre unfair und würde genau die Kultur vergiften, die es aufbauen soll. Unsere Feindbilder richten sich gegen Verhalten, und zwar zuerst gegen eigenes.",
    },
    { type: "h3", text: "In uns selbst" },
  );

  intern.forEach((feind) => {
    blocks.push({ type: "karte", titel: feind.titel, text: feind.text });
  });

  blocks.push(
    { type: "spacer", size: 2 },
    { type: "h3", text: "Draußen, für unsere Kunden" },
  );

  extern.forEach((feind) => {
    blocks.push({ type: "karte", titel: feind.titel, text: feind.text, akzent: true });
  });

  /* ── Seite 5: Glaubenssätze im Überblick und das eigene Warum ─ */

  blocks.push(
    { type: "pageBreak" },
    { type: "h2", text: "Unsere Glaubenssätze" },
    {
      type: "p",
      text: "Sieben Sätze in Ich-Form für die Tage, an denen es nicht von allein läuft. Einer davon begrüßt dich jeden Morgen im Dashboard, für alle im Team derselbe. Sie sind keine Poesie, sondern Arbeitswerkzeug: Der Satz, der dir heute schwerfällt, ist meist der, den du heute brauchst. Auf den folgenden Seiten steht jeder Satz einzeln und groß, zum Ausdrucken und Aufhängen.",
    },
    { type: "list", items: KULTUR_GLAUBENSSAETZE, ordered: true },
    { type: "spacer", size: 3 },
    { type: "h2", text: "Dein eigenes Warum" },
    {
      type: "p",
      text: "Warum bist du hier, und wem willst du mit dieser Arbeit etwas ermöglichen? Schreib es auf, mit Datum, und lies es wieder, wenn eine Woche nicht läuft.",
    },
    { type: "kv", label: "Mein Warum", value: " " },
    { type: "kv", label: "Mein Ziel in 12 Monaten", value: " " },
    { type: "kv", label: "Datum", value: " " },
  );

  /* ── Plakatseiten: je ein Glaubenssatz ─────────────────────── */

  KULTUR_GLAUBENSSAETZE.forEach((satz, i) => {
    blocks.push({
      type: "poster",
      text: satz,
      nummer: String(i + 1).padStart(2, "0"),
      untertitel: `Glaubenssatz ${i + 1} von ${KULTUR_GLAUBENSSAETZE.length}  ·  OS Immobilien`,
    });
  });

  return generateSimpleDocPdf({
    title: "Unsere Kultur",
    subtitle: "Werte, Standards, Glaubenssätze und wogegen wir antreten",
    filename: "OS-Immobilien_Unsere_Kultur.pdf",
    deckblatt: {
      kennung: "Unternehmenskultur",
      titel: "Unsere Kultur",
      untertitel:
        "Werte, Standards, Glaubenssätze und das, wogegen wir für unsere Kunden antreten.",
      nummer: "KUL-01",
    },
    blocks,
  });
};
