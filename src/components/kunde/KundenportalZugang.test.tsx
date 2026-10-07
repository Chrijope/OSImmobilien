import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KundenportalZugang, type KundenportalZugangAngaben } from "./KundenportalZugang";
import { KundenprofilStammdaten } from "@/components/kunden/profil/KundenprofilStammdaten";

/**
 * Der Kundenportal-Block steht seit dem 23.09.2026 an zwei Stellen: im
 * Investment unter „Bonität und Bankprüfung“ und im Kundenprofil unter den
 * Kontaktdaten. Geprüft wird der Baustein selbst und, am Quelltext, dass
 * beide Stellen dasselbe Bündel aus Handlern und Rechten bekommen.
 */

const angaben = (over: Partial<KundenportalZugangAngaben> = {}): KundenportalZugangAngaben => ({
  status: "aktiv",
  freigeschaltetAm: "2026-09-12T12:03:00Z",
  gesperrtAm: null,
  einladungErneutAm: null,
  person2Email: null,
  person2Eingeladen: false,
  darfVerwalten: true,
  darfZweiFaktorZuruecksetzen: true,
  einladungGesendet: false,
  zweiFaktorLaeuft: false,
  onPerson2Einladen: vi.fn(),
  onEinladungErneut: vi.fn(),
  onZweiFaktorZuruecksetzen: vi.fn(),
  onSperren: vi.fn(),
  onEntsperren: vi.fn(),
  ...over,
});

describe("Kundenportal im Kundenprofil", () => {
  it("zeigt Status und Datum der Freischaltung", () => {
    render(<KundenportalZugang {...angaben()} darstellung="profil" />);
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.getByText(/freigeschaltet am 12\.09\.2026 um \d{2}:\d{2} Uhr/)).toBeInTheDocument();
  });

  it("zeigt bei gesperrtem Portal das Sperrdatum und den Knopf zum Entsperren", () => {
    const a = angaben({ status: "gesperrt", gesperrtAm: "2026-09-20T08:15:00Z" });
    render(<KundenportalZugang {...a} darstellung="profil" />);
    expect(screen.getByText("Gesperrt")).toBeInTheDocument();
    expect(screen.getByText(/Gesperrt am 20\.09\.2026 um \d{2}:\d{2} Uhr/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Portal entsperren/ }));
    expect(a.onEntsperren).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /Portal sperren/ })).not.toBeInTheDocument();
  });

  it("nennt ohne Freischaltung den Status und verweist aufs Investment", () => {
    render(<KundenportalZugang {...angaben({ status: "none", freigeschaltetAm: null })} darstellung="profil" />);
    expect(screen.getByText("Nicht freigeschaltet")).toBeInTheDocument();
    expect(screen.getByText(/im Investment unter „Bonität und Bankprüfung“/)).toBeInTheDocument();
    // Freigeschaltet wird nur im Investment, im Profil gibt es keinen Knopf dafür.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("wiederholt die Überschrift nicht in der Statuszeile", () => {
    render(<KundenportalZugang {...angaben()} darstellung="profil" />);
    expect(screen.queryByText("Kundenportal")).not.toBeInTheDocument();
  });
});

describe("Die drei Aktionen", () => {
  it("rufen die übergebenen Handler", () => {
    const a = angaben();
    render(<KundenportalZugang {...a} darstellung="profil" />);
    fireEvent.click(screen.getByRole("button", { name: /Einladung erneut versenden/ }));
    fireEvent.click(screen.getByRole("button", { name: /Zwei-Faktor zurücksetzen/ }));
    fireEvent.click(screen.getByRole("button", { name: /Portal sperren/ }));
    expect(a.onEinladungErneut).toHaveBeenCalledTimes(1);
    expect(a.onZweiFaktorZuruecksetzen).toHaveBeenCalledTimes(1);
    expect(a.onSperren).toHaveBeenCalledTimes(1);
  });

  it("sperrt den Sperrknopf, solange die Datenbank noch nicht geantwortet hat", () => {
    const a = angaben({ sperreLaeuft: true });
    render(<KundenportalZugang {...a} darstellung="profil" />);
    const knopf = screen.getByRole("button", { name: /Wird gespeichert/ });
    expect(knopf).toBeDisabled();
    fireEvent.click(knopf);
    expect(a.onSperren).not.toHaveBeenCalled();
  });

  it("im Investment kommt nur das Freischalten dazu", () => {
    const onFreischalten = vi.fn();
    render(<KundenportalZugang {...angaben({ status: "none", freigeschaltetAm: null })} onFreischalten={onFreischalten} />);
    fireEvent.click(screen.getByRole("button", { name: /Portal freischalten/ }));
    expect(onFreischalten).toHaveBeenCalledTimes(1);
  });
});

