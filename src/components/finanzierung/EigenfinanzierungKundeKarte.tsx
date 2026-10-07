import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Upload, Download, Trash2, Loader2, Plus, Lock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { openUnterlage } from "@/lib/storage";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirm";
import { portalSprache } from "@/i18n/portalSprache";
import { datumText } from "@/lib/sprachFormat";
import {
  getEigenfinanzierung,
  alleKundenDarlehensvertraege,
  speichereKundenAngebot,
  speichereKundenDarlehensvertrag,
  loescheKundenDarlehensvertrag,
  type EigenfinanzierungAngebot,
} from "@/lib/eigenfinanzierungStore";

/**
 * Eigenfinanzierung im Kundenportal.
 *
 * Steht am Investment der Vermerk „Kunde finanziert selbst", legt der Kunde
 * hier seine eigenen Unterlagen ab: genau ein Finanzierungsangebot und
 * beliebig viele Darlehensverträge.
 *
 * Zwei Unterschiede zu den Bonitätsunterlagen, sonst derselbe Weg und
 * dieselbe Optik:
 *
 * Erstens gibt es keinen Freigabeschritt. Was hier hochgeladen wird, ist
 * sofort sichtbar, es steht also nie „in Prüfung". Dasselbe gilt in die andere
 * Richtung: Lädt der Vertriebspartner im Kundenprofil hoch, sieht der Kunde es
 * ebenfalls sofort.
 *
 * Zweitens läuft das Speichern über die eigene Datenbankfunktion
 * `eigenfinanzierung_kunde_unterlage` statt über `register_unterlage_upload`,
 * weil der Zustand nicht in `docStatuses` liegt, sondern in
 * `meta.eigenfinanzierung`. Details im Kopf von `eigenfinanzierungStore.ts`.
 */
interface Props {
  investmentId: string;
  kontakt: { id: string; vorname?: string; nachname?: string; zustaendig_id?: string } | null | undefined;
  /** Nach dem Speichern die Seite nachladen lassen. */
  onRefresh?: () => void;
}

