import { useEffect, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Gift, Pencil } from "lucide-react";
import { cacheGet } from "@/lib/dataCache";
import {
  createProgramm, getProgrammByInvestment,
  type EmpfehlungsProgramm,
} from "@/lib/empfehlungenStore";
import {
  EmpfehlungsprogrammDialoge,
  type EmpfehlungsprogrammDialogArt,
} from "@/components/kunde/EmpfehlungsprogrammDialoge";

/**
 * Das Empfehlungsprogramm des Kunden als kompakte Knoepfe in der
 * Aktionsreihe der Stammdaten (neben "Daten aendern" usw.).
 *
 * Frueher stand hier eine grosse Karte mit Konditionen und der Liste der
 * eingegangenen Empfehlungen. Die Liste gibt es kundenuebergreifend auf der
 * Empfehlungen-Seite (Sidebar unter Vertrieb), deshalb bleiben im Profil nur
 * die Knoepfe: aktivieren, bearbeiten, deaktivieren. Dialoge und
 * Speicherlogik liegen gemeinsam in EmpfehlungsprogrammDialoge.tsx.
 *
 * Unter der Haube haengen die Programme weiter an den Investments, davon
 * leben Kundenportal, Empfehlungseingang und Abrechnung. Gepflegt wird das
 * Programm hier einmal fuer alle Investments des Kunden.
 */

interface Props {
  /**
   * Überschrift über den Knöpfen. Sie steht hier und nicht beim Aufrufer,
   * damit sie mit den Knöpfen verschwindet, wenn der Kunde noch kein
   * Investment hat oder die Rolle das Programm nicht pflegen darf.
   */
  ueberschrift?: ReactNode;
  kunde: any;
  investments: any[];
  currentUser: { id?: string; name?: string; role?: string } | null;
  onChanged?: () => void;
}

export function EmpfehlungsprogrammKnoepfe({ ueberschrift, kunde, investments, currentUser, onChanged }: Props) {
  const [dialogArt, setDialogArt] = useState<EmpfehlungsprogrammDialogArt | null>(null);
  // Nur ein Render-Ausloeser: nach Cache-Aenderungen (Selbstheilung,
  // Speichern) wird neu gerechnet, die Werte selbst kommen direkt aus dem
  // Cache. Bewusst ohne useMemo, die Listen sind klein.
  const [, erneuern] = useState(0);

  const rowMeta = (cacheGet("kontakte").find((r: any) => r.id === kunde?.id)?.meta) || {};
  const aktiv = !!rowMeta.empfehlungsprogramm_aktiv;

  const leitProgramm = (investments.map((inv) => getProgrammByInvestment(inv.id)).find(Boolean) as EmpfehlungsProgramm | undefined) ?? null;

  const canManage = ["admin", "inhaber", "vertriebspartner"].includes(currentUser?.role || "");

  // Selbstheilung: Kommt nach der Freischaltung ein weiteres Investment dazu,
  // bekommt es das Programm mit denselben Konditionen automatisch.
  useEffect(() => {
    if (!aktiv || !leitProgramm) return;
    let ergaenzt = false;
    for (const inv of investments) {
      if (getProgrammByInvestment(inv.id)) continue;
      createProgramm({
        investmentId: inv.id,
        kontaktId: kunde.id,
        kontaktName: `${kunde.vorname || ""} ${kunde.nachname || ""}`.trim(),
        beraterName: leitProgramm.beraterName,
        provisionsTyp: leitProgramm.provisionsTyp,
        provisionsBetrag: leitProgramm.provisionsBetrag,
        provisionsText: leitProgramm.provisionsText,
        bedingungen: leitProgramm.bedingungen,
        freigeschaltet: true,
      });
      ergaenzt = true;
    }
    if (ergaenzt) erneuern((v) => v + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aktiv, investments.length]);

  if (investments.length === 0 || !kunde?.id || !canManage) return null;

  return (
    <>
      {ueberschrift}
      {aktiv && (
        <Badge
          variant="outline"
          className="self-center text-[10px] gap-1 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30"
        >
          <Gift className="h-3 w-3" /> Empfehlungsprogramm aktiv
        </Badge>
      )}
      {/*
        Aktivieren ist die Hauptaktion des Kastens und steht deshalb in der
        Grundfarbe des Projekts (Christian, 23.09.2026). Bearbeiten und
        Deaktivieren bleiben leise.
      */}
      {!aktiv ? (
        <Button size="sm" variant="default" onClick={() => setDialogArt("einstellen")}>
          <Gift className="h-3 w-3 mr-1" /> Empfehlungsprogramm aktivieren
        </Button>
      ) : (
        <>
          <Button size="sm" variant="secondary" onClick={() => setDialogArt("einstellen")}>
            <Pencil className="h-3 w-3 mr-1" /> Empfehlungsprogramm bearbeiten
          </Button>
          <Button size="sm" variant="secondary" className="text-muted-foreground" onClick={() => setDialogArt("deaktivieren")}>
            Deaktivieren
          </Button>
        </>
      )}

      <EmpfehlungsprogrammDialoge
        kunde={kunde}
        investments={investments}
        currentUser={currentUser}
        offen={dialogArt}
        onSchliessen={() => setDialogArt(null)}
        onChanged={() => {
          erneuern((v) => v + 1);
          onChanged?.();
        }}
      />
    </>
  );
}
