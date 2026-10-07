import { supabase } from "@/integrations/supabase/client";

/*
 * Die erzeugten Supabase-Typen kennen `partner_unterlagen` und die neuen
 * Profilspalten noch nicht, sie entstehen erst nach der Migration. Bis dahin
 * derselbe Behelf wie in objekteStore und anderswo im Projekt.
 */
const db = supabase as unknown as {
  from: (t: string) => any;
  storage: typeof supabase.storage;
};

/**
 * Pflichtunterlagen eines Partners: Personalausweis und § 34c GewO.
 *
 * Beim ersten Anmelden muss beides erledigt sein, bevor sich das CRM öffnet.
 * Bestandspartner haben dafür eine Frist von dreißig Tagen, damit am Tag der
 * Einführung niemand vor einer verschlossenen Tür steht.
 *
 * Die Dateien liegen im Bucket `partner-unterlagen`, der nicht öffentlich ist.
 * Ausweiskopien dürfen unter keinen Umständen über eine erratbare Adresse
 * erreichbar sein. Zum Ansehen wird jedes Mal eine kurzlebige Adresse erzeugt.
 */

export type UnterlagenArt = "personalausweis" | "gewerbeerlaubnis_34c";

export const UNTERLAGEN_LABEL: Record<UnterlagenArt, string> = {
  personalausweis: "Personalausweis",
  gewerbeerlaubnis_34c: "Erlaubnis nach § 34c GewO",
};

/**
 * Erlaubte Dateitypen.
 *
 * Nur PDF und JPEG. `image/jpg` steht mit dabei, weil manche Handykameras
 * diesen falschen, aber verbreiteten Typ senden. Ohne ihn scheitert ein
 * Upload, der für den Nutzer aussieht wie ein ganz gewöhnliches Foto.
 */
export const ERLAUBTE_TYPEN = ["application/pdf", "image/jpeg", "image/jpg"];
export const ERLAUBTE_ENDUNGEN = [".pdf", ".jpg", ".jpeg"];
export const MAX_GROESSE = 20 * 1024 * 1024;

export interface PartnerUnterlage {
  id: string;
  userId: string;
  art: UnterlagenArt;
  pfad: string;
  dateiname: string;
  groesse?: number;
  mimeTyp?: string;
  hochgeladenAm: string;
}

export interface OnboardingStand {
  ausweisDa: boolean;
  /** true, false oder null wenn noch nicht angegeben. */
  hat34c: boolean | null;
  erlaubnisDa: boolean;
  /** Alles erledigt, was verlangt ist. */
  vollstaendig: boolean;
  /** Bis wann die Schonfrist läuft. Null bei neuen Partnern. */
  fristBis: string | null;
  /** Verbleibende Tage, negativ wenn abgelaufen. Null ohne Frist. */
  tageRest: number | null;
}

/**
 * Prüft eine Datei, bevor sie hochgeladen wird.
 *
 * Der Bucket weist falsche Typen ohnehin ab, aber erst nach dem Hochladen.
 * Ein Fehler vorher spart dem Nutzer die Wartezeit und nennt ihm den Grund in
 * verständlichen Worten statt in einer Serverantwort.
 */
export function pruefeDatei(datei: File): string | null {
  const endung = datei.name.toLowerCase().slice(datei.name.lastIndexOf("."));
  const typOk = ERLAUBTE_TYPEN.includes(datei.type.toLowerCase());
  const endungOk = ERLAUBTE_ENDUNGEN.includes(endung);
  // Manche Browser liefern gar keinen Typ. Dann entscheidet die Endung.
  if (!typOk && !endungOk) {
    return "Nur PDF und JPEG sind erlaubt.";
  }
  /*
   * Keine Größenprüfung mehr.
   *
   * Vorher wurde alles über 20 MB abgewiesen, und der Partner stand mit einer
   * Fehlermeldung da. Ein Ausweisfoto einer modernen Handykamera hat schnell
   * 12 MB, ein eingescanntes Amtsdokument auch mal 40. Wer dann selbst ein
   * Bildbearbeitungsprogramm suchen muss, lädt gar nichts mehr hoch.
   *
   * Stattdessen verkleinert `aufHochladbareGroesse` die Datei vor dem Upload,
   * siehe unterlagenVerkleinern.ts.
   */
  if (datei.size === 0) return "Die Datei ist leer.";
  return null;
}