export function EigenfinanzierungKundeKarte({ investmentId, kontakt, onRefresh }: Props) {
  const { t } = useTranslation();
  const [state, setState] = useState(() => getEigenfinanzierung(investmentId));
  const [laedt, setLaedt] = useState<"angebot" | "vertrag" | null>(null);
  const [migrationFehlt, setMigrationFehlt] = useState(false);
  const eingabe = useRef<HTMLInputElement>(null);
  const ziel = useRef<"angebot" | "vertrag">("vertrag");

  useEffect(() => {
    const neuLaden = () => setState(getEigenfinanzierung(investmentId));
    neuLaden();
    window.addEventListener("eigenfinanzierung-updated", neuLaden);
    return () => window.removeEventListener("eigenfinanzierung-updated", neuLaden);
  }, [investmentId]);

  if (!state.aktiv || !kontakt) return null;

  const vertraege = alleKundenDarlehensvertraege(state);
  const kundeName = `${kontakt.vorname || ""} ${kontakt.nachname || ""}`.trim();
  const datum = (iso?: string) => (iso ? datumText(iso, portalSprache()) : "");
  /*
   * Die Meldungen aus eigenfinanzierungStore.ts sind deutsche Sätze. Auf
   * Englisch steht deshalb der allgemeine Hinweis in der Anzeigesprache statt
   * eines deutschen Satzes.
   */
  const fehlerText = (fehler: string | undefined, rueckfall: string) =>
    fehler && portalSprache() === "de" ? fehler : rueckfall;

  /** Glocke an den zugewiesenen Vertriebspartner, Muster wie bei den Bonitätsunterlagen. */
  const meldeDemPartner = async (was: string) => {
    try {
      const beraterId = kontakt.zustaendig_id;
      if (!beraterId) return;
      await supabase.from("benachrichtigungen" as any).insert({
        benutzer_id: beraterId,
        titel: `Finanzierungsunterlagen: ${kundeName}`,
        nachricht: `${kundeName} hat Finanzierungsunterlagen hochgeladen: „${was}".`,
        link: `/kunden/${kontakt.id}`,
        ziel_rolle: "vertriebspartner",
      } as any);
    } catch (err) {
      console.error("Benachrichtigung an den Vertriebspartner fehlgeschlagen:", err);
    }
  };

  const waehleDatei = (fuer: "angebot" | "vertrag") => {
    ziel.current = fuer;
    eingabe.current?.click();
  };

  const verarbeiteDatei = async (datei: File) => {
    const fuer = ziel.current;
    setLaedt(fuer);
    try {
      const endung = datei.name.split(".").pop() || "pdf";
      const teil = fuer === "angebot" ? "kundeFA" : "kundeDV";
      const pfad = `finanzierung/eigen/${kontakt.id}/${investmentId}/${teil}_${Date.now()}.${endung}`;
      const { error } = await supabase.storage.from("unterlagen").upload(pfad, datei, { upsert: true });
      if (error) {
        toast.error(t("portal.investments.finanzierung.eigen.upload_failed"));
        return;
      }
      const eintrag: EigenfinanzierungAngebot = {
        fileName: datei.name,
        storagePath: pfad,
        uploadedAt: new Date().toISOString(),
        uploadedByName: kundeName || "Kunde",
        uploadedByRole: "kunde",
      };
      const ergebnis = fuer === "angebot"
        ? await speichereKundenAngebot(investmentId, eintrag)
        : await speichereKundenDarlehensvertrag(investmentId, eintrag);
      if (!ergebnis.ok) {
        if (ergebnis.migrationFehlt) {
          setMigrationFehlt(true);
          toast.error(t("portal.investments.finanzierung.eigen.not_ready"));
        } else {
          toast.error(fehlerText(ergebnis.fehler, t("portal.investments.finanzierung.eigen.save_failed")));
        }
        return;
      }
      setState(getEigenfinanzierung(investmentId));
      await meldeDemPartner(datei.name);
      toast.success(t("portal.investments.finanzierung.eigen.uploaded"));
      onRefresh?.();
    } catch (err) {
      console.error(err);
      toast.error(t("portal.investments.finanzierung.eigen.save_failed"));
    } finally {
      setLaedt(null);
    }
  };

  const loescheVertrag = async (eintrag: EigenfinanzierungAngebot) => {
    const ok = await confirmDialog({
      title: t("portal.investments.finanzierung.eigen.delete_title"),
      description: t("portal.investments.finanzierung.eigen.delete_text", { name: eintrag.fileName }),
      confirmText: t("portal.investments.finanzierung.eigen.delete_ok"),
      cancelText: t("portal.investments.finanzierung.eigen.delete_cancel"),
      variant: "destructive",
    });
    if (!ok) return;
    const ergebnis = await loescheKundenDarlehensvertrag(investmentId, eintrag.storagePath);
    if (!ergebnis.ok) {
      if (ergebnis.migrationFehlt) setMigrationFehlt(true);
      toast.error(fehlerText(ergebnis.fehler, t("portal.investments.finanzierung.eigen.delete_failed")));
      return;
    }
    setState(getEigenfinanzierung(investmentId));
    /*
     * Die Datei im Speicher wird nachrangig entfernt. Schlägt es fehl, bleibt
     * höchstens eine verwaiste Datei liegen, sichtbar ist sie nirgends mehr.
     */
    try {
      await supabase.storage.from("unterlagen").remove([eintrag.storagePath]);
    } catch (err) { console.warn("Datei im Speicher nicht entfernt", err); }
    toast.success(t("portal.investments.finanzierung.eigen.deleted"));
    onRefresh?.();
  };

  const zeile = (
    schluessel: string,
    name: string,
    eintrag: EigenfinanzierungAngebot | undefined,
    aktionen: React.ReactNode,
  ) => (
    <div key={schluessel} className="border-b pb-3">
      <div className="flex items-start gap-2">
        <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${eintrag ? "bg-[hsl(var(--success))]" : "bg-destructive"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">{name}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 bg-muted/50 ${eintrag ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
              {eintrag
                ? t("portal.investments.finanzierung.eigen.state_done")
                : t("portal.investments.finanzierung.eigen.state_missing")}
            </span>
          </div>
          {eintrag && (
            <p className="text-xs text-muted-foreground mt-0.5 break-words">
              {eintrag.fileName} · {t("portal.investments.finanzierung.eigen.uploaded_at", { date: datum(eintrag.uploadedAt) })}
            </p>
          )}
          <div className="flex gap-3 mt-1.5 flex-wrap">{aktionen}</div>
        </div>
      </div>
    </div>
  );

  const knopfKlasse = "text-xs text-primary hover:underline uppercase tracking-wide flex items-center gap-1 disabled:opacity-50 disabled:no-underline";

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
      <input
        ref={eingabe}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) verarbeiteDatei(f); e.target.value = ""; }}
      />

      <div>
        <p className="text-sm font-bold">{t("portal.investments.finanzierung.eigen.title")}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{t("portal.investments.finanzierung.eigen.intro")}</p>
      </div>

      <div className="flex items-center gap-2 text-xs text-[hsl(var(--success))]">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        <span>{t("portal.investments.finanzierung.eigen.no_release")}</span>
      </div>

      {migrationFehlt && (
        <div className="flex items-start gap-2 rounded-md bg-muted/60 p-2.5">
          <Lock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">{t("portal.investments.finanzierung.eigen.not_ready")}</p>
        </div>
      )}

      <div className="space-y-3">
        {zeile(
          "angebot",
          t("portal.investments.finanzierung.eigen.angebot"),
          state.kundenAngebot,
          state.kundenAngebot ? (
            <button className={knopfKlasse} onClick={() => openUnterlage(state.kundenAngebot!.storagePath)}>
              <Download className="h-3 w-3" /> {t("portal.investments.finanzierung.eigen.view")}
            </button>
          ) : (
            <button className={knopfKlasse} disabled={laedt === "angebot"} onClick={() => waehleDatei("angebot")}>
              {laedt === "angebot" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {t("portal.investments.finanzierung.eigen.upload")}
            </button>
          ),
        )}

        <div>
          <div className="flex items-start gap-2">
            <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${vertraege.length > 0 ? "bg-[hsl(var(--success))]" : "bg-destructive"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t("portal.investments.finanzierung.eigen.vertrag")}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 bg-muted/50 ${vertraege.length > 0 ? "text-[hsl(var(--success))]" : "text-destructive"}`}>
                  {vertraege.length > 0
                    ? t("portal.investments.finanzierung.eigen.state_count", { count: vertraege.length })
                    : t("portal.investments.finanzierung.eigen.state_missing")}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t("portal.investments.finanzierung.eigen.vertrag_hint")}</p>

              {vertraege.length > 0 && (
                <div className="mt-2 space-y-2">
                  {vertraege.map((eintrag) => (
                    <div key={eintrag.storagePath} className="rounded-md bg-background/70 px-2.5 py-2">
                      <p className="text-xs font-medium break-words">{eintrag.fileName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {t("portal.investments.finanzierung.eigen.uploaded_at", { date: datum(eintrag.uploadedAt) })}
                      </p>
                      <div className="flex gap-3 mt-1 flex-wrap">
                        <button className={knopfKlasse} onClick={() => openUnterlage(eintrag.storagePath)}>
                          <Download className="h-3 w-3" /> {t("portal.investments.finanzierung.eigen.view")}
                        </button>
                        <button
                          className="text-xs text-destructive hover:underline uppercase tracking-wide flex items-center gap-1"
                          onClick={() => loescheVertrag(eintrag)}
                        >
                          <Trash2 className="h-3 w-3" /> {t("portal.investments.finanzierung.eigen.delete")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3 mt-1.5 flex-wrap">
                <button className={knopfKlasse} disabled={laedt === "vertrag"} onClick={() => waehleDatei("vertrag")}>
                  {laedt === "vertrag"
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : vertraege.length > 0 ? <Plus className="h-3 w-3" /> : <Upload className="h-3 w-3" />}
                  {vertraege.length > 0
                    ? t("portal.investments.finanzierung.eigen.add")
                    : t("portal.investments.finanzierung.eigen.upload")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
