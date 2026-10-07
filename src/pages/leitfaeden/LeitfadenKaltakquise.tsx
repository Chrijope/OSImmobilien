import { Phone, AlertCircle, Target, MessageSquare, Sparkles, Clock } from "lucide-react";
import {
  UnterlagenDetailLayout,
  SectionCard,
  PhaseStep,
  EinwandDropdownList,
  type EinwandItem,
} from "@/components/unterlagen/UnterlagenDetailLayout";

const KALT_EINWAENDE: EinwandItem[] = [
  {
    einwand: "Ich habe gerade keine Zeit.",
    technik: "Wertschätzung + Alternative",
    antwort:
      "Das verstehe ich. Genau deshalb möchte ich keinen Termin verschwenden. Wann passt es dir besser – heute Abend nach 18 Uhr oder morgen Vormittag?",
    beispiel: "Wer nicht gleich auflegt, bekommt fast immer einen Rückruf-Termin.",
  },
  {
    einwand: "Schick mir doch was per Mail.",
    technik: "Vorwegnahme + Personalisierung",
    antwort:
      "Sehr gerne. Bevor ich aber Standard-Material schicke: Darf ich dir 2 kurze Fragen stellen, damit ich dir genau das schicke, was zu deiner Situation passt?",
  },
  {
    einwand: "Ich investiere lieber in ETFs.",
    technik: "Bumerang",
    antwort:
      "Eine sehr kluge Strategie. Genau deshalb passt eine Immobilie als Ergänzung perfekt – sie korreliert nicht mit dem Aktienmarkt und reduziert das Gesamtrisiko deines Portfolios. Wäre eine 15-minütige Berechnung interessant?",
  },
  {
    einwand: "Ich habe schon einen Vertriebspartner.",
    technik: "Differenzierung",
    antwort:
      "Das ist großartig – ein guter Vertriebspartner ist viel wert. Wir sind keine Konkurrenz, sondern Spezialisten für Kapitalanlage-Immobilien. Viele unserer Kunden behalten ihren Vermögensberater. Wäre eine zweite Meinung zu unserem Spezialgebiet interessant?",
  },
  {
    einwand: "Immobilien sind doch zu teuer geworden.",
    technik: "Marktdaten + Hypothetische Frage",
    antwort:
      "Du hast recht, dass die Preise gestiegen sind. Gleichzeitig sind sie 2022/23 um 13 % gefallen und haben sich nun stabilisiert. Angenommen, ich zeige dir ein Objekt mit über 5 % Bruttorendite – wäre das für dich interessant?",
  },
  {
    einwand: "Ich verstehe nichts von Immobilien.",
    technik: "Beruhigung + Empathie",
    antwort:
      "Das ist überhaupt kein Problem – im Gegenteil. Genau deshalb gibt es uns. Wir nehmen dir die fachlichen Themen komplett ab und erklären jeden Schritt. Wann passt dir ein unverbindliches Erstgespräch?",
  },
  {
    einwand: "Was kostet das Gespräch?",
    technik: "Klarheit",
    antwort:
      "Das Erstgespräch ist für dich 100 % kostenfrei und unverbindlich. Wir verdienen erst, wenn du dich später für ein konkretes Objekt entscheidest – bezahlt vom Verkäufer.",
  },
  {
    einwand: "Du willst mir doch nur was verkaufen.",
    technik: "Ehrlichkeit",
    antwort:
      "Da hast du absolut recht – langfristig schon. Aber nicht heute. Heute geht es nur darum, ob das Modell überhaupt zu dir passt. Wenn nein, sage ich dir das ehrlich. Wann hättest du 30 Minuten?",
  },
  {
    einwand: "Ich muss mit meiner Frau / meinem Mann sprechen.",
    technik: "Einbinden",
    antwort:
      "Sehr verständlich – eine Investitionsentscheidung trifft man gemeinsam. Genau deshalb mache ich den Termin am liebsten zu zweit. Wann passt es euch beiden?",
  },
  {
    einwand: "Ich habe kein Eigenkapital.",
    technik: "Klärung",
    antwort:
      "Das hören wir oft – und meist ist mehr Spielraum vorhanden, als Kunden denken. Für die Kaufnebenkosten brauchst du etwa 9 % des Kaufpreises. Lass uns kurz schauen, was bei dir realistisch ist.",
  },
  {
    einwand: "Vielleicht in einem Jahr.",
    technik: "Hypothetische Frage",
    antwort:
      "Verstehe. Angenommen, der Markt würde nächstes Jahr 8 % anziehen und die Zinsen weiter steigen – würdest du es bereuen, heute nicht eingestiegen zu sein?",
  },
  {
    einwand: "Woher hast du meine Nummer?",
    technik: "Transparenz",
    antwort:
      "Sehr gute Frage. Du hast am [Datum] auf unserer Webseite [Lead-Magnet] heruntergeladen und uns dabei deine Nummer hinterlassen. Möchtest du, dass ich die Details kurz vorlese?",
  },
];

