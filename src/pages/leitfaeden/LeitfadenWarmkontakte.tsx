import { Heart, Users, Sparkles, Target, MessageSquare } from "lucide-react";
import {
  UnterlagenDetailLayout,
  SectionCard,
  PhaseStep,
  EinwandDropdownList,
  type EinwandItem,
} from "@/components/unterlagen/UnterlagenDetailLayout";

const WARM_EINWAENDE: EinwandItem[] = [
  {
    einwand: "Ich weiß gar nicht, was [Empfehlungsgeber] dir erzählt hat.",
    technik: "Brücke bauen",
    antwort:
      "[Empfehlungsgeber] erwähnte, dass du dich gerade mit dem Thema Vermögensaufbau und Kapitalanlage beschäftigst. Ich rufe deshalb völlig unverbindlich an, um zu schauen, ob das Thema überhaupt aktuell für dich ist.",
  },
  {
    einwand: "Aktuell habe ich kein Interesse.",
    technik: "Tür öffnen",
    antwort:
      "Vollkommen ok. Darf ich fragen: Was müsste sich verändern, damit das Thema für dich wieder relevant wird? Ich notiere es und melde mich nur, wenn es passt.",
  },
  {
    einwand: "Ich kenne mich damit nicht aus.",
    technik: "Beruhigen + Mehrwert",
    antwort:
      "Das ist genau der Grund, warum [Empfehlungsgeber] dich an mich verwiesen hat. Wir nehmen dir das komplette Fachwissen ab. Wäre ein 30-minütiges Erstgespräch interessant – ohne jede Verpflichtung?",
  },
  {
    einwand: "Was hat [Empfehlungsgeber] mit dir zu tun?",
    technik: "Transparenz",
    antwort:
      "[Empfehlungsgeber] ist selbst Kunde bei uns und sehr zufrieden. Es war seine eigene Idee, dir den Kontakt zu vermitteln. Wenn du möchtest, kann er dir seine Erfahrungen schildern.",
  },
  {
    einwand: "Ich habe keine Zeit.",
    technik: "Empathie + konkrete Alternative",
    antwort:
      "Verstehe ich. Auch [Empfehlungsgeber] hatte zu Beginn dieselbe Sorge. Wir haben dann einen 30-Minuten-Termin am Abend gemacht. Wann würde es dir am besten passen?",
  },
  {
    einwand: "Ich habe schon einen Anlageberater.",
    technik: "Differenzieren",
    antwort:
      "Sehr gut – [Empfehlungsgeber] hat auch einen. Wir ergänzen klassische Anlageberatung um die Kapitalanlage-Immobilie als Sachwert. Eine zweite Meinung kostet dich nichts. Wann passt es?",
  },
  {
    einwand: "Wenn das so toll ist, warum hat [Empfehlungsgeber] mir nichts gesagt?",
    technik: "Wertschätzung",
    antwort:
      "Eine berechtigte Frage – am besten klärt [Empfehlungsgeber] das selbst kurz mit dir. Soll ich ihn bitten, sich nochmal bei dir zu melden?",
  },
  {
    einwand: "Ich glaube, das ist nichts für mich.",
    technik: "Kein Druck + Tür offen",
    antwort:
      "Vollkommen ok – nicht jeder profitiert von einer Kapitalanlage-Immobilie. Darf ich dich trotzdem in unsere unverbindliche Info-Mail aufnehmen, falls sich deine Lage später ändert?",
  },
];

