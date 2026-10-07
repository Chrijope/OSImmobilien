import { useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PhoneInput } from "@/components/ui/phone-input";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { sendePartnerBewerbung, type PartnerBewerbungAntwort } from "@/lib/partnerBewerbung";
import { ladeRecaptcha } from "@/lib/recaptcha";
import { FileText, Send, Upload, X } from "lucide-react";

/**
 * Das Bewerbungsformular für Vertriebspartner und Tippgeber.
 *
 * Herausgelöst aus `VertriebspartnerLanding.tsx` am 24.09.2026, damit die
 * Stellenanzeige dasselbe Formular öffnet und nicht ein zweites, das
 * auseinanderläuft. Felder, Pflichtangaben, Reihenfolge der Prüfungen und
 * Hinweise sind unverändert.
 *
 * Was die Seite nach dem Absenden zeigt, entscheidet sie selbst über
 * `onAbgesendet`: Die Landingpage zeigt ihre Bestätigung, die Stellenanzeige
 * leitet den Berater in seinen Kennenlernbogen.
 */

export type PartnerBewerbungFormularProps = {
  weg: "tippgeber" | "vertriebspartner";
  stelleId: string;
  stelleTitel: string;
  beschaeftigungsart: string;
  /** Eingangsweg ins CRM. */
  quelle: string;
  erfahrungPlaceholder: string;
  /** Nur die Stellenanzeige fordert den Schlüssel des Kennenlernbogens an. */
  kennenlernLink?: boolean;
  /**
   * Das feste Feld für `submit-bewerbung`, nur aus der Stellenanzeige. Beim
   * Tippgeber gibt es außerdem kein Feld für den Lebenslauf. Die Landingpage
   * setzt es nicht und verlangt den Lebenslauf wie bisher.
   */
  stelle?: "tippgeber" | "finanzdienstleister";
  onAbgesendet: (antwort: PartnerBewerbungAntwort, vorname: string) => void;
  /** Der Knopf neben „Bewerbung absenden", mit eigener Klasse `sm:order-1`. */
  abbrechenKnopf?: ReactNode;
  /** Zusätzliche Klassen für den Absendeknopf, etwa die Signalfarbe der Landingpage. */
  absendenKlasse?: string;
};

const QUELLEN = ["LinkedIn", "Jobportal", "Empfehlung", "Website", "Social Media", "Messe", "Google", "Sonstiges"];

const fileToDataUrl = (file: File): Promise<string> => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = rej;
  r.readAsDataURL(file);
});

