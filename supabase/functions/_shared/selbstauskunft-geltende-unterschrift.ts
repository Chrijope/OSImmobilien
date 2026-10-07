/**
 * Welche Unterschrift unter der Selbstauskunft gilt (seit 26.09.2026).
 *
 * Wird eine bereits unterschriebene Selbstauskunft korrigiert, braucht die
 * neue Fassung neue Unterschriften. Bis zum 26.09.2026 blieben dabei drei
 * Dinge vom alten Stand stehen:
 *
 *   - `meta.saPdf`: der Merker „Selbstauskunft liegt vor“. Kundenprofil,
 *     Bonitätscheck und Freischaltung der Objektauswahl fragen ihn ab und
 *     zeigten die Selbstauskunft weiter als erledigt.
 *   - `meta.docStatuses.Selbstauskunft = "approved"`: dasselbe im Kundenportal.
 *   - `meta.saSignatures`: die alten Unterschriften. Sie landeten im
 *     Entwurfs-PDF der neuen Fassung, und `finalize-selbstauskunft` mischte
 *     sie beim nächsten Teilstand wieder dazu, weil die alten, unterschriebenen
 *     Anfragen neben den neuen in `signature_requests` liegen bleiben.
 *
 * Diese Datei ist die eine Stelle für die Regel. Die Edge Functions
 * (`send-signature-request`, `finalize-selbstauskunft`) und die Oberfläche
 * lesen sie gleichermaßen, damit Server und Anzeige nicht auseinanderlaufen.
 *
 * Bewusst NICHT Teil der Regel: die Freischaltung der Objektauswahl. Steht
 * ein Vorgang schon auf „Objektauswahl“ oder weiter, bleibt sie offen, siehe
 * `objektauswahlFreigeschaltet` (stufeErreicht). Eine Korrektur der Angaben
 * soll niemanden zurückwerfen, der schon ein Objekt oder eine Reservierung
 * hat. Sie zeigt nur, dass die neue Unterschrift aussteht.
 */

/** Eine Unterschriftsanfrage der Selbstauskunft, soweit hier gebraucht. */
export interface SaAnfrage {
  person_type: string;
  status: string;
  created_at?: string | null;
  signed_at?: string | null;
  signature_data?: string | null;
  name?: string | null;
  sa_data?: unknown;
  /** `signature_requests.meta`, hier nur wegen `saFassung`. */
  meta?: unknown;
}

export interface SaUnterschrift {
  signatureData: string | null | undefined;
  signedAt: string | null | undefined;
  name: string | null | undefined;
}

