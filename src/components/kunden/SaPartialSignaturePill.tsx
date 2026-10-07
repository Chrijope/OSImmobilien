import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirm";
import { signaturErneutSenden } from "@/lib/signaturErneutSenden";
import { SIGNATUR_FRIST_TAGE, SIGNATUR_FRIST_TEXT } from "@/lib/signaturFrist";
import { Mail, RefreshCw, Clock, AlertTriangle } from "lucide-react";
import { saErwartetePersonen } from "../../../supabase/functions/_shared/selbstauskunft-geltende-unterschrift.ts";

type SigRow = {
  id: string;
  person_type: string;
  name: string;
  email: string;
  status: string;
  signed_at: string | null;
  created_at: string;
  expires_at: string | null;
  sa_data: any;
};

// Modul-globaler Cache (stale-while-revalidate), damit der Block beim Re-Mount
// sofort die letzte bekannte Anzeige rendert statt erst nach dem DB-Roundtrip.
const PILL_CACHE = new Map<string, SigRow[]>();
const cacheKey = (k: string, i: string) => `${k}::${i}`;

interface Props {
  kontaktId: string;
  investmentId: string;
  /** Fallback saData if no pending row carries one (used for resend). */
  fallbackSaData?: any;
}

/** Ist der Link dieser Anfrage abgelaufen? Ohne Datum gilt er als gültig. */
function istAbgelaufen(zeile: SigRow, jetzt: Date = new Date()): boolean {
  if (!zeile.expires_at) return false;
  const ablauf = new Date(zeile.expires_at).getTime();
  if (isNaN(ablauf)) return false;
  return ablauf < jetzt.getTime();
}

