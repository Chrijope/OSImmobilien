import { useEffect, useId, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ArrowRight, ArrowLeft, Check, User, Briefcase, Target, Wallet, Mail, PiggyBank, BarChart3, CalendarClock, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  leadFehlermeldung,
  leadNetzfehlerMeldung,
  retryAfterSekunden,
} from "@/lib/leadFehlermeldung";
import { erzeugeMetaEventId, istMetaPixelAktiv, meldeMetaLead } from "@/lib/metaPixel";
import { useFormularOffenFuerPixel } from "@/hooks/useMetaPixelMitEinwilligung";
import { einwilligungFuerServer } from "@/lib/cookieEinwilligung";
import { kampagneFuerLead } from "@/lib/kampagnenKennung";
import { baueLeadEinwilligung } from "@/lib/leadEinwilligung";
import { mitSeitenSprache } from "@/lib/seitenSprache";
import { useSeitenSprache, useSeitenTexte } from "@/components/SeitenSprache";
import { LEAD_FUNNEL_TEXTE, LEAD_FUNNEL_WERTE, type LeadFunnelTexte } from "./leadFunnelTexte";

const {
  beruf: EMPLOYMENT_OPTIONS,
  einkommen: INCOME_VALUES,
  ziele: GOALS,
  eigenkapital: EQUITY_OPTIONS,
  volumen: INVESTMENT_VOLUME,
  zeitrahmen: TIMELINE_OPTIONS,
  immobilien: PROPERTY_OPTIONS,
  kontaktzeit: CONTACT_TIME_OPTIONS,
} = LEAD_FUNNEL_WERTE;

type EinkommenGruppe = keyof LeadFunnelTexte["einkommen"];

interface LeadFunnelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  beraterUserId?: string | null;
  beraterName?: string | null;
  beraterSlug?: string | null;
  tippgeberId?: string | null;
  tippgeberName?: string | null;
}

type Employment = "angestellt" | "selbststaendig" | "unternehmer" | "freiberufler" | "beamter" | "arbeitslos" | "";

interface FunnelData {
  employment: Employment;
  income: string;
  hasProperty: string;
  equity: string;
  equityAmount: string;
  goals: string[];
  investmentVolume: string;
  timeline: string;
  riskTolerance: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredTime: string;
}

const INITIAL_DATA: FunnelData = {
  employment: "", income: "", hasProperty: "", equity: "", equityAmount: "",
  goals: [], investmentVolume: "", timeline: "", riskTolerance: "",
  firstName: "", lastName: "", email: "", phone: "", preferredTime: "",
};

/** Welche Einkommensfrage zu welcher beruflichen Situation gehoert. */
const einkommenGruppe = (employment: Employment): EinkommenGruppe | null => {
  if (employment === "angestellt" || employment === "beamter") return "angestellt";
  if (employment === "selbststaendig" || employment === "freiberufler") return "selbststaendig";
  if (employment === "unternehmer") return "unternehmer";
  return null;
};

/** Die Fehler im Kontaktschritt, als Schluessel, damit ein Sprachwechsel sie mitnimmt. */
type FeldFehler = keyof LeadFunnelTexte["fehler"] | "einwilligung";

/**
 * Zwischenspeicher für den Funnel.
 *
 * Sieben Schritte auszufüllen kostet Zeit. Ging das Absenden schief, war
 * vorher alles weg, sobald der Dialog zuging: `reset()` löscht den gesamten
 * Zustand. Deshalb liegen die Eingaben zusätzlich im localStorage, damit ein
 * zweiter Versuch möglich ist.
 *
 * Die kurze Haltbarkeit ist Absicht. Es sind personenbezogene Daten, und das
 * Gerät kann geteilt sein. Zwei Stunden reichen für einen zweiten Versuch nach
 * einer Serverstörung und sind kurz genug, dass niemand die Angaben eines
 * fremden Besuchers vorfindet. Nach erfolgreichem Absenden wird sofort
 * gelöscht.
 */
const ENTWURF_SCHLUESSEL = "mi_lead_funnel_entwurf";
const ENTWURF_HALTBARKEIT_MS = 2 * 60 * 60 * 1000;

