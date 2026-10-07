import { Gauge, Users, Target, Calculator, Eye, MessageSquare, AlertTriangle } from "lucide-react";
import { UnterlagenDetailLayout, SectionCard, PhaseStep } from "@/components/unterlagen/UnterlagenDetailLayout";

/**
 * Die vier Kundentypen aus der Partnerschulung, kurz und zum Nachschlagen.
 *
 * Die vollstaendige Praesentation liegt als PDF unter
 * public/dokumente/kundentypen.pdf und haengt oben rechts am Knopf. Diese
 * Seite ist die schnelle Fassung fuer zwischendurch: erkennen, fuehren,
 * Fehler vermeiden.
 *
 * Die vier Farben sind hier Inhalt, keine Gestaltung. Deshalb stehen sie
 * bewusst in festen Farbwerten und nicht in den Marken-Tokens.
 */

interface Typ {
  name: string;
  frage: string;
  kern: string;
  rand: string;
  punkt: string;
  flaeche: string;
  verhalten: string;
  sprache: string;
  tempo: string;
  entscheidung: string;
  angst: string;
  wunsch: string;
}

const TYPEN: Typ[] = [
  {
    name: "Rot",
    frage: "„Was bringt es?“",
    kern: "Ergebnis, Tempo, Entscheidung",
    rand: "border-red-500/40",
    punkt: "bg-red-500",
    flaeche: "bg-red-500/5",
    verhalten: "Übernimmt die Führung, unterbricht, schaut auf die Uhr",
    sprache: "Kurz, Imperativ, „Was bringt das?“, „Kommen wir zum Punkt“",
    tempo: "Hoch, will heute wissen, was morgen passiert",
    entscheidung: "Nutzen gegen Aufwand, Hebel, Kontrolle",
    angst: "Zeit zu verlieren, abhängig zu sein, über den Tisch gezogen zu werden",
    wunsch: "Das Ergebnis, das er selbst herbeigeführt hat",
  },
  {
    name: "Gelb",
    frage: "„Wie fühlt sich das an?“",
    kern: "Bild, Zukunft, Zugehörigkeit",
    rand: "border-amber-500/40",
    punkt: "bg-amber-500",
    flaeche: "bg-amber-500/5",
    verhalten: "Redet viel, lacht, wechselt Themen, erzählt Geschichten",
    sprache: "„Stell dir vor“, „Das wäre doch was“, Superlative",
    tempo: "Schnell in der Begeisterung, langsam in der Umsetzung",
    entscheidung: "Gefühl, Vision, was andere sagen werden",
    angst: "Ausgeschlossen zu sein, langweilig zu wirken, allein dazustehen",
    wunsch: "Teil von etwas sein, das gut aussieht und gut erzählt ist",
  },
  {
    name: "Grün",
    frage: "„Ist das sicher für uns?“",
    kern: "Sicherheit, Schritt für Schritt, Begleitung",
    rand: "border-emerald-500/40",
    punkt: "bg-emerald-500",
    flaeche: "bg-emerald-500/5",
    verhalten: "Hört zu, nickt, fragt wenig, widerspricht nicht im Raum",
    sprache: "„Wir“, „eigentlich“, „ich weiß nicht, ob“, Konjunktiv",
    tempo: "Langsam, braucht Zeit zwischen den Schritten",
    entscheidung: "Was passiert, wenn es schiefgeht, und wer ist dann da",
    angst: "Etwas zu verlieren, jemanden zu enttäuschen, gedrängt zu werden",
    wunsch: "Einen Plan mit Schritten, bei dem er jederzeit anhalten darf",
  },
  {
    name: "Blau",
    frage: "„Wie kommst du darauf?“",
    kern: "Zahlen, Herleitung, Belege",
    rand: "border-sky-500/40",
    punkt: "bg-sky-500",
    flaeche: "bg-sky-500/5",
    verhalten: "Hat vorbereitet, hat Fragen notiert, schreibt mit",
    sprache: "„Woher kommt die Zahl“, „unter welcher Annahme“, „Quelle?“",
    tempo: "Langsam und gründlich, entscheidet spät und dann stabil",
    entscheidung: "Nachvollziehbarkeit, Vollständigkeit, Fehlerfreiheit",
    angst: "Einen Fehler zu machen, den er hätte sehen können",
    wunsch: "Alles auf dem Tisch, nichts im Nachhinein",
  },
];

