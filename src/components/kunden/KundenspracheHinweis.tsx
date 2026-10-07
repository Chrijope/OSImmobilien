import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { useKundenSprache, type Sprache } from "@/lib/kundenSprache";

/**
 * „Geht auf Englisch raus“: der Hinweis neben jedem Versandknopf an Kunden.
 *
 * Plan Kundensprache, Risiko „gemischte Kommunikation“: Berater sehen im CRM
 * Deutsch, der Kunde bekommt Englisch. Damit das niemanden überrascht, steht
 * neben dem Knopf ein kleiner Hinweis. Bei Deutsch steht nichts, das ist der
 * Normalfall.
 *
 * Einsatz neben einem Versandknopf:
 *
 *   <Button onClick={senden}>An Kunde senden</Button>
 *   <KundenspracheHinweis kontaktId={kontaktId} />
 *
 * Die Komponente folgt dem Zwischenspeicher. Wählt jemand in der Rückfrage
 * „English“, erscheint der Hinweis sofort.
 */
export function KundenspracheHinweis({ kontaktId, className }: { kontaktId: string | null | undefined; className?: string }) {
  const { sprache } = useKundenSprache(kontaktId);
  if (sprache !== "en") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary",
        className,
      )}
      title="Die Kundensprache steht auf Englisch. Mails, Dokumente und Portal folgen dieser Sprache."
    >
      <Languages className="h-3 w-3" aria-hidden="true" />
      Geht auf Englisch raus
    </span>
  );
}

/**
 * Das Kürzel „EN“ neben dem Kundennamen (Profil, Kundenliste). Bei Deutsch
 * steht nichts.
 *
 * Mit `kontaktId` folgt es dem Zwischenspeicher. In langen Listen stattdessen
 * `sprache` übergeben, gewonnen aus `englischsprachigeKontaktIds()`, sonst
 * sucht jede Zeile einzeln im Zwischenspeicher.
 */
export function KundenspracheKuerzel(props: { kontaktId: string | null | undefined; className?: string } | { sprache: Sprache; className?: string }) {
  if ("sprache" in props) return <Kuerzel sprache={props.sprache} className={props.className} />;
  return <KuerzelAusKontakt kontaktId={props.kontaktId} className={props.className} />;
}

function KuerzelAusKontakt({ kontaktId, className }: { kontaktId: string | null | undefined; className?: string }) {
  const { sprache } = useKundenSprache(kontaktId);
  return <Kuerzel sprache={sprache} className={className} />;
}

function Kuerzel({ sprache, className }: { sprache: Sprache; className?: string }) {
  if (sprache !== "en") return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border border-primary/40 px-1 text-[10px] font-semibold uppercase leading-4 tracking-wide text-primary align-middle",
        className,
      )}
      title="Kundensprache Englisch"
      aria-label="Kundensprache Englisch"
    >
      EN
    </span>
  );
}