export async function ladeUnterlagen(userId: string): Promise<PartnerUnterlage[]> {
  const { data, error } = await db
    .from("partner_unterlagen")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    /*
     * Ausdruecklich werfen statt leere Liste liefern: Eine leere Liste heisst
     * fuer die Unterlagen-Sperre "kein Ausweis hochgeladen", und ein blosser
     * Ladefehler (Netz, Datenbanklast) sperrte so einen Partner faelschlich
     * aus dem CRM aus (passiert bei Matthias Mokross am 01.09.). Die Aufrufer
     * behandeln den Fehler jetzt sichtbar; die Sperre laesst im Zweifel offen.
     */
    console.error("[partnerUnterlagen] laden:", error);
    throw new Error(error.message || "Unterlagen konnten nicht geladen werden");
  }
  return (data || []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    userId: String(r.user_id),
    art: r.art as UnterlagenArt,
    pfad: String(r.pfad),
    dateiname: String(r.dateiname),
    groesse: r.groesse as number | undefined,
    mimeTyp: r.mime_typ as string | undefined,
    hochgeladenAm: String(r.hochgeladen_am),
  }));
}

/**
 * Lädt eine Datei hoch und ersetzt eine vorhandene derselben Art.
 *
 * Der Pfad beginnt mit der Nutzerkennung, daran hängt die Zugriffsregel im
 * Speicher. Ein fester Dateiname je Art statt eines Zeitstempels: So bleibt
 * es bei einer Datei, auch wenn jemand fünfmal hochlädt.
 */
export async function ladeHoch(
  userId: string,
  art: UnterlagenArt,
  datei: File,
): Promise<{
  ok: boolean;
  grund?: string;
  /** Musste die Datei verkleinert werden? */
  verkleinert?: boolean;
  vorher?: number;
  nachher?: number;
  /** Bei PDFs: Die Textebene ging dabei verloren. */
  textEbeneVerloren?: boolean;
  /** Verkleinern gescheitert, hochgeladen wurde das Original. */
  verkleinernFehler?: string;
}> {
  const fehler = pruefeDatei(datei);
  if (fehler) return { ok: false, grund: fehler };

  /*
   * Zu große Dateien verkleinern statt abweisen.
   *
   * Passt die Datei schon, kommt sie unangetastet zurück. Ein bereits kleines
   * PDF durch den Bildwolf zu drehen und dabei die Textebene zu verlieren,
   * wäre ein Schaden ohne Nutzen.
   */
  const { aufHochladbareGroesse, groesseText } = await import("@/lib/unterlagenVerkleinern");
  const ergebnis = await aufHochladbareGroesse(datei);
  const zuLaden = ergebnis.datei;

  if (zuLaden.size > MAX_GROESSE) {
    /*
     * Den Grund unterscheiden: "nicht weit genug" stimmt nur, wenn das
     * Verkleinern gelaufen ist. Ist es abgestürzt, soll der Nutzer das
     * erfahren, statt an seiner Aufnahme zu zweifeln.
     */
    return {
      ok: false,
      grund: ergebnis.fehler
        ? `${ergebnis.fehler} Die Datei ist mit ${groesseText(datei.size)} zu groß zum Hochladen. Bitte lade das Dokument aus einem anderen Browser erneut hoch oder verkleinere es vorher selbst.`
        : "Die Datei ließ sich nicht weit genug verkleinern. Bitte mit geringerer Auflösung erneut aufnehmen.",
    };
  }

  const endung = zuLaden.name.toLowerCase().endsWith(".pdf") ? "pdf" : "jpg";
  const pfad = `${userId}/${art}.${endung}`;

  try {
    const { error: uploadFehler } = await supabase.storage
      .from("partner-unterlagen")
      .upload(pfad, zuLaden, { upsert: true, contentType: zuLaden.type || undefined });
    if (uploadFehler) return { ok: false, grund: uploadFehler.message };

    /*
     * Erst nach dem erfolgreichen Upload den Eintrag schreiben.
     *
     * Andersherum stünde in der Tabelle ein Dokument, dessen Datei es nicht
     * gibt, und das Onboarding gälte als erledigt, obwohl nichts ankam.
     */
    const { error: dbFehler } = await db
      .from("partner_unterlagen")
      .upsert({
        user_id: userId,
        art,
        pfad,
        dateiname: datei.name,
        groesse: zuLaden.size,
        mime_typ: zuLaden.type || null,
        hochgeladen_am: new Date().toISOString(),
      }, { onConflict: "user_id,art" });
    if (dbFehler) return { ok: false, grund: dbFehler.message };

    return {
      ok: true,
      verkleinert: ergebnis.verkleinert,
      vorher: ergebnis.vorher,
      nachher: zuLaden.size,
      textEbeneVerloren: ergebnis.textEbeneVerloren,
      verkleinernFehler: ergebnis.fehler,
    };
  } catch (e) {
    return { ok: false, grund: e instanceof Error ? e.message : "Upload fehlgeschlagen" };
  }
}

