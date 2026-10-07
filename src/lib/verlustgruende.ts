/**
 * Katalog der Verlustgründe.
 *
 * Bisher war der Grund ein Freitextfeld. Jeder hat etwas anderes geschrieben,
 * und in der Auswertung wurde aus jeder Formulierung eine eigene Zeile. Damit
 * war die Frage "warum verlieren wir Leads" nicht beantwortbar.
 *
 * Zwei Ebenen: Die Gruppe beantwortet die Frage, an der die Führung etwas
 * ändern kann, der Grund ist die konkrete Nennung. Freitext gibt es nur noch
 * über die Auswahl "Sonstiges" im Dialog: ein Pflichttext für den seltenen
 * Fall, dass keine der Gruppen passt. Gespeichert wird dann der Text selbst
 * im Feld `verlorenGrund`, genau wie beim Altbestand von vor der Umstellung.
 * Alle Lesestellen laufen deshalb über `verlustGrundLabel()` und
 * `verlustGruppeVon()`, die mit Katalog-IDs und Freitext gleichermaßen
 * umgehen können.
 *
 * Zwei Angaben je Grund machen aus der Statistik ein Werkzeug:
 *   wiederAnsprechbar  steuert die Wiedervorlage verlorener Leads
 *   verantwortung      trennt Marktabsagen von Dingen, die bei uns lagen
 */

export type VerlustGruppeId =
  | "nicht_erreicht"
  | "kein_bedarf"
  | "nicht_finanzierbar"
  | "timing"
  | "passt_nicht"
  | "wettbewerb"
  | "prozessverlust"
  | "sonstiges";

/** Lag der Verlust an uns oder an etwas, das wir nicht beeinflussen? */
export type VerlustVerantwortung = "uns" | "extern";

export interface VerlustGruppe {
  id: VerlustGruppeId;
  label: string;
  /** Ein Satz, was diese Gruppe aussagt. Erscheint im Dialog als Hilfe. */
  bedeutung: string;
}

export interface VerlustGrund {
  id: string;
  gruppe: VerlustGruppeId;
  label: string;
  /** Darf dieser Lead später erneut angesprochen werden? */
  wiederAnsprechbar: boolean;
  verantwortung: VerlustVerantwortung;
  /** Erwartete Sperrfrist in Monaten, bevor erneut angesprochen wird. */
  wiedervorlageMonate?: number;
  /**
   * true: steht im Dialog nicht als fester Grund zur Auswahl. Gilt für den
   * Sammelposten "Sonstiges", der alte und neue Freitexte aufnimmt.
   */
  nurAutomatisch?: boolean;
}

export const VERLUST_GRUPPEN: VerlustGruppe[] = [
  { id: "nicht_erreicht", label: "Nicht erreicht", bedeutung: "Wir kommen nicht an den Menschen heran." },
  { id: "kein_bedarf", label: "Kein Bedarf", bedeutung: "Er will grundsätzlich nicht." },
  { id: "nicht_finanzierbar", label: "Nicht finanzierbar", bedeutung: "Er will, aber die Zahlen oder die Bank tragen nicht." },
  { id: "timing", label: "Timing", bedeutung: "Er will, aber nicht jetzt." },
  { id: "passt_nicht", label: "Passt nicht zu uns", bedeutung: "Falsche Zielgruppe für unser Produkt." },
  { id: "wettbewerb", label: "Wettbewerb", bedeutung: "Er hat woanders gekauft." },
  { id: "prozessverlust", label: "Prozessverlust", bedeutung: "Er ist uns unterwegs verloren gegangen." },
  { id: "sonstiges", label: "Sonstiges", bedeutung: "Passt in keine der Gruppen, eigener Grund als kurzer Text." },
];