function zeitpunkt(wert: string | null | undefined): number {
  const t = wert ? Date.parse(wert) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

function nichtLeer(wert: unknown): boolean {
  return typeof wert === "string" && wert.trim() !== "";
}

/*
 * Fassungskennung (seit 26.09.2026, Befund HB-004).
 *
 * Jede abgeschickte Fassung der Selbstauskunft trägt eine eigene,
 * unveränderliche Kennung in `signature_requests.meta.saFassung`: beim
 * Ausfüll-Link die Kennung der `sa_fill_tokens`-Zeile, beim Versand aus dem
 * CRM eine neue UUID. Jede Unterschrift gehört damit zu genau einer Fassung.
 *
 * Vorher wurde über Zeitstempel zugeordnet. Gingen zwei Ausfüll-Links hinaus,
 * konnte die Unterschrift von Person 1 zur ersten Fassung mit der von Person 2
 * zur zweiten Fassung abschließen, und am Investment standen Angaben, die
 * Person 1 so nie unterschrieben hatte.
 *
 * Maßgeblich ist die Fassung der jüngsten Anfrage. Trägt sie keine Kennung
 * (Bestand, oder ein Weg, der noch keine setzt), gilt alles wie bisher.
 */

/** Status einer offenen Anfrage, die zu einer abgelösten Fassung gehört. */
export const SA_UEBERHOLT = "ueberholt";

/** Die `person_type`-Werte der Selbstauskunft. Andere Vorgänge liegen in derselben Tabelle. */
export const SA_PERSON_TYPEN = ["person1", "person2", "partner"] as const;

export function istSaPerson(typ: string): boolean {
  return (SA_PERSON_TYPEN as readonly string[]).includes(typ);
}

/**
 * Darf der Inhaber dieses Links die Angaben korrigieren
 * (`update-sa-signature-data`)? Nur die Selbstauskunft, als Positivliste
 * (Codex-Pruefung 27.09.2026, NB-01). Vorher war nur `rv_*` gesperrt; mit
 * seinem Vertragslink konnte ein Bewerber `sa_data` ersetzen, darunter
 * `bewerberData.vertragFassung`, und sich so die Fassung mit Anlage 4 und
 * die Pixel-Freigabe geben.
 */
export function darfSaKorrigieren(personType: unknown): boolean {
  return typeof personType === "string" && istSaPerson(personType);
}

/** Die Fassungskennung einer Anfrage, oder `null` ohne Kennung. */
export function saFassungVon(anfrage: { meta?: unknown } | null | undefined): string | null {
  const m = anfrage?.meta;
  const f = m && typeof m === "object" && !Array.isArray(m) ? (m as { saFassung?: unknown }).saFassung : undefined;
  return nichtLeer(f) ? (f as string).trim() : null;
}

/**
 * Die Fassung, um die es gerade geht: die der jüngsten Anfrage der
 * Selbstauskunft. `null`, wenn die jüngste keine Kennung trägt (Bestand).
 */
export function saAktuelleFassung(anfragen: readonly SaAnfrage[] | null | undefined): string | null {
  let juengste: SaAnfrage | undefined;
  for (const a of anfragen ?? []) {
    if (!istSaPerson(a.person_type) || a.status === SA_UEBERHOLT) continue;
    if (!juengste || zeitpunkt(a.created_at) >= zeitpunkt(juengste.created_at)) juengste = a;
  }
  return juengste ? saFassungVon(juengste) : null;
}

/**
 * Zu welcher Fassung ein Versand aus `send-signature-request` gehört.
 *
 * - `vorgegeben`: der Aufruf aus `submit-sa-signature` bringt die Fassung des
 *   Ausfüll-Links mit. Das Überholen älterer Fassungen hat dort schon
 *   stattgefunden.
 * - Gehen alle erwarteten Personen zugleich hinaus (das Beraterformular),
 *   ist das eine neue Fassung mit `neueKennung`.
 * - Sonst ist es ein Neuversand an einzelne Personen („Neuen Link senden“).
 *   Er gehört zur aktuellen Fassung und trägt deren Angaben, damit eine
 *   Fassung nie zwei verschiedene Inhalte hat. Ohne aktuelle Fassung
 *   (Bestand) bleibt es ohne Kennung, wie bisher.
 */
export function saFassungFuerVersand(args: {
  vorgegeben?: string | null;
  bestehende: readonly SaAnfrage[] | null | undefined;
  empfaengerTypen: readonly string[];
  saData: unknown;
  neueKennung: string;
}): { fassung: string | null; neu: boolean; saData: unknown } {
  if (nichtLeer(args.vorgegeben)) {
    return { fassung: (args.vorgegeben as string).trim(), neu: false, saData: args.saData };
  }
  const alleDabei = saErwartetePersonen(args.saData).every((p) =>
    args.empfaengerTypen.some((t) => gleichePerson(String(t ?? "").trim(), p))
  );
  if (alleDabei) return { fassung: args.neueKennung, neu: true, saData: args.saData };

  const fassung = saAktuelleFassung(args.bestehende);
  if (!fassung) return { fassung: null, neu: false, saData: args.saData };
  let juengste: SaAnfrage | undefined;
  for (const a of args.bestehende ?? []) {
    if (saFassungVon(a) !== fassung || a.sa_data == null) continue;
    if (!juengste || zeitpunkt(a.created_at) >= zeitpunkt(juengste.created_at)) juengste = a;
  }
  return { fassung, neu: false, saData: juengste?.sa_data ?? args.saData };
}

/**
 * Offene Anfragen aller anderen Fassungen als überholt markieren.
 *
 * Nur offene: Unterschriebene bleiben als Nachweis unverändert stehen.
 * Anfragen ohne Kennung zählen als ältere Fassung. `sign_signature_request`
 * nimmt nur `pending` an, eine überholte Anfrage lässt sich also nicht mehr
 * unterschreiben; die Signaturseite zeigt dazu einen eigenen Hinweis.
 */
export async function saAeltereFassungenUeberholen(
  // deno-lint-ignore no-explicit-any
  db: any,
  args: { kontaktId: string; investmentId?: string | null; fassung: string },
): Promise<{ error: unknown }> {
  if (!/^[0-9a-f-]{36}$/i.test(args.fassung)) return { error: new Error("Ungueltige Fassungskennung") };
  let q = db
    .from("signature_requests")
    .update({ status: SA_UEBERHOLT })
    .eq("kontakt_id", args.kontaktId)
    .eq("status", "pending")
    .in("person_type", [...SA_PERSON_TYPEN])
    // Die Kennung ist eine UUID; nichts anderes landet in diesem Filter.
    .or(`meta->>saFassung.is.null,meta->>saFassung.neq.${args.fassung}`);
  q = args.investmentId ? q.eq("investment_id", args.investmentId) : q.is("investment_id", null);
  const { error } = await q;
  return { error: error ?? null };
}

/**
 * Je Person die jüngste Anfrage.
 *
 * Eine Korrektur legt neue Anfragen an, die alten, schon unterschriebenen
 * bleiben als Nachweis stehen. Maßgeblich ist je Person nur die jüngste.
 * Ohne Datum, oder bei gleichem Datum, gewinnt die später in der Liste.
 */
export function geltendeSaAnfragen<T extends SaAnfrage>(anfragen: readonly T[] | null | undefined): T[] {
  const jePerson = new Map<string, { anfrage: T; zeit: number }>();
  for (const anfrage of anfragen ?? []) {
    const zeit = zeitpunkt(anfrage.created_at);
    const bisher = jePerson.get(anfrage.person_type);
    if (!bisher || zeit >= bisher.zeit) jePerson.set(anfrage.person_type, { anfrage, zeit });
  }
  return [...jePerson.values()].map((e) => e.anfrage);
}

/**
 * Zusatzregeln für `saUnterschriftenStand` (seit 26.09.2026, zweiter Teil).
 *
 * - `fassungSeit`: der Vermerk `saNeueUnterschriftSeit`. Steht er, zählt eine
 *   Unterschrift nur, wenn sie ab diesem Zeitpunkt geleistet wurde. Eine
 *   ältere gehört zur abgelösten Fassung, auch wenn sie je Person noch die
 *   jüngste Anfrage ist (etwa weil für Person 2 noch kein neuer Link
 *   hinausging). Ohne Vermerk, also im Bestand, gilt die Regel wie bisher.
 * - `erwartet`: wer unterschreiben muss, siehe `saErwartetePersonen`. Fehlt
 *   für eine erwartete Person jede Anfrage, ist die Selbstauskunft nicht
 *   fertig. Vorher konnte sie mit nur einer Unterschrift abschließen, wenn der
 *   Neuversand an Person 1 die offene Anfrage von Person 2 gelöscht hatte.
 */
export interface SaStandOptionen {
  fassungSeit?: string | null;
  erwartet?: readonly string[];
}

/**
 * Die Unterschrift von Person 2 hieß früher auch `partner`. Beide Namen
 * meinen dieselbe Person, das Kundenprofil behandelt sie ebenso.
 */
function gleichePerson(a: string, b: string): boolean {
  const p2 = (t: string) => t === "person2" || t === "partner";
  return a === b || (p2(a) && p2(b));
}

/**
 * Wer die Selbstauskunft unterschreiben muss: immer Person 1, dazu Person 2,
 * wenn sie in dieser Selbstauskunft steht. Dieselbe Bedingung, mit der das
 * Formular ihr ein Unterschriftsfeld zeigt (`person2` angekreuzt und ein
 * Vorname). Maßgeblich sind die Angaben der Fassung, die unterschrieben
 * wird, nicht der Kontakt: Dort kann eine Person 2 stehen, die bei diesem
 * Kauf nicht mitkauft, und die Selbstauskunft käme dann nie zum Abschluss.
 */
export function saErwartetePersonen(saData: unknown): string[] {
  const d = (saData && typeof saData === "object" ? saData : {}) as {
    person2?: unknown;
    person2Data?: { vorname?: unknown } | null;
  };
  const mitPerson2 = d.person2 === true && nichtLeer(d.person2Data?.vorname);
  return mitPerson2 ? ["person1", "person2"] : ["person1"];
}

/**
 * Stand der Unterschriften zur geltenden Fassung.
 *
 * `saData` stammt aus der jüngsten geltenden Anfrage, also aus der Fassung,
 * die gerade unterschrieben wird, und nicht aus irgendeiner alten.
 *
 * Ohne `optionen` verhält sich die Funktion genau wie bisher (Bestand).
 */
export function saUnterschriftenStand<T extends SaAnfrage>(
  anfragen: readonly T[] | null | undefined,
  optionen: SaStandOptionen = {},
): {
  geltend: T[];
  alleUnterschrieben: boolean;
  unterschriften: Record<string, SaUnterschrift>;
  anzahlGesamt: number;
  anzahlUnterschrieben: number;
  saData: unknown;
  /** Erwartete Personen, für die es gar keine Anfrage gibt. */
  fehlend: string[];
  /** Die Fassung, deren Unterschriften gezählt wurden, `null` im Bestand. */
  fassung: string | null;
} {
  /*
   * Mit Fassungskennung zählen nur Anfragen genau dieser Fassung. Der
   * Zeitvermerk `fassungSeit` ist dann überflüssig: Die Kennung ordnet
   * genauer zu als jede Uhrzeit.
   */
  const fassung = saAktuelleFassung(anfragen);
  const basis = fassung
    ? (anfragen ?? []).filter((a) => saFassungVon(a) === fassung && a.status !== SA_UEBERHOLT)
    : (anfragen ?? []).filter((a) => a.status !== SA_UEBERHOLT);
  const geltend = geltendeSaAnfragen(basis);
  const grenze = !fassung && nichtLeer(optionen.fassungSeit) ? zeitpunkt(optionen.fassungSeit) : -Infinity;
  const gueltig = (r: T) => r.status === "signed" && zeitpunkt(r.signed_at) >= grenze;

  const unterschriften: Record<string, SaUnterschrift> = {};
  for (const r of geltend) {
    if (gueltig(r)) {
      unterschriften[r.person_type] = { signatureData: r.signature_data, signedAt: r.signed_at, name: r.name };
    }
  }
  let juengste: T | undefined;
  for (const r of geltend) {
    if (!juengste || zeitpunkt(r.created_at) >= zeitpunkt(juengste.created_at)) juengste = r;
  }
  const fehlend = (optionen.erwartet ?? []).filter(
    (person) => !geltend.some((r) => gleichePerson(r.person_type, person)),
  );
  const anzahlUnterschrieben = Object.keys(unterschriften).length;
  const anzahlGesamt = geltend.length + fehlend.length;
  return {
    geltend,
    alleUnterschrieben: geltend.length > 0 && fehlend.length === 0 && anzahlUnterschrieben === geltend.length,
    unterschriften,
    anzahlGesamt,
    anzahlUnterschrieben,
    saData: juengste?.sa_data,
    fehlend,
    fassung,
  };
}

/**
 * Welche offenen Anfragen ein Neuversand abräumen darf: nur die der Personen,
 * die den neuen Link bekommen (seit 26.09.2026).
 *
 * Vorher löschte `send-signature-request` alle offenen Anfragen des
 * Investments. Bekam nur Person 1 einen neuen Link, verschwand damit auch die
 * offene Anfrage von Person 2, und die Selbstauskunft galt nach der
 * Unterschrift von Person 1 als abgeschlossen. `partner` und `person2` sind
 * dieselbe Person und werden gemeinsam abgeräumt.
 */
export function saAufzuraeumendePersonTypen(personTypen: readonly string[]): string[] {
  const ergebnis = new Set<string>();
  for (const typ of personTypen) {
    const t = String(typ ?? "").trim();
    if (!t) continue;
    ergebnis.add(t);
    if (t === "person2") ergebnis.add("partner");
    if (t === "partner") ergebnis.add("person2");
  }
  return [...ergebnis];
}

/** Die Felder aus `investments.meta`, die hier gebraucht werden. */
export interface SaKorrekturMeta {
  saSigned?: unknown;
  saSignedAt?: unknown;
  saSignaturePending?: unknown;
  saSignatures?: unknown;
  saPdf?: unknown;
  saPdfPath?: unknown;
  saPdfUnterschriftAm?: unknown;
  saPapierUpload?: unknown;
  saNeueUnterschriftSeit?: unknown;
}

/**
 * Was am Investment zurückgesetzt wird, wenn eine fertige Selbstauskunft neu
 * zur Unterschrift geht. Leer, wenn es keine fertige gab (erster Versand oder
 * neuer Link zu einer noch offenen Anfrage).
 *
 * Fertig heißt: unterschrieben (`saSigned`) oder ein Dokument liegt vor
 * (`saPdf`, auch die hochgeladene Papier-Selbstauskunft). Die alten Angaben
 * gehen nicht verloren, sie wandern nach `saVorigeFassung`. Die Datei im
 * Speicher bleibt ohnehin liegen.
 *
 * `saSigned`, `saSignedAt` und `saSignaturePending` setzt der Aufrufer wie
 * bisher selbst, ebenso den Dokumentstatus.
 */
export function saKorrekturMetaPatch(
  meta: SaKorrekturMeta | null | undefined,
  jetzt: string,
): Record<string, unknown> {
  const m = meta ?? {};
  const warFertig = m.saSigned === true || nichtLeer(m.saPdf);
  if (!warFertig) return {};
  return {
    saPdf: null,
    saPapierUpload: null,
    saSignatures: {},
    saSignaturePartial: false,
    saNeueUnterschriftSeit: jetzt,
    saVorigeFassung: {
      saPdf: m.saPdf ?? null,
      saPdfPath: m.saPdfPath ?? null,
      saPdfUnterschriftAm: m.saPdfUnterschriftAm ?? null,
      saPapierUpload: m.saPapierUpload ?? null,
      saSignedAt: m.saSignedAt ?? null,
      abgeloestAm: jetzt,
    },
  };
}

/**
 * Eine neue Fassung über den Ausfüll-Link (seit 26.09.2026, zweiter Teil).
 *
 * Schickt der Kunde über einen neuen Ausfüll-Link eine schon fertige
 * Selbstauskunft erneut ab, ist das eine neue Fassung mit neuen Angaben und
 * neuer Unterschrift. Bis dahin übersprang `submit-sa-signature` die neue
 * Unterschrift, weil schon eine unterschriebene Anfrage da war, und
 * `finalize-selbstauskunft` meldete „bereits abgeschlossen“. Die neuen
 * Angaben standen dann mit der alten Unterschrift am Investment.
 *
 * Dasselbe Zurücksetzen wie beim Neuversand über `send-signature-request`
 * (`saKorrekturMetaPatch`), dazu Abschluss und Dokumentstatus. Leer, wenn es
 * keine fertige Selbstauskunft gab.
 */
export function saNeueFassungMetaPatch(
  meta: (SaKorrekturMeta & { docStatuses?: unknown }) | null | undefined,
  jetzt: string,
): Record<string, unknown> {
  const korrektur = saKorrekturMetaPatch(meta, jetzt);
  if (Object.keys(korrektur).length === 0) return {};
  const roh = meta?.docStatuses;
  const docStatuses = roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as Record<string, unknown>) : {};
  return {
    ...korrektur,
    saSigned: false,
    saSignedAt: null,
    saSignaturePending: true,
    docStatuses: { ...docStatuses, Selbstauskunft: "uploaded" },
  };
}