export default function LeitfadenKaltakquise() {
  return (
    <UnterlagenDetailLayout
      title="Leitfaden Kaltakquise"
      subtitle="Schritt-für-Schritt zum Beratungstermin – verkaufspsychologisch fundiert"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateLeitfadenKaltakquisePDF();
      }}
      pdfLabel="Leitfaden als PDF"
      quellen={[
        {
          titel: "Bundesnetzagentur – Werbeanrufe (UWG § 7)",
          url: "https://www.bundesnetzagentur.de/DE/Vportal/TK/Aerger/Telefonwerbung/start.html",
        },
        { titel: "Cialdini, R.: Influence – The Psychology of Persuasion", hinweis: "Standardwerk zur Verkaufspsychologie" },
        { titel: "Grant Cardone: Sell or Be Sold", hinweis: "Praxisbuch zur aktiven Akquise" },
        { titel: "Chris Voss: Never Split the Difference", hinweis: "Verhandlungstechniken aus FBI-Geiselverhandlungen" },
        {
          titel: "DSGVO Art. 6 Abs. 1 lit. f – berechtigtes Interesse bei B2B-Kontakten",
          url: "https://dsgvo-gesetz.de/art-6-dsgvo/",
        },
      ]}
    >
      <SectionCard title="Rechtlicher Rahmen" icon={<AlertCircle className="h-5 w-5" />}>
        <p>
          Im B2C-Bereich ist die Kaltakquise per Telefon laut § 7 UWG ohne ausdrückliche Einwilligung
          <strong> verboten</strong>. Im B2B-Bereich ist sie zulässig, wenn ein <strong>mutmaßliches Interesse</strong>{" "}
          besteht. Im Kapitalanlage-Vertrieb arbeiten wir daher primär mit:
        </p>
        <ul className="space-y-1 list-disc list-inside text-sm">
          <li>Empfehlungen und Tippgeber-Kontakten</li>
          <li>Online-Leads (Formular, Webinar, Lead-Magnet → ausdrückliche Einwilligung)</li>
          <li>Eigene Bestandskunden für Cross-Selling</li>
          <li>Eventkontakten und Messe-Visitenkarten</li>
          <li>B2B-Anrufen bei Steuerberatern, Anwälten, HR-Verantwortlichen</li>
        </ul>
        <p className="text-muted-foreground text-xs mt-2">
          Dieser Leitfaden behandelt deshalb die Erstansprache von Personen, die bereits ein
          dokumentiertes Interesse signalisiert haben.
        </p>
      </SectionCard>

      <SectionCard title="Mindset & Vorbereitung" icon={<Sparkles className="h-5 w-5" />}>
        <p>
          80 % der Kaltakquise entscheidet sich <strong>vor dem ersten Klingeln</strong>. Schaffe dir die
          richtigen Bedingungen:
        </p>
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li><strong>Stehe</strong> beim Telefonieren – die Stimme klingt sofort energetischer und souveräner.</li>
          <li><strong>Lächle</strong> beim Sprechen, auch wenn niemand es sieht – man hört es im Tonfall.</li>
          <li><strong>Block-Time</strong>: Plane 60-90 Minuten am Stück, nicht zwischendurch (z. B. 10:00-11:30 Uhr).</li>
          <li><strong>Ziel-Setzung</strong>: 25 Wählversuche → 8 Gespräche → 3 Termine. Realistisch und messbar.</li>
          <li><strong>Wasser bereitstellen</strong>, Smartphone-Notification aus, Fenster auf, Musik aus.</li>
          <li>Profil & Notizen zum Ansprechpartner offen haben (LinkedIn, CRM-Historie).</li>
        </ul>
      </SectionCard>

      <SectionCard title="Die 5 Phasen eines Erstgesprächs" icon={<Target className="h-5 w-5" />}>
        <div className="space-y-5">
          <PhaseStep
            num={1}
            titel="Eröffnung (15 Sekunden)"
            text={`„Hallo [Vorname], hier ist [dein Name] von MOREImmo in München.\n\nIch rufe an, weil du bei uns auf der Webseite Interesse an unserer Kapitalanlage-Berechnung gezeigt hast."\n\nWichtig: Klar, ruhig, langsam. Keine entschuldigende Stimme. Sofort der Anlass.`}
          />
          <PhaseStep
            num={2}
            titel="Erlaubnis einholen (10 Sekunden)"
            text={`„Passt es dir gerade 2 Minuten? Falls nicht, sage ich dir sofort, worum es geht – du entscheidest, ob wir tiefer einsteigen."\n\nWer „Nein" sagt, bekommt sofort einen Rückrufvorschlag mit zwei konkreten Alternativen.`}
          />
          <PhaseStep
            num={3}
            titel="Bedarfsanalyse (3-5 Minuten)"
            text={`Offene Fragen stellen, viel zuhören, mitschreiben:\n• „Was hat dich konkret zu unserer Anfrage geführt?"\n• „Welche Erfahrungen hast du bisher mit Vermögensaufbau?"\n• „Was wäre dein Idealzustand in 10 Jahren?"\n• „Womit beschäftigst du dich gerade beruflich/privat?"\n\nZiel: Bedarf, Schmerzpunkt, Lebensphase verstehen.`}
          />
          <PhaseStep
            num={4}
            titel="Termin platzieren (1 Minute)"
            text={`„Auf Basis dessen sehe ich klar, dass es sich lohnt, dass wir uns 30 Minuten zusammensetzen. Ich zeige dir 2-3 konkrete Objekte und rechne deine Lage durch. Das ist 100 % unverbindlich.\n\nPasst dir Dienstag um 16 Uhr besser oder Donnerstag um 10 Uhr?"\n\nImmer 2 konkrete Alternativen. Nie offene Frage „Wann hättest du Zeit?"`}
          />
          <PhaseStep
            num={5}
            titel="Abschluss & Bestätigung (30 Sekunden)"
            text={`„Perfekt, dann ist der Termin am Donnerstag, 10 Uhr fix. Ich schicke dir sofort eine Kalender-Einladung mit allen Infos und dem Link zum Videogespräch. Wenn etwas dazwischen kommt, gib mir bitte rechtzeitig Bescheid – andersherum genauso.\n\nIch freue mich auf Donnerstag!"\n\nKalender-Einladung sofort innerhalb von 5 Minuten verschicken.`}
          />
        </div>
      </SectionCard>

      <SectionCard title="Komplett-Skript für den Erst-Anruf" icon={<MessageSquare className="h-5 w-5" />}>
        <div className="bg-primary/5 border border-primary/20 rounded p-4 text-sm leading-relaxed space-y-3">
          <p>
            <strong>Du:</strong> „Hallo [Vorname], hier ist [dein Name] von MOREImmo in München."
          </p>
          <p>
            <strong>Du:</strong> „Ich rufe an, weil du dir am [Datum] auf unserer Webseite unsere kostenlose
            Kapitalanlage-Berechnung angeschaut hast. Passt es dir gerade 2 Minuten?"
          </p>
          <p className="text-muted-foreground italic">
            (Pause! Antwort abwarten. Wenn ja → weiter. Wenn nein → Rückruf-Termin platzieren.)
          </p>
          <p>
            <strong>Du:</strong> „Damit ich deine Zeit nicht verschwende: Was hat dich damals zu unserer
            Berechnung geführt? Suchst du aktiv nach einer Anlageform, oder war es eher Neugier?"
          </p>
          <p className="text-muted-foreground italic">(Antwort sehr genau hören. Mitschreiben.)</p>
          <p>
            <strong>Du:</strong> „Verstehe. Und wenn du dir heute deine Vermögenslage anschaust – was würdest
            du gerne in den nächsten 10 Jahren erreichen?"
          </p>
          <p className="text-muted-foreground italic">(Bedarf erkennen, paraphrasieren.)</p>
          <p>
            <strong>Du:</strong> „Auf Basis dessen sehe ich klar, dass es sich lohnt, dass wir uns 30 Minuten
            zusammensetzen. Ich zeige dir anhand deiner konkreten Zahlen, ob und wie eine Kapitalanlage-Immobilie
            für dich funktioniert. 100 % unverbindlich. Passt dir Dienstag 16 Uhr oder Donnerstag 10 Uhr besser?"
          </p>
          <p>
            <strong>Du:</strong> „Perfekt. Ich schicke dir die Einladung in den nächsten 5 Minuten zu. Eine
            kurze Frage noch, damit wir vorbereitet sind: Was ist für dich das Wichtigste, was wir bis Donnerstag
            klären sollten?"
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Die 12 häufigsten Einwände – als Dropdown" icon={<Phone className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground mb-3">
          Klicke auf einen Einwand, um die empfohlene Antwort und Technik zu sehen.
        </p>
        <EinwandDropdownList items={KALT_EINWAENDE} />
      </SectionCard>

      <SectionCard title="Top-Tipps aus 10.000+ Telefonaten" icon={<Clock className="h-5 w-5" />}>
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li>Niemals länger als <strong>5 Minuten</strong> für die Erstansprache – Termin ist das einzige Ziel.</li>
          <li>Notizen <strong>direkt nach jedem Gespräch</strong> ins CRM – beim Follow-up ist jedes Detail Gold wert.</li>
          <li>Wer „Nein" sagt, ist nicht persönlich gemeint – nächster Anruf, neue Chance.</li>
          <li>Best-Practice-Anrufzeiten: <strong>Di-Do, 09:30-11:30 Uhr und 16:00-18:30 Uhr</strong>.</li>
          <li>Bei jedem 10. Anruf eine kurze Reflexion: Was lief gut, was passe ich an?</li>
          <li>3 „Nein" am Stück → kurze Pause, frischen Kaffee, Mindset zurücksetzen.</li>
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