/** Eine Zeile in der Vergleichstabelle: Kopf links, vier Farben rechts. */
function Zeile({ kopf, werte }: { kopf: string; werte: string[] }) {
  return (
    <div className="grid grid-cols-[7rem_repeat(4,1fr)] gap-2 border-t border-border py-2 text-xs">
      <div className="font-semibold uppercase tracking-wide text-[10px] text-muted-foreground pt-0.5">{kopf}</div>
      {werte.map((w, i) => (
        <div key={i}>{w}</div>
      ))}
    </div>
  );
}

function Kopfzeile() {
  return (
    <div className="grid grid-cols-[7rem_repeat(4,1fr)] gap-2 text-[10px] font-bold uppercase tracking-wide">
      <div />
      {TYPEN.map((t) => (
        <div key={t.name} className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${t.punkt}`} />
          {t.name}
        </div>
      ))}
    </div>
  );
}

export default function Kundentypen() {
  return (
    <UnterlagenDetailLayout
      title="Die vier Kundentypen"
      subtitle="Rot, Gelb, Grün, Blau erkennen und richtig führen"
      badge="Partnerschulung"
      pdfLabel="Präsentation als PDF"
      onDownloadPdf={() => {
        // Versionsstempel, damit nach dem Austausch nicht die alte Fassung aus dem Zwischenspeicher kommt.
        window.open("/dokumente/kundentypen.pdf?v=2026-09-26", "_blank", "noopener");
      }}
    >
      <SectionCard title="Worum es geht" icon={<Users className="h-5 w-5" />}>
        <p>
          Du verkaufst dieselbe Wohnung viermal anders, weil vier verschiedene Menschen sie kaufen.
          Der Inhalt bleibt immer gleich, nur Reihenfolge und Tiefe ändern sich. Ein Gespräch kippt
          selten am Inhalt, meistens an der Stelle, an der Tempo oder Tiefe nicht zum Menschen passen.
        </p>
      </SectionCard>

      <SectionCard title="Das Modell in einem Bild" icon={<Gauge className="h-5 w-5" />}>
        <p className="mb-4">
          Zwei Fragen sortieren jeden Kunden: Wie schnell will er, und woran orientiert er sich,
          an der Sache oder am Menschen.
        </p>
        <div className="relative">
          <div className="grid grid-cols-2 gap-3">
            {[TYPEN[0], TYPEN[1], TYPEN[3], TYPEN[2]].map((t) => (
              <div key={t.name} className={`rounded-lg border ${t.rand} ${t.flaeche} p-4`}>
                <div className="flex items-center gap-2 font-semibold">
                  <span className={`h-2.5 w-2.5 rounded-full ${t.punkt}`} />
                  {t.name}
                </div>
                <div className="mt-1 text-sm font-medium">{t.frage}</div>
                <div className="mt-1 text-xs text-muted-foreground">{t.kern}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-[10px] uppercase tracking-wide text-muted-foreground">
            <div>Oben: schnell · links: Sache</div>
            <div className="text-right">Unten: langsam · rechts: Mensch</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Das Modell ist grob, und grob reicht: Wir diagnostizieren nicht, wir wählen den nächsten Satz.
          Jeder Mensch hat alle vier Farben, eine davon führt im Gespräch.
        </p>
      </SectionCard>

      <SectionCard title="Die vier im Porträt" icon={<Target className="h-5 w-5" />}>
        <div className="grid gap-4 md:grid-cols-2">
          {TYPEN.map((t) => (
            <div key={t.name} className={`rounded-lg border ${t.rand} ${t.flaeche} p-4 space-y-2`}>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${t.punkt}`} />
                <span className="font-semibold">{t.name}</span>
                <span className="text-xs text-muted-foreground">{t.frage}</span>
              </div>
              <dl className="space-y-1 text-xs">
                <div><dt className="inline font-semibold">Verhalten: </dt><dd className="inline">{t.verhalten}</dd></div>
                <div><dt className="inline font-semibold">Sprache: </dt><dd className="inline">{t.sprache}</dd></div>
                <div><dt className="inline font-semibold">Tempo: </dt><dd className="inline">{t.tempo}</dd></div>
                <div><dt className="inline font-semibold">Entscheidet über: </dt><dd className="inline">{t.entscheidung}</dd></div>
                <div><dt className="inline font-semibold">Angst: </dt><dd className="inline">{t.angst}</dd></div>
                <div><dt className="inline font-semibold">Wunsch: </dt><dd className="inline">{t.wunsch}</dd></div>
              </dl>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Erkennen in fünf Minuten" icon={<Eye className="h-5 w-5" />}>
        <p className="mb-3">
          Du brauchst keinen Test, du brauchst fünf Beobachtungen, die du ohnehin machst.
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <Kopfzeile />
            <Zeile kopf="Wortwahl" werte={["„Ergebnis“, „schnell“", "„stell dir vor“, „spannend“", "„wir“, „eigentlich“, „sicher“", "„genau“, „Annahme“, „woher“"]} />
            <Zeile kopf="Erste Frage" werte={["Was bringt es?", "Wie läuft das bei euch?", "Was passiert, wenn?", "Wie rechnest du das?"]} />
            <Zeile kopf="Small Talk" werte={["kürzt ab", "führt ihn selbst", "wartet", "übergeht ihn höflich"]} />
            <Zeile kopf="Haltung" werte={["vorn und laut", "bewegt", "ruhig", "neutral, schreibt mit"]} />
            <Zeile kopf="Terminwahl" werte={["nennt den Zeitpunkt", "sagt sofort zu", "fragt den Partner", "fragt nach Vorbereitung"]} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Führen: der erste Satz je Farbe" icon={<MessageSquare className="h-5 w-5" />}>
        <div className="space-y-5">
          <PhaseStep num={1} titel="Rot: kurz, klar, Entscheidung statt Erklärung" text="„Ich brauche zwanzig Minuten, dann hast du eine Zahl und kannst entscheiden.“ Nutzen der Wohnung: Mit rund 30.000 Euro Eigenkapital steuerst du ein Objekt von 300.000 Euro, und der Mieter zahlt den größten Teil der Rate." />
          <PhaseStep num={2} titel="Gelb: das Bild malen, Struktur schriftlich nachliefern" text="Vision und Zugehörigkeit: In zehn Jahren gehört dir eine Wohnung in einer Stadt, die wächst, und du bist einer von denen, die es gemacht haben statt darüber zu reden." />
          <PhaseStep num={3} titel="Grün: Plan mit Schritten, Risiko selbst nennen" text="Sicherheit vor Tempo, jeder Schritt angekündigt, jederzeit anhalten dürfen. Mensch, dann Prozess, dann Objekt." />
          <PhaseStep num={4} titel="Blau: Annahmen offenlegen, sichtbar rechnen" text="Gebäudeanteil 75 Prozent, 2 Prozent AfA, 42 Prozent Grenzsteuersatz. Alle drei sind Annahmen, wir setzen seine ein. Unterlagen vor dem Termin, nicht danach." />
        </div>
      </SectionCard>

      <SectionCard title="Takt, Kanal und Tiefe" icon={<Calculator className="h-5 w-5" />}>
        <p className="mb-3">
          Die Stufen im CRM sind für alle vier gleich, verändert wird nur, wie oft, worüber und in
          welcher Tiefe du dich meldest.
        </p>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <Kopfzeile />
            <Zeile kopf="Takt" werte={["selten und kurz", "oft und persönlich", "regelmäßig und angekündigt", "seltener und vollständig"]} />
            <Zeile kopf="Kanal" werte={["Nachricht mit Ergebnis", "Anruf, Sprachnachricht", "Anruf mit Ankündigung", "E-Mail mit Unterlagen"]} />
            <Zeile kopf="Objektauswahl" werte={["zwei Objekte, klare Empfehlung", "das Objekt mit Lage und Geschichte", "das Objekt mit dem Plan dahinter", "Vergleich mit Faktor und Nettomietrendite"]} />
            <Zeile kopf="Nachbetreuung" werte={["Ergebnismeldung", "Anruf und Einladung", "Anruf zur Nebenkostenabrechnung", "Hinweis zur Anlage V"]} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Wo es kippt" icon={<AlertTriangle className="h-5 w-5" />}>
        <ul className="space-y-2 list-disc list-inside text-sm">
          <li><strong>Rot:</strong> „Dazu komme ich gleich, erst die Grundlagen.“ Zwei Wochen später steht im CRM „Kontakt abgebrochen“.</li>
          <li><strong>Grün:</strong> „Dann reservieren wir das jetzt, damit es dir keiner wegnimmt.“ Tag drei kommt der Rückzug.</li>
          <li><strong>Gelb:</strong> Zeile für Zeile durch die Tabelle. Die Begeisterung hält bis Zeile drei.</li>
          <li><strong>Blau:</strong> „Vertrau mir.“ Danach kommt keine Frage mehr, aber auch keine Unterschrift.</li>
          <li>Ein-Technik-Regel für alle Farben: nie zwei Techniken hintereinander, immer Pause für die Antwort.</li>
          <li>Sitzen zwei Farben am Tisch, sprichst du mit beiden in ihrer Sprache und lässt nie einen für den anderen übersetzen.</li>
        </ul>
      </SectionCard>
    </UnterlagenDetailLayout>
  );
}
