import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Eigenfinanzierung: mehrere Darlehensvertraege, ein Finanzierungsangebot.
 *
 * Christian am 21.09.2026: Ein Kunde kann mehr als einen Darlehensvertrag
 * haben, etwa zwei Darlehen oder eine nachgereichte Fassung. Das
 * Finanzierungsangebot bleibt bei genau einem, am Ende gibt es nur eine
 * Bankzusage.
 *
 * Geprueft wird dreierlei:
 *  - mehrere Vertraege stehen nebeneinander, das Angebot bleibt einzeln,
 *  - ein Altbestand, der nur im frueheren Einzelfeld liegt, bleibt sichtbar,
 *  - die Freigabe der Pipeline greift weiterhin, ein Vertrag genuegt.
 */

const INV_MEHRERE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const INV_ALTBESTAND = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const INV_NUR_ANGEBOT = "cccccccc-cccc-cccc-cccc-cccccccccccc";

const angebot = (name: string, pfad: string) => ({
  fileName: name,
  storagePath: pfad,
  uploadedAt: "2026-09-18T09:00:00.000Z",
  uploadedByName: "Otto Hans",
  uploadedByRole: "kunde",
});

// Meta der Investments. Der Store liest und schreibt ausschliesslich hier.
let investmentMeta: Record<string, any> = {};

function setzeMetaZurueck() {
  investmentMeta = {
    [INV_MEHRERE]: {
      eigenfinanzierung: {
        aktiv: true,
        aktiviertVonName: "Christian Peetz",
        aktiviertAm: "2026-09-01T10:00:00.000Z",
        kundenAngebot: angebot("Bankzusage.pdf", "pfad/angebot.pdf"),
        kundenDarlehensvertraege: [
          angebot("Darlehen_Haupt.pdf", "pfad/dv-1.pdf"),
          angebot("Darlehen_KfW.pdf", "pfad/dv-2.pdf"),
        ],
        kundenDarlehensvertrag: angebot("Darlehen_KfW.pdf", "pfad/dv-2.pdf"),
      },
    },
    // Altbestand: nur das fruehere Einzelfeld, noch kein Array.
    [INV_ALTBESTAND]: {
      eigenfinanzierung: {
        aktiv: true,
        aktiviertVonName: "Christian Peetz",
        aktiviertAm: "2026-09-01T10:00:00.000Z",
        kundenAngebot: angebot("Bankzusage_alt.pdf", "pfad/angebot-alt.pdf"),
        kundenDarlehensvertrag: angebot("Darlehen_alt.pdf", "pfad/dv-alt.pdf"),
      },
    },
    [INV_NUR_ANGEBOT]: {
      eigenfinanzierung: {
        aktiv: true,
        aktiviertVonName: "Christian Peetz",
        aktiviertAm: "2026-09-01T10:00:00.000Z",
        kundenAngebot: angebot("Bankzusage.pdf", "pfad/angebot.pdf"),
      },
    },
  };
}

vi.mock("@/lib/dataCache", () => ({
  cacheGet: () => [],
  cacheInsert: vi.fn(),
  cacheUpdate: vi.fn(),
  cacheFilter: vi.fn(() => []),
}));

vi.mock("@/lib/dbStoreHelper", () => ({
  isTestAccount: () => false,
  localGet: (_schluessel: string, standard: unknown) => standard,
  localSet: vi.fn(),
}));

vi.mock("@/lib/investmentsStore", () => ({
  getInvestmentMeta: (investmentId: string, schluessel: string, standard: unknown) =>
    investmentMeta[investmentId]?.[schluessel] ?? standard,
  setInvestmentMeta: (investmentId: string, schluessel: string, wert: unknown) => {
    investmentMeta[investmentId] = { ...(investmentMeta[investmentId] || {}), [schluessel]: wert };
  },
  getInvestmentMetaField: (investmentId: string, schluessel: string, standard: unknown) =>
    investmentMeta[investmentId]?.[schluessel] ?? standard,
  setInvestmentMetaFields: (investmentId: string, updates: Record<string, unknown>) => {
    investmentMeta[investmentId] = { ...(investmentMeta[investmentId] || {}), ...updates };
  },
}));

