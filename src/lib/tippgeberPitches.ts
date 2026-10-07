// Tippgeber Pitch-Toolkit
// WhatsApp-/SMS-Vorlagen für Tippgeber. Locker, im Namen des Tippgebers,
// mit eingebautem VP-Landingpage-Link (?tg=<tippgeberId> für Tracking).

export type PitchVariant = {
  id: string;
  titel: string;
  thema: string;
  emoji: string;
  zielgruppen: ZielgruppeId[];
  text: (ctx: PitchContext) => string;
};

export type PitchContext = {
  tippgeberVorname: string;
  vpVorname: string;
  vpFullName: string;
  landingpageUrl: string; // bereits inkl. ?tg=<tippgeberId>
};

// ── Zielgruppen ───────────────────────────────────────────────────────────
export type ZielgruppeId =
  | "alle"
  | "freund"
  | "familie"
  | "kollege"
  | "bekannter"
  | "vermieter"
  | "selbststaendig"
  | "junge_familie"
  | "best_ager";

export const ZIELGRUPPEN: { id: ZielgruppeId; label: string; emoji: string; hinweis: string }[] = [
  { id: "alle", label: "Alle", emoji: "👥", hinweis: "Zeige alle Pitch-Varianten unabhängig vom Empfänger." },
  { id: "freund", label: "Freund / Freundin", emoji: "🤝", hinweis: "Locker, persönlich, du-zu-du. Keine Verkaufsfloskeln." },
  { id: "familie", label: "Familie", emoji: "👨‍👩‍👧", hinweis: "Vertrauen ist da – nicht überreden, einfach zeigen." },
  { id: "kollege", label: "Kollege / Kollegin", emoji: "💼", hinweis: "Gemeinsamer Bezug (Job, Brutto-Netto, Steuer) hilft beim Einstieg." },
  { id: "bekannter", label: "Bekannter", emoji: "💬", hinweis: "Höflich, kurz, kein Druck – mehr Info-Charakter." },
  { id: "vermieter", label: "Vermieter / Eigentümer", emoji: "🏠", hinweis: "Argument: Portfolio strategisch ausbauen, Steueroptimierung." },
  { id: "selbststaendig", label: "Selbstständige", emoji: "🧑‍💻", hinweis: "Stichworte: Altersvorsorge, schwankendes Einkommen, GmbH-Strategien." },
  { id: "junge_familie", label: "Junge Familie", emoji: "👶", hinweis: "Stichworte: Kindesalter absichern, generationenübergreifend denken." },
  { id: "best_ager", label: "Best Ager (50+)", emoji: "🧓", hinweis: "Stichworte: Rentenlücke schließen, Vermögen übertragen, Inflationsschutz." },
];