/**
 * Kurzlebige Adresse zum Ansehen einer Datei.
 *
 * Der Bucket ist nicht öffentlich, jede Anzeige braucht eine eigens erzeugte
 * Adresse. Fünf Minuten reichen zum Öffnen und sind kurz genug, dass ein
 * weitergegebener Link nicht dauerhaft funktioniert.
 */
export async function ansehenLink(pfad: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("partner-unterlagen")
    .createSignedUrl(pfad, 300);
  if (error) {
    console.error("[partnerUnterlagen] Link:", error);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Restliche Tage bis zum Stichtag, auf ganze Tage aufgerundet. */
function tageBis(frist: string | null): number | null {
  if (!frist) return null;
  const ms = new Date(frist).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  return Math.ceil(ms / 86400000);
}

/**
 * Der Stand des Onboardings.
 *
 * Vollständig heißt: Ausweis ist da, und zur Gewerbeerlaubnis wurde eine
 * Angabe gemacht. Lautet die Angabe "liegt vor", muss auch die Datei da sein.
 * Ein "liegt nicht vor" blockiert nichts, es ist nur eine Information für die
 * Leitung.
 */
export function onboardingStand(
  unterlagen: PartnerUnterlage[],
  hat34c: boolean | null,
  fristBis: string | null,
): OnboardingStand {
  const ausweisDa = unterlagen.some((u) => u.art === "personalausweis");
  const erlaubnisDa = unterlagen.some((u) => u.art === "gewerbeerlaubnis_34c");
  const erlaubnisErledigt = hat34c === false || (hat34c === true && erlaubnisDa);
  return {
    ausweisDa,
    hat34c,
    erlaubnisDa,
    vollstaendig: ausweisDa && erlaubnisErledigt,
    fristBis,
    tageRest: tageBis(fristBis),
  };
}

/**
 * Darf dieser Nutzer das CRM benutzen?
 *
 * Vollständig ist immer erlaubt. Unvollständig nur, solange die Schonfrist
 * läuft. Wer keine Frist hat, ist ein neuer Partner und muss sofort liefern.
 */
export function darfInsCrm(stand: OnboardingStand): boolean {
  if (stand.vollstaendig) return true;
  return stand.tageRest !== null && stand.tageRest > 0;
}