vi.mock("@/contexts/UserContext", () => ({
  useUser: () => ({ user: { role: "admin", name: "Christian Peetz" } }),
}));

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/storage", () => ({ openUnterlage: vi.fn() }));
vi.mock("@/lib/aktivitaetenStore", () => ({ addAktivitaet: vi.fn() }));
vi.mock("@/lib/bellNotifications", () => ({
  notifyByRole: vi.fn(),
  notifyKunde: vi.fn(),
  notifyUser: vi.fn(),
}));
vi.mock("@/lib/followUpStore", () => ({ addFollowUp: vi.fn() }));
vi.mock("@/lib/currentUser", () => ({ getCurrentUserId: () => "nutzer-1" }));
vi.mock("@/lib/confirm", () => ({ confirmDialog: vi.fn(async () => true) }));

import { EigenfinanzierungSection } from "@/components/finanzierung/EigenfinanzierungSection";
import {
  alleKundenDarlehensvertraege,
  fuegeKundenDarlehensvertragHinzu,
  entferneKundenDarlehensvertrag,
  getEigenfinanzierung,
} from "@/lib/eigenfinanzierungStore";

beforeEach(() => {
  vi.clearAllMocks();
  setzeMetaZurueck();
});

const bereich = (investmentId: string) => (
  <EigenfinanzierungSection investmentId={investmentId} kundeId="kontakt-otto-hans" kundeName="Otto Hans" />
);

describe("Eigenfinanzierung: mehrere Darlehensvertraege", () => {
  it("zeigt alle Darlehensvertraege nebeneinander, das Angebot bleibt einzeln", () => {
    render(bereich(INV_MEHRERE));

    expect(screen.getByText("Darlehen_Haupt.pdf")).toBeInTheDocument();
    expect(screen.getByText("Darlehen_KfW.pdf")).toBeInTheDocument();
    expect(screen.getByText("2 hochgeladen")).toBeInTheDocument();

    // Weiterer Vertrag moeglich, ein weiteres Angebot nicht.
    expect(screen.getByText("Weiteren Darlehensvertrag hinzufügen")).toBeInTheDocument();
    expect(screen.queryByText(/Finanzierungsangebot \(Bankzusage\) hochladen/)).not.toBeInTheDocument();
    expect(screen.getByText("Bankzusage.pdf")).toBeInTheDocument();
  });

  it("ein Altbestand ohne Liste bleibt sichtbar", () => {
    render(bereich(INV_ALTBESTAND));

    expect(screen.getByText("Darlehen_alt.pdf")).toBeInTheDocument();
    // Beide Kaesten melden „Hochgeladen": das Angebot und der Darlehensvertrag.
    expect(screen.getAllByText("Hochgeladen")).toHaveLength(2);
    expect(screen.queryByText("Ausstehend")).not.toBeInTheDocument();
  });

  it("Freigabe der Pipeline: ein Vertrag genuegt, ohne Vertrag bleibt der Knopf gesperrt", () => {
    const { unmount } = render(bereich(INV_ALTBESTAND));
    expect(screen.getByRole("button", { name: /Finanzierung bestätigen und weiter zum Notar/ })).not.toBeDisabled();
    unmount();

    render(bereich(INV_NUR_ANGEBOT));
    expect(screen.getByRole("button", { name: /Finanzierung bestätigen und weiter zum Notar/ })).toBeDisabled();
  });
});

