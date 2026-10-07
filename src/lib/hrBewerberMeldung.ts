import { supabase } from "@/integrations/supabase/client";
import { cacheGet } from "./dataCache";
import { getCurrentUserId } from "./currentUser";
import { notifyUser } from "./bellNotifications";

/**
 * Meldet einen von Hand erfassten Bewerber an HR.
 *
 * Die beiden anderen Eingangswege, das oeffentliche Formular und der
 * Zapier-Webhook, erledigen das serverseitig in
 * `supabase/functions/_shared/hr-benachrichtigung.ts`. Wer einen Bewerber im
 * CRM selbst eintraegt, loeste bisher gar nichts aus, und damit war die
 * Zusage "HR wird bei jedem neuen Bewerber benachrichtigt" nur zu zwei
 * Dritteln wahr.
 *
 * Empfaenger haengen ausschliesslich an der Rolle, nie an einer Person, und
 * zwar in demselben Zuschnitt wie serverseitig: Glocke und Mail gehen
 * ausschliesslich an die HR-Rolle.
 *
 * Wer den Bewerber gerade selbst angelegt hat, bekommt weder Glocke noch Mail.
 * Sich selbst mitzuteilen, was man eben getippt hat, ist keine Nachricht.
 */

/*
 * Wer im Bewerbermanagement die Glocke bekommt.
 *
 * Bewusst nur noch die HR-Rolle, wie serverseitig in
 * supabase/functions/_shared/hr-benachrichtigung.ts. Inhaber und Admins
 * standen frueher mit auf der Liste und haben jede eingehende Bewerbung
 * mitbekommen. Eine Glocke, die staendig fuer etwas laeutet, das einen nichts
 * angeht, wird nach einer Woche ignoriert.
 */
const GLOCKEN_ROLLEN = ["hr"];

interface Profil {
  id: string;
  email?: string | null;
}

/** Nutzer-IDs zu einer Rollenliste, aus dem Zwischenspeicher. */
function nutzerMitRollen(rollen: string[]): string[] {
  try {
    const zeilen = cacheGet("user_roles") as Array<{ user_id?: string; role?: string }>;
    return [
      ...new Set(
        zeilen
          .filter((r) => r.role && rollen.includes(r.role))
          .map((r) => r.user_id || "")
          .filter(Boolean),
      ),
    ];
  } catch {
    return [];
  }
}

function mailAdressenVon(userIds: string[]): string[] {
  if (!userIds.length) return [];
  try {
    const profile = cacheGet("profiles") as Profil[];
    return [
      ...new Set(
        profile
          .filter((p) => userIds.includes(p.id))
          .map((p) => (p.email || "").trim())
          .filter((e) => e.includes("@")),
      ),
    ];
  } catch {
    return [];
  }
}

export interface HandBewerber {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
  ort: string;
  quelle: string;
  stelleTitel: string;
}

/**
 * Glocke und Mail zu einem von Hand erfassten Bewerber.
 *
 * Bewusst best-effort und ohne Rueckgabewert: Der Bewerber ist gespeichert,
 * bevor diese Funktion laeuft. Eine Meldung, die nicht hinausgeht, darf das
 * Erfassen nicht als gescheitert aussehen lassen.
 */
export async function meldeNeuenBewerberAnHr(b: HandBewerber): Promise<void> {
  const selbst = getCurrentUserId();
  const name = `${b.vorname || ""} ${b.nachname || ""}`.trim() || "Ein Bewerber";
  const link = `/bewerberprozess?openBewerber=${b.id}`;

  const glockenIds = nutzerMitRollen(GLOCKEN_ROLLEN).filter((uid) => uid !== selbst);
  for (const uid of glockenIds) {
    notifyUser(uid, {
      titel: `Neuer Bewerber: ${name}`,
      nachricht: `${name} wurde als ${b.stelleTitel || "Bewerber"} von Hand erfasst. Eingang über ${b.quelle || "Manuell"}. Bitte anrufen und qualifizieren.`,
      link,
      category: "system",
    });
  }

  const hrIds = nutzerMitRollen(["hr"]).filter((uid) => uid !== selbst);
  const adressen = mailAdressenVon(hrIds);
  const jetzt = new Date();

  for (const adresse of adressen) {
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "bewerber-neu-intern",
          recipientEmail: adresse,
          idempotencyKey: `bewerber-neu-intern-${b.id}-${adresse}`,
          templateData: {
            bewerberName: name,
            bewerberEmail: b.email || "",
            bewerberTelefon: b.telefon || "",
            ort: b.ort || "",
            quelle: b.quelle || "Manuell",
            stelleTitel: b.stelleTitel || "",
            eingegangenAm: jetzt.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }),
            bewerberLink: `https://osimmobilien.netlify.app${link}`,
          },
        },
      });
      if (error) console.warn("[hrBewerberMeldung] Mail an HR fehlgeschlagen:", error.message || error);
    } catch (e) {
      console.warn("[hrBewerberMeldung] Mail an HR fehlgeschlagen:", e);
    }
  }
}

export interface UnterschriebenerVertrag {
  bewerbungId: string;
  bewerberName: string;
  bewerberEmail: string;
  bewerberTelefon: string;
  paketTitel: string;
}

/**
 * Meldet HR, dass ein unterschriebener Vertrag vorliegt.
 *
 * Gilt fuer den Weg von Hand: Jemand laedt das unterschriebene PDF hoch. Die
 * digitale Signaturstrecke meldet sich selbst aus `finalize-vertrag`, deshalb
 * kann sich hier nichts doppeln, die beiden Wege schliessen einander aus.
 *
 * Wortlaut und Vorlage sind dieselben wie serverseitig, damit HR bei beiden
 * Wegen dieselbe Nachricht liest.
 */
export async function meldeVertragUnterschriebenAnHr(v: UnterschriebenerVertrag): Promise<void> {
  const selbst = getCurrentUserId();
  const link = `/bewerberprozess?openBewerber=${v.bewerbungId}`;
  const naechsterSchritt =
    "Bitte kontaktieren und den Onboarding-Termin vereinbaren. Im Erstgespräch wurde zugesagt, dass wir uns nach der Unterschrift melden.";

  const hrIds = nutzerMitRollen(["hr"]).filter((uid) => uid !== selbst);

  for (const uid of hrIds) {
    notifyUser(uid, {
      titel: `${v.bewerberName} hat den Vertrag unterschrieben`,
      nachricht: naechsterSchritt,
      link,
      category: "system",
    });
  }

  const jetzt = new Date();
  for (const adresse of mailAdressenVon(hrIds)) {
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "bewerber-vertrag-unterschrieben-intern",
          recipientEmail: adresse,
          idempotencyKey: `bewerber-vertrag-unterschrieben-${v.bewerbungId}-${adresse}`,
          templateData: {
            bewerberName: v.bewerberName,
            bewerberEmail: v.bewerberEmail || "",
            bewerberTelefon: v.bewerberTelefon || "",
            paketTitel: v.paketTitel || "",
            unterschriebenAm: jetzt.toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" }),
            naechsterSchritt,
            bewerberLink: `https://osimmobilien.netlify.app${link}`,
          },
        },
      });
      if (error) console.warn("[hrBewerberMeldung] Vertragsmail an HR fehlgeschlagen:", error.message || error);
    } catch (e) {
      console.warn("[hrBewerberMeldung] Vertragsmail an HR fehlgeschlagen:", e);
    }
  }
}
