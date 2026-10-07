import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

/**
 * Eigenfinanzierung im Kundenportal.
 *
 * Christian am 21.09.2026: Steht der Vermerk „Kunde finanziert selbst", soll
 * der Kunde seine Unterlagen im Portal selbst hochladen. Genau ein
 * Finanzierungsangebot, beliebig viele Darlehensvertraege, keine Freigabe
 * durch den Partner, danach eine Glocke beim zustaendigen Vertriebspartner.
 *
 * Geschrieben wird ueber die Datenbankfunktion
 * `eigenfinanzierung_kunde_unterlage` (Migration 20260921270000), weil
 * `merge_investment_meta` fuer einen Kunden alles ausser zwei Schluesseln
 * verwirft, und zwar ohne Fehlermeldung.
 *
 * Postgres laeuft im Test nicht mit. Die Attrappe unten bildet deshalb die
 * Regeln der Migration nach, und zwar genau die, auf die sich die Oberflaeche
 * verlaesst. Zusaetzlich prueft der letzte Block die Migrationsdatei selbst,
 * damit diese Regeln nicht still aus dem SQL verschwinden.
 */

const INV = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const INV_AUS = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const KONTAKT = { id: "kontakt-1", vorname: "Otto", nachname: "Hans", zustaendig_id: "berater-1" };

let investmentMeta: Record<string, any> = {};
let benachrichtigungen: any[] = [];
let entfernteDateien: string[] = [];

function setzeZurueck() {
  investmentMeta = {
    [INV]: { eigenfinanzierung: { aktiv: true, aktiviertVonName: "Christian Peetz", vpBestaetigt: undefined } },
    [INV_AUS]: { eigenfinanzierung: { aktiv: false } },
  };
  benachrichtigungen = [];
  entfernteDateien = [];
}

/** Bildet die Regeln aus 20260921270000 nach. */
function attrappeRpc(_name: string, args: any) {
  const { _investment_id, _aktion, _datei } = args;
  const meta = investmentMeta[_investment_id] || {};
  const ef = { ...(meta.eigenfinanzierung || {}) };

  if (!ef.aktiv) return { data: null, error: { message: "Eigenfinanzierung nicht aktiv" } };

  const pfad = _datei?.storagePath;
  if (!pfad) return { data: null, error: { message: "Kein Speicherpfad angegeben" } };

  // Altbestand aus dem frueheren Einzelfeld mit uebernehmen.
  const vertraege = Array.isArray(ef.kundenDarlehensvertraege) ? [...ef.kundenDarlehensvertraege] : [];
  if (ef.kundenDarlehensvertrag && !vertraege.some((v: any) => v.storagePath === ef.kundenDarlehensvertrag.storagePath)) {
    vertraege.push(ef.kundenDarlehensvertrag);
  }

  if (_aktion === "vertrag_entfernen") {
    if (!vertraege.some((v: any) => v.storagePath === pfad)) {
      return { data: null, error: { message: "Darlehensvertrag nicht gefunden" } };
    }
    const rest = vertraege.filter((v: any) => v.storagePath !== pfad);
    ef.kundenDarlehensvertraege = rest;
    if (rest.length > 0) ef.kundenDarlehensvertrag = rest[rest.length - 1];
    else delete ef.kundenDarlehensvertrag;
  } else {
    const praefix = `finanzierung/eigen/${KONTAKT.id}/${_investment_id}/`;
    if (!String(pfad).startsWith(praefix)) {
      return { data: null, error: { message: "Speicherpfad gehoert nicht zu diesem Vorgang" } };
    }
    // Der Eintrag wird serverseitig neu gebaut, Name und Rolle kommen vom Kontakt.
    const eintrag = {
      fileName: _datei.fileName || "Dokument",
      storagePath: pfad,
      uploadedAt: "2026-09-21T10:00:00.000Z",
      uploadedByName: `${KONTAKT.vorname} ${KONTAKT.nachname}`,
      uploadedByRole: "kunde",
    };
    if (_aktion === "angebot") {
      if (ef.kundenAngebot) return { data: null, error: { message: "Finanzierungsangebot liegt bereits vor" } };
      ef.kundenAngebot = eintrag;
    } else {
      vertraege.push(eintrag);
      ef.kundenDarlehensvertraege = vertraege;
      ef.kundenDarlehensvertrag = eintrag;
    }
  }

  investmentMeta[_investment_id] = { ...meta, eigenfinanzierung: ef };
  return { data: ef, error: null };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn(async (name: string, args: any) => attrappeRpc(name, args)),
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        remove: vi.fn(async (pfade: string[]) => { entfernteDateien.push(...pfade); return { error: null }; }),
      }),
    },
    from: () => ({
      insert: vi.fn(async (zeile: any) => { benachrichtigungen.push(zeile); return { error: null }; }),
    }),
  },
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMeta: (investmentId: string, schluessel: string, standard: unknown) =>
    investmentMeta[investmentId]?.[schluessel] ?? standard,
  setInvestmentMeta: (investmentId: string, schluessel: string, wert: unknown) => {
    investmentMeta[investmentId] = { ...(investmentMeta[investmentId] || {}), [schluessel]: wert };
  },
  setInvestmentMetaNurLokal: (investmentId: string, schluessel: string, wert: unknown) => {
    investmentMeta[investmentId] = { ...(investmentMeta[investmentId] || {}), [schluessel]: wert };
  },
  getInvestmentMetaField: (investmentId: string, schluessel: string, standard: unknown) =>
    investmentMeta[investmentId]?.[schluessel] ?? standard,
  setInvestmentMetaFields: (investmentId: string, updates: Record<string, unknown>) => {
    investmentMeta[investmentId] = { ...(investmentMeta[investmentId] || {}), ...updates };
  },
}));

