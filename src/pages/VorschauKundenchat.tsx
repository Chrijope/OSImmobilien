import { useRef, useState } from "react";
import { CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { stehtRechts } from "@/lib/chatSeite";
import { CHAT_MAX_ZEICHEN } from "@/lib/chatSenden";

/*
 * Lokale Vorschau Kundenchat, /vorschau/kundenchat (16.10.2026).
 *
 * Nur `npm run dev`, siehe vorschauRouten.ts. Beide Seiten nebeneinander mit
 * Beispieldaten im Speicher, ohne Datenbank: links das Kundenportal, rechts
 * der Zugang des Partners. Die Regeln sind die der Migration
 * 20261016231000: eine Gruppe je Kunde, nur der Zustaendige sitzt drin, beim
 * Wechsel geht der alte hinaus und der neue sieht den ganzen Verlauf. Wer
 * welche Nachricht lesen darf, prueft die Datenbank; hier ist es
 * nachgestellt, damit man den Ablauf ansehen kann.
 */

interface Nachricht {
  id: string;
  absender: string;
  name: string;
  text: string;
  zeit: string;
  gelesenVon: string[];
}

const KUNDE = "kunde-kim";
const PARTNER = { alf: { id: "vp-alf", name: "Alf Alt" }, nina: { id: "vp-nina", name: "Nina Neu" } };
const zeit = () => new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export default function VorschauKundenchat() {
  const [zustaendig, setZustaendig] = useState(PARTNER.alf);
  const [teilnehmer, setTeilnehmer] = useState<string[]>([KUNDE, PARTNER.alf.id]);
  const [nachrichten, setNachrichten] = useState<Nachricht[]>([
    { id: "n1", absender: KUNDE, name: "Kim Kunde", text: "Hallo, ich habe eine Frage zur Finanzierung.", zeit: "09:12", gelesenVon: [KUNDE, PARTNER.alf.id] },
    { id: "n2", absender: PARTNER.alf.id, name: "Alf Alt", text: "Gern, worum geht es genau?", zeit: "09:15", gelesenVon: [PARTNER.alf.id] },
  ]);
  const [protokoll, setProtokoll] = useState<string[]>([]);

  const senden = (absender: string, name: string, text: string) => {
    if (!teilnehmer.includes(absender)) {
      setProtokoll((p) => [`Abgelehnt: ${name} ist nicht im Chat`, ...p]);
      return;
    }
    setNachrichten((alt) => [...alt, { id: crypto.randomUUID(), absender, name, text, zeit: zeit(), gelesenVon: [absender] }]);
  };

  const lesen = (wer: string) =>
    setNachrichten((alt) => alt.map((n) => (n.gelesenVon.includes(wer) ? n : { ...n, gelesenVon: [...n.gelesenVon, wer] })));

  const wechseln = () => {
    const neu = zustaendig.id === PARTNER.alf.id ? PARTNER.nina : PARTNER.alf;
    setTeilnehmer([KUNDE, neu.id]);
    setProtokoll((p) => [`Zuständig jetzt ${neu.name}: ${zustaendig.name} geht hinaus, ${neu.name} kommt hinein`, ...p]);
    setZustaendig(neu);
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">Vorschau Kundenchat</h1>
        <span className="text-sm text-muted-foreground">Beispieldaten, nichts wird gespeichert oder verschickt.</span>
        <Button variant="outline" size="sm" onClick={wechseln}>Zuständigen wechseln</Button>
        <span className="text-sm">Zuständig: <strong>{zustaendig.name}</strong></span>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Seite
          titel="Kundenportal, Kim Kunde"
          ich={KUNDE}
          name="Kim Kunde"
          aussen={null}
          nachrichten={nachrichten}
          darfLesen
          onSenden={(t) => senden(KUNDE, "Kim Kunde", t)}
          onLesen={() => lesen(KUNDE)}
        />
        <Seite
          titel={`CRM, ${zustaendig.name}`}
          ich={zustaendig.id}
          name={zustaendig.name}
          aussen={new Set([KUNDE])}
          nachrichten={nachrichten}
          darfLesen={teilnehmer.includes(zustaendig.id)}
          onSenden={(t) => senden(zustaendig.id, zustaendig.name, t)}
          onLesen={() => lesen(zustaendig.id)}
        />
      </div>
      <Card className="p-3 text-sm space-y-1">
        <p className="font-semibold">Was andere sehen</p>
        <p>Geschäftsleitung (Admin, Inhaber): liest mit, ohne Teilnehmer zu sein, bekommt also keine Glocke je Nachricht.</p>
        <p>Backoffice, Vertriebsleitung, andere Partner, andere Kunden: sehen den Kundenchat nicht.</p>
        <p>Teilnehmer jetzt: Kim Kunde, {zustaendig.name}{zustaendig.id === PARTNER.nina.id ? " (Alf Alt ist draußen und liest nicht mehr mit)" : ""}</p>
        {protokoll.map((z, i) => <p key={i} className="text-muted-foreground">{z}</p>)}
      </Card>
    </div>
  );
}

function Seite(props: {
  titel: string;
  ich: string;
  name: string;
  aussen: ReadonlySet<string> | null;
  nachrichten: Nachricht[];
  darfLesen: boolean;
  onSenden: (text: string) => void;
  onLesen: () => void;
}) {
  const [text, setText] = useState("");
  const sendetGerade = useRef(false);
  const [gesendet, setGesendet] = useState(0);
  const ungelesen = props.nachrichten.filter((n) => n.absender !== props.ich && !n.gelesenVon.includes(props.ich)).length;

  const absenden = () => {
    const t = text.trim();
    // Sperre wie in KundeChat und ChatVerlauf: ein zweiter Klick im selben
    // Moment geht ins Leere.
    if (!t || sendetGerade.current) return;
    sendetGerade.current = true;
    props.onSenden(t);
    setGesendet((n) => n + 1);
    setText("");
    setTimeout(() => { sendetGerade.current = false; }, 300);
  };

  return (
    <Card className="flex h-[32rem] flex-col overflow-hidden" data-vorschau-seite={props.ich}>
      <div className="flex items-center justify-between border-b p-3">
        <span className="font-semibold text-sm">{props.titel}</span>
        <span className="text-xs">Ungelesen: <strong data-ungelesen>{props.darfLesen ? ungelesen : 0}</strong> · gesendet: {gesendet}</span>
      </div>
      {props.darfLesen ? (
        <div className="flex-1 space-y-2 overflow-y-auto p-3" onMouseEnter={props.onLesen} role="log">
          {props.nachrichten.map((n) => {
            const rechts = stehtRechts(n.absender, props.ich, props.aussen);
            const eigen = n.absender === props.ich;
            return (
              <div key={n.id} className={`flex ${rechts ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${rechts ? "bg-primary text-primary-foreground" : "bg-background border"}`}>
                  {!eigen && <p className="text-xs font-semibold opacity-80">{n.name}</p>}
                  <p className="whitespace-pre-wrap break-words">{n.text}</p>
                  <p className="mt-1 flex items-center gap-1 text-[11px] opacity-80">
                    {n.zeit}
                    {eigen && n.gelesenVon.some((id) => id !== n.absender) && (<><CheckCheck className="h-3 w-3" /> gelesen</>)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="flex-1 p-3 text-sm text-muted-foreground">Kein Zugriff auf diesen Chat.</p>
      )}
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); absenden(); }}>
        <Input value={text} maxLength={CHAT_MAX_ZEICHEN} onChange={(e) => setText(e.target.value)} placeholder={`Als ${props.name} schreiben`} />
        <Button type="submit" variant="brand" disabled={!text.trim()}>Senden</Button>
      </form>
    </Card>
  );
}
