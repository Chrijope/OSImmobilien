import { generateSimpleDocPdf } from "./simpleDocPdf";

/**
 * 6 Einwandbehandlungs-Techniken als einzelne PDFs.
 * Jede Technik mit Erklärung, Schritten, Beispielen und Übungsaufgaben.
 */

export const generateBumerangTechnikPDF = () => generateSimpleDocPdf({
  title: "Bumerang-Technik",
  subtitle: "Einwände in Kaufargumente verwandeln",
  filename: "OS-Immobilien_Technik_Bumerang.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Bumerang-Technik", untertitel: "Einwände in Kaufargumente verwandeln", nummer: "EIN-01" },
  blocks: [
    { type: "h2", text: "Was ist die Bumerang-Technik?" },
    { type: "p", text: "Die Bumerang-Technik nutzt den Einwand des Kunden als Sprungbrett für ein Gegenargument. Aus dem 'Nein-Anker' wird ein 'Ja-Argument'. Sie funktioniert besonders bei emotionalen oder pauschalen Einwänden." },
    { type: "h2", text: "Die 3 Schritte" },
    { type: "list", items: [
      "Einwand wertschätzend bestätigen ('Genau deshalb…')",
      "Den Einwand spiegeln und in einen Vorteil umkehren",
      "Mit Frage abschließen, die Zustimmung erzeugt",
    ]},
    { type: "h2", text: "Beispiel 1: 'Immobilien sind zu teuer'" },
    { type: "callout", variant: "info", text: "Genau deshalb solltest du jetzt einsteigen – wenn Substanzwerte teuer sind, dann deshalb, weil sie knapp sind. Genau das macht sie zu einer wertstabilen Anlage. Welche Anlageklasse hat in den letzten 30 Jahren mehr Vermögen aufgebaut?" },
    { type: "h2", text: "Beispiel 2: 'Ich will mich nicht binden'" },
    { type: "callout", variant: "info", text: "Genau deshalb ist eine Kapitalanlage-Immobilie ideal: Du bindest dich nicht persönlich, weil ein Mieter darin wohnt. Dein Geld bleibt aktiv – statt auf dem Tagesgeld zu schmelzen. Würdest du zustimmen, dass Inflation aktuell die größere Bindung ist?" },
    { type: "h2", text: "Beispiel 3: 'Ich habe keine Zeit'" },
    { type: "callout", variant: "info", text: "Genau deshalb ist unser Komplettpaket interessant: Wir übernehmen alles – Standortanalyse, Bonität, Notar, Verwaltung. Du investierst maximal 2 Stunden deiner Zeit. Wann hättest du diese 2 Stunden in den nächsten 14 Tagen?" },
    { type: "h2", text: "Wann nicht einsetzen?" },
    { type: "list", items: [
      "Bei sachlichen Einwänden mit echten Zahlen → besser Argumente liefern",
      "Wenn Kunde sich angegriffen fühlen könnte → erst Beziehung stärken",
      "Bei Bedenken zur eigenen Bonität → empathisch zuhören, dann lösen",
    ]},
    { type: "h2", text: "Übung: Eigene Bumerangs entwickeln" },
    { type: "checkbox", text: "Notiere die 3 häufigsten Einwände aus deinen letzten Gesprächen" },
    { type: "checkbox", text: "Formuliere für jeden einen Bumerang nach dem 3-Schritte-Schema" },
    { type: "checkbox", text: "Übe sie laut – Bumerangs müssen flüssig kommen" },
  ],
});

