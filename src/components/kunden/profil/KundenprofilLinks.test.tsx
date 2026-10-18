import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, renderHook } from "@testing-library/react";
import type { KundeData } from "@/lib/kundenStore";

/*
 * Umbau Kundenprofil vom 18.10.2026: alle Stammdaten links, jedes Feld mit
 * eigenem Stift, klappbare Abschnitte, Ampeln und der Lead-Score als Ring.
 */

const toastSpy = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ toast: (a: unknown) => toastSpy(a), useToast: () => ({ toast: toastSpy }) }));

const patchSpy = vi.fn(async (_schluessel: string, _patch: unknown) => true);
vi.mock("@/lib/userSettingsCache", () => ({
  getUserSetting: () => ({ lead: true, portal: false, kaputt: "ja" }),
  patchUserSetting: (k: string, p: unknown) => patchSpy(k, p),
}));
vi.mock("@/hooks/useCacheReady", () => ({ useCacheReady: () => true }));
vi.mock("@/hooks/useLiveData", () => ({ useLiveVersion: () => 0 }));
// Die Kampagne liest den Zwischenspeicher, für diese Tests ohne Belang.
vi.mock("@/components/kunden/KampagnenZeile", () => ({ KampagnenZeile: () => null }));

import { KundenprofilFeld } from "./KundenprofilFeld";
import { KontaktFelder, LeadFelder, Person2Felder, qualifizierungHinweis, geburtstagAlsIso, geburtstagAusIso } from "./KundenprofilKundendaten";
import { KundenprofilStammdaten } from "./KundenprofilStammdaten";
import { portalAmpel, empfehlungAmpel, KundenprofilAmpel } from "./KundenprofilAmpel";
import { leseOffeneAbschnitte, useProfilAbschnitte, PROFIL_ABSCHNITTE_SCHLUESSEL } from "./useProfilAbschnitte";
import { KundenprofilLeadScore, leadScoreFarbe, leadScoreTipp, LEAD_SCORE_STUFENWORT } from "./KundenprofilLeadScore";
import { baueRechnerQuellen } from "./KundenprofilRechnerZeilen";
import { baueReiter, istErlaubterReiter, leseReiterAusAdresse, standardReiter } from "@/lib/kundenprofilReiter";
import { Input } from "@/components/ui/input";

beforeEach(() => {
  toastSpy.mockClear();
  patchSpy.mockClear();
});

const kunde = (over: Partial<KundeData> = {}): KundeData =>
  ({
    id: "k1", osImmoId: 42, vorname: "Max", nachname: "Mustermann", email: "max@example.org",
    telefon: "+491701234567", geburtstag: "12.03.1986", strasse: "Musterweg", hausnummer: "12",
    plz: "10115", ort: "Berlin", quelle: "Website", berater: "Erika", setter: "Sina",
    erstellt_am: "2026-09-01T10:00:00Z", ...over,
  }) as KundeData;