interface Entwurf {
  gespeichertAm: number;
  step: number;
  data: FunnelData;
}

function ladeEntwurf(): Entwurf | null {
  if (typeof window === "undefined") return null;
  try {
    const roh = window.localStorage.getItem(ENTWURF_SCHLUESSEL);
    if (!roh) return null;
    const entwurf = JSON.parse(roh) as Entwurf;
    if (
      !entwurf ||
      typeof entwurf.gespeichertAm !== "number" ||
      Date.now() - entwurf.gespeichertAm > ENTWURF_HALTBARKEIT_MS ||
      !entwurf.data ||
      typeof entwurf.data !== "object"
    ) {
      window.localStorage.removeItem(ENTWURF_SCHLUESSEL);
      return null;
    }
    return {
      gespeichertAm: entwurf.gespeichertAm,
      step: Math.min(Math.max(Number(entwurf.step) || 1, 1), 7),
      // Fehlende Felder auffüllen, falls sich der Funnel seit dem Speichern
      // geändert hat.
      data: { ...INITIAL_DATA, ...entwurf.data, goals: Array.isArray(entwurf.data.goals) ? entwurf.data.goals : [] },
    };
  } catch {
    return null;
  }
}

function speichereEntwurf(step: number, data: FunnelData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ENTWURF_SCHLUESSEL,
      JSON.stringify({ gespeichertAm: Date.now(), step, data } satisfies Entwurf),
    );
  } catch {
    // Privater Modus oder volle Quote. Der Funnel funktioniert auch ohne.
  }
}

function loescheEntwurf() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ENTWURF_SCHLUESSEL);
  } catch {
    // Nichts zu tun.
  }
}

const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePhone = (phone: string) => /^[\d\s\-+()]{6,20}$/.test(phone.replace(/\s/g, ""));