export const generateKontextwechselPDF = () => generateSimpleDocPdf({
  title: "Kontextwechsel-Technik",
  subtitle: "Einwände durch Perspektivwechsel entkräften",
  filename: "OS-Immobilien_Technik_Kontextwechsel.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Kontextwechsel-Technik", untertitel: "Einwände durch Perspektivwechsel entkräften", nummer: "EIN-02" },
  blocks: [
    { type: "h2", text: "Was ist die Kontextwechsel-Technik?" },
    { type: "p", text: "Der Kunde betrachtet sein Investment in einem zu engen Kontext (z. B. 'monatliche Rate'). Du erweiterst den Blickwinkel auf Lebenszeit, Inflation oder Vergleichsanlagen. Plötzlich erscheint der Einwand klein." },
    { type: "h2", text: "Die 4 Bewährten Kontexte" },
    { type: "list", items: [
      "Zeit-Kontext: 'Pro Tag sind das nur 12 €'",
      "Vergleichs-Kontext: 'Das ist weniger als deine KFZ-Versicherung'",
      "Inflations-Kontext: 'In 10 Jahren ist dein Geld auf dem Tagesgeld 23 % weniger wert'",
      "Lebenszeit-Kontext: 'Du arbeitest 40 Jahre – wo willst du mit 65 stehen?'",
    ]},
    { type: "h2", text: "Beispiel 1: 'Die monatliche Rate ist zu hoch'" },
    { type: "callout", variant: "info", text: "Stimmt, 950 € pro Monat klingen viel. Aber rechnen wir es um: Das sind 31 € pro Tag – weniger als ein Mittagessen mit Kollegen. Und davon zahlt der Mieter 720 € zurück. Dein echter Aufwand: 7,60 € pro Tag. Wären dir 7,60 € am Tag Vermögensaufbau wert?" },
    { type: "h2", text: "Beispiel 2: 'Was ist, wenn der Markt einbricht?'" },
    { type: "callout", variant: "info", text: "Berechtigte Frage. Schauen wir den Kontext an: Selbst der größte Crash 2008 hat deutsche Wohnimmobilien durchschnittlich nur 4 % nach unten bewegt – und nach 18 Monaten waren die Preise höher als vorher. Wo waren in dieser Zeit DAX und Bitcoin?" },
    { type: "h2", text: "Wirkungsstark machen" },
    { type: "list", items: [
      "Konkrete Zahlen statt Floskeln",
      "Vergleiche aus der Lebenswelt des Kunden (Auto, Urlaub, Café)",
      "Immer mit Zustimmungsfrage abschließen",
    ]},
  ],
});

export const generateHypothetischeFragePDF = () => generateSimpleDocPdf({
  title: "Hypothetische-Frage-Technik",
  subtitle: "Einwände mit Konjunktiv ausräumen",
  filename: "OS-Immobilien_Technik_Hypothetische_Frage.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Hypothetische-Frage-Technik", untertitel: "Einwände mit Konjunktiv ausräumen", nummer: "EIN-03" },
  blocks: [
    { type: "h2", text: "Die Macht des 'Angenommen…'" },
    { type: "p", text: "Eine hypothetische Frage zwingt den Kunden mental in eine Situation, in der der Einwand nicht mehr gilt. Damit wird der echte, dahinterliegende Einwand sichtbar – oder der vorgeschobene Einwand löst sich auf." },
    { type: "h2", text: "Das Standardformat" },
    { type: "callout", variant: "success", text: "'Angenommen, [Einwand wäre gelöst] – wärst du dann grundsätzlich bereit, [Zielhandlung]?'" },
    { type: "h2", text: "Beispiel 1: 'Ich habe nicht genug Eigenkapital'" },
    { type: "callout", variant: "info", text: "Verstehe. Angenommen, wir würden eine Bank finden, die mit nur 9 % Eigenkapital für die Nebenkosten finanziert – wärst du dann grundsätzlich bereit, in die nächste Phase zu gehen?" },
    { type: "h2", text: "Beispiel 2: 'Ich muss mit meiner Frau sprechen'" },
    { type: "callout", variant: "info", text: "Selbstverständlich. Angenommen, deine Frau wäre auch von der Idee überzeugt – würdest du persönlich dann zustimmen, dass wir die nächste Phase starten?" },
    { type: "h2", text: "Beispiel 3: 'Vielleicht in einem Jahr'" },
    { type: "callout", variant: "info", text: "Verstehe. Angenommen, der Markt würde im nächsten Jahr 8 % zulegen und die Zinsen weiter steigen – würdest du es dann bereuen, heute nicht eingestiegen zu sein?" },
    { type: "h2", text: "Was die Antwort verrät" },
    { type: "list", items: [
      "Antwort 'Ja': Vorgeschobener Einwand → den echten finden und lösen",
      "Antwort 'Nein, weil…': Der echte Einwand kommt auf den Tisch",
      "Ausweichen: Vertrauen fehlt → Beziehungsebene stärken",
    ]},
  ],
});