export const VERLUST_GRUENDE: VerlustGrund[] = [
  // ── Nicht erreicht ──────────────────────────────────────────────────────
  { id: "ne_mehrfach", gruppe: "nicht_erreicht", label: "Mehrfach nicht erreicht", wiederAnsprechbar: true, wiedervorlageMonate: 3, verantwortung: "uns" },
  { id: "ne_daten_falsch", gruppe: "nicht_erreicht", label: "Kontaktdaten falsch", wiederAnsprechbar: false, verantwortung: "extern" },
  { id: "ne_abgebrochen", gruppe: "nicht_erreicht", label: "Kontakt abgebrochen, keine Antwort mehr", wiederAnsprechbar: true, wiedervorlageMonate: 6, verantwortung: "uns" },

  // ── Kein Bedarf ─────────────────────────────────────────────────────────
  { id: "kb_kein_interesse", gruppe: "kein_bedarf", label: "Kein Interesse an Kapitalanlage", wiederAnsprechbar: true, wiedervorlageMonate: 12, verantwortung: "extern" },
  { id: "kb_nur_infos", gruppe: "kein_bedarf", label: "Wollte nur Informationen sammeln", wiederAnsprechbar: true, wiedervorlageMonate: 6, verantwortung: "extern" },
  { id: "kb_bereits_investiert", gruppe: "kein_bedarf", label: "Hat bereits investiert und will nicht mehr", wiederAnsprechbar: true, wiedervorlageMonate: 12, verantwortung: "extern" },

  // ── Nicht finanzierbar ──────────────────────────────────────────────────
  { id: "nf_bonitaet", gruppe: "nicht_finanzierbar", label: "Bonität nicht ausreichend", wiederAnsprechbar: true, wiedervorlageMonate: 12, verantwortung: "extern" },
  { id: "nf_eigenkapital", gruppe: "nicht_finanzierbar", label: "Eigenkapital fehlt", wiederAnsprechbar: true, wiedervorlageMonate: 12, verantwortung: "extern" },
  { id: "nf_einkommen", gruppe: "nicht_finanzierbar", label: "Einkommen zu niedrig", wiederAnsprechbar: true, wiedervorlageMonate: 12, verantwortung: "extern" },
  { id: "nf_bank_abgelehnt", gruppe: "nicht_finanzierbar", label: "Bank hat abgelehnt", wiederAnsprechbar: true, wiedervorlageMonate: 9, verantwortung: "extern" },
  { id: "nf_schufa", gruppe: "nicht_finanzierbar", label: "Schufa-Eintrag", wiederAnsprechbar: true, wiedervorlageMonate: 18, verantwortung: "extern" },

  // ── Timing ──────────────────────────────────────────────────────────────
  { id: "ti_spaeter", gruppe: "timing", label: "Möchte später wieder angesprochen werden", wiederAnsprechbar: true, wiedervorlageMonate: 6, verantwortung: "extern" },
  { id: "ti_beruflich", gruppe: "timing", label: "Berufliche Veränderung", wiederAnsprechbar: true, wiedervorlageMonate: 9, verantwortung: "extern" },
  { id: "ti_privat", gruppe: "timing", label: "Private Veränderung", wiederAnsprechbar: true, wiedervorlageMonate: 9, verantwortung: "extern" },

  // ── Passt nicht zu uns ──────────────────────────────────────────────────
  { id: "pn_vermoegensaufbau", gruppe: "passt_nicht", label: "Für Vermögensaufbau geeignet, nicht für Immobilie", wiederAnsprechbar: false, verantwortung: "extern" },
  { id: "pn_zielgruppe", gruppe: "passt_nicht", label: "Zielgruppe passt nicht", wiederAnsprechbar: false, verantwortung: "extern" },
  { id: "pn_selbstnutzung", gruppe: "passt_nicht", label: "Will selbst einziehen", wiederAnsprechbar: false, verantwortung: "extern" },

  // ── Wettbewerb ──────────────────────────────────────────────────────────
  { id: "we_wettbewerber", gruppe: "wettbewerb", label: "Bei einem Wettbewerber gekauft", wiederAnsprechbar: true, wiedervorlageMonate: 18, verantwortung: "uns" },
  { id: "we_andere_anlage", gruppe: "wettbewerb", label: "Andere Anlageform gewählt", wiederAnsprechbar: true, wiedervorlageMonate: 18, verantwortung: "extern" },

  // ── Prozessverlust ──────────────────────────────────────────────────────
  { id: "pv_mitentscheider", gruppe: "prozessverlust", label: "Mitentscheider dagegen", wiederAnsprechbar: true, wiedervorlageMonate: 9, verantwortung: "uns" },
  { id: "pv_steuerberater", gruppe: "prozessverlust", label: "Steuerberater dagegen", wiederAnsprechbar: true, wiedervorlageMonate: 9, verantwortung: "uns" },
  { id: "pv_kein_objekt", gruppe: "prozessverlust", label: "Kein passendes Objekt gefunden", wiederAnsprechbar: true, wiedervorlageMonate: 6, verantwortung: "uns" },
  { id: "pv_preis", gruppe: "prozessverlust", label: "Preisvorstellung nicht erfüllbar", wiederAnsprechbar: true, wiedervorlageMonate: 9, verantwortung: "uns" },
  { id: "pv_reservierung_zurueck", gruppe: "prozessverlust", label: "Reservierung zurückgezogen", wiederAnsprechbar: true, wiedervorlageMonate: 6, verantwortung: "uns" },

  // ── Sonstiges ───────────────────────────────────────────────────────────
  { id: "so_sonstiges", gruppe: "sonstiges", label: "Sonstiges (Freitext)", wiederAnsprechbar: true, wiedervorlageMonate: 12, verantwortung: "extern", nurAutomatisch: true },
];

