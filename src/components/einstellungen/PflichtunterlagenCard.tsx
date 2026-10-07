import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Upload, FileText, Eye, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Siehe partnerUnterlagenStore: Die erzeugten Typen kennen die neuen
// Profilspalten noch nicht.
const db = supabase as unknown as { from: (t: string) => any };
import {
  ladeUnterlagen, ladeHoch, ansehenLink, onboardingStand,
  UNTERLAGEN_LABEL, type PartnerUnterlage, type UnterlagenArt,
} from "@/lib/partnerUnterlagenStore";
import { groesseText } from "@/lib/unterlagenVerkleinern";

/**
 * Die beiden Pflichtunterlagen in den Einstellungen.
 *
 * Personalausweis und, falls vorhanden, die Erlaubnis nach § 34c GewO.
 * Beides zusammen schließt das Onboarding ab und öffnet das CRM.
 *
 * Die Karte wird an zwei Stellen eingebunden: bei den persönlichen Daten der
 * Ausweis, bei den Gewerbedaten die Erlaubnis. Über `nurArt` lässt sich
 * steuern, welcher Teil erscheint.
 */

export function PflichtunterlagenCard({
  userId,
  /** Nur diesen Teil zeigen. Ohne Angabe erscheinen beide. */
  nurArt,
  onGeaendert,
}: {
  userId: string;
  nurArt?: "ausweis" | "gewerbe";
  onGeaendert?: () => void;
}) {
  const [unterlagen, setUnterlagen] = useState<PartnerUnterlage[]>([]);
  const [hat34c, setHat34c] = useState<boolean | null>(null);
  const [laedt, setLaedt] = useState<UnterlagenArt | null>(null);
  const [bereit, setBereit] = useState(false);
  /** Migration fehlt. Dann ist die Karte nutzlos und sagt es auch. */
  const [nichtEingerichtet, setNichtEingerichtet] = useState(false);
  /** Ladefehler (Netz/Datenbank): nicht als "fehlt" anzeigen, sondern sagen. */
  const [ladefehler, setLadefehler] = useState(false);

  const laden = useCallback(async () => {
    setLadefehler(false);
    let docs: Awaited<ReturnType<typeof ladeUnterlagen>>;
    let profil: { data?: unknown; error?: { code?: string; message?: string } };
    try {
      [docs, profil] = await Promise.all([
        ladeUnterlagen(userId),
        db.from("profiles").select("gewerbeerlaubnis_34c").eq("id", userId).maybeSingle(),
      ]);
    } catch (e) {
      console.warn("[PflichtunterlagenCard] laden fehlgeschlagen:", (e as Error)?.message);
      setLadefehler(true);
      setBereit(true);
      return;
    }
    setUnterlagen(docs);
    /*
     * Kennt die Datenbank die Spalte nicht, ist die Migration noch nicht
     * gelaufen. Dann hat es keinen Sinn, Knöpfe anzubieten, die beim ersten
     * Klick scheitern.
     */
    const fehler = (profil as { error?: { code?: string; message?: string } }).error;
    if (fehler && (fehler.code === "42703" || /does not exist/i.test(fehler.message || ""))) {
      setNichtEingerichtet(true);
      setBereit(true);
      return;
    }
    const wert = (profil.data as { gewerbeerlaubnis_34c?: boolean | null } | null)?.gewerbeerlaubnis_34c;
    setHat34c(wert === null || wert === undefined ? null : Boolean(wert));
    setBereit(true);
  }, [userId]);

  useEffect(() => { void laden(); }, [laden]);

  const setzeErlaubnis = async (vorhanden: boolean) => {
    setHat34c(vorhanden);
    const { error } = await db
      .from("profiles").update({ gewerbeerlaubnis_34c: vorhanden }).eq("id", userId);
    if (error) {
      // Zurückdrehen, sonst zeigt die Auswahl etwas an, das nicht gespeichert ist.
      setHat34c((v) => (v === vorhanden ? null : v));
      /*
       * Den Grund nennen, nicht nur das Scheitern.
       *
       * Der häufigste Fall ist eine noch nicht ausgeführte Migration: Die
       * Spalte gibt es dann schlicht nicht. Postgres meldet das mit
       * "column ... does not exist" beziehungsweise dem Code 42703, und ohne
       * Übersetzung steht der Nutzer vor einem Rätsel.
       */
      const fehlendeSpalte =
        error.code === "42703" || /column .* does not exist/i.test(error.message || "");
      toast.error(
        fehlendeSpalte
          ? "Die Datenbank kennt dieses Feld noch nicht. Die Migration für die Pflichtunterlagen muss erst ausgeführt werden."
          : `Die Angabe konnte nicht gespeichert werden: ${error.message}`,
      );
      return;
    }
    onGeaendert?.();
  };

  if (!bereit) {
    return (
      <Card className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Unterlagen werden geladen…
      </Card>
    );
  }

  if (ladefehler) {
    return (
      <Card className="p-4">
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Deine Unterlagen konnten gerade nicht geladen werden. Das sagt nichts darüber aus,
            ob sie vorliegen. Bitte kurz erneut versuchen.
          </span>
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => { setBereit(false); void laden(); }}>
          Erneut laden
        </Button>
      </Card>
    );
  }

  if (nichtEingerichtet) {
    return (
      <Card className="border-amber-300/60 bg-amber-50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
        <p className="flex items-start gap-2 text-sm text-amber-900 dark:text-amber-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Die Pflichtunterlagen sind in der Datenbank noch nicht eingerichtet. Die Migration
            <code className="mx-1 rounded bg-amber-100 px-1 text-xs dark:bg-amber-900/40">
              20260806160000_partner_pflichtunterlagen
            </code>
            muss erst ausgeführt werden. Bis dahin lässt sich hier nichts speichern.
          </span>
        </p>
      </Card>
    );
  }

  const stand = onboardingStand(unterlagen, hat34c, null);
  const zeigeAusweis = nurArt !== "gewerbe";
  const zeigeGewerbe = nurArt !== "ausweis";

  return (
    <Card className="p-6">
      <div className="mb-3 h-1 w-8 bg-primary" />
      <h3 className="mb-1 font-bold">
        {nurArt === "gewerbe" ? "Gewerbeerlaubnis" : nurArt === "ausweis" ? "Ausweisdokument" : "Pflichtunterlagen"}
      </h3>
      <p className="mb-5 text-xs text-muted-foreground">
        Nur PDF und JPEG. Zu große Dateien werden automatisch verkleinert. Sichtbar für dich,
        die Geschäftsleitung, das Backoffice und die Vertriebsleitung.
      </p>

      {zeigeAusweis && (
        <UploadZeile
          art="personalausweis"
          pflicht
          vorhanden={unterlagen.find((u) => u.art === "personalausweis")}
          laedt={laedt === "personalausweis"}
          onUpload={async (datei) => {
            setLaedt("personalausweis");
            const r = await ladeHoch(userId, "personalausweis", datei);
            setLaedt(null);
            if (!r.ok) { toast.error(r.grund || "Upload fehlgeschlagen"); return; }
            meldeErfolg("Personalausweis", r);
            await laden();
            onGeaendert?.();
          }}
        />
      )}

      {zeigeGewerbe && (
        <div className={zeigeAusweis ? "mt-6 border-t pt-5" : ""}>
          <Label className="text-sm font-medium">
            Erlaubnis nach § 34c GewO <span className="text-destructive">*</span>
          </Label>
          <RadioGroup
            className="mt-2 flex gap-6"
            value={hat34c === null ? "" : hat34c ? "ja" : "nein"}
            onValueChange={(v) => void setzeErlaubnis(v === "ja")}
          >
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="ja" id="g34c-ja" />
              <label htmlFor="g34c-ja" className="cursor-pointer text-sm">Vorhanden</label>
            </div>
            <div className="flex items-center gap-1.5">
              <RadioGroupItem value="nein" id="g34c-nein" />
              <label htmlFor="g34c-nein" className="cursor-pointer text-sm">Nicht vorhanden</label>
            </div>
          </RadioGroup>

          {hat34c === true && (
            <div className="mt-4">
              <UploadZeile
                art="gewerbeerlaubnis_34c"
                pflicht
                vorhanden={unterlagen.find((u) => u.art === "gewerbeerlaubnis_34c")}
                laedt={laedt === "gewerbeerlaubnis_34c"}
                onUpload={async (datei) => {
                  setLaedt("gewerbeerlaubnis_34c");
                  const r = await ladeHoch(userId, "gewerbeerlaubnis_34c", datei);
                  setLaedt(null);
                  if (!r.ok) { toast.error(r.grund || "Upload fehlgeschlagen"); return; }
                  meldeErfolg("Gewerbeerlaubnis", r);
                  await laden();
                  onGeaendert?.();
                }}
              />
            </div>
          )}

          {hat34c === false && (
            <p className="mt-3 text-xs text-muted-foreground">
              Notiert. Ohne Erlaubnis nach § 34c GewO ist nichts weiter zu tun, die Angabe
              liegt der Geschäftsleitung vor.
            </p>
          )}
        </div>
      )}

      {!nurArt && (
        <div className="mt-5 border-t pt-4">
          {stand.vollstaendig ? (
            <p className="flex items-center gap-1.5 text-sm text-[hsl(var(--success))]">
              <CheckCircle2 className="h-4 w-4" /> Alles vollständig.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-500">
              <AlertCircle className="h-4 w-4" /> Es fehlt noch etwas.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Rueckmeldung nach dem Upload.
 *
 * Wurde die Datei verkleinert, soll der Partner das erfahren: Er hat eine
 * 40-MB-Datei ausgewaehlt und bekommt eine 6-MB-Datei abgelegt. Sagt niemand
 * etwas, wundert er sich spaeter ueber die Qualitaet.
 *
 * Bei PDFs kommt hinzu, dass die Textebene verloren geht. Das ist keine
 * Kleinigkeit und gehoert ausdruecklich gesagt.
 */
function meldeErfolg(
  label: string,
  r: { verkleinert?: boolean; vorher?: number; nachher?: number; textEbeneVerloren?: boolean; verkleinernFehler?: string },
) {
  /*
   * Das Verkleinern ist gescheitert, die Originaldatei passte aber noch unter
   * das Limit und ist hochgeladen. Trotzdem sagen: Sonst sieht es aus, als
   * wäre alles glatt gelaufen, und niemand merkt, dass die Funktion kaputt
   * ist. Ein Toast genügt, der Upload selbst hat ja geklappt.
   */
  if (r.verkleinernFehler) {
    toast.warning(`${label} hochgeladen, aber nicht verkleinert`, {
      description: `${r.verkleinernFehler} Hochgeladen wurde die Originaldatei.`,
    });
    return;
  }
  if (!r.verkleinert) {
    toast.success(`${label} hochgeladen`);
    return;
  }
  const von = r.vorher ? groesseText(r.vorher) : "";
  const auf = r.nachher ? groesseText(r.nachher) : "";
  toast.success(`${label} hochgeladen`, {
    description: r.textEbeneVerloren
      ? `Die Datei war zu groß und wurde von ${von} auf ${auf} verkleinert. Dabei ist die Textebene verloren gegangen, das Dokument ist jetzt eine Bildfolge.`
      : `Die Datei war zu groß und wurde von ${von} auf ${auf} verkleinert.`,
  });
}

/** Eine Zeile: Bezeichnung, Zustand und der Knopf zum Hochladen. */
function UploadZeile({
  art, pflicht, vorhanden, laedt, onUpload,
}: {
  art: UnterlagenArt;
  pflicht?: boolean;
  vorhanden?: PartnerUnterlage;
  laedt: boolean;
  onUpload: (datei: File) => void | Promise<void>;
}) {
  const feld = useRef<HTMLInputElement>(null);

  const ansehen = async () => {
    if (!vorhanden) return;
    const url = await ansehenLink(vorhanden.pfad);
    if (url) window.open(url, "_blank");
    else toast.error("Die Datei konnte nicht geöffnet werden.");
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {UNTERLAGEN_LABEL[art]}
          {pflicht && <span className="ml-0.5 text-destructive">*</span>}
        </p>
        {vorhanden ? (
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <FileText className="h-3 w-3 shrink-0" />
            <span className="truncate">{vorhanden.dateiname}</span>
            <span className="shrink-0">
              · {new Date(vorhanden.hochgeladenAm).toLocaleDateString("de-DE")}
            </span>
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground">Noch nicht hochgeladen</p>
        )}
      </div>

      <Badge
        variant="outline"
        className={vorhanden
          ? "border-[hsl(var(--success))]/40 text-[hsl(var(--success))]"
          : "border-destructive/40 text-destructive"}
      >
        {vorhanden ? "Hochgeladen" : "Fehlt"}
      </Badge>

      {vorhanden && (
        <Button variant="ghost" size="sm" onClick={() => void ansehen()} className="gap-1.5">
          <Eye className="h-3.5 w-3.5" /> Ansehen
        </Button>
      )}

      <Button
        variant={vorhanden ? "outline" : "default"}
        size="sm"
        disabled={laedt}
        onClick={() => feld.current?.click()}
        className="gap-1.5"
      >
        {laedt
          ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lädt…</>
          : <><Upload className="h-3.5 w-3.5" /> {vorhanden ? "Ersetzen" : "Hochladen"}</>}
      </Button>

      <input
        ref={feld}
        type="file"
        // Die Auswahl im Dateidialog schon einschränken. Geprüft wird trotzdem
        // noch einmal, denn diese Angabe lässt sich im Dialog umgehen.
        accept="application/pdf,image/jpeg,.pdf,.jpg,.jpeg"
        className="hidden"
        onChange={(e) => {
          const datei = e.target.files?.[0];
          // Zurücksetzen, damit dieselbe Datei erneut gewählt werden kann.
          e.target.value = "";
          if (datei) void onUpload(datei);
        }}
      />
    </div>
  );
}