export const generateVorwegnahmePDF = () => generateSimpleDocPdf({
  title: "Vorwegnahme-Technik",
  subtitle: "Einwände entwaffnen, bevor sie ausgesprochen werden",
  filename: "OS-Immobilien_Technik_Vorwegnahme.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Vorwegnahme-Technik", untertitel: "Einwände entwaffnen, bevor sie ausgesprochen werden", nummer: "EIN-04" },
  blocks: [
    { type: "h2", text: "Was ist die Vorwegnahme?" },
    { type: "p", text: "Du sprichst kritische Punkte aktiv an, bevor der Kunde sie als Einwand formuliert. Damit nimmst du dem Einwand seine Wirkung – und zeigst Souveränität, Transparenz und Kompetenz." },
    { type: "h2", text: "Wann besonders mächtig?" },
    { type: "list", items: [
      "Bei bekannten Bedenken (Marktrisiko, Zinsen, Verwaltungsaufwand)",
      "Beim Einwand 'Klingt zu gut, um wahr zu sein'",
      "Wenn Wettbewerber dich angreifen könnten",
    ]},
    { type: "h2", text: "Beispiel 1: Marktrisiko" },
    { type: "callout", variant: "info", text: "Bevor wir zum Zahlenwerk kommen, möchte ich dir ehrlich sagen: Auch Immobilien können temporär an Wert verlieren. 2022/23 sind die Preise in Deutschland um durchschnittlich 13 % gefallen. Genau deshalb arbeiten wir nur mit B- und A-Lagen mit nachweisbarer Mietnachfrage. Lass mich dir zeigen, warum unser Standort selbst dieser Korrektur standhält." },
    { type: "h2", text: "Beispiel 2: Verwaltungsaufwand" },
    { type: "callout", variant: "info", text: "Viele Käufer fragen mich: 'Was, wenn der Mieter nicht zahlt oder das Bad neu muss?' Genau deshalb arbeiten wir mit einer professionellen Hausverwaltung, die mietausfallversichert vermittelt und sich um alle Reparaturen kümmert. Du hast mit der Wohnung nach dem Kauf maximal 1-2 Stunden pro Jahr zu tun." },
    { type: "h2", text: "Die Wirkung" },
    { type: "list", items: [
      "Der Kunde fühlt sich ernst genommen",
      "Du wirkst nicht wie ein Verkäufer, der etwas verschweigt",
      "Der Einwand ist 'verbrannt' – er kann ihn nicht mehr stark vorbringen",
      "Vertrauen wächst – Abschlussquote steigt nachweislich",
    ]},
  ],
});

export const generateIsolierendeFragePDF = () => generateSimpleDocPdf({
  title: "Isolierende-Frage-Technik",
  subtitle: "Den echten Einwand finden",
  filename: "OS-Immobilien_Technik_Isolierende_Frage.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Isolierende-Frage-Technik", untertitel: "Den echten Einwand finden", nummer: "EIN-05" },
  blocks: [
    { type: "h2", text: "Warum isolieren?" },
    { type: "p", text: "Kunden bringen oft mehrere Einwände hintereinander oder verstecken den eigentlichen Grund hinter Vorwand-Einwänden. Mit der isolierenden Frage trennst du den genannten Einwand vom echten – und behandelst ihn gezielt." },
    { type: "h2", text: "Die Standardformel" },
    { type: "callout", variant: "success", text: "'Mal abgesehen von [genanntem Einwand] – gibt es noch etwas anderes, das dich vor einer Entscheidung zurückhält?'" },
    { type: "h2", text: "Beispiel-Dialog" },
    { type: "p", text: "Kunde: 'Die Rendite ist mir zu niedrig.'" },
    { type: "p", text: "Du: 'Verstehe. Mal abgesehen von der Rendite – gibt es noch etwas anderes, das dich zögern lässt?'" },
    { type: "p", text: "Kunde: 'Naja, ehrlich gesagt habe ich Sorge wegen der Bonitätsprüfung bei meinem Selbstständigen-Status.'" },
    { type: "callout", variant: "warn", text: "Das war der echte Einwand! Die Rendite war nur vorgeschoben. Jetzt kannst du gezielt auf die Bonitätsfrage eingehen." },
    { type: "h2", text: "Variationen" },
    { type: "list", items: [
      "'Ist das dein einziger Vorbehalt?'",
      "'Wenn wir das geklärt hätten – stünde dem Abschluss noch etwas im Weg?'",
      "'Was müsste passieren, damit du heute zustimmst?'",
    ]},
    { type: "h2", text: "Goldene Regel" },
    { type: "callout", variant: "warn", text: "Behandle nie einen Einwand, ohne sicher zu sein, dass es wirklich der einzige ist. Sonst kommt nach jeder Lösung ein neuer Einwand – und du verlierst." },
  ],
});

