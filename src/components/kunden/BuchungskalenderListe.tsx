import { CalendarPlus, ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BUCHUNG_ANLAESSE, type EigeneBuchungslinks } from "@/lib/eigeneBuchungslinks";
import { TerminseiteKnopf } from "@/components/kunden/TerminseiteKnopf";

/**
 * Die vier eigenen Buchungskalender als Übersicht, darunter ein Knopf.
 *
 * Steht überall dort, wo ein Termin entsteht, etwa im Meeting-Dialog.
 * Christian am 21.09.2026: Wer auf „Meeting" klickt, will in aller
 * Regel gemeinsam mit dem Kunden eine Zeit aussuchen. Bis dahin musste er dafür
 * die Seite verlassen und in den Einstellungen nachsehen, welche Adresse zu
 * welchem Gespräch gehört.
 *
 * ## Warum ein Knopf statt vier
 *
 * Bis zum 21.09.2026 trug jede der vier Zeilen einen eigenen Knopf
 * „Terminseite", jeder mit vorgewähltem Anliegen. Christian wollte einen
 * einzigen Klick auf die allgemeine Terminseite und die Wahl dort treffen, wo
 * ohnehin der Kalender steht. Die vier Zeilen bleiben trotzdem stehen, aber nur
 * noch als Auskunft: Sie zeigen, welcher Kalender hinterlegt ist und welcher
 * fehlt, und der Weg „Hinterlegen" führt weiter in die Einstellungen.
 *
 * ## Warum nicht der nackte Kalenderlink
 *
 * Der Knopf öffnete zuerst direkt Calendly. Dann bucht der Kunde dort, und im
 * CRM steht nichts: Calendly meldet uns keine Zeit zurück. Deshalb führt er
 * jetzt auf unsere eigene Terminseite, in der derselbe Kalender eingebettet
 * steckt und der Kunde die gebuchte Zeit anschließend bestätigt. Erst damit
 * landet der Termin in der Akte und am Investment.
 *
 * Ohne Kontakt geht das nicht, denn die Terminseite gehört immer zu genau einem
 * Kunden. Dann bleibt es bei den direkten Kalenderlinks je Zeile, das ist
 * besser als kein Weg.
 *
 * Ein fehlender Kalender wird ausdrücklich als fehlend gezeigt und nicht
 * weggelassen. Sonst sucht jemand das Objektgespräch, findet es nicht und hält
 * es für einen Fehler, statt zu merken, dass er es nur hinterlegen muss.
 */
export function BuchungskalenderListe({
  links,
  laedt = false,
  kontaktId,
  kontaktName,
  kontaktEmail,
  investmentId,
}: {
  links: EigeneBuchungslinks;
  /**
   * Solange wahr, steht noch nicht fest, welche Kalender es gibt.
   *
   * Ohne dieses Feld zeigte die Liste fuer den Bruchteil einer Sekunde bei
   * allen vier "Noch kein Kalender hinterlegt" samt Knopf "Hinterlegen" und
   * sprang dann um. Ein Zustand, der sofort widerrufen wird, ist schlimmer als
   * gar keiner: Wer ihn erwischt, glaubt, etwas sei kaputt.
   */
  laedt?: boolean;
  kontaktId?: string;
  kontaktName?: string;
  kontaktEmail?: string;
  investmentId?: string | null;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-sm font-medium">Termin mit dem Kunden vereinbaren</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {kontaktId
          ? "Das sind deine Kalender. Der Knopf darunter öffnet deine Terminseite: Dort wählst du das Anliegen, buchst im Kalender und trägst die Zeit ein, dann steht sie sofort in der Akte."
          : "Öffne den passenden Kalender und such die Zeit gemeinsam mit dem Kunden aus. Datum und Uhrzeit trägst du danach unten ein."}
      </p>
      <div className="mt-2.5 space-y-1.5">
        {BUCHUNG_ANLAESSE.map((k) => {
          const url = (links[k.anlass] || "").trim();
          return (
            <div
              key={k.anlass}
              className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-medium ${url || laedt ? "" : "text-muted-foreground"}`}>
                  {k.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {url || laedt ? k.dauer : "Noch kein Kalender hinterlegt"}
                </p>
              </div>
              {/*
                Solange geladen wird, steht rechts nur ein ruhiger Platzhalter.
                Vorher sprang dort im Bruchteil einer Sekunde "Hinterlegen" auf
                und wieder weg, bei allen vier gleichzeitig.
              */}
              {laedt && (
                <span className="h-7 w-[92px] shrink-0 animate-pulse rounded-md bg-muted" aria-hidden />
              )}
              {/*
                Neuer Tab statt Navigation: Der Dialog bleibt offen und die
                bereits getippte Beschreibung ist nicht weg.
              */}
              {!laedt && !url && (
                <Button type="button" variant="ghost" size="sm" className="h-7 shrink-0 gap-1.5 text-xs" asChild>
                  <a href="/einstellungen?tab=profil" target="_blank" rel="noreferrer">
                    <Plus className="h-3 w-3" /> Hinterlegen
                  </a>
                </Button>
              )}
              {/* Ohne Kontakt gibt es keine Terminseite, dann der Kalender selbst. */}
              {!laedt && url && !kontaktId && (
                <Button type="button" variant="outline" size="sm" className="h-7 shrink-0 gap-1.5 text-xs" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3 w-3" /> Öffnen
                  </a>
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/*
        Der eine Weg auf die Terminseite, für alle vier Gespräche zusammen.
        Ohne Kontakt gibt es ihn nicht, denn die Terminseite hängt immer an
        genau einem Kunden; dann bleiben die Kalenderlinks oben.
      */}
      {kontaktId && (
        <div className="mt-2.5">
          <TerminseiteKnopf
            kontaktId={kontaktId}
            kontaktName={kontaktName}
            kontaktEmail={kontaktEmail}
            investmentId={investmentId}
            beschriftung="Terminseite öffnen"
            icon={<CalendarPlus className="h-3.5 w-3.5 mr-1.5" />}
            className="h-8 w-full text-xs"
          />
        </div>
      )}
    </div>
  );
}