vi.mock("@/lib/storage", () => ({ openUnterlage: vi.fn() }));
vi.mock("@/lib/confirm", () => ({ confirmDialog: vi.fn(async () => true) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    // Der Schluessel selbst genuegt: Der Test prueft Verhalten, nicht Texte.
    t: (schluessel: string, werte?: Record<string, unknown>) => {
      let text = String(schluessel);
      if (werte) for (const [k, v] of Object.entries(werte)) text = text.replace(`{{${k}}}`, String(v));
      return text;
    },
    i18n: { resolvedLanguage: "de" },
  }),
  // Die Karte formatiert Daten über `@/i18n/portalSprache`, das i18next
  // einrichtet. Dafür braucht es das Einhängestück von react-i18next.
  initReactI18next: { type: "3rdParty", init: () => undefined },
}));

import { EigenfinanzierungKundeKarte } from "@/components/finanzierung/EigenfinanzierungKundeKarte";
import {
  speichereKundenAngebot,
  speichereKundenDarlehensvertrag,
  loescheKundenDarlehensvertrag,
  getEigenfinanzierung,
  alleKundenDarlehensvertraege,
} from "@/lib/eigenfinanzierungStore";

beforeEach(() => {
  vi.clearAllMocks();
  setzeZurueck();
});

const datei = (name: string) => new File(["x"], name, { type: "application/pdf" });

/**
 * Der Knopftext "upload" steht zweimal auf der Karte, einmal beim
 * Finanzierungsangebot und einmal beim ersten Darlehensvertrag. `index` sagt,
 * welcher der beiden gemeint ist: 0 das Angebot, 1 der Vertrag.
 */
function ladeHoch(knopfText: string, dateiname: string, index = 0) {
  fireEvent.click(screen.getAllByText(knopfText)[index]);
  const eingabe = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(eingabe, { target: { files: [datei(dateiname)] } });
}