export const generateReferenzTechnikPDF = () => generateSimpleDocPdf({
  title: "Referenz-Technik",
  subtitle: "Einwände mit sozialem Beweis entkräften",
  filename: "OS-Immobilien_Technik_Referenz.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Referenz-Technik", untertitel: "Einwände mit sozialem Beweis entkräften", nummer: "EIN-06" },
  blocks: [
    { type: "h2", text: "Warum Referenzen wirken" },
    { type: "p", text: "Menschen sind soziale Wesen. Wenn jemand 'wie sie' bereits erfolgreich entschieden hat, sinkt die wahrgenommene Unsicherheit. Diese Technik nutzt Vergleichsfälle, um Einwände zu entkräften." },
    { type: "h2", text: "Die 3 Säulen einer guten Referenz" },
    { type: "list", items: [
      "Ähnliche Lebenssituation (Beruf, Alter, Familienstand)",
      "Gleicher oder ähnlicher Einwand zu Beginn",
      "Konkretes, positives Ergebnis (Zahlen!)",
    ]},
    { type: "h2", text: "Beispiel 1: 'Ich bin zu alt dafür'" },
    { type: "callout", variant: "info", text: "Ich verstehe. Ein Kunde von mir, Robert M. aus Augsburg, war 58 als wir starteten. Er war zunächst sehr skeptisch wegen seines Alters. Heute, mit 60, hat er seine erste vermietete Wohnung – die Bank hat 100 % finanziert, weil sein Einkommen stabil war. Er sagt heute, er hätte gerne 5 Jahre früher angefangen. Wie unterscheidet sich deine Situation?" },
    { type: "h2", text: "Beispiel 2: 'Als Selbstständige bekomme ich keine Finanzierung'" },
    { type: "callout", variant: "info", text: "Sabine K., 52, Steuerberaterin aus Stuttgart, dachte das auch. Wir haben mit 3 Banken parallel verhandelt und die Bonität anhand ihrer letzten 3 Jahresabschlüsse aufgebaut. Heute spart sie über die Denkmal-AfA mehr als 7.000 € Steuern – jährlich. Lass uns deine Situation konkret durchrechnen." },
    { type: "h2", text: "Wichtige Regeln" },
    { type: "list", items: [
      "Niemals Namen ohne ausdrückliche schriftliche Freigabe nennen",
      "Anonymisieren: 'Ein Kunde aus Region X, Beruf Y'",
      "Konkrete Zahlen erhöhen die Glaubwürdigkeit",
      "Niemals erfinden – sonst zerstört es bei Aufdeckung das Vertrauen komplett",
    ]},
    { type: "h2", text: "Aufbau eines Referenz-Pools" },
    { type: "checkbox", text: "Sammle nach jedem Abschluss eine kurze Notiz zum Kundenprofil" },
    { type: "checkbox", text: "Notiere den initialen Einwand und wie er gelöst wurde" },
    { type: "checkbox", text: "Halte das konkrete Ergebnis fest (Rendite, Steuerersparnis, Cashflow)" },
    { type: "checkbox", text: "Bitte 1-2 Kunden um schriftliche Freigabe für eine Kurzreferenz" },
  ],
});

