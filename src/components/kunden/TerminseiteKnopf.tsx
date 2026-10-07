import { useState } from "react";
import { CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { erstelleLink, istExternerLink, ladeLinks, type BuchungLink } from "@/lib/buchungStore";
import { supabase } from "@/integrations/supabase/client";
import { buchungFehlerMeldung } from "@/lib/buchungZeitenMeldung";
import { partnerterminPfad } from "@/lib/partnerterminStore";
import { hinweisDialog } from "@/lib/confirm";
import { useEigeneBuchungslinks, type BuchungAnlassSchluessel } from "@/lib/eigeneBuchungslinks";

/**
 * Ein Knopf, der die eigene Terminseite für genau ein Gespräch öffnet.
 *
 * Christian am 21.09.2026: In der Objektauswahl soll ein Knopf
 * „Objektvorstellungsgespräch vereinbaren" stehen, in der Finanzierung einer
 * für das Finanzierungsgespräch. Beide führen auf die Terminseite, in der der
 * eigene Kalender des Partners eingebettet ist.
 *
 * ## Warum ein vorhandener Link wiederverwendet wird
 *
 * Die Terminseite hängt an einem persönlichen Buchungslink. Würde jeder Klick
 * einen neuen erzeugen, sammelten sich in der Kundenakte Dutzende Links, und
 * ein bereits verschickter zeigte auf einen anderen Vorgang als der zuletzt
 * geöffnete. Deshalb wird der neueste Link ohne Terminart genommen, sofern es
 * einen gibt. Nur wenn keiner da ist, entsteht einer.
 *
 * ## Warum der Anlass in der Adresse stehen darf, aber nicht muss
 *
 * Die Terminseite kennt alle vier Gespräche. Steht der Anlass in der Adresse,
 * ist die Frage „worum geht es" schon beantwortet, und der erste Schritt
 * entfällt. Wählen lässt sich trotzdem weiter, die Vorwahl sperrt nichts.
 *
 * Ohne Anlass führt der Knopf auf die allgemeine Terminseite, und die Wahl
 * trifft der Partner dort. Genau so steht er seit dem 21.09.2026 im
 * Meeting-Dialog: ein Knopf statt vier.
 *
 * ## Warum nichts in die Zwischenablage kommt
 *
 * Seit dem 29.09.2026 ist die Terminseite nur noch für den angemeldeten
 * Partner, dem der Link gehört (Christians Freigabe). Der Knopf öffnet sie
 * deshalb nur, auf der Adresse, auf der der Partner gerade arbeitet, damit
 * seine Anmeldung gilt. Eine Adresse für den Kunden gibt es nicht mehr, und
 * `?intern=1` braucht die Seite nicht mehr.
 */
export function TerminseiteKnopf({
  kontaktId,
  kontaktName,
  kontaktEmail,
  investmentId,
  anlass,
  beschriftung,
  icon,
  className,
}: {
  kontaktId: string;
  kontaktName?: string;
  kontaktEmail?: string;
  investmentId?: string | null;
  /** Ohne Angabe die allgemeine Terminseite, auf der der Anlass gewählt wird. */
  anlass?: BuchungAnlassSchluessel;
  beschriftung: string;
  /** Eigenes Zeichen vor der Beschriftung. Ohne Angabe der Kalender mit Plus. */
  icon?: React.ReactNode;
  className?: string;
}) {
  /*
    Bewusst auseinandergenommen: Der Hook gibt `{ links, laedt }` zurueck. Ein
    `const links = useEigeneBuchungslinks()` sieht richtig aus, liefert aber das
    ganze Objekt, und `links[anlass]` ist dann `undefined`. Genau so hat der
    Knopf am 21.09.2026 auf jeden Klick mit einer Ausnahme geantwortet, ohne
    dass die Typpruefung oder ein Test etwas gemerkt haetten.
  */
  const { links } = useEigeneBuchungslinks();
  const [arbeitet, setArbeitet] = useState(false);

  const oeffnen = async () => {
    if (arbeitet || !kontaktId) return;

    /*
      Ohne hinterlegten Kalender fuehrt die Terminseite ins Leere: Sie zeigte
      dem Kunden eine leere Auswahl. Der Hinweis nennt deshalb die Stelle, an
      der es fehlt, statt den Knopf einfach nicht zu zeigen.

      Ohne vorgewaehlten Anlass reicht ein einziger Kalender. Die Seite zeigt
      dann eben nur die Gespraeche, fuer die einer hinterlegt ist.
    */
    const fehltKalender = anlass
      ? !links[anlass].trim()
      : !Object.values(links).some((l) => l.trim());
    if (fehltKalender) {
      await hinweisDialog({
        title: anlass
          ? "Für dieses Gespräch fehlt noch dein Kalender"
          : "Dir fehlt noch ein Buchungskalender",
        description:
          "Hinterleg ihn unter Einstellungen, Profil, Buchungskalender-Links. " +
          "Danach kannst du die Terminseite hier öffnen und an den Kunden geben.",
      });
      return;
    }

    setArbeitet(true);
    try {
      /*
        Der wiederverwendbare Link muss vier Bedingungen erfuellen, nicht zwei.

        Bis zum 21.09.2026 fehlten zwei davon, und beide fuehrten auf „Dieser
        Link ist nicht mehr gueltig":

          * `gueltig_bis` wurde nicht geprueft. Ein abgelaufener Altlink wurde
            wiederverwendet, und die Datenbank wies ihn zu Recht ab.
          * Der Besitzer wurde nicht geprueft. Die Seite zeigt den Kalender des
            Linkbesitzers, der Knopf prueft aber den eigenen. Bei einem Kunden,
            dessen alter Link von einem anderen Partner stammt, passte beides
            nicht zusammen.
      */
      const eigeneId = (await supabase.auth.getUser()).data.user?.id;
      const jetzt = Date.now();
      const vorhandene = await ladeLinks(kontaktId);
      let link: BuchungLink | null =
        vorhandene.find((l) =>
          l.aktiv
          && istExternerLink(l)
          && !l.einmalig
          && (!l.gueltig_bis || new Date(l.gueltig_bis).getTime() > jetzt)
          && (!eigeneId || l.mitarbeiter_id === eigeneId)
          /*
            Ein Link, der schon an einem anderen Investment hängt, bleibt
            liegen (29.09.2026). Sein Investment geht in der Datenbank vor
            jeder Auswahl, und die Seite fragt dann nicht mehr: Der Termin
            landete sonst beim falschen Objekt.
          */
          && (!l.investment_id || l.investment_id === investmentId),
        ) || null;

      if (!link) {
        const ergebnis = await erstelleLink({
          kontaktId,
          kontaktName,
          kontaktEmail,
          terminartId: null,
          terminartName: "terminwahl",
          ziel: "extern",
          investmentId: investmentId || null,
          einmalig: false,
          gueltigBis: null,
        });
        link = ergebnis.link;
        if (!link) {
          const meldung = buchungFehlerMeldung(ergebnis.fehler, "linkAnlegen");
          toast({ title: meldung.titel, description: meldung.text, variant: "destructive" });
          return;
        }
      }

      /*
        Die Seite oeffnet auf der Adresse, auf der der Partner gerade
        angemeldet ist, nicht auf osimmobilien.netlify.app: Sie verlangt seit dem
        29.09.2026 die Anmeldung als Besitzer des Links. Aus der
        Lovable-Vorschau heraus fehlte sie auf osimmobilien.netlify.app.

        In die Zwischenablage kommt nichts mehr: Die Seite ist nur noch fuer
        den Partner selbst, eine Adresse zum Weitergeben gibt es nicht.
      */
      const anlassTeil = anlass ? `?anlass=${anlass}` : "";
      window.open(`${window.location.origin}${partnerterminPfad(link.token)}${anlassTeil}`, "_blank", "noopener,noreferrer");
    } finally {
      setArbeitet(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={className || "text-xs h-7"}
      disabled={arbeitet}
      onClick={() => void oeffnen()}
    >
      {arbeitet
        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
        : (icon ?? <CalendarPlus className="h-3 w-3 mr-1" />)}
      {beschriftung}
    </Button>
  );
}