describe("Kundenportal: der Kunde laedt seine Eigenfinanzierung selbst hoch", () => {
  it("laedt ein Finanzierungsangebot hoch, danach ist kein zweites mehr moeglich", async () => {
    render(<EigenfinanzierungKundeKarte investmentId={INV} kontakt={KONTAKT} />);

    ladeHoch("portal.investments.finanzierung.eigen.upload", "Bankzusage.pdf");
    await waitFor(() => expect(screen.getByText(/Bankzusage\.pdf/)).toBeInTheDocument());

    // Der Hochladeknopf des Angebots ist weg, uebrig bleibt der fuer Vertraege.
    expect(screen.getAllByText("portal.investments.finanzierung.eigen.upload")).toHaveLength(1);

    // Und die Regel gilt auch, wenn die Oberflaeche umgangen wird.
    const zweites = await speichereKundenAngebot(INV, {
      fileName: "Zweite_Zusage.pdf",
      storagePath: `finanzierung/eigen/${KONTAKT.id}/${INV}/kundeFA_2.pdf`,
      uploadedAt: "2026-09-21T11:00:00.000Z",
      uploadedByName: "Otto Hans",
      uploadedByRole: "kunde",
    });
    expect(zweites.ok).toBe(false);
    expect(zweites.fehler).toMatch(/bereits ein Finanzierungsangebot/i);
  });

  it("nimmt mehrere Darlehensvertraege nebeneinander an", async () => {
    render(<EigenfinanzierungKundeKarte investmentId={INV} kontakt={KONTAKT} />);

    ladeHoch("portal.investments.finanzierung.eigen.upload", "Darlehen_Haupt.pdf", 1);
    await waitFor(() => expect(screen.getByText("Darlehen_Haupt.pdf")).toBeInTheDocument());

    ladeHoch("portal.investments.finanzierung.eigen.add", "Darlehen_KfW.pdf");
    await waitFor(() => expect(screen.getByText("Darlehen_KfW.pdf")).toBeInTheDocument());

    expect(screen.getByText("Darlehen_Haupt.pdf")).toBeInTheDocument();
    expect(alleKundenDarlehensvertraege(getEigenfinanzierung(INV))).toHaveLength(2);
  });

  it("meldet dem zugewiesenen Vertriebspartner jeden Upload ueber die Glocke", async () => {
    render(<EigenfinanzierungKundeKarte investmentId={INV} kontakt={KONTAKT} />);

    ladeHoch("portal.investments.finanzierung.eigen.upload", "Bankzusage.pdf");
    await waitFor(() => expect(benachrichtigungen).toHaveLength(1));

    expect(benachrichtigungen[0].benutzer_id).toBe("berater-1");
    expect(benachrichtigungen[0].ziel_rolle).toBe("vertriebspartner");
    expect(benachrichtigungen[0].nachricht).toContain("Otto Hans");
    expect(benachrichtigungen[0].nachricht).toContain("Bankzusage.pdf");
    expect(benachrichtigungen[0].link).toBe("/kunden/kontakt-1");
  });

  it("entfernt einen Darlehensvertrag samt Datei, nach Rueckfrage", async () => {
    render(<EigenfinanzierungKundeKarte investmentId={INV} kontakt={KONTAKT} />);

    ladeHoch("portal.investments.finanzierung.eigen.upload", "Darlehen.pdf", 1);
    await waitFor(() => expect(screen.getByText("Darlehen.pdf")).toBeInTheDocument());

    fireEvent.click(screen.getByText("portal.investments.finanzierung.eigen.delete"));
    await waitFor(() => expect(screen.queryByText("Darlehen.pdf")).not.toBeInTheDocument());
    expect(entfernteDateien).toHaveLength(1);
  });

  it("schreibt ohne aktive Eigenfinanzierung nichts und zeigt auch nichts", async () => {
    const { container } = render(<EigenfinanzierungKundeKarte investmentId={INV_AUS} kontakt={KONTAKT} />);
    expect(container).toBeEmptyDOMElement();

    const vorher = JSON.stringify(investmentMeta[INV_AUS]);
    const ergebnis = await speichereKundenDarlehensvertrag(INV_AUS, {
      fileName: "Darlehen.pdf",
      storagePath: `finanzierung/eigen/${KONTAKT.id}/${INV_AUS}/kundeDV_1.pdf`,
      uploadedAt: "2026-09-21T10:00:00.000Z",
      uploadedByName: "Otto Hans",
      uploadedByRole: "kunde",
    });

    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehler).toMatch(/nicht eingeschaltet/i);
    expect(JSON.stringify(investmentMeta[INV_AUS])).toBe(vorher);
  });

  it("weist eine Datei ab, die nicht zu diesem Kauf gehoert", async () => {
    const ergebnis = await speichereKundenDarlehensvertrag(INV, {
      fileName: "Fremd.pdf",
      storagePath: "finanzierung/eigen/kontakt-fremd/anderes-investment/kundeDV_1.pdf",
      uploadedAt: "2026-09-21T10:00:00.000Z",
      uploadedByName: "Otto Hans",
      uploadedByRole: "kunde",
    });
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehler).toMatch(/gehört nicht zu diesem Kauf/i);
  });

  it("meldet einen unbekannten Vertrag beim Loeschen, statt still nichts zu tun", async () => {
    const ergebnis = await loescheKundenDarlehensvertrag(INV, "gibt/es/nicht.pdf");
    expect(ergebnis.ok).toBe(false);
    expect(ergebnis.fehler).toMatch(/steht nicht mehr/i);
  });
});

describe("Die Migration selbst haelt die Regeln fest", () => {
  const sql = readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260921270000_eigenfinanzierung_kunde_upload.sql"),
    "utf8",
  );

  it("laeuft als SECURITY DEFINER mit festem search_path und ohne anon", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.eigenfinanzierung_kunde_unterlage\(uuid, text, jsonb\) FROM public;/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.eigenfinanzierung_kunde_unterlage\(uuid, text, jsonb\) FROM anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.eigenfinanzierung_kunde_unterlage\(uuid, text, jsonb\) TO authenticated;/);
    expect(sql).not.toMatch(/GRANT EXECUTE[^;]*TO[^;]*\banon\b/);
  });

  it("prueft Zugehoerigkeit, aktiven Schalter und das einzelne Angebot", () => {
    expect(sql).toContain("public.is_internal_role(auth.uid())");
    expect(sql).toContain("'authUserId') = auth.uid()::text");
    expect(sql).toContain("Eigenfinanzierung nicht aktiv");
    expect(sql).toContain("Finanzierungsangebot liegt bereits vor");
    expect(sql).toContain("Darlehensvertrag nicht gefunden");
    expect(sql).toContain("Speicherpfad gehoert nicht zu diesem Vorgang");
  });

  it("fasst ausschliesslich die drei Felder des Kunden an", () => {
    const geschrieben = [...sql.matchAll(/jsonb_set\(_ef, '\{([a-zA-Z]+)\}'/g)].map((m) => m[1]);
    expect(new Set(geschrieben)).toEqual(
      new Set(["kundenAngebot", "kundenDarlehensvertraege", "kundenDarlehensvertrag"]),
    );
    // Die geschuetzten Felder werden nirgends gesetzt.
    for (const feld of ["aktiv", "vpBestaetigt", "aktiviertVonName", "deaktiviertAm"]) {
      expect(sql).not.toContain(`jsonb_set(_ef, '{${feld}}'`);
    }
  });

  it("vergleicht kunde_id als uuid, nicht als Text", () => {
    expect(sql).toContain("WHERE id = inv_row.kunde_id");
    expect(sql).not.toContain("id::text = inv_row.kunde_id");
  });
});