export const generateGegenfragePDF = () => generateSimpleDocPdf({
  title: "Gegenfrage-Technik",
  subtitle: "Den Einwand mit einer klugen Frage zurückspielen",
  filename: "OS-Immobilien_Technik_Gegenfrage.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Gegenfrage-Technik", untertitel: "Den Einwand mit einer klugen Frage zurückspielen", nummer: "EIN-07" },
  blocks: [
    { type: "h2", text: "Wer fragt, der führt." },
    { type: "p", text: "Statt einen Einwand zu beantworten, stellst du eine offene Gegenfrage. So lenkst du den Kunden ins Nachdenken, gewinnst Zeit und erfährst gleichzeitig den wahren Hintergrund." },
    { type: "h2", text: "Beispiel 1: 'Das ist mir zu teuer'" },
    { type: "callout", variant: "info", text: "Verstehe. Womit vergleichst du aktuell den Preis – mit deinem Tagesgeld, mit anderen Anlageklassen oder mit der erwarteten Wertsteigerung?" },
    { type: "h2", text: "Beispiel 2: 'Das Risiko ist mir zu hoch'" },
    { type: "callout", variant: "info", text: "Spannende Aussage. Was wäre für dich der größte Risikofaktor – ein Mietausfall, ein Wertverlust der Immobilie oder eine Zinserhöhung?" },
    { type: "h2", text: "Beispiel 3: 'Ich glaube nicht, dass sich das rechnet'" },
    { type: "callout", variant: "info", text: "Was müsste sich konkret rechnen, damit es für dich attraktiv wäre – Cashflow ab Tag 1, Steuerersparnis oder reine Wertentwicklung?" },
    { type: "h2", text: "Goldene Regeln" },
    { type: "list", items: [
      "Immer offene Fragen (nicht ja/nein)",
      "Echtes Interesse an der Antwort zeigen",
      "Antwort notieren – sie ist Gold für die nächste Phase",
    ]},
  ],
});

export const generateZerlegungsTechnikPDF = () => generateSimpleDocPdf({
  title: "Zerlegungs-Technik",
  subtitle: "Pauschale Einwände in Einzelteile zerlegen",
  filename: "OS-Immobilien_Technik_Zerlegung.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Zerlegungs-Technik", untertitel: "Pauschale Einwände in Einzelteile zerlegen", nummer: "EIN-08" },
  blocks: [
    { type: "h2", text: "Pauschale Einwände sind selten echt" },
    { type: "p", text: "Wenn ein Kunde sagt 'Immobilien sind nichts für mich', steckt dahinter selten eine durchdachte Analyse, sondern oft 1-2 konkrete Sub-Sorgen. Die Zerlegungstechnik bricht den Pauschal-Einwand auf seine Bestandteile herunter." },
    { type: "h2", text: "Standard-Format" },
    { type: "callout", variant: "success", text: "'Wenn du an Immobilien als Anlage denkst – welche 2-3 Bereiche bereiten dir am meisten Bauchschmerzen? Finanzierung, Verwaltung, Mieter, Wertentwicklung?'" },
    { type: "h2", text: "Beispiel-Dialog" },
    { type: "p", text: "Kunde: 'Immobilien sind nichts für mich.'" },
    { type: "p", text: "Du: 'Damit ich verstehe, was du genau meinst: Liegt es eher an der langen Bindung, der Verwaltung oder der Finanzierung?'" },
    { type: "p", text: "Kunde: 'Hauptsächlich die Verwaltung. Ich will mich nicht um Mieter kümmern.'" },
    { type: "callout", variant: "warn", text: "Treffer! Aus dem pauschalen 'Nein' wurde ein konkreter Punkt – den du mit der Hausverwaltungs-Dienstleistung leicht ausräumen kannst." },
    { type: "h2", text: "Wirkung" },
    { type: "list", items: [
      "Der pauschale Einwand zerfällt in lösbare Mini-Einwände",
      "Du zeigst Verständnis statt Verkaufsdruck",
      "Du bekommst eine echte Agenda für das Folgegespräch",
    ]},
  ],
});

export const generateZeitumkehrPDF = () => generateSimpleDocPdf({
  title: "Zeitumkehr-Technik",
  subtitle: "Den Einwand aus Sicht des zukünftigen Ich betrachten",
  filename: "OS-Immobilien_Technik_Zeitumkehr.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Zeitumkehr-Technik", untertitel: "Den Einwand aus Sicht des zukünftigen Ich betrachten", nummer: "EIN-09" },
  blocks: [
    { type: "h2", text: "Vom Heute ins Morgen springen" },
    { type: "p", text: "Diese Technik versetzt den Kunden mental 5, 10 oder 30 Jahre in die Zukunft. Aus dieser Perspektive wirken kurzfristige Bedenken meist klein, das Aufschieben dagegen schmerzhaft." },
    { type: "h2", text: "Standard-Format" },
    { type: "callout", variant: "success", text: "'Stell dir vor, wir sprechen in 10 Jahren wieder. Was würdest du dir heute am liebsten geraten haben?'" },
    { type: "h2", text: "Beispiel 1: 'Vielleicht in einem Jahr'" },
    { type: "callout", variant: "info", text: "Stell dir vor, wir sprechen in 5 Jahren wieder. Die Wohnung hätte 18 % an Wert gewonnen, der Mieter hätte 35.000 € Tilgung bezahlt. Würdest du es bereuen, heute gewartet zu haben?" },
    { type: "h2", text: "Beispiel 2: 'Ich bin zu alt'" },
    { type: "callout", variant: "info", text: "Stell dir vor, du bist 75 und schaust zurück auf die Entscheidung von heute. Würde 'Ich war zu alt' noch ein guter Grund sein – oder eher 'Ich hätte es einfach versuchen sollen'?" },
    { type: "h2", text: "Wirkung" },
    { type: "list", items: [
      "Kurzfristige Sorgen verlieren ihr Gewicht",
      "Die Opportunitätskosten des Nicht-Handelns werden sichtbar",
      "Emotionale Anker für die Entscheidung entstehen",
    ]},
  ],
});

