import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getStelleById, type Stelle } from "@/lib/bewerbungStore";
import { supabase } from "@/integrations/supabase/client";
import logoImg from "@/assets/moreimmo-logo.png";
import { ArrowLeft, ArrowRight, CheckCircle, Send } from "lucide-react";
import { SEITE_TOKEN_MUSTER, bewerberSeitePfad } from "@/lib/bewerberSeite";
import { toast } from "@/hooks/use-toast";
import { PhoneInput } from "@/components/ui/phone-input";
import { SpamHinweis } from "@/components/bewerbung/SpamHinweis";
import { Checkbox } from "@/components/ui/checkbox";
import { ladeRecaptcha, executeRecaptcha } from "@/lib/recaptcha";

const BewerbenPage = () => {
  const { stelleId } = useParams();
  const [stelle, setStelle] = useState<Stelle | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /**
   * Das Token der persönlichen Seite, direkt aus der Antwort des Servers.
   *
   * „Der Bewerber, der sich gerade eingetragen hat, ist im Moment der höchsten
   * Aufmerksamkeit; ihn stattdessen auf eine Mail warten zu lassen, verschenkt
   * genau diesen Moment." Deshalb ist die Erfolgsseite der zweite Weg zur
   * Seite, gleichberechtigt neben der Eingangsmail. Landet die im Spam, ist
   * der Fall nicht mehr still verloren.
   *
   * Leer heißt: Die Migration ist noch nicht gelaufen oder das Anlegen hat
   * nicht geklappt. Dann steht hier der bisherige Text, und alles Weitere
   * kommt wie bisher per Mail.
   */
  const [seiteToken, setSeiteToken] = useState("");
  const [hp, setHp] = useState(""); // Honeypot
  const [einwilligung, setEinwilligung] = useState(false);

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

  useEffect(() => {
    if (stelleId) {
      const found = getStelleById(stelleId);
      setStelle(found || null);
    }
  }, [stelleId]);

  // reCAPTCHA v3 lädt erst beim ersten Feld, das jemand anklickt (onFocusCapture
  // am Formular), nicht schon beim Seitenaufruf. Wer nur liest, schickt Google nichts.

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stelle) return;
    if (!form.vorname.trim() || !form.nachname.trim() || !form.email.trim()) {
      toast({ title: "Bitte fülle alle Pflichtfelder aus.", variant: "destructive" });
      return;
    }
    // Die Handynummer ist Pflicht: Reaktionsgeschwindigkeit ist im
    // Vertriebsrecruiting die Variable mit der staerksten Wirkung, und ohne
    // Nummer bleibt nur die Mail.
    if (!einwilligung) {
      toast({ title: "Bitte bestätige noch Dein Einverständnis.", description: "Ohne Deine Einwilligung dürfen wir die Bewerbung nicht bearbeiten.", variant: "destructive" });
      return;
    }
    if (!form.telefon.trim()) {
      toast({ title: "Bitte gib Deine Handynummer an.", description: "Wir melden uns telefonisch, meist noch am selben Tag.", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const recaptchaToken = await executeRecaptcha();
      const { data, error } = await supabase.functions.invoke("submit-bewerbung", {
        body: {
          action: "submit",
          vorname: form.vorname.trim(),
          nachname: form.nachname.trim(),
          email: form.email.trim(),
          telefon: form.telefon.trim(),
          ort: form.ort.trim(),
          erfahrung: form.erfahrung.trim(),
          motivation: form.motivation.trim(),
          quelle: form.quelle || "Website",
          stelleId: stelle.id,
          stelleTitel: stelle.titel,
          beschaeftigungsart: stelle.art,
          hp,
          recaptchaToken,
        },
      });
      if (error) throw error;
      const antwort = data as { error?: string; seiteToken?: string } | null;
      if (antwort?.error) throw new Error(antwort.error);
      const token = antwort?.seiteToken;
      if (typeof token === "string" && SEITE_TOKEN_MUSTER.test(token)) setSeiteToken(token);
      setSubmitted(true);
    } catch (err: any) {
      console.error("Bewerbung submit failed", err);
      toast({
        title: "Senden fehlgeschlagen",
        description: err?.message || "Bitte später erneut versuchen.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!stelle) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 text-center space-y-4">
          <h2 className="text-xl font-bold">Stelle nicht gefunden</h2>
          <p className="text-muted-foreground">Diese Stellenausschreibung existiert nicht.</p>
          <Link to="/karriere"><Button>Alle offenen Stellen</Button></Link>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div data-lg="seite" className="min-h-screen bg-gradient-to-br from-muted/30 to-background flex items-center justify-center">
        <Card className="p-10 text-center space-y-4 max-w-md">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <h2 className="text-2xl font-bold">Bewerbung eingegangen!</h2>
          {seiteToken ? (
            <>
              <p className="text-muted-foreground">
                Vielen Dank für Deine Bewerbung als <strong>{stelle.titel}</strong>. Deine
                persönliche Seite steht schon bereit. Dort siehst Du jederzeit, was erledigt ist,
                wer gerade am Zug ist und was Du als Nächstes tun kannst.
              </p>
              <Link to={bewerberSeitePfad(seiteToken)} className="block">
                <Button className="w-full">
                  Zu Deiner Bewerbungsseite<ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Gleich bekommst Du zusätzlich eine Mail mit Deinem Zugang. Speichere Dir diesen Link
                am besten als Lesezeichen, dann findest Du Deinen Stand immer wieder.
              </p>
            </>
          ) : (
            <p className="text-muted-foreground">
              Vielen Dank für Deine Bewerbung als <strong>{stelle.titel}</strong>. Wir melden uns in Kürze bei Dir.
            </p>
          )}
          <SpamHinweis />
          <Link to="/karriere"><Button variant="outline">Zurück zu allen Stellen</Button></Link>
        </Card>
      </div>
    );
  }

  return (
    <div data-lg="seite" className="min-h-screen bg-gradient-to-br from-muted/30 to-background">
      <header data-lg="kopfscheibe" className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
          <img src={logoImg} alt="MOREImmo" className="h-10 object-contain" />
          <Link to={`/karriere/${stelleId}`}>
            <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />Zurück</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Bewerbung: {stelle.titel}</h1>
          <p className="text-muted-foreground mt-1">{stelle.standort} · {stelle.art}</p>
        </div>

        <Card className="p-6">
          <form onSubmit={handleSubmit} onFocusCapture={ladeRecaptcha} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Vorname *</Label>
                <Input value={form.vorname} onChange={e => setForm(f => ({ ...f, vorname: e.target.value }))} required />
              </div>
              <div>
                <Label>Nachname *</Label>
                <Input value={form.nachname} onChange={e => setForm(f => ({ ...f, nachname: e.target.value }))} required />
              </div>
            </div>

            <div>
              <Label>E-Mail *</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Handynummer *</Label>
                <PhoneInput value={form.telefon} onChange={v => setForm(f => ({ ...f, telefon: v }))} required />
                <p className="text-xs text-muted-foreground">
                  Damit wir Dich schnell erreichen. Meist rufen wir noch am selben Tag an.
                </p>
              </div>
              <div>
                <Label>Ort</Label>
                <Input value={form.ort} onChange={e => setForm(f => ({ ...f, ort: e.target.value }))} />
              </div>
            </div>

            <div>
              <Label>Wie bist du auf uns aufmerksam geworden?</Label>
              <Select value={form.quelle} onValueChange={v => setForm(f => ({ ...f, quelle: v }))}>
                <SelectTrigger><SelectValue placeholder="Bitte wählen" /></SelectTrigger>
                <SelectContent>
                  {["LinkedIn", "Jobportal", "Empfehlung", "Website", "Social Media", "Messe", "Google", "Sonstiges"].map(q => (
                    <SelectItem key={q} value={q}>{q}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Erfahrung</Label>
              <Input placeholder="z.B. 3 Jahre Vertrieb, Quereinsteiger..." value={form.erfahrung} onChange={e => setForm(f => ({ ...f, erfahrung: e.target.value }))} />
            </div>

            <div>
              <Label>Motivation</Label>
              <Textarea placeholder="Warum möchtest Du bei uns arbeiten? Was treibt Dich an?" rows={4} value={form.motivation} onChange={e => setForm(f => ({ ...f, motivation: e.target.value }))} />
            </div>

            {/* Honeypot — vor Bots versteckt, von Menschen nicht sichtbar */}
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

            {/* Ausdrueckliche Einwilligung statt blosser Kenntnisnahme. */}
            <label className="flex items-start gap-3 text-xs text-muted-foreground cursor-pointer">
              <Checkbox
                checked={einwilligung}
                onCheckedChange={(v) => setEinwilligung(v === true)}
                className="mt-0.5"
              />
              <span className="leading-snug">
                Ich bin einverstanden, dass MOREImmo meine Angaben zur Bearbeitung meiner
                Bewerbung speichert und verwendet. Meine Angaben sind freiwillig. Ich kann
                mein Einverständnis jederzeit formlos widerrufen, zum Beispiel per Mail an
                datenschutz@more.immo. Weitere Informationen in der{" "}
                <Link to="/datenschutz" className="underline">Datenschutzerklärung</Link>.
              </span>
            </label>

            {/* reCAPTCHA v3 — unsichtbar; rechtlicher Hinweis */}
            <p className="text-xs text-muted-foreground text-center">
              Diese Seite ist durch reCAPTCHA geschützt. Es gelten die{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="underline">
                Datenschutzerklärung
              </a>{" "}
              und{" "}
              <a href="https://policies.google.com/terms" target="_blank" rel="noopener noreferrer" className="underline">
                Nutzungsbedingungen
              </a>{" "}
              von Google.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Link to={`/karriere/${stelleId}`}>
                <Button type="button" variant="outline">Abbrechen</Button>
              </Link>
              <Button type="submit" disabled={submitting || !einwilligung}>
                <Send className="h-4 w-4 mr-2" />
                {submitting ? "Sende…" : "Bewerbung absenden"}
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  );
};

export default BewerbenPage;