const OptionButton = ({ selected, onClick, icon, label }: { selected: boolean; onClick: () => void; icon?: string; label: string }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left text-gray-800 ${
      selected ? "border-amber-500 bg-amber-50 shadow-sm" : "border-gray-200 hover:border-amber-500/40 hover:bg-gray-50"
    }`}
  >
    {icon && <span className="text-2xl">{icon}</span>}
    <span className="font-semibold flex-1">{label}</span>
    {selected && <Check className="w-5 h-5 text-amber-600 flex-shrink-0" />}
  </button>
);

const StepHeader = ({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle: string }) => (
  <div className="flex items-center gap-3 mb-6">
    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-amber-100">
      <Icon className="w-5 h-5 text-amber-600" />
    </div>
    <div>
      <h3 className="text-xl font-normal text-gray-900">{title}</h3>
      <p className="text-sm text-gray-500">{subtitle}</p>
    </div>
  </div>
);

const LeadFunnelDialog = ({ open, onOpenChange, beraterUserId, beraterName, beraterSlug, tippgeberId, tippgeberName }: LeadFunnelDialogProps) => {
  // Die Seitensprache. Ohne SeitenSpracheProvider (CRM-Vorschau, Tests) Deutsch.
  const t = useSeitenTexte(LEAD_FUNNEL_TEXTE);
  const sprache = useSeitenSprache();
  const pflichtId = useId();
  const werbungId = useId();
  // Einmal beim ersten Rendern lesen, nicht bei jedem.
  const [entwurf] = useState(() => ladeEntwurf());
  const [step, setStep] = useState(entwurf?.step ?? 1);
  const [data, setData] = useState<FunnelData>(entwurf?.data ?? INITIAL_DATA);
  const [errors, setErrors] = useState<Record<string, FeldFehler>>({});
  /* Die Einwilligung liegt bewusst NICHT im Entwurf: Sie wird bei jedem
     Absenden frisch gegeben, und zwar zu dem Wortlaut, der gerade dasteht. */
  const [einwilligung, setEinwilligung] = useState(false);
  const [werbung, setWerbung] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [sendeFehler, setSendeFehler] = useState<string>("");
  const totalSteps = 7;
  // Eingaben da oder Absenden laeuft: Ein Widerruf der Pixel-Einwilligung
  // haelt das Pixel dann nur an, statt die Seite neu zu laden (NB-08).
  useFormularOffenFuerPixel(
    isSubmitting || (!submitted && JSON.stringify(data) !== JSON.stringify(INITIAL_DATA)),
  );

  // Solange nicht abgesendet ist, liegt der Stand im Zwischenspeicher. Danach
  // nicht mehr: Die Angaben sind dann in der Datenbank und haben auf einem
  // womöglich geteilten Gerät nichts mehr verloren. Ein unberührtes Formular
  // wird ebenfalls nicht gespeichert, sondern löscht einen alten Entwurf.
  useEffect(() => {
    if (submitted) return;
    if (JSON.stringify(data) === JSON.stringify(INITIAL_DATA)) {
      loescheEntwurf();
      return;
    }
    speichereEntwurf(step, data);
  }, [step, data, submitted]);

  const reset = () => { setStep(1); setData(INITIAL_DATA); setErrors({}); setSubmitted(false); setSendeFehler(""); setEinwilligung(false); setWerbung(false); };

  /**
   * Wird der Dialog vor dem Absenden geschlossen, bleibt der Stand stehen.
   * Genau das ging vorher verloren: `reset()` beim Schließen löschte alle
   * sieben Schritte samt Kontaktdaten, ein zweiter Versuch nach einem Fehler
   * hätte von vorn begonnen. Erst nach erfolgreichem Absenden wird geleert.
   */
  const handleOpenChange = (open: boolean) => {
    if (!open && submitted) {
      loescheEntwurf();
      reset();
    }
    onOpenChange(open);
  };
  const isArbeitslos = data.employment === "arbeitslos";

  const canNext = () => {
    switch (step) {
      case 1: return data.employment !== "";
      case 2: return data.income !== "";
      case 3: return data.hasProperty !== "";
      case 4: return data.equityAmount !== "";
      case 5: return data.goals.length > 0;
      case 6: return data.investmentVolume !== "" && data.timeline !== "";
      case 7: return data.firstName && data.lastName && data.email && data.phone && data.preferredTime;
      default: return false;
    }
  };

  const toggleGoal = (goal: string) => {
    setData((prev) => ({ ...prev, goals: prev.goals.includes(goal) ? prev.goals.filter((g) => g !== goal) : [...prev.goals, goal] }));
  };

  const validateContact = () => {
    const newErrors: Record<string, FeldFehler> = {};
    if (!data.firstName.trim()) newErrors.firstName = "vorname";
    if (!data.lastName.trim()) newErrors.lastName = "nachname";
    if (!data.email.trim()) newErrors.email = "emailFehlt";
    else if (!validateEmail(data.email)) newErrors.email = "emailUngueltig";
    if (!data.phone.trim()) newErrors.phone = "telefonFehlt";
    else if (!validatePhone(data.phone)) newErrors.phone = "telefonUngueltig";
    if (!data.preferredTime) newErrors.preferredTime = "kontaktzeit";
    if (!einwilligung) newErrors.einwilligung = "einwilligung";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateContact()) return;
    setIsSubmitting(true);
    setSendeFehler("");
    try {
      const funnelNotizen = [
        `Beruf: ${data.employment}`,
        `Einkommen: ${data.income}`,
        `Immobilienbesitz: ${data.hasProperty}`,
        `Eigenkapital: ${data.equityAmount}`,
        `Ziele: ${data.goals.join(", ")}`,
        `Investitionsvolumen: ${data.investmentVolume}`,
        `Zeitrahmen: ${data.timeline}`,
        `Bevorzugte Kontaktzeit: ${data.preferredTime}`,
      ].join("\n");

      // Eine Event-ID fuer beide Wege: das Browser-Pixel und die serverseitige
      // Conversion-API melden dasselbe Lead-Ereignis mit dieser ID, Meta
      // dedupliziert dann automatisch. Es gibt sie nur, wenn der Besucher dem
      // Pixel zugestimmt hat. Ohne Zustimmung wird keine ID mitgeschickt, und
      // damit meldet auch der Server nichts an Meta.
      const metaEventId = istMetaPixelAktiv() ? erzeugeMetaEventId() : undefined;
      // Die Kampagnenkennung aus dem Werbelink, falls der Besucher über eine
      // Anzeige kam. Ohne Kennung fällt das Feld weg (`kampagnenKennung.ts`).
      const kampagne = kampagneFuerLead();

      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "DEIN-SUPABASE-PROJEKT";
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/submit-lead`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vorname: data.firstName.trim(),
            nachname: data.lastName.trim(),
            email: data.email.trim(),
            telefon: data.phone.trim(),
            notizen: funnelNotizen,
            // Die Sprache der Seite wird zur Kundensprache des neuen Kontakts
            // (Plan Kundensprache, Etappe 6). Notizen und `meta` bleiben deutsch.
            sprache,
            // Der Nachweis traegt den Wortlaut, den der Besucher gelesen hat,
            // in derselben Sprache und mit deren Fassungsnummer.
            dsgvo_consent: baueLeadEinwilligung(einwilligung, werbung, undefined, sprache),
            quelle: tippgeberName
              ? `Landingpage (Tippgeber: ${tippgeberName})`
              : beraterName ? `Microseite ${beraterName}` : "Vertriebspartner-Microseite",
            beraterName: beraterName || undefined,
            // Das Kuerzel aus /vp/<kuerzel> entscheidet, der Server ermittelt
            // den Partner selbst daraus. Die Kennung geht nur noch mit, wo
            // kein Kuerzel bekannt ist, etwa in der Vorschau, solange das
            // eigene Kuerzel noch geladen wird.
            beraterSlug: beraterSlug || undefined,
            beraterUserId: beraterSlug ? undefined : beraterUserId || undefined,
            metaEventId,
            // Die Wahl aus dem Cookie-Banner. Nur mit Marketing-Einwilligung
            // meldet `submit-lead` den Lead an die Meta Conversion-API.
            cookieEinwilligung: einwilligungFuerServer(),
            meta: {
              microseiteSlug: beraterSlug || null,
              ...(kampagne ? { kampagne } : {}),
              ...(tippgeberId ? {
                tippgeberId,
                tippgeberName: tippgeberName || undefined,
                empfehlungsgeberName: tippgeberName || undefined,
                empfehlungsgeberBeziehung: "Tippgeber",
                erstelltVonId: tippgeberId,
                erstelltVonName: tippgeberName || undefined,
              } : {}),
              funnelData: {
                employment: data.employment,
                income: data.income,
                hasProperty: data.hasProperty,
                equityAmount: data.equityAmount,
                goals: data.goals,
                investmentVolume: data.investmentVolume,
                timeline: data.timeline,
                preferredTime: data.preferredTime,
              },
            },
          }),
        }
      );

      if (!res.ok) {
        // Die Serverantwort bleibt im Log. Der Interessent bekommt eine
        // Meldung, die zur Lage passt und sagt, was er tun kann.
        const err = await res.json().catch(() => ({}));
        console.error("Lead save error:", res.status, err);
        const meldung = leadFehlermeldung(res.status, retryAfterSekunden(res.headers), sprache);
        setSendeFehler(meldung);
        toast.error(meldung);
        setIsSubmitting(false);
        return;
      }

      // Lead-Ereignis ans Meta-Pixel melden. Passiert nur, wenn der Besucher
      // dem Pixel zugestimmt hat und es geladen wurde, sonst ist das ein No-op.
      if (metaEventId) meldeMetaLead(metaEventId);

      // Erst jetzt darf der Zwischenspeicher weg. Die Angaben stehen in der
      // Datenbank, und auf einem geteilten Gerät soll sie der nächste Besucher
      // nicht vorfinden.
      loescheEntwurf();
      setIsSubmitting(false);
      setSubmitted(true);
    } catch (err) {
      console.error("Lead save error:", err);
      const meldung = leadNetzfehlerMeldung(sprache);
      setSendeFehler(meldung);
      toast.error(meldung);
      setIsSubmitting(false);
    }
  };

  const next = () => { if (step === 7) handleSubmit(); else setStep((s) => s + 1); };
  const back = () => setStep((s) => Math.max(1, s - 1));
  const gruppe = einkommenGruppe(data.employment);
  const incomeConfig = gruppe
    ? { label: t.einkommen[gruppe].titel, subtitle: t.einkommen[gruppe].untertitel, werte: INCOME_VALUES[gruppe], labels: t.einkommen[gruppe].optionen }
    : { label: "", subtitle: "", werte: [] as string[], labels: [] as string[] };
  /** Der angezeigte Text zu einem gespeicherten Wert, sonst der Wert selbst. */
  const anzeige = (werte: readonly string[], labels: readonly string[], wert: string) => labels[werte.indexOf(wert)] ?? wert;
  const fehlerText = (feld: string) => {
    const f = errors[feld];
    return f && f !== "einwilligung" ? t.fehler[f] : "";
  };

  if (submitted) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg bg-white border-none text-gray-900 p-0 overflow-hidden shadow-2xl">
          <DialogTitle className="sr-only">{t.danke.srTitel}</DialogTitle>
          <div className="p-8 md:p-12 text-center">
            <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-[hsl(30,6%,19%)]">
              <Check className="w-10 h-10 text-[hsl(40,20%,98%)]" />
            </div>
            <h3 className="text-2xl md:text-3xl font-normal mb-4 text-gray-900">{t.danke.titel(data.firstName)}</h3>
            <p className="text-gray-500 leading-relaxed mb-6">
              {t.danke.textVor}<strong className="text-gray-700">{anzeige(CONTACT_TIME_OPTIONS, t.danke.zeiten, data.preferredTime)}</strong>{t.danke.textNach}
            </p>
            <button onClick={() => handleOpenChange(false)} className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-normal transition-all duration-300 hover:scale-105 bg-[hsl(30,6%,19%)] text-[hsl(40,20%,98%)]">
              {t.danke.zurueck}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (isArbeitslos && step > 1) {
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg bg-white border-none text-gray-900 p-0 overflow-hidden shadow-2xl">
          <DialogTitle className="sr-only">{t.ohneEinkommen.srTitel}</DialogTitle>
          <div className="p-8 md:p-12 text-center">
            <div className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center bg-gray-100">
              <AlertCircle className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-2xl font-normal mb-4 text-gray-900">{t.ohneEinkommen.titel}</h3>
            <p className="text-gray-500 leading-relaxed mb-4">{t.ohneEinkommen.text1}</p>
            <p className="text-gray-500 leading-relaxed mb-8">{t.ohneEinkommen.text2}</p>
            <button onClick={() => handleOpenChange(false)} className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold transition-all duration-300 hover:scale-105 bg-gray-900 text-white">{t.ohneEinkommen.knopf}</button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg bg-white border-none text-gray-900 p-0 overflow-hidden shadow-2xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">{t.dialogTitel}</DialogTitle>
        <div className="px-8 pt-8 sticky top-0 bg-white z-10">
          <div className="flex gap-1.5 mb-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className="h-1.5 flex-1 rounded-full transition-all duration-300" style={{ background: i < step ? "hsl(30, 28%, 62%)" : "#e5e7eb" }} />
            ))}
          </div>
          <p className="text-xs text-gray-500">{t.schrittVon(step, totalSteps)}</p>
        </div>

        <div className="px-8 pb-8 pt-4">
          {step === 1 && (
            <div>
              <StepHeader icon={User} title={t.beruf.titel} subtitle={t.beruf.untertitel} />
              <div className="space-y-2.5">{EMPLOYMENT_OPTIONS.map((opt, i) => <OptionButton key={opt.value} selected={data.employment === opt.value} onClick={() => setData({ ...data, employment: opt.value as Employment })} icon={opt.icon} label={t.beruf.optionen[i]} />)}</div>
            </div>
          )}
          {step === 2 && (
            <div>
              <StepHeader icon={Briefcase} title={incomeConfig.label} subtitle={incomeConfig.subtitle} />
              <div className="space-y-2.5">{incomeConfig.werte.map((opt, i) => <OptionButton key={opt} selected={data.income === opt} onClick={() => setData({ ...data, income: opt })} label={incomeConfig.labels[i]} />)}</div>
            </div>
          )}
          {step === 3 && (
            <div>
              <StepHeader icon={PiggyBank} title={t.immobilien.titel} subtitle={t.immobilien.untertitel} />
              <div className="space-y-2.5">{PROPERTY_OPTIONS.map((opt, i) => <OptionButton key={opt} selected={data.hasProperty === opt} onClick={() => setData({ ...data, hasProperty: opt })} label={t.immobilien.optionen[i]} />)}</div>
            </div>
          )}
          {step === 4 && (
            <div>
              <StepHeader icon={Wallet} title={t.eigenkapital.titel} subtitle={t.eigenkapital.untertitel} />
              <div className="space-y-2.5">{EQUITY_OPTIONS.map((opt, i) => <OptionButton key={opt} selected={data.equityAmount === opt} onClick={() => setData({ ...data, equityAmount: opt })} label={t.eigenkapital.optionen[i]} />)}</div>
            </div>
          )}
          {step === 5 && (
            <div>
              <StepHeader icon={Target} title={t.ziele.titel} subtitle={t.ziele.untertitel} />
              <div className="space-y-2.5">{GOALS.map((goal, i) => <OptionButton key={goal.value} selected={data.goals.includes(goal.value)} onClick={() => toggleGoal(goal.value)} icon={goal.icon} label={t.ziele.optionen[i]} />)}</div>
            </div>
          )}
          {step === 6 && (
            <div>
              <StepHeader icon={BarChart3} title={t.rahmen.titel} subtitle={t.rahmen.untertitel} />
              <p className="text-sm font-semibold text-gray-700 mb-3">{t.rahmen.volumenFrage}</p>
              <div className="space-y-2.5 mb-8">{INVESTMENT_VOLUME.map((opt, i) => <OptionButton key={opt} selected={data.investmentVolume === opt} onClick={() => setData({ ...data, investmentVolume: opt })} label={t.rahmen.volumenOptionen[i]} />)}</div>
              <p className="text-sm font-semibold text-gray-700 mb-3">{t.rahmen.zeitFrage}</p>
              <div className="space-y-2.5">{TIMELINE_OPTIONS.map((opt, i) => <OptionButton key={opt} selected={data.timeline === opt} onClick={() => setData({ ...data, timeline: opt })} label={t.rahmen.zeitOptionen[i]} />)}</div>
            </div>
          )}
          {step === 7 && (
            <div>
              <StepHeader icon={Mail} title={t.kontakt.titel} subtitle={t.kontakt.untertitel} />
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block text-gray-700">{t.kontakt.vorname}</label>
                    <input type="text" value={data.firstName} onChange={(e) => setData({ ...data, firstName: e.target.value })} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-gray-900 focus:border-amber-500 focus:outline-none transition-colors placeholder:text-gray-400" placeholder={t.kontakt.beispielVorname} />
                    {errors.firstName && <p className="text-xs text-red-500 mt-1">{fehlerText("firstName")}</p>}
                  </div>
                  <div>
                    <label className="text-sm font-semibold mb-1.5 block text-gray-700">{t.kontakt.nachname}</label>
                    <input type="text" value={data.lastName} onChange={(e) => setData({ ...data, lastName: e.target.value })} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-gray-900 focus:border-amber-500 focus:outline-none transition-colors placeholder:text-gray-400" placeholder={t.kontakt.beispielNachname} />
                    {errors.lastName && <p className="text-xs text-red-500 mt-1">{fehlerText("lastName")}</p>}
                  </div>
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block text-gray-700">{t.kontakt.email}</label>
                  <input type="email" value={data.email} onChange={(e) => setData({ ...data, email: e.target.value })} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-gray-900 focus:border-amber-500 focus:outline-none transition-colors placeholder:text-gray-400" placeholder={t.kontakt.beispielEmail} />
                  {errors.email && <p className="text-xs text-red-500 mt-1">{fehlerText("email")}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block text-gray-700">{t.kontakt.telefon}</label>
                  <input type="tel" value={data.phone} onChange={(e) => setData({ ...data, phone: e.target.value })} className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 bg-white text-gray-900 focus:border-amber-500 focus:outline-none transition-colors placeholder:text-gray-400" placeholder={t.kontakt.beispielTelefon} />
                  {errors.phone && <p className="text-xs text-red-500 mt-1">{fehlerText("phone")}</p>}
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block text-gray-700">{t.kontakt.kontaktzeit}</label>
                  <div className="space-y-2">{CONTACT_TIME_OPTIONS.map((opt, i) => <OptionButton key={opt} selected={data.preferredTime === opt} onClick={() => setData({ ...data, preferredTime: opt })} label={t.kontakt.kontaktzeitOptionen[i]} />)}</div>
                  {errors.preferredTime && <p className="text-xs text-red-500 mt-1">{fehlerText("preferredTime")}</p>}
                </div>
              </div>
              <div className="mt-6 p-4 rounded-xl bg-gray-50 border border-gray-100">
                <div className="flex items-start gap-3">
                  <CalendarClock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-gray-700">{t.kontakt.kostenlosTitel}</p>
                    <p className="text-xs text-gray-500">{t.kontakt.kostenlosText}</p>
                  </div>
                </div>
              </div>

              {/*
                Die beiden Einwilligungen, oben die Pflicht, darunter die
                freiwillige. Der Wortlaut kommt aus `leadEinwilligung.ts` und
                ist genau der, der mit dem Lead als Nachweis gespeichert wird.
              */}
              <div className="mt-6 space-y-3">
                <div className="flex items-start gap-3">
                  <input
                    id={pflichtId}
                    type="checkbox"
                    checked={einwilligung}
                    onChange={(e) => {
                      const an = e.target.checked;
                      setEinwilligung(an);
                      if (an) {
                        setErrors((alt) => {
                          const rest = { ...alt };
                          delete rest.einwilligung;
                          return rest;
                        });
                      }
                    }}
                    aria-invalid={errors.einwilligung ? true : undefined}
                    aria-describedby={errors.einwilligung ? `${pflichtId}-fehler` : undefined}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-amber-600"
                  />
                  <label htmlFor={pflichtId} className={`text-xs leading-relaxed cursor-pointer ${errors.einwilligung ? "text-red-600" : "text-gray-500"}`}>
                    {t.einwilligung.pflicht}{" "}
                    <a
                      href={mitSeitenSprache("/datenschutz", sprache)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-700 underline hover:no-underline"
                    >
                      {t.einwilligung.datenschutz}
                    </a>
                    . <span aria-hidden="true">*</span>
                  </label>
                </div>
                {errors.einwilligung && (
                  <p id={`${pflichtId}-fehler`} role="alert" className="text-xs text-red-500 pl-7">
                    {t.einwilligung.fehlt}
                  </p>
                )}
                <div className="flex items-start gap-3">
                  <input
                    id={werbungId}
                    type="checkbox"
                    checked={werbung}
                    onChange={(e) => setWerbung(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-amber-600"
                  />
                  <label htmlFor={werbungId} className="text-xs leading-relaxed text-gray-500 cursor-pointer">
                    {t.einwilligung.werbung}
                  </label>
                </div>
              </div>
            </div>
          )}

          {sendeFehler && (
            <div className="mt-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">{t.sendeFehlerTitel}</p>
                <p className="text-sm text-red-700">{sendeFehler}</p>
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mt-8">
            {step > 1 ? (
              <button onClick={back} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                <ArrowLeft className="w-4 h-4" /> {t.knopf.zurueck}
              </button>
            ) : <div />}
            <button onClick={next} disabled={!canNext() || isSubmitting} className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-normal transition-all duration-300 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 bg-[hsl(30,6%,19%)] text-[hsl(40,20%,98%)]">
              {isSubmitting
                ? t.knopf.sendet
                : step === 7
                  ? (sendeFehler ? t.knopf.erneut : t.knopf.absenden)
                  : t.knopf.weiter}
              {!isSubmitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LeadFunnelDialog;