export const generateZahlenZerlegungPDF = () => generateSimpleDocPdf({
  title: "Zahlen-Zerlegungs-Technik",
  subtitle: "Mit konkreten Zahlen Wirklichkeit schaffen",
  filename: "OS-Immobilien_Technik_Zahlen.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Zahlen-Zerlegungs-Technik", untertitel: "Mit konkreten Zahlen Wirklichkeit schaffen", nummer: "EIN-10" },
  blocks: [
    { type: "h2", text: "Zahlen schlagen Meinungen" },
    { type: "p", text: "Im Vertrieb gewinnt am Ende, wer die besseren Zahlen liefert. Diese Technik zerlegt jeden gefühlsbasierten Einwand in eine nachvollziehbare Rechnung – am besten live auf einem Blatt Papier oder im Rechner." },
    { type: "h2", text: "Beispiel 1: 'Ich habe Sorge, mich finanziell zu übernehmen'" },
    { type: "callout", variant: "info", text: "Lass uns das gemeinsam rechnen: Dein Netto liegt bei 4.200 €. Lebenshaltung 2.300 €. Bleiben 1.900 €. Der Cashflow der Wohnung wäre +85 € pro Monat. Wo entsteht da die finanzielle Belastung?" },
    { type: "h2", text: "Beispiel 2: 'Steuerersparnis ist doch nur ein Werbegag'" },
    { type: "callout", variant: "info", text: "Schauen wir deine Lohnsteuerbescheinigung: Du zahlst aktuell 18.400 € Lohnsteuer pro Jahr. Mit der AfA und den Werbungskosten dieser Wohnung sinkt das auf 14.700 € – also 3.700 € mehr Netto pro Jahr. Real auf deinem Konto." },
    { type: "h2", text: "Spielregeln" },
    { type: "list", items: [
      "Immer mit den Zahlen DES KUNDEN rechnen, nicht mit Schaubildern",
      "Auf Papier oder im Rechner mitrechnen, nicht im Kopf",
      "Kunden mitrechnen lassen – das schafft maximale Überzeugung",
      "Niemals beschönigen – auch worst-case Szenarien rechnen",
    ]},
  ],
});