describe("Eigenfinanzierungs-Store: Liste, Altbestand und Spiegel", () => {
  it("fuehrt Altbestand und Liste beim Lesen zusammen, ohne zu doppeln", () => {
    expect(
      alleKundenDarlehensvertraege(getEigenfinanzierung(INV_ALTBESTAND)).map((v) => v.fileName),
    ).toEqual(["Darlehen_alt.pdf"]);

    // Das Einzelfeld zeigt hier auf denselben Pfad wie der letzte Eintrag der
    // Liste. Es darf deshalb nicht ein zweites Mal auftauchen.
    expect(
      alleKundenDarlehensvertraege(getEigenfinanzierung(INV_MEHRERE)).map((v) => v.fileName),
    ).toEqual(["Darlehen_Haupt.pdf", "Darlehen_KfW.pdf"]);
  });

  it("haengt einen Vertrag an und spiegelt den zuletzt hochgeladenen in den Kundenordner", () => {
    fuegeKundenDarlehensvertragHinzu(INV_ALTBESTAND, angebot("Darlehen_neu.pdf", "pfad/dv-neu.pdf"));

    const stand = getEigenfinanzierung(INV_ALTBESTAND);
    expect(alleKundenDarlehensvertraege(stand).map((v) => v.fileName)).toEqual([
      "Darlehen_alt.pdf",
      "Darlehen_neu.pdf",
    ]);
    // Der Kundenordner hat fuer den Darlehensvertrag nur einen Platz.
    expect(investmentMeta[INV_ALTBESTAND].docFileUrls.Darlehensvertrag).toBe("pfad/dv-neu.pdf");
    expect(investmentMeta[INV_ALTBESTAND].docStatuses.Darlehensvertrag).toBe("signed");
  });

  it("entfernt einen Vertrag und zieht den Spiegel auf den verbliebenen nach", () => {
    fuegeKundenDarlehensvertragHinzu(INV_ALTBESTAND, angebot("Darlehen_neu.pdf", "pfad/dv-neu.pdf"));
    entferneKundenDarlehensvertrag(INV_ALTBESTAND, "pfad/dv-neu.pdf");

    const stand = getEigenfinanzierung(INV_ALTBESTAND);
    expect(alleKundenDarlehensvertraege(stand).map((v) => v.fileName)).toEqual(["Darlehen_alt.pdf"]);
    expect(investmentMeta[INV_ALTBESTAND].docFileUrls.Darlehensvertrag).toBe("pfad/dv-alt.pdf");
  });

  it("raeumt den Spiegel ab, wenn der letzte Vertrag geloescht wird", () => {
    fuegeKundenDarlehensvertragHinzu(INV_NUR_ANGEBOT, angebot("Darlehen.pdf", "pfad/dv.pdf"));
    entferneKundenDarlehensvertrag(INV_NUR_ANGEBOT, "pfad/dv.pdf");

    expect(alleKundenDarlehensvertraege(getEigenfinanzierung(INV_NUR_ANGEBOT))).toEqual([]);
    expect(investmentMeta[INV_NUR_ANGEBOT].docFileUrls.Darlehensvertrag).toBeUndefined();
    expect(investmentMeta[INV_NUR_ANGEBOT].docStatuses.Darlehensvertrag).toBeUndefined();
  });

  it("laesst einen fremden Spiegel aus der regulaeren Finanzierung stehen", () => {
    investmentMeta[INV_NUR_ANGEBOT].docFileUrls = { Darlehensvertrag: "finanzierung/regulaer.pdf" };
    investmentMeta[INV_NUR_ANGEBOT].docStatuses = { Darlehensvertrag: "signed" };
    investmentMeta[INV_NUR_ANGEBOT].eigenfinanzierung = {
      ...investmentMeta[INV_NUR_ANGEBOT].eigenfinanzierung,
      kundenDarlehensvertraege: [angebot("Darlehen.pdf", "pfad/dv.pdf")],
    };

    entferneKundenDarlehensvertrag(INV_NUR_ANGEBOT, "pfad/dv.pdf");

    expect(investmentMeta[INV_NUR_ANGEBOT].docFileUrls.Darlehensvertrag).toBe("finanzierung/regulaer.pdf");
  });
});