export const PITCH_VARIANTS: PitchVariant[] = [
  {
    id: "steueroptimierung",
    titel: "Steuern senken & mehr Netto",
    thema: "Lohnsteuer reduzieren",
    emoji: "💰",
    zielgruppen: ["freund", "kollege", "bekannter", "selbststaendig"],
    text: (c) => `Hey! Du hast doch letztens gemeint, dass dir vom Brutto wieder viel zu wenig Netto übrig bleibt. Ich hab da was, das könnte echt interessant für dich sein.

Mein Bekannter ${c.vpFullName} zeigt, wie man mit der richtigen Kapitalanlage-Immobilie legal seine Lohnsteuer drückt – und am Ende monatlich ein paar hundert Euro mehr im Konto hat.

Ich kenn mich da selbst nicht im Detail aus, aber er erklärt's wirklich easy in einem 20-Min-Call. Schau's dir mal an, völlig unverbindlich:

👉 ${c.landingpageUrl}

Sag mir gern Bescheid, falls du dich eintragen willst – ich kann dich ihm auch direkt empfehlen, dann meldet er sich.`,
  },
  {
    id: "vermoegensaufbau",
    titel: "Vermögen mit Immobilien",
    thema: "Vermögensaufbau",
    emoji: "📈",
    zielgruppen: ["freund", "kollege", "bekannter", "selbststaendig", "junge_familie"],
    text: (c) => `Hey, kurze Frage: Hast du dir schon mal überlegt, wie du in 10–15 Jahren wirklich Vermögen aufbaust – ohne dass dein Konto leer wird?

Ich hab gerade ${c.vpFullName} kennengelernt, der genau das mit Immobilien macht. Klingt im ersten Moment groß, aber der Trick ist: Der Mieter und das Finanzamt zahlen den Großteil. Du legst nur einen kleinen Teil oben drauf und nach ein paar Jahren gehört dir die Wohnung.

Ich bin selber kein Experte, deshalb zeigt er's am besten. 20 Min, locker, kein Verkaufsgespräch:

👉 ${c.landingpageUrl}

Wenn's für dich spannend klingt, trag dich gern ein – er meldet sich dann.`,
  },
  {
    id: "inflationsschutz",
    titel: "Inflationsschutz",
    thema: "Geld vor Inflation schützen",
    emoji: "🛡️",
    zielgruppen: ["freund", "bekannter", "best_ager", "selbststaendig"],
    text: (c) => `Hi! Mal ehrlich – Geld auf dem Konto verliert gerade jedes Jahr 3–5 % an Wert. Ist eigentlich Wahnsinn.

Ich hab da jemanden im Bekanntenkreis, ${c.vpFullName}, der zeigt wie man genau das mit Immobilien aushebeln kann. Sachwert statt Sparbuch, easy erklärt.

Kein langes Hin und Her – einfach mal anschauen ob's für dich passt:

👉 ${c.landingpageUrl}

Falls du dich einträgst, sagst du mir kurz Bescheid? Dann erwartet er dich schon. 😉`,
  },
  {
    id: "altersvorsorge",
    titel: "Sorgenfrei im Alter",
    thema: "Immo-Rente / Altersvorsorge",
    emoji: "🏖️",
    zielgruppen: ["familie", "kollege", "best_ager", "selbststaendig"],
    text: (c) => `Hey, kurze Sache: Du hast mal gesagt, dass dir die gesetzliche Rente Sorgen macht – ich glaub, das geht aktuell echt vielen so.

Ich kenn ${c.vpFullName}, der baut mit ganz normalen Leuten eine "Immo-Rente" auf. Heißt: 1–2 Wohnungen finanzieren, Mieter zahlt die Raten ab, mit 60 gehören die dir und du hast Miete als Zusatzrente. Klingt eigentlich logisch, oder?

Schau's dir mal an, dauert 20 Min:

👉 ${c.landingpageUrl}

Wenn's spannend ist – einfach eintragen, er meldet sich dann zeitnah.`,
  },
  {
    id: "passives-einkommen",
    titel: "Passives Einkommen",
    thema: "Finanzielle Freiheit",
    emoji: "🔄",
    zielgruppen: ["freund", "kollege", "selbststaendig"],
    text: (c) => `Moin! Schnelle Frage: Wie cool wär's, wenn jeden Monat ein paar hundert Euro reinkommen, OHNE dass du dafür extra arbeiten musst?

Ich kenn jemanden, ${c.vpFullName}, der genau das mit Kapitalanlage-Immobilien aufbaut. Eine Wohnung nach der anderen, der Mieter zahlt's ab und nach ein paar Jahren bleibt jeden Monat was übrig.

Ich erklär's nicht so gut wie er – schau's dir lieber direkt an:

👉 ${c.landingpageUrl}

Wenn's was für dich ist, trag dich kurz ein. Er ist echt locker und gibt keinen Druck.`,
  },
  {
    id: "naechste-generation",
    titel: "Für die Kinder absichern",
    thema: "Familie & Generationenvermögen",
    emoji: "👨‍👩‍👧",
    zielgruppen: ["familie", "junge_familie", "best_ager"],
    text: (c) => `Hey, da du auch Kinder hast – hast du dir schon mal überlegt, wie du wirklich was für sie zur Seite legst, jenseits vom Sparbuch (was eh nix bringt)?

Ich hab kürzlich ${c.vpFullName} kennengelernt, der hilft Familien dabei, mit Immobilien Vermögen aufzubauen, das später an die Kinder geht – steueroptimiert sogar.

Ist easy erklärt in 20 Min:

👉 ${c.landingpageUrl}

Wenn's was für dich klingt, trag dich kurz ein. 👍`,
  },
  {
    id: "eigenkapital-fuer-eigenheim",
    titel: "Kapital fürs Eigenheim",
    thema: "Eigenheim ansparen",
    emoji: "🏡",
    zielgruppen: ["freund", "kollege", "junge_familie"],
    text: (c) => `Hi! Du wolltest doch irgendwann mal ein eigenes Haus, oder? Das Problem ist meistens das Eigenkapital, das man dafür ansparen muss.

${c.vpFullName} (kenn ich aus dem Bekanntenkreis) zeigt einen ziemlich cleveren Weg, wie man mit einer kleinen Kapitalanlage-Wohnung in ein paar Jahren genug Eigenkapital aufbaut, um danach das eigene Haus zu finanzieren. Ist quasi ein doppelter Hebel.

Schau's dir mal an, dauert nicht lange:

👉 ${c.landingpageUrl}

Wenn's interessant ist, einfach eintragen.`,
  },
  {
    id: "klassisch-empfehlung",
    titel: "Klassische Empfehlung",
    thema: "Allgemeiner Pitch",
    emoji: "✨",
    zielgruppen: ["freund", "familie", "kollege", "bekannter", "vermieter", "selbststaendig", "junge_familie", "best_ager"],
    text: (c) => `Hey, ich empfehl dir gerade mal jemanden, der mir richtig gut gefallen hat: ${c.vpFullName}.

Er macht Kapitalanlage-Immobilien und erklärt das Thema so easy und ohne Druck, dass ich dachte – das muss ich dir mal weiterleiten. Egal ob Steuern sparen, Vermögen aufbauen oder Altersvorsorge – er schaut individuell was zu dir passt.

Hier kannst du dir 20 Min unverbindlich Zeit nehmen:

👉 ${c.landingpageUrl}

Sag Bescheid falls du dich einträgst, dann weiß er Bescheid und meldet sich zeitnah bei dir.`,
  },
];