function datumKurz(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Stand der Unterschriften zur Selbstauskunft, mit Knopf für einen neuen Link.
 *
 * Bis zum 16.09.2026 erschien dieser Kasten nur im Sonderfall: zwei Personen,
 * eine hat unterschrieben, die andere nicht. Der häufigste Fall, nämlich eine
 * versendete Selbstauskunft, die niemand angerührt hat, hatte damit keinen
 * Knopf zum erneuten Senden. Der Partner musste den Umweg über
 * „Selbstauskunft bearbeiten & erneut senden“ nehmen und das ganze Formular
 * noch einmal durchlaufen.
 *
 * Jetzt zeigt der Kasten jede noch offene Unterschrift, auch die einzelne, und
 * jede Zeile trägt ihren eigenen Knopf. Er bleibt ausdrücklich auch dann
 * bedienbar, wenn der alte Link abgelaufen ist, denn genau dann wird er
 * gebraucht.
 *
 * Die Pipeline rückt weiterhin erst vor, wenn alle Personen unterschrieben
 * haben; das entscheidet `finalize-selbstauskunft` auf dem Server.
 */
export function SaPartialSignaturePill({ kontaktId, investmentId, fallbackSaData }: Props) {
  const { toast } = useToast();
  const ck = cacheKey(kontaktId, investmentId);
  const [rows, setRows] = useState<SigRow[] | null>(() => PILL_CACHE.get(ck) ?? null);
  const [resending, setResending] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("signature_requests")
      .select("id, person_type, name, email, status, signed_at, created_at, expires_at, sa_data")
      .eq("kontakt_id", kontaktId)
      .eq("investment_id", investmentId)
      .not("person_type", "like", "rv_%")
      // Anfragen einer abgelösten Fassung sind weder offen noch unterschrieben.
      .neq("status", "ueberholt")
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[SaPartialSignaturePill] load error", error);
      if (!PILL_CACHE.has(ck)) setRows([]);
      return;
    }
    const list = (data || []) as SigRow[];
    PILL_CACHE.set(ck, list);
    setRows(list);
    /*
     * Hier stand bis zum 26.09.2026 ein Hintergrund-Abgleich: Sobald eine
     * Unterschrift da war, rief der Kasten `finalize-selbstauskunft` nur mit
     * Kontakt und Investment auf, damit Teilunterschriften in
     * `meta.saSignatures` landen. Die Function verlangt aber seit dem
     * 31.05.2026 einen Unterschriftslink oder das Geheimwort der Functions,
     * der Abgleich kam am 17.06.2026 dazu. Er wurde also nie angenommen und
     * endete jedes Mal mit „Unauthorized“.
     *
     * Gebraucht wird er auch nicht: Beide Wege, auf denen unterschrieben wird
     * (Signaturseite und Ausfüll-Link), rufen die Function mit gültigem
     * Nachweis auf, und sie spiegelt die Teilunterschriften dabei selbst.
     * Den Aufruf für Mitarbeiter zu öffnen, hätte eine Function mit Stufe,
     * Glocke und Mail ohne Not für einen weiteren Aufrufer freigegeben.
     */
  }, [kontaktId, investmentId, ck]);

  useEffect(() => { load(); }, [load]);

  if (!rows || rows.length === 0) return null;

  // Latest row per person_type wins
  const latestByPerson = new Map<string, SigRow>();
  for (const r of rows) {
    if (!latestByPerson.has(r.person_type)) latestByPerson.set(r.person_type, r);
  }
  /*
   * Person 2 steht in der Selbstauskunft, hat aber gar keine Anfrage.
   *
   * Das passierte bis zum 26.09.2026, wenn „Neuen Link senden“ an Person 1
   * die offene Anfrage von Person 2 mitgelöscht hat. Seitdem schließt die
   * Selbstauskunft ohne Person 2 nicht mehr ab. Damit sie nicht unsichtbar
   * hängen bleibt, erscheint Person 2 hier als offen, mit eigenem Knopf.
   */
  const angaben = rows[0]?.sa_data || fallbackSaData;
  const hatPerson2 = latestByPerson.has("person2") || latestByPerson.has("partner");
  if (saErwartetePersonen(angaben).includes("person2") && !hatPerson2) {
    const p2 = (angaben?.person2Data || {}) as { vorname?: string; nachname?: string; email?: string };
    latestByPerson.set("person2", {
      id: "person2-ohne-anfrage",
      person_type: "person2",
      name: `${p2.vorname || ""} ${p2.nachname || ""}`.trim() || "Person 2",
      email: (p2.email || "").trim(),
      status: "pending",
      signed_at: null,
      created_at: "",
      expires_at: null,
      sa_data: angaben,
    });
  }
  const latest = Array.from(latestByPerson.values());
  const total = latest.length;

  const signed = latest.filter(r => r.status === "signed");
  const pending = latest.filter(r => r.status !== "signed");
  if (pending.length === 0) return null; // fully signed — handled elsewhere

  const resend = async (row: SigRow) => {
    // Aktuellen Kontakt aus DB laden — die Email in signature_requests kann veraltet
    // sein (z. B. „Offen" wurde eingetragen und Julian hat sie nun in Stammdaten korrigiert).
    let freshEmail = row.email;
    let freshName = row.name;
    const { data: kRow } = await supabase
      .from("kontakte")
      .select("vorname, nachname, email, meta")
      .eq("id", kontaktId)
      .maybeSingle();
    if (kRow) {
      const meta: any = kRow.meta || {};
      const isP2 = row.person_type === "person2" || row.person_type === "partner";
      if (isP2 && meta.person2) {
        freshEmail = (meta.person2.email || "").trim();
        freshName = `${meta.person2.vorname || ""} ${meta.person2.nachname || ""}`.trim() || row.name;
      } else if (!isP2) {
        freshEmail = (kRow.email || "").trim();
        freshName = `${kRow.vorname || ""} ${kRow.nachname || ""}`.trim() || row.name;
      }
    }
    const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(freshEmail);
    if (!emailValid) {
      toast({
        title: "Keine gültige E-Mail",
        description: `Für ${freshName} ist keine gültige E-Mail-Adresse hinterlegt. Bitte zuerst in den Stammdaten unter „Daten ändern" eintragen.`,
        variant: "destructive",
      });
      return;
    }
    const saData = row.sa_data || fallbackSaData || (signed[0]?.sa_data);
    if (!saData) {
      toast({ title: "Fehler", description: "Keine Selbstauskunft-Daten zum Versenden gefunden.", variant: "destructive" });
      return;
    }

    // Rückfrage im Projektstil. Sie sagt ausdrücklich, dass der bisherige Link
    // damit ungültig wird: Wer die alte Mail noch im Postfach hat, kommt damit
    // nicht mehr weiter.
    const ok = await confirmDialog({
      title: "Neuen Link zur Selbstauskunft senden?",
      description:
        `${freshName} bekommt eine neue E-Mail an ${freshEmail}. Der neue Link gilt ${SIGNATUR_FRIST_TEXT}. `
        + "Der bisherige Link wird damit ungültig. Sollte die alte E-Mail noch im Postfach liegen, "
        + "muss der Kunde die neue nehmen.",
      confirmText: "Neuen Link senden",
      cancelText: "Abbrechen",
    });
    if (!ok) return;

    setResending(row.person_type);
    try {
      const ergebnis = await signaturErneutSenden({
        art: "selbstauskunft",
        kontaktId,
        investmentId,
        daten: saData,
        /*
         * Ohne E-Mail-Adresse. Die Function ermittelt sie seit dem
         * 16.09.2026 selbst aus dem Kontakt (Audit-Befund F03A). Die Prüfung
         * oben bleibt trotzdem stehen: Sie liest denselben Kontakt und sagt
         * sofort und verständlich Bescheid, statt den Aufruf ins Leere
         * laufen zu lassen.
         */
        personen: [{ name: freshName, personType: row.person_type }],
      });

      if (ergebnis.art !== "ok") {
        /*
         * Kein Erfolgston, wenn nichts rausging, und der Grund steht dabei.
         * Er ist das Einzige, was der Partner weitergeben kann, wenn der
         * Versand klemmt. Vorbild: der Zweig `if (dbErr)` im BugReportDialog.
         */
        toast({
          title: "Neuer Link wurde nicht gesendet",
          description: `${ergebnis.text} Bitte den Grund weitergeben, wenn er sich nicht von selbst erklärt.`,
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Neuer Link versendet ✓",
        description: `${freshName} hat eine neue E-Mail an ${freshEmail} bekommen. Der Link gilt ${SIGNATUR_FRIST_TEXT}.`,
      });
      await load();
    } finally {
      setResending(null);
    }
  };

  const pendingNames = pending.map(p => p.name.split(" ")[0]).join(", ");
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const invalidEmailPersons = pending.filter(p => !emailRegex.test((p.email || "").trim()));
  const hasInvalidEmail = invalidEmailPersons.length > 0;
  const invalidEmailMessage = (() => {
    if (!hasInvalidEmail) return "";
    const parts = invalidEmailPersons.map(p => {
      const raw = (p.email || "").trim();
      const shown = raw ? `aktuell „${raw}"` : "keine E-Mail hinterlegt";
      return `${p.name} (${shown})`;
    });
    const list = parts.join(" und ");
    const verb = invalidEmailPersons.length === 1 ? "ist ungültig" : "sind ungültig";
    return `Die E-Mail-Adresse von ${list} ${verb}. Bitte in den Stammdaten oben rechts über „Daten ändern" korrigieren und anschließend einen neuen Link senden.`;
  })();

  // Überschrift: Steht schon eine Unterschrift, zählt sie mit. Sonst sagt der
  // Kasten schlicht, auf wen gewartet wird.
  const ueberschrift = signed.length > 0
    ? `${signed.length} von ${total} unterschrieben (${pendingNames} ausstehend)`
    : `Unterschrift ausstehend (${pendingNames})`;

  return (
    <div className="mt-2 w-full rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 p-2.5 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-[hsl(var(--warning))]">
        <Clock className="h-3.5 w-3.5" />
        <span>{ueberschrift}</span>
      </div>
      {hasInvalidEmail && (
        <div className="flex items-start gap-1.5 text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1.5">
          <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
          <span>{invalidEmailMessage}</span>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        {pending.map(p => {
          const abgelaufen = istAbgelaufen(p);
          const frist = datumKurz(p.expires_at);
          return (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground min-w-0 flex-1 break-words">
                <Mail className="h-3 w-3 inline mr-1" />{p.name} – {p.email}
                {frist && (
                  <span className={abgelaufen ? "block text-destructive" : "block text-muted-foreground"}>
                    {abgelaufen ? `Link am ${frist} abgelaufen` : `Link gültig bis ${frist}`}
                  </span>
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[10px] gap-1 shrink-0"
                disabled={resending === p.person_type}
                onClick={() => resend(p)}
              >
                <RefreshCw className={`h-3 w-3 ${resending === p.person_type ? "animate-spin" : ""}`} />
                Neuen Link senden, gültig {SIGNATUR_FRIST_TAGE} Tage
              </Button>
            </div>
          );
        })}
      </div>
      {total > 1 && (
        <p className="text-[10px] text-muted-foreground leading-snug">
          Die Pipeline wechselt erst zu „Bonitätsunterlagen", wenn alle Personen unterschrieben haben.
        </p>
      )}
    </div>
  );
}