const NACH_ID = new Map(VERLUST_GRUENDE.map((g) => [g.id, g]));
const GRUPPE_NACH_ID = new Map(VERLUST_GRUPPEN.map((g) => [g.id, g]));

export function verlustGrundById(id?: string | null): VerlustGrund | undefined {
  return id ? NACH_ID.get(id) : undefined;
}

/**
 * Steht in `verlorenGrund` eine Katalog-ID oder ein Freitext?
 *
 * Freitext entsteht auf zwei Wegen: über die Auswahl "Sonstiges" im
 * Verloren-Dialog und durch den Altbestand von vor der Katalog-Umstellung.
 */
export function istFreitextGrund(wert?: string | null): boolean {
  const t = (wert || "").trim();
  return t.length > 0 && !NACH_ID.has(t);
}

export function verlustGruppeById(id?: string | null): VerlustGruppe | undefined {
  return id ? GRUPPE_NACH_ID.get(id as VerlustGruppeId) : undefined;
}

export function gruendeDerGruppe(gruppe: VerlustGruppeId): VerlustGrund[] {
  return VERLUST_GRUENDE.filter((g) => g.gruppe === gruppe && !g.nurAutomatisch);
}

/** Gruppen, die im Dialog zur Auswahl stehen. Ohne den Altbestand-Sammelposten. */
export function auswaehlbareGruppen(): VerlustGruppe[] {
  return VERLUST_GRUPPEN.filter((gr) => gruendeDerGruppe(gr.id).length > 0);
}

/**
 * Alte Freitexte auf den Katalog abbilden.
 *
 * Die Regeln stammen aus dem, was die Auswertung bisher schon
 * zusammengefasst hat, plus den festen Texten, die das System selbst gesetzt
 * hat. Was sich nicht sicher zuordnen lässt, landet in Sonstiges und behält
 * den ursprünglichen Text.
 */