// ── Anlass-/Situations-basierte Gesprächs-Öffner ──────────────────────────
export type AnlassOeffner = {
  id: string;
  emoji: string;
  anlass: string;
  ueberleitung: string;
  beispiel: string;
};

export const ANLASS_OEFFNER: AnlassOeffner[] = [
  {
    id: "smalltalk-kaffee",
    emoji: "☕",
    anlass: "Beim Kaffee, Abendessen oder Spaziergang",
    ueberleitung: "Wenn das Gespräch auf Geld, Zukunft oder Ärger über Steuern kommt, einfach den eigenen Erfahrungsbericht andocken.",
    beispiel: "Apropos – ich hab kürzlich jemanden kennengelernt, der einem easy zeigt, wie man mit Immobilien Vermögen aufbaut, ohne dass man Experte sein muss. Soll ich dir den Link mal schicken?",
  },
  {
    id: "gehaltserhoehung",
    emoji: "📈",
    anlass: "Nach einer Gehaltserhöhung oder Bonuszahlung",
    ueberleitung: "Klassisches Timing: mehr Brutto = mehr Steuern. Hier ist das Steuer-Argument am stärksten.",
    beispiel: "Glückwunsch zur Gehaltserhöhung! Bevor das Finanzamt sich freut – schau dir mal kurz an, wie man genau das mit einer Kapitalanlage-Immobilie umlenken kann.",
  },
  {
    id: "inflations-thema",
    emoji: "💸",
    anlass: "Gespräche über Inflation, Sparbuch oder Rente",
    ueberleitung: "Wenn jemand stöhnt, dass Geld auf dem Konto nichts bringt – perfekter Übergang zum Sachwert-Argument.",
    beispiel: "Stimmt total. Genau deshalb hab ich mir das Thema Immobilien angeschaut – ich verlink dir mal den, der mir das erklärt hat.",
  },
  {
    id: "hauskauf-bekannte",
    emoji: "🏠",
    anlass: "Bekannte sprechen über Hauskauf",
    ueberleitung: "Viele unterschätzen, dass eine Kapitalanlage-Wohnung der EK-Beschleuniger fürs eigene Haus sein kann.",
    beispiel: "Falls dir noch EK fehlt – ein Bekannter hat mir gezeigt, wie man mit einer kleinen Anlage-Wohnung gezielt Eigenkapital aufbaut. Klingt cleverer als nur sparen.",
  },
  {
    id: "erbschaft-lebensaenderung",
    emoji: "🎁",
    anlass: "Nach Erbschaft, Verkauf oder Lebensveränderung",
    ueberleitung: "Größere Geldsummen oder Umbrüche sind der natürliche Moment, in dem Menschen über Anlage nachdenken.",
    beispiel: "Hast du dir schon überlegt, was du mit dem Geld machst? Ich hab da jemanden, der erklärt unverbindlich was zu deiner Situation passt.",
  },
  {
    id: "neuer-job",
    emoji: "🚀",
    anlass: "Bei Jobwechsel oder Selbstständigkeit",
    ueberleitung: "Neuer Lebensabschnitt = guter Moment, Finanzen neu zu sortieren.",
    beispiel: "Glückwunsch zum neuen Job – wenn du eh gerade alles neu aufsetzt, schau dir mal an, wie eine Immobilie steuerlich ins Bild passen kann.",
  },
];

// ── Einwand-Behandlung ────────────────────────────────────────────────────
export type EinwandKarte = {
  id: string;
  einwand: string;
  antwort: string;
  uebergang: string;
};