export default function LeitfadenWarmkontakte() {
  return (
    <UnterlagenDetailLayout
      title="Leitfaden Warmkontakte & Empfehlungen"
      subtitle="Empfohlene Kontakte zu einem Beratungsgespräch führen – ohne Verkaufsdruck"
      onDownloadPdf={async () => {
        const m = await import("@/lib/unterlagenPdfContent");
        await m.generateLeitfadenWarmkontaktePDF();
      }}
      pdfLabel="Leitfaden als PDF"
      quellen={[
        { titel: "Studie Bain & Company: Net Promoter Score und Empfehlungsumsätze", url: "https://www.bain.com/insights/net-promoter-system/" },
        {
          titel: "Nielsen Global Trust in Advertising Report",
          hinweis: "92 % der Konsumenten vertrauen Empfehlungen aus dem persönlichen Umfeld",
        },
        { titel: "Joe Girard: How to Sell Anything to Anybody", hinweis: "Klassiker zum Empfehlungsmanagement" },
        { titel: "Robert Cialdini: Influence", hinweis: "Reziprozität & sozialer Beweis" },
      ]}
    >
      <SectionCard title="Warum Warmkontakte 8x besser konvertieren" icon={<Heart className="h-5 w-5" />}>
        <p>
          Empfohlene Kontakte schließen laut Bain-Studie <strong>3-8x häufiger ab</strong> als Kaltkontakte und
          haben einen deutlich <strong>höheren Customer Lifetime Value</strong>. Der Grund: Vertrauen ist
          bereits durch den Empfehlungsgeber aufgebaut. Dein Job: dieses Vertrauen nicht enttäuschen.
        </p>
      </SectionCard>

      <SectionCard title="Die 4 goldenen Regeln" icon={<Sparkles className="h-5 w-5" />}>
        <ol className="space-y-2 list-decimal list-inside text-sm">
          <li>
            <strong>Innerhalb von 24 h melden</strong> – sonst verpufft die Wärme der Empfehlung.
          </li>
          <li>
            <strong>Empfehlungsgeber sofort nennen</strong> – schafft Kontext und Vertrauen.
          </li>
          <li>
            <strong>Nicht verkaufen, sondern zuhören</strong> – Bedarf ist meist anders als erwartet.
          </li>
          <li>
            <strong>Empfehlungsgeber später danken</strong> – auch ohne Abschluss, immer mit Update.
          </li>
        </ol>
      </SectionCard>

      <SectionCard title="Vorbereitung: Bevor du anrufst" icon={<Target className="h-5 w-5" />}>
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li>
            <strong>Empfehlungsgeber kontaktieren</strong>: „Hat dich [Person] freigegeben? Was sollte ich
            wissen?"
          </li>
          <li>
            <strong>LinkedIn-Recherche</strong>: Beruf, Lebensphase, mögliche Schmerzpunkte.
          </li>
          <li>
            <strong>Mögliche Gemeinsamkeiten</strong> finden (gleicher Geburtsort, gleiche Universität,
            ähnliches Hobby).
          </li>
          <li>
            <strong>Anrufzeit-Strategie</strong>: Bei Selbstständigen früh am Morgen oder nach 18 Uhr,
            Angestellte mittags oder abends.
          </li>
          <li>
            <strong>Ziel definieren</strong>: Termin innerhalb 7 Tagen, als Videogespräch oder vor Ort.
          </li>
        </ul>
      </SectionCard>

      <SectionCard title="Die 6 Phasen des Warmkontakt-Gesprächs" icon={<Target className="h-5 w-5" />}>
        <div className="space-y-5">
          <PhaseStep
            num={1}
            titel="Eröffnung mit Empfehlung (20 Sekunden)"
            text={`„Hallo [Vorname], hier ist [dein Name] von OS Immobilien. Ich melde mich, weil mir [Empfehlungsgeber] erzählt hat, dass du dich aktuell mit dem Thema Vermögensaufbau beschäftigst und an Kapitalanlage-Immobilien interessiert bist. Passt es dir gerade kurz?"\n\nWichtig: Nie sagen „Dein Freund hat mir deine Nummer gegeben, damit ich dir etwas verkaufe." Das zerstört die Wärme.`}
          />
          <PhaseStep
            num={2}
            titel="Beziehung zum Empfehlungsgeber kurz spiegeln"
            text={`„[Empfehlungsgeber] und ich kennen uns seit X Jahren – er ist einer unserer Kunden / Tippgeber. Er meinte, ich solle dich unbedingt anrufen, weil das Thema für dich spannend sein könnte."\n\nDas signalisiert: Ich bin keine kalte Stimme – ich bin Teil seines Vertrauenskreises.`}
          />
          <PhaseStep
            num={3}
            titel="Offene Bedarfsanalyse (3-5 Minuten)"
            text={`Frage offen, höre zu, paraphrasiere:\n• „Was hat [Empfehlungsgeber] denn genau erzählt, was dich aktuell beschäftigt?"\n• „Wie bist du selbst auf das Thema Vermögensaufbau gekommen?"\n• „Welche Anlageformen nutzt du aktuell schon?"\n• „Was wäre für dich das ideale Ergebnis in 5-10 Jahren?"`}
          />
          <PhaseStep
            num={4}
            titel="Brücke zum Beratungsgespräch"
            text={`„Auf Basis von dem, was du sagst, sehe ich, dass wir dir drei sehr konkrete Lösungsansätze zeigen können. Das machen wir immer in einem 30-minütigen Erstgespräch, in dem ich deine Zahlen kurz aufnehme und 2-3 konkrete Objekte rechne.\n\nDas Erstgespräch ist für dich 100 % kostenfrei und unverbindlich – wie es bei [Empfehlungsgeber] auch war."`}
          />
          <PhaseStep
            num={5}
            titel="Termin konkret platzieren"
            text={`„Lieber per Video oder bei uns im Büro in München? Und passt dir Dienstag 16 Uhr besser oder Donnerstag 10 Uhr?"\n\nZwei konkrete Alternativen. Nie offen lassen.`}
          />
          <PhaseStep
            num={6}
            titel="Abschluss + Schleife zum Empfehlungsgeber"
            text={`„Wunderbar, ich schicke dir die Einladung sofort. Und [Empfehlungsgeber] gebe ich kurz Bescheid, dass wir sprechen – ich glaube, er freut sich. Bis Donnerstag!"\n\nDanach: Empfehlungsgeber per WhatsApp/Mail kurz informieren („Hat super geklappt, danke!").`}
          />
        </div>
      </SectionCard>

      <SectionCard title="Komplett-Skript Warmkontakt" icon={<MessageSquare className="h-5 w-5" />}>
        <div className="bg-primary/5 border border-primary/20 rounded p-4 text-sm leading-relaxed space-y-3">
          <p>
            <strong>Du:</strong> „Hallo [Vorname], hier ist [dein Name] von OS Immobilien in München."
          </p>
          <p>
            <strong>Du:</strong> „Ich melde mich, weil mir [Empfehlungsgeber] erzählt hat, dass du aktuell darüber
            nachdenkst, dich strategisch breiter aufzustellen und auch Sachwerte mit aufzunehmen. Passt es dir
            gerade 2-3 Minuten?"
          </p>
          <p className="text-muted-foreground italic">(Pause! Antwort abwarten.)</p>
          <p>
            <strong>Du:</strong> „[Empfehlungsgeber] und ich arbeiten seit [Zeitraum] zusammen – er ist sehr
            zufriedener Kunde von uns. Damit ich dich nicht mit den falschen Themen langweile: Was hat er denn
            genau erzählt, was dich aktuell beschäftigt?"
          </p>
          <p className="text-muted-foreground italic">(Antwort genau hören. Mitschreiben.)</p>
          <p>
            <strong>Du:</strong> „Sehr spannend. Damit ich verstehe, wie wir dir helfen können: Was wären für
            dich aktuell die wichtigsten 1-2 Themen?"
          </p>
          <p>
            <strong>Du:</strong> „Auf Basis dessen sehe ich klar, dass es sich lohnt, dass wir uns 30 Minuten
            zusammensetzen. Ich zeige dir 2-3 konkrete Objekte und rechne deine Lage durch – wie ich es bei
            [Empfehlungsgeber] auch gemacht habe.\n\nLieber per Video oder bei uns im Büro? Und passt dir Dienstag
            16 Uhr besser oder Donnerstag 10 Uhr?"
          </p>
          <p>
            <strong>Du:</strong> „Wunderbar! Ich schicke dir sofort die Einladung. Und [Empfehlungsgeber] gebe
            ich kurz Bescheid, dass wir uns am Donnerstag sehen – ich glaube, er freut sich."
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Die 8 typischen Warmkontakt-Einwände – als Dropdown" icon={<Users className="h-5 w-5" />}>
        <p className="text-sm text-muted-foreground mb-3">
          Klicke auf einen Einwand, um die empfohlene Antwort und Technik zu sehen.
        </p>
        <EinwandDropdownList items={WARM_EINWAENDE} />
      </SectionCard>

      <SectionCard title="Das Empfehlungs-System aufbauen">
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li>Nach jedem Notartermin nach 2-3 Empfehlungen fragen – die Energie ist dann am höchsten.</li>
          <li>
            Empfehlungsgeber mit Status-Updates auf dem Laufenden halten („Ich hatte heute mit [X] ein gutes
            Erstgespräch").
          </li>
          <li>Bei erfolgreichem Abschluss: persönliche Karte + kleines Geschenk (Wein, Buch, Erlebnis).</li>
          <li>Empfehlungsprogramm mit transparenter Provision aktiv kommunizieren (siehe Modul „Empfehlungen" im CRM).</li>
          <li>
            Mindestens 1x pro Jahr ein „Empfehlungs-Dinner" mit den Top-5 Empfehlungsgebern – stärkt die Bindung
            massiv.
          </li>
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