export function grundAusFreitext(text?: string | null): { grundId: string; sicher: boolean } {
  const t = (text || "").trim().toLowerCase();
  if (!t) return { grundId: "so_sonstiges", sicher: false };

  const regeln: [RegExp, string][] = [
    [/nicht erreicht|nicht erreichbar|versuche.*(erfolglos|nicht erreicht)/, "ne_mehrfach"],
    [/kontaktdaten falsch|falsche (nummer|daten)|nummer (existiert nicht|ungültig)/, "ne_daten_falsch"],
    [/kein interesse|keine lust|will nicht/, "kb_kein_interesse"],
    [/nur info|informationen sammeln|wollte sich nur informieren/, "kb_nur_infos"],
    [/bereits investiert|hat schon.*(wohnung|immobilie)/, "kb_bereits_investiert"],
    [/bonität|bonitaet|schufa/, "nf_bonitaet"],
    [/eigenkapital/, "nf_eigenkapital"],
    [/einkommen zu (niedrig|gering)/, "nf_einkommen"],
    [/bank.*(abgelehnt|absage)|finanzierung abgelehnt|nicht finanzierbar|finanzierungsf/, "nf_bank_abgelehnt"],
    [/später|spaeter|zu einem anderen zeitpunkt|melde mich wieder/, "ti_spaeter"],
    [/jobwechsel|arbeitslos|beruflich/, "ti_beruflich"],
    [/schwanger|trennung|scheidung|privat/, "ti_privat"],
    [/vermögensaufbau|vermoegensaufbau/, "pn_vermoegensaufbau"],
    [/selbst (ein|be)ziehen|eigennutz/, "pn_selbstnutzung"],
    [/zielgruppe|passt nicht/, "pn_zielgruppe"],
    [/wettbewerb|konkurrenz|woanders gekauft|ander\w* anbieter|ander\w* vertrieb/, "we_wettbewerber"],
    [/etf|aktien|fonds|andere anlage/, "we_andere_anlage"],
    [/(ehe)?(frau|mann|partner|eltern).*(dagegen|nicht einverstanden)|mitentscheider/, "pv_mitentscheider"],
    [/steuerberater/, "pv_steuerberater"],
    [/kein.*objekt|nichts passendes/, "pv_kein_objekt"],
    [/zu teuer|preis/, "pv_preis"],
    [/reservierung.*(zurück|zurueck|storn)/, "pv_reservierung_zurueck"],
  ];

  for (const [muster, grundId] of regeln) {
    if (muster.test(t)) return { grundId, sicher: true };
  }
  return { grundId: "so_sonstiges", sicher: false };
}

/** Anzeigename eines gespeicherten Verlusts, egal ob Katalog-ID oder Alttext. */
export function verlustGrundLabel(grundId?: string | null, freitext?: string | null): string {
  const katalog = verlustGrundById(grundId);
  if (katalog) {
    // Altbestand behält seinen ursprünglichen Wortlaut, damit beim Umstellen
    // keine Information verloren geht.
    if (katalog.id === "so_sonstiges" && freitext?.trim()) return freitext.trim();
    return katalog.label;
  }
  // Freitext, ob Altbestand oder neue Sonstiges-Auswahl: der gespeicherte
  // Text ist selbst der Grund.
  const text = (grundId || freitext || "").trim();
  return text || "Kein Grund angegeben";
}

/** Gruppe eines gespeicherten Verlusts, auch für Altbestand. */
export function verlustGruppeVon(grundId?: string | null, freitext?: string | null): VerlustGruppe {
  const katalog = verlustGrundById(grundId);
  if (katalog) return GRUPPE_NACH_ID.get(katalog.gruppe)!;
  const abgeleitet = grundAusFreitext(grundId || freitext);
  const grund = NACH_ID.get(abgeleitet.grundId)!;
  return GRUPPE_NACH_ID.get(grund.gruppe)!;
}

/** Ist dieser Lead nach der hinterlegten Frist wieder ansprechbar? */
export function wiederAnsprechbarAm(
  grundId?: string | null,
  verlorenAm?: string | null,
): Date | null {
  const grund = verlustGrundById(grundId);
  if (!grund || !grund.wiederAnsprechbar) return null;
  const basis = verlorenAm ? new Date(verlorenAm) : null;
  if (!basis || Number.isNaN(basis.getTime())) return null;
  const d = new Date(basis);
  d.setMonth(d.getMonth() + (grund.wiedervorlageMonate ?? 12));
  return d;
}