export const EINWAND_KARTEN: EinwandKarte[] = [
  {
    id: "kein-geld",
    einwand: "Ich hab doch gar kein Geld dafür.",
    antwort: "Genau deshalb lohnt es sich, sich das anzuschauen. Es geht nicht um einen Wohnungskauf in bar – sondern um eine Finanzierung, die der Mieter und das Finanzamt zum Großteil mittragen. Viele starten mit relativ wenig Eigenkapital.",
    uebergang: "Schau es dir 20 Min an – kostet nichts und du weißt, ob es für dich realistisch ist.",
  },
  {
    id: "zu-riskant",
    einwand: "Immobilien sind mir zu riskant.",
    antwort: "Verständlich – aber wirklich riskant ist eine schlechte Immobilie. Genau deshalb arbeitet er nur mit geprüften Objekten und rechnet vorher knallhart durch, ob es zu deiner Situation passt. Wenn nicht, sagt er es dir auch.",
    uebergang: "Lass dir die Strategie zeigen, dann entscheidest du in Ruhe.",
  },
  {
    id: "kein-experte",
    einwand: "Ich kenn mich da überhaupt nicht aus.",
    antwort: "Genau das ist sein Job – er erklärt es so, dass du es verstehst. Du musst keine Bilanzen lesen oder Märkte analysieren. Du musst nur deine Ziele und deine Situation kennen.",
    uebergang: "Ein 20-Min-Call und du verstehst, ob das Thema überhaupt zu dir passt.",
  },
  {
    id: "zinsen-hoch",
    einwand: "Die Zinsen sind doch viel zu hoch.",
    antwort: "Stimmt, der Markt ist anders als 2020. Aber gleichzeitig sind die Kaufpreise gefallen und die Mieten gestiegen – die Rendite kann heute besser sein als vor drei Jahren. Es kommt auf die richtige Auswahl an.",
    uebergang: "Er zeigt dir konkrete Rechnungen, dann siehst du es selbst.",
  },
  {
    id: "lieber-etf",
    einwand: "Ich spar lieber in ETFs.",
    antwort: "ETFs sind super – aber eine Immobilie kannst du finanzieren, einen ETF nicht. Du arbeitest mit dem Hebel der Bank, dem Steuervorteil und der Miete gleichzeitig. ETF und Immobilie sind kein Entweder-Oder, sondern eine ideale Kombi.",
    uebergang: "Lass es dir mal gegenüberstellen, dann siehst du den Unterschied.",
  },
  {
    id: "keine-zeit",
    einwand: "Ich hab grad keine Zeit dafür.",
    antwort: "Der Vorteil: Du hast in der Anfangsphase nur 20 Min Aufwand. Danach übernimmt er die Recherche, die Termine und den Papierkram. Du entscheidest nur am Ende.",
    uebergang: "Trag dich ein, er meldet sich zu einem Zeitpunkt, der dir passt.",
  },
  {
    id: "schon-vermittler",
    einwand: "Ich hab schon einen Berater.",
    antwort: "Verständlich – aber gerade bei Immobilien lohnt es sich, eine zweite Meinung zu haben. Es kostet dich nichts und du siehst, ob dein aktueller Berater dich gut aufgestellt hat.",
    uebergang: "Einfach mal 20 Min, danach weißt du es besser.",
  },
  {
    id: "denke-drueber-nach",
    einwand: "Ich überleg's mir noch mal.",
    antwort: "Total in Ordnung. Aber \"überlegen\" ohne Faktenbasis bringt selten was. Im Erstgespräch bekommst du genau die Fakten, mit denen du dann wirklich entscheiden kannst.",
    uebergang: "Trag dich einfach ein – wenn du nach dem Termin nein sagst, ist das auch okay.",
  },
];

// 6-stufiger Prozess, den Tippgeber kennen sollte (für Erwartungsmanagement)
export const SALES_PROZESS_SCHRITTE = [
  {
    nr: 1,
    titel: "Erstgespräch (Telefon)",
    beschreibung: "Kurzes Kennenlernen am Telefon (10–15 Min) – Bedarf abklären, Termin für Beratung vereinbaren.",
    dauer: "10–15 Min",
  },
  {
    nr: 2,
    titel: "Beratungsgespräch (online)",
    beschreibung: "Ausführliches Online-Gespräch mit Selbstauskunft. Ziele, Bonität & Strategie werden geklärt.",
    dauer: "60–90 Min",
  },
  {
    nr: 3,
    titel: "Objektvorstellung & Auswahl",
    beschreibung: "Passende Kapitalanlage-Immobilien werden vorgestellt, gemeinsam wird die richtige ausgewählt.",
    dauer: "1–2 Termine",
  },
  {
    nr: 4,
    titel: "Finanzierung anfragen",
    beschreibung: "Die Finanzierung wird bei den Bankpartnern angefragt und abgestimmt.",
    dauer: "1–3 Wochen",
  },
  {
    nr: 5,
    titel: "Notartermin",
    beschreibung: "Beurkundung beim Notar – die Wohnung gehört offiziell dem Kunden.",
    dauer: "ca. 1 Stunde",
  },
  {
    nr: 6,
    titel: "Beglückwünschen 🎉",
    beschreibung: "Investment steht – Kunde wird offiziell beglückwünscht. Ab jetzt baut sich Vermögen auf!",
    dauer: "Lifetime",
  },
];