export function PartnerBewerbungFormular({
  weg,
  stelleId,
  stelleTitel,
  beschaeftigungsart,
  quelle,
  erfahrungPlaceholder,
  kennenlernLink = false,
  stelle,
  onAbgesendet,
  abbrechenKnopf,
  absendenKlasse,
}: PartnerBewerbungFormularProps) {
  const tippgeberStelle = stelle === "tippgeber";
  const isTG = weg === "tippgeber";
  const [submitting, setSubmitting] = useState(false);
  const [hp, setHp] = useState(""); // Honigtopf gegen Bots, muss leer bleiben
  const [einwilligung, setEinwilligung] = useState(false);
  const [lebenslauf, setLebenslauf] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    vorname: "",
    nachname: "",
    email: "",
    telefon: "",
    ort: "",
    erfahrung: "",
    motivation: "",
    quelle: "",
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Nur PDF erlaubt", description: "Bitte lade Deinen Lebenslauf als PDF hoch.", variant: "destructive" });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Datei zu groß", description: "Maximal 10 MB erlaubt.", variant: "destructive" });
      return;
    }
    setLebenslauf(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vorname.trim() || !form.nachname.trim() || !form.email.trim()) {
      toast({ title: "Bitte fülle alle Pflichtfelder aus.", variant: "destructive" });
      return;
    }

    // Zusätzliche Pflichtfelder
    if (!form.quelle) {
      toast({ title: "Bitte wähle aus, wie Du auf uns aufmerksam geworden bist.", variant: "destructive" });
      return;
    }
    if (!form.erfahrung.trim()) {
      toast({ title: "Bitte gib Deine Erfahrung an.", variant: "destructive" });
      return;
    }
    if (!form.motivation.trim()) {
      toast({ title: "Bitte teile uns Deine Motivation mit.", variant: "destructive" });
      return;
    }
    if (!einwilligung) {
      toast({ title: "Bitte bestätige noch Dein Einverständnis.", description: "Ohne Deine Einwilligung dürfen wir die Bewerbung nicht bearbeiten.", variant: "destructive" });
      return;
    }
    /*
     * `PhoneInput` liefert auch bei leerem Feld die Landesvorwahl („+49"),
     * die Prüfung auf leeren Text greift dann nicht. Für Tippgeber, die
     * ausschließlich angerufen werden, zählen deshalb die Ziffern, dieselbe
     * Grenze wie in `submit-bewerbung`. Die Landingpage bleibt, wie sie war.
     */
    const zuWenigZiffern = tippgeberStelle && form.telefon.replace(/\D/g, "").length < 6;
    if (!form.telefon.trim() || zuWenigZiffern) {
      toast({ title: "Bitte gib Deine Handynummer an.", description: "Wir melden uns telefonisch, meist noch am selben Tag.", variant: "destructive" });
      return;
    }
    // Der Tippgeber der Stellenanzeige reicht keinen Lebenslauf ein (Christian, 24.09.2026).
    if (!tippgeberStelle && !lebenslauf) {
      toast({ title: "Bitte lade Deinen Lebenslauf als PDF hoch.", variant: "destructive" });
      return;
    }

    let lebenslaufUrl = "";
    if (!tippgeberStelle && lebenslauf) {
      try {
        lebenslaufUrl = await fileToDataUrl(lebenslauf);
      } catch {
        toast({ title: "Fehler beim Lesen der Datei", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const antwort = await sendePartnerBewerbung({
        vorname: form.vorname.trim(),
        nachname: form.nachname.trim(),
        email: form.email.trim(),
        telefon: form.telefon.trim(),
        ort: form.ort.trim(),
        erfahrung: form.erfahrung.trim(),
        motivation: form.motivation.trim(),
        quelle,
        aufmerksamDurch: form.quelle,
        stelleId,
        stelleTitel,
        beschaeftigungsart,
        lebenslaufUrl,
        lebenslaufName: lebenslaufUrl ? lebenslauf?.name || "" : "",
        hp,
        kennenlernLink,
        ...(stelle ? { stelle } : {}),
      });
      onAbgesendet(antwort, form.vorname.trim());
    } catch (err) {
      // Nur der Fehler, nie die Antwort: Sie kann den Schlüssel zum Bogen tragen.
      console.error("[bewerbung] Absenden fehlgeschlagen", err);
      toast({
        title: "Senden fehlgeschlagen",
        description: err instanceof Error ? err.message : "Bitte versuche es in einem Moment erneut.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // reCAPTCHA lädt beim ersten Feld, das jemand anklickt, nicht beim
    // Seitenaufruf. So bekommt Google nur Daten von Besuchern, die sich
    // tatsächlich bewerben, und bis zum Absenden ist das Skript meist bereit.
    <form onSubmit={handleSubmit} onFocusCapture={ladeRecaptcha} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Vorname *</Label>
          <Input value={form.vorname} onChange={e => setForm(f => ({ ...f, vorname: e.target.value }))} required maxLength={100} />
        </div>
        <div className="space-y-1.5">
          <Label>Nachname *</Label>
          <Input value={form.nachname} onChange={e => setForm(f => ({ ...f, nachname: e.target.value }))} required maxLength={100} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>E-Mail *</Label>
        <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required maxLength={255} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Handynummer *</Label>
          <PhoneInput value={form.telefon} onChange={v => setForm(f => ({ ...f, telefon: v }))} required />
          <p className="text-xs text-muted-foreground">
            Damit wir Dich schnell erreichen. Meist rufen wir noch am selben Tag an.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Ort</Label>
          <Input value={form.ort} onChange={e => setForm(f => ({ ...f, ort: e.target.value }))} maxLength={100} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Wie bist Du auf uns aufmerksam geworden? *</Label>
        <Select value={form.quelle} onValueChange={v => setForm(f => ({ ...f, quelle: v }))} required>
          <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
          <SelectContent>
            {QUELLEN.map(q => (
              <SelectItem key={q} value={q}>{q}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Erfahrung *</Label>
        <Input
          placeholder={erfahrungPlaceholder}
          value={form.erfahrung}
          onChange={e => setForm(f => ({ ...f, erfahrung: e.target.value }))}
          maxLength={300}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label>{isTG ? "Warum möchtest Du Tippgeber werden? *" : "Deine Motivation *"}</Label>
        <Textarea
          placeholder={isTG
            ? "Erzähl uns kurz, warum Du als Tippgeber starten möchtest..."
            : "Warum möchtest Du Vertriebspartner bei OS Immobilien werden?"
          }
          rows={4}
          value={form.motivation}
          onChange={e => setForm(f => ({ ...f, motivation: e.target.value }))}
          maxLength={2000}
          required
        />
      </div>

      {!tippgeberStelle && (
      <div className="space-y-1.5">
        <Label>Lebenslauf (PDF) *</Label>
        <div
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-lg border-2 border-dashed border-border p-5 text-center transition-all hover:border-primary hover:bg-primary/5"
        >
          <input ref={fileInputRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileSelect} data-testid="lebenslauf-datei" />
          {lebenslauf ? (
            <div className="flex items-center justify-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground">{lebenslauf.name}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setLebenslauf(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                aria-label="Lebenslauf entfernen"
                className="ml-1 text-muted-foreground hover:text-destructive"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-sm text-muted-foreground">
              <Upload className="h-5 w-5" />
              <span>Klicke hier, um Deinen Lebenslauf als PDF hochzuladen</span>
              <span className="text-xs">Max. 10 MB</span>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Ausdrueckliche Einwilligung statt blosser Kenntnisnahme. Sie ist
          zugleich der Nachweis, dass der Bewerber die Information gesehen hat.
          Sie steht ueber den Knoepfen (Christian, 24.09.2026): Der Absenden-
          Knopf ist ohne sie gesperrt, und wer sie erst unter dem Knopf findet,
          haelt ihn fuer kaputt. */}
      <label className="flex items-start gap-3 text-xs text-muted-foreground cursor-pointer pt-2">
        <Checkbox
          checked={einwilligung}
          onCheckedChange={(v) => setEinwilligung(v === true)}
          className="mt-0.5"
        />
        <span className="leading-snug">
          Ich bin einverstanden, dass OS Immobilien meine Angaben zur Bearbeitung meiner Bewerbung
          speichert und verwendet. Meine Angaben sind freiwillig. Ich kann mein Einverständnis
          jederzeit formlos widerrufen, zum Beispiel per Mail an os@os-immobilien.com.{" "}
          Weitere Informationen in der{" "}
          <Link to="/datenschutz" className="text-primary hover:underline">Datenschutzerklärung</Link>.
        </span>
      </label>

      <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:justify-end">
        {/* Traegt seine Reihenfolge selbst (`sm:order-1`), wie bisher auf der Landingpage. */}
        {abbrechenKnopf}
        <Button type="submit" size="lg" disabled={submitting || !einwilligung} className={cn("gap-2 sm:order-2", absendenKlasse)}>
          <Send className="h-4 w-4" />{submitting ? "Wird gesendet …" : "Bewerbung absenden"}
        </Button>
      </div>

      {/* Honigtopf, vor Bots versteckt und für Menschen unsichtbar */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
        <Label>Website</Label>
        <Input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={hp}
          onChange={e => setHp(e.target.value)}
        />
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Diese Seite ist durch reCAPTCHA geschützt. Es gelten die{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="text-primary hover:underline">Datenschutzerklärung</a>{" "}
        und die{" "}
        <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="text-primary hover:underline">Nutzungsbedingungen</a>{" "}
        von Google.
      </p>
    </form>
  );
}