describe("Rechte", () => {
  it("ohne Berechtigung keine Knöpfe, der Status bleibt sichtbar", () => {
    render(<KundenportalZugang {...angaben({ darfVerwalten: false, darfZweiFaktorZuruecksetzen: false, person2Email: "p2@example.org" })} darstellung="profil" />);
    expect(screen.getByText("Aktiv")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("ohne Berechtigung auch kein Hinweis aufs Freischalten", () => {
    render(<KundenportalZugang {...angaben({ status: "none", freigeschaltetAm: null, darfVerwalten: false })} darstellung="profil" />);
    expect(screen.getByText("Nicht freigeschaltet")).toBeInTheDocument();
    expect(screen.queryByText(/Freischalten kannst du/)).not.toBeInTheDocument();
  });

  it("Zwei-Faktor nur für Admin und Inhaber, die übrigen Knöpfe bleiben", () => {
    render(<KundenportalZugang {...angaben({ darfZweiFaktorZuruecksetzen: false })} darstellung="profil" />);
    expect(screen.queryByRole("button", { name: /Zwei-Faktor/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Einladung erneut versenden/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Portal sperren/ })).toBeInTheDocument();
  });
});

describe("Überschriften der linken Spalte", () => {
  it("Kundenportal sieht aus wie Kontaktdaten", () => {
    render(
      <KundenprofilStammdaten
        name="Kambiz Zangeneh"
        anrede="Herr"
        felder={[{ label: "E-Mail", wert: "kambiz@example.org" }]}
        onWeitereFelder={() => {}}
        portal={<KundenportalZugang {...angaben()} darstellung="profil" />}
      />,
    );
    const kontaktdaten = screen.getByRole("heading", { level: 3, name: "Kontaktdaten" });
    const portal = screen.getByRole("heading", { level: 3, name: "Kundenportal" });
    expect(portal.className).toBe(kontaktdaten.className);
    // Das Portal steht unter den Kontaktdaten, nicht darüber.
    expect(kontaktdaten.compareDocumentPosition(portal) & 4).toBeTruthy();
  });
});

describe("Verdrahtung im Kundenprofil", () => {
  const profil = readFileSync(resolve(process.cwd(), "src/pages/KundenDetail.tsx"), "utf8");

  it("Investment und Profil bekommen dasselbe Bündel", () => {
    expect(profil.match(/<KundenportalZugang\s+\{\.\.\.kundenportalAngaben\}/g)).toHaveLength(2);
    expect(profil).toContain('portal={<KundenportalZugang {...kundenportalAngaben} darstellung="profil" />}');
  });

  it("das Bündel trägt die Handler und Rechte aus dem Investment", () => {
    expect(profil).toContain("onEinladungErneut: handleResendPortalInvite,");
    expect(profil).toContain("onZweiFaktorZuruecksetzen: handleMfaZuruecksetzen,");
    expect(profil).toContain("onSperren: handlePortalSperren,");
    expect(profil).toContain("onEntsperren: handlePortalEntsperren,");
    expect(profil).toContain("darfVerwalten: darfKundenportalVerwalten,");
    expect(profil).toContain("darfZweiFaktorZuruecksetzen: isAdminOrInhaber,");
    expect(profil).toContain("const darfKundenportalVerwalten = canManageCustomerPortal && !isFinanzierer && !isSetterinRole;");
  });

  it("Sperren und Entsperren warten auf den Server und laufen über die Edge Function", () => {
    expect(profil).toContain("const erfolgreich = await schaltePortalSperre(gesperrt, {");
    // Seit dem 23.09.2026 nicht mehr über merge_kontakt_meta, sondern über
    // `kundenportal-sperre`, die das Recht prüft und die Anmeldung sperrt.
    expect(profil).toContain("const ergebnis = await portalSperreAmServer(id!, sperren);");
    expect(profil).not.toContain("mergeKontaktMetaMitGrund(id!, updates)");
    expect(profil).toContain("sperreLaeuft: portalSperreLaeuft,");
  });

  it("im Investment steht der Block nur für Berechtigte", () => {
    expect(profil).toContain("{darfKundenportalVerwalten && (");
  });
});