// ─────────────────────────────────────────
// Sammel-PDF: Alle 10 Techniken in einem Dokument
// ─────────────────────────────────────────
export const generateAlleTechnikenPDF = () => generateSimpleDocPdf({
  title: "Alle 10 Einwandbehandlungs-Techniken",
  subtitle: "Das komplette Toolkit für den Vertrieb von Kapitalanlage-Immobilien",
  filename: "OS-Immobilien_Alle_10_Techniken.pdf",
  deckblatt: { kennung: "Einwandtechnik", titel: "Alle 10 Einwandbehandlungs-Techniken", untertitel: "Das komplette Toolkit für den Vertrieb von Kapitalanlage-Immobilien", nummer: "EIN-11" },
  blocks: [
    { type: "h2", text: "Vorwort" },
    { type: "p", text: "Einwände sind keine Ablehnung, sondern eine Einladung zum Dialog. Profi-Verkäufer beherrschen mehrere Techniken und wechseln je nach Persönlichkeit, Phase und Inhalt des Einwands. Dieses Dokument bündelt alle 10 erprobten Methoden mit Beispielen aus dem Kapitalanlage-Vertrieb." },

    { type: "h2", text: "1. Bumerang-Technik" },
    { type: "p", text: "Den Einwand des Kunden in ein Kaufargument verwandeln." },
    { type: "callout", variant: "info", text: "Beispiel: 'Immobilien sind zu teuer.' → 'Genau deshalb sind sie wertstabil – Knappheit erzeugt Preis.'" },

    { type: "h2", text: "2. Kontextwechsel" },
    { type: "p", text: "Perspektive wechseln: Tag, Vergleich, Inflation oder Lebenszeit." },
    { type: "callout", variant: "info", text: "Beispiel: '950 € Rate sind viel.' → 'Das sind 31 € pro Tag. 720 € zahlt der Mieter. Echter Aufwand: 7,60 € pro Tag.'" },

    { type: "h2", text: "3. Hypothetische Frage" },
    { type: "p", text: "Mit 'Angenommen' den Einwand mental ausräumen." },
    { type: "callout", variant: "info", text: "Beispiel: 'Ich habe kein Eigenkapital.' → 'Angenommen, wir finden eine Bank mit 9 % EK – wärst du bereit?'" },

    { type: "h2", text: "4. Vorwegnahme" },
    { type: "p", text: "Kritische Punkte selbst ansprechen, bevor der Kunde es tut." },
    { type: "callout", variant: "info", text: "Beispiel: 'Auch Immobilien können Wert verlieren – 2022/23 ca. 13 %. Genau deshalb wählen wir nur A/B-Lagen.'" },

    { type: "h2", text: "5. Isolierende Frage" },
    { type: "p", text: "Den echten Einwand vom Vorwand trennen." },
    { type: "callout", variant: "info", text: "Beispiel: 'Mal abgesehen von der Rendite – gibt es noch etwas anderes, das dich zögern lässt?'" },

    { type: "h2", text: "6. Referenz-Technik" },
    { type: "p", text: "Sozialer Beweis durch ähnliche Kundengeschichten." },
    { type: "callout", variant: "info", text: "Beispiel: 'Robert M., 58, war zunächst genauso skeptisch – heute besitzt er eine 100 % finanzierte Wohnung.'" },

    { type: "h2", text: "7. Gegenfrage" },
    { type: "p", text: "Statt zu antworten, mit einer offenen Frage führen." },
    { type: "callout", variant: "info", text: "Beispiel: 'Das ist mir zu teuer.' → 'Womit vergleichst du den Preis aktuell?'" },

    { type: "h2", text: "8. Zerlegungs-Technik" },
    { type: "p", text: "Pauschale Einwände in konkrete Sub-Einwände aufbrechen." },
    { type: "callout", variant: "info", text: "Beispiel: 'Immobilien sind nichts für mich.' → 'Liegt es an Bindung, Verwaltung oder Finanzierung?'" },

    { type: "h2", text: "9. Zeitumkehr" },
    { type: "p", text: "Den Kunden mental 10 Jahre nach vorne versetzen." },
    { type: "callout", variant: "info", text: "Beispiel: 'In 10 Jahren – würdest du es bereuen, heute nicht eingestiegen zu sein?'" },

    { type: "h2", text: "10. Zahlen-Zerlegung" },
    { type: "p", text: "Gefühlsbasierte Einwände mit konkreten Zahlen entkräften." },
    { type: "callout", variant: "info", text: "Beispiel: 'Ich übernehme mich finanziell.' → 'Lass uns rechnen: Cashflow + 85 € pro Monat – wo ist die Belastung?'" },

    { type: "h2", text: "Praxis-Tipps zur Anwendung" },
    { type: "list", items: [
      "Übe jede Technik einzeln, bis sie sitzt",
      "Wähle die Technik passend zum Kundentyp – Analytiker lieben Zahlen, Emotionale lieben Geschichten",
      "Nie zwei Techniken hintereinander 'feuern' – immer Pause für die Antwort",
      "Schließe jeden Einwand mit einer Frage ab, die dich zur nächsten Phase führt",
      "Notiere nach jedem Gespräch, welche Technik bei welchem Einwandtyp funktioniert hat",
    ]},

    { type: "h2", text: "Quellen & Inspiration" },
    { type: "list", items: [
      "Cialdini, R.: Influence – The Psychology of Persuasion",
      "Chris Voss: Never Split the Difference",
      "Neil Rackham: SPIN Selling",
      "Grant Cardone: Sell or Be Sold",
      "Vermögensaufbau-Studie Postbank 2024",
    ]},
  ],
});