describe("Jedes Feld hat seinen eigenen Stift", () => {
  const feld = (speichern = vi.fn(async () => true)) => {
    render(
      <dl>
        <KundenprofilFeld
          label="E-Mail"
          wert="alt@example.org"
          bearbeitung={{ start: () => "alt@example.org", editor: (w, setze) => <Input aria-label="Wert" value={w} onChange={(e) => setze(e.target.value)} />, speichern }}
        />
      </dl>,
    );
    return speichern;
  };

  it("Enter speichert genau dieses Feld und bestätigt mit einem Toast", async () => {
    const speichern = feld();
    fireEvent.click(screen.getByRole("button", { name: "E-Mail bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Wert"), { target: { value: "neu@example.org" } });
    fireEvent.submit(screen.getByRole("form", { name: "E-Mail bearbeiten" }));
    await waitFor(() => expect(speichern).toHaveBeenCalledWith("neu@example.org"));
    await waitFor(() => expect(toastSpy).toHaveBeenCalledWith({ title: "E-Mail gespeichert" }));
    expect(screen.queryByLabelText("Wert")).not.toBeInTheDocument();
  });

  it("Esc verwirft ohne zu speichern", () => {
    const speichern = feld();
    fireEvent.click(screen.getByRole("button", { name: "E-Mail bearbeiten" }));
    fireEvent.keyDown(screen.getByLabelText("Wert"), { key: "Escape" });
    expect(speichern).not.toHaveBeenCalled();
    expect(screen.getByText("alt@example.org")).toBeInTheDocument();
  });

  it("bleibt offen, wenn der Speicherweg ablehnt, und meldet keinen Erfolg", async () => {
    const speichern = feld(vi.fn(async () => false));
    fireEvent.click(screen.getByRole("button", { name: "E-Mail bearbeiten" }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(speichern).toHaveBeenCalled());
    expect(screen.getByLabelText("Wert")).toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("zeigt ohne Bearbeitung keinen Stift", () => {
    render(<dl><KundenprofilFeld label="Kennung" wert="OSI-00042" /></dl>);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("Speichern je Feld über den vorhandenen Weg", () => {
  it("Kontaktdaten: Telefon und E-Mail gehen als einzelne Änderung an speichereStammdaten", async () => {
    const speichere = vi.fn(async () => true);
    render(<KontaktFelder kunde={kunde()} speichere={speichere} sprache="Deutsch" onAnrufen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "E-Mail bearbeiten" }));
    const eingabe = screen.getByDisplayValue("max@example.org");
    fireEvent.change(eingabe, { target: { value: " neu@example.org " } });
    fireEvent.submit(eingabe.closest("form")!);
    await waitFor(() => expect(speichere).toHaveBeenCalledWith({ email: "neu@example.org" }));
  });

  it("Adresse ist ein Feld mit Straße, Hausnummer, PLZ und Ort", async () => {
    const speichere = vi.fn(async () => true);
    render(<KontaktFelder kunde={kunde()} speichere={speichere} sprache="Deutsch" onAnrufen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Adresse bearbeiten" }));
    fireEvent.change(screen.getByLabelText("Postleitzahl"), { target: { value: "20095" } });
    fireEvent.change(screen.getByLabelText("Ort"), { target: { value: "Hamburg" } });
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(speichere).toHaveBeenCalledWith({ strasse: "Musterweg", hausnummer: "12", plz: "20095", ort: "Hamburg" }));
  });

  it("Person 2: die E-Mail geht mit der ganzen Person 2 an denselben Weg", async () => {
    const speichere = vi.fn(async () => true);
    const p2 = { anrede: "Frau", vorname: "Maria", nachname: "M", geburtsdatum: "", email: "", telefon: "", strasse: "", hausnummer: "", plz: "", ort: "" };
    render(<Person2Felder person2={p2} speichere={speichere} onAnrufen={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "E-Mail bearbeiten" }));
    expect(screen.getByText(/Pflicht/)).toBeInTheDocument();
    const eingabe = screen.getByPlaceholderText("email@beispiel.de");
    fireEvent.change(eingabe, { target: { value: "maria@example.org" } });
    fireEvent.submit(eingabe.closest("form")!);
    await waitFor(() => expect(speichere).toHaveBeenCalledWith({ person2: { ...p2, email: "maria@example.org" } }));
  });

  it("zeigt hinter der Telefonnummer nur das WhatsApp-Symbol, für beide Personen", () => {
    const p2 = { anrede: "", vorname: "Maria", nachname: "M", geburtsdatum: "", email: "", telefon: "+491709999999", strasse: "", hausnummer: "", plz: "", ort: "" };
    render(<><KontaktFelder kunde={kunde()} sprache="Deutsch" onAnrufen={() => {}} /><Person2Felder person2={p2} onAnrufen={() => {}} /></>);
    const links = screen.getAllByRole("link", { name: "Per WhatsApp schreiben" });
    expect(links).toHaveLength(2);
    for (const l of links) {
      expect(l).toHaveAttribute("title", "Per WhatsApp schreiben");
      expect(l.textContent).toBe("");
    }
    expect(screen.queryByText(/WhatsApp/)).not.toBeInTheDocument();
  });

  it("Geburtstag wird als TT.MM.JJJJ gespeichert", () => {
    expect(geburtstagAlsIso("12.03.1986")).toBe("1986-03-12");
    expect(geburtstagAusIso("1986-03-12")).toBe("12.03.1986");
    expect(geburtstagAlsIso("")).toBe("");
  });
});

describe("Rechte je Rolle", () => {
  it("ohne Speicherweg (Finanzierer, Buchhaltung) hat kein Kontaktfeld einen Stift", () => {
    render(<KontaktFelder kunde={kunde()} sprache="Deutsch" onAnrufen={() => {}} />);
    expect(screen.queryByRole("button", { name: /bearbeiten/ })).not.toBeInTheDocument();
  });

  it("Setter bleibt Anzeige, der Vertriebspartner-Stift öffnet den vorhandenen Ablauf", () => {
    const wechsel = vi.fn();
    render(<LeadFelder kunde={kunde()} meta={{}} rolle="admin" speichere={vi.fn(async () => true)} vertriebspartnerName="Erika" onVertriebspartnerAendern={wechsel} onKontaktOeffnen={() => {}} />);
    expect(screen.queryByRole("button", { name: "Setter bearbeiten" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Vertriebspartner bearbeiten" }));
    expect(wechsel).toHaveBeenCalledTimes(1);
  });

  it("ohne Recht zum Wechsel kein Stift am Vertriebspartner, „Erstellt von“ nur mit Freigabe", () => {
    render(<LeadFelder kunde={kunde()} meta={{ erstelltVonName: "Anna" }} rolle="vertriebspartner" speichere={vi.fn(async () => true)} vertriebspartnerName="Erika" onKontaktOeffnen={() => {}} />);
    expect(screen.queryByRole("button", { name: "Vertriebspartner bearbeiten" })).not.toBeInTheDocument();
    expect(screen.queryByText("Erstellt von")).not.toBeInTheDocument();
  });

  it("Admin und Inhaber sehen „Erstellt von“", () => {
    render(<LeadFelder kunde={kunde()} meta={{ erstelltVonName: "Anna" }} rolle="admin" ersteller={{ nutzer: [] }} vertriebspartnerName="Erika" onKontaktOeffnen={() => {}} />);
    expect(screen.getByText("Erstellt von")).toBeInTheDocument();
    expect(screen.getByText("Anna")).toBeInTheDocument();
  });

  const profil = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");
  it("die Seite gibt Finanzierer und Buchhaltung keinen Speicherweg", () => {
    expect(profil).toContain("const darfStammdatenAendern = !isFinanzierer && !nurLesend;");
    expect(profil).toContain("const speichere = darfStammdatenAendern ? speichereStammdaten : undefined;");
    expect(profil).toContain("onVertriebspartnerAendern={canChangeBerater ? oeffneVertriebspartnerWechsel : undefined}");
    expect(profil).toContain("ersteller={isAdminOrInhaber ?");
  });

  it("die Knöpfe Vertriebspartner ändern und Setter ändern sind entfallen, der Ablauf ist derselbe", () => {
    expect(profil).not.toMatch(/<UserCog[^>]*\/> Vertriebspartner ändern/);
    expect(profil).not.toMatch(/Setter ändern/);
    expect(profil).toContain("<Button size=\"sm\" onClick={handleSaveBerater} disabled={!grundBereit}>");
    expect(profil).toContain("onClick={fuehreBeraterWechselAus} disabled={!grundBereit}");
  });
});

describe("Ampeln bei Kundenportal und Empfehlungsprogramm", () => {
  it("Portal: grün aktiv, gelb nur eingeladen, rot aus oder gesperrt", () => {
    expect(portalAmpel("aktiv")).toMatchObject({ ton: "gruen", wort: "aktiv" });
    expect(portalAmpel("eingeladen")).toMatchObject({ ton: "gelb", wort: "eingeladen" });
    expect(portalAmpel("gesperrt")).toMatchObject({ ton: "rot", wort: "gesperrt" });
    expect(portalAmpel("none")).toMatchObject({ ton: "rot", wort: "aus" });
  });

  it("Empfehlungsprogramm kennt nur aktiv oder aus", () => {
    expect(empfehlungAmpel(true).ton).toBe("gruen");
    expect(empfehlungAmpel(false).ton).toBe("rot");
  });

  it("zeigt das Wort sichtbar und den Satz als aria-label", () => {
    render(<KundenprofilAmpel stand={portalAmpel("eingeladen")} />);
    const ampel = screen.getByRole("img");
    expect(ampel).toHaveAttribute("aria-label", portalAmpel("eingeladen").satz);
    expect(ampel.textContent).toBe("eingeladen");
  });

  it("steht eingeklappt in der Kopfzeile", () => {
    render(<KundenprofilStammdaten name="Max" abschnitte={[{ schluessel: "portal", titel: "Kundenportal", ampel: portalAmpel("aktiv"), inhalt: <p>Inhalt</p> }]} />);
    expect(screen.queryByText("Inhalt")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: portalAmpel("aktiv").satz })).toBeInTheDocument();
  });
});

describe("Eingeklappt merken", () => {
  it("startet eingeklappt und klappt per Klick auf", () => {
    render(<KundenprofilStammdaten name="Max" abschnitte={[{ schluessel: "qualifizierung", titel: "Qualifizierungsfragen", hinweis: "4 von 4 beantwortet", inhalt: <p>Fragen</p> }]} />);
    const kopf = screen.getByRole("button", { name: /Qualifizierungsfragen/ });
    expect(kopf).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("4 von 4 beantwortet")).toBeInTheDocument();
    fireEvent.click(kopf);
    expect(kopf).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Fragen")).toBeInTheDocument();
  });

  it("liest nur echte Wahrheitswerte", () => {
    expect(leseOffeneAbschnitte({ lead: true, portal: false, kaputt: "ja" })).toEqual({ lead: true, portal: false });
    expect(leseOffeneAbschnitte(null)).toEqual({});
    expect(leseOffeneAbschnitte([true])).toEqual({});
  });

  it("merkt sich den Zustand je Nutzer und schreibt nur den geänderten Schlüssel", () => {
    const { result } = renderHook(() => useProfilAbschnitte());
    expect(result.current.istOffen("lead")).toBe(true);
    expect(result.current.istOffen("portal")).toBe(false);
    expect(result.current.istOffen("unbekannt")).toBe(false);
    act(() => result.current.umschalten("portal"));
    expect(result.current.istOffen("portal")).toBe(true);
    expect(patchSpy).toHaveBeenCalledWith(PROFIL_ABSCHNITTE_SCHLUESSEL, { portal: true });
  });

  it("zählt die beantworteten Qualifizierungsfragen", () => {
    expect(qualifizierungHinweis({ qualZiel: "Rente", qualEinkommen: "3000", qualEigenkapital: "", qualBeruflicheSituation: undefined })).toBe("2 von 4 beantwortet");
  });
});

describe("Lead-Score als Ring", () => {
  it("verläuft von Rot nach Grün über die Tokens", () => {
    expect(leadScoreFarbe(5)).toBe("hsl(var(--destructive))");
    expect(leadScoreFarbe(95)).toBe("hsl(var(--success))");
    expect(leadScoreFarbe(50)).toContain("--brand-orange");
    expect(leadScoreFarbe(50)).toContain("--fortschritt-aktiv");
  });

  it("gibt den Stufen Wörter", () => {
    expect(LEAD_SCORE_STUFENWORT).toEqual({ A: "heiß", B: "warm", C: "kühl", D: "kalt" });
  });

  it("nennt das Kriterium mit den meisten fehlenden Punkten", () => {
    const tipp = leadScoreTipp({ total: 50, klasse: "C", klasseLabel: "", hasSA: true, breakdown: [
      { key: "a", label: "Haushaltsnetto", score: 10, max: 30 },
      { key: "b", label: "Schuldenquote", score: 9, max: 10 },
    ] });
    expect(tipp).toContain("Haushaltsnetto");
  });

  it("zeigt ohne Selbstauskunft „offen“", () => {
    render(<KundenprofilLeadScore saData={null} />);
    expect(screen.getByRole("img", { name: /Lead-Score offen/ })).toBeInTheDocument();
    expect(screen.getByText("offen")).toBeInTheDocument();
  });

  it("nennt Zahl und Stufe im aria-label, nicht nur über die Farbe", () => {
    render(<KundenprofilLeadScore saData={{ vorname: "Max", nachname: "M", einkommen: { netto: 2600 } }} />);
    const ring = screen.getByRole("button", { name: /^Lead-Score \d+ von 100, Stufe [A-D], / });
    expect(ring).toBeInTheDocument();
  });
});

describe("Angaben aus Rechnern und Gesprächen", () => {
  it("blendet Quellen ohne Daten aus und gibt je Investment eine KI-Zeile", () => {
    const quellen = baueRechnerQuellen({
      meta: { analyseScore: 72, analyseSnapshot: { erfasstAm: "2026-10-09T10:00:00Z" } },
      ki: [
        { investmentId: "i2", nummer: 2, text: "Zweites", stand: "2026-10-15T10:00:00Z" },
        { investmentId: "i1", nummer: 1, text: "Erstes" },
        { investmentId: "i3", nummer: 3, text: "  " },
      ],
    });
    expect(quellen.map((q) => q.schluessel)).toEqual(["analyse", "ki-i1", "ki-i2"]);
    expect(quellen[0]).toMatchObject({ titel: "Analyse-Tool", kern: "72 Punkte", datum: "09.10." });
  });

  it("ohne irgendeine Angabe gibt es keine Zeile", () => {
    expect(baueRechnerQuellen({ meta: {} })).toEqual([]);
  });
});

describe("Reiter Stammdaten aufgelöst", () => {
  it("keine Rolle hat noch einen Reiter Stammdaten", () => {
    for (const rolle of ["admin", "vertriebspartner", "setterin", "finanzierungspartner", "buchhaltung", "versicherungsexperte"]) {
      expect(baueReiter(rolle, []).map((r) => r.key)).not.toContain("stammdaten");
      expect(istErlaubterReiter("stammdaten", rolle)).toBe(false);
    }
  });

  it("Investments ist der Startreiter, der Versicherungsexperte startet bei den Dokumenten", () => {
    expect(standardReiter("vertriebspartner")).toBe("investments");
    expect(standardReiter("setterin")).toBe("investments");
    expect(standardReiter("versicherungsexperte")).toBe("dokumente");
    for (const rolle of ["admin", "setterin", "versicherungsexperte", "finanzierungspartner"]) {
      expect(istErlaubterReiter(standardReiter(rolle), rolle)).toBe(true);
    }
  });

  it("alte Adressen mit ?tab=stammdaten landen auf dem Startreiter", () => {
    expect(leseReiterAusAdresse("stammdaten")).toEqual({ tab: null, investment: null, verlauf: null });
  });

  it("alle Angaben links stehen untereinander, Bezeichnung über dem Wert", () => {
    const css = readFileSync(resolve(process.cwd(), "src/components/kunden/profil/kundenprofil.css"), "utf8");
    const regeln = css.match(/\.kundenprofil-felder > div \{[^}]*\}/g) || [];
    expect(regeln.length).toBeGreaterThan(0);
    for (const r of regeln) if (r.includes("grid-template-columns")) expect(r).toContain("grid-template-columns: minmax(0, 1fr);");
  });

  it("die Seite springt nirgends mehr in den Reiter Stammdaten", () => {
    const profil = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");
    expect(profil).not.toMatch(/["']stammdaten["']/);
    expect(profil).not.toContain("renderStammdaten");
    expect(profil).not.toContain("Alle Stammdaten");
  });
});