/**
 * Wartet eine korrigierte Selbstauskunft auf ihre neue Unterschrift?
 *
 * Erkannt wird das allein am Vermerk `saNeueUnterschriftSeit`, den
 * `send-signature-request` seit dem 26.09.2026 bei einer Korrektur setzt.
 *
 * Bewusst KEINE Rückfall-Regel für den Bestand davor: Christian will bei
 * bisherigen Kunden nichts an der Anzeige ändern (Entscheidung 26.09.2026).
 * Alte Vorgänge zeigen die Selbstauskunft also weiter so an wie bisher,
 * die neue Regel gilt nur für Korrekturen ab diesem Tag.
 */
export function saNeueUnterschriftAusstehend(meta: SaKorrekturMeta | null | undefined): boolean {
  if (!meta || meta.saSigned === true) return false;
  if (nichtLeer(meta.saPapierUpload)) return false;
  return nichtLeer(meta.saNeueUnterschriftSeit);
}

/**
 * Die Unterschriften aus `meta.saSignatures`, die zur geltenden Fassung gehören.
 *
 * Seit dem 26.09.2026 räumt der Versand einer Korrektur die alten
 * Unterschriften ab, dort stehen also nur Unterschriften zur geltenden
 * Fassung. Den Bestand davor lassen wir bewusst unverändert.
 */
export function saGeltendeUnterschriftenAusMeta(
  meta: SaKorrekturMeta | null | undefined,
): Record<string, SaUnterschrift> {
  const roh = meta?.saSignatures;
  const sigs = roh && typeof roh === "object" && !Array.isArray(roh) ? (roh as Record<string, SaUnterschrift>) : {};
  return sigs;
}
