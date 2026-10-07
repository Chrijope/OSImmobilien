import { useTranslation } from "react-i18next";
import { TrendingUp, Wallet } from "lucide-react";
import { extractAusgaben, extractEinkuenfte } from "@/lib/finanzierbarkeitUtils";
import { portalSprache } from "@/i18n/portalSprache";
import { euroText } from "@/lib/sprachFormat";

/**
 * Einnahmen und Ausgaben aus der Selbstauskunft, aufgeschluesselt.
 *
 * Stand frueher auf der Portal-Startseite, dort einmal je Investment
 * untereinander. Der Kunde las damit auf der Uebersicht Zahlenkolonnen zu
 * Kaeufen, um die es gerade gar nicht ging. Die Angaben gehoeren zu genau
 * einem Kauf, deshalb stehen sie jetzt beim jeweiligen Investment
 * (Entscheidung Christian, 10.09.2026).
 *
 * Die Extraktion kommt aus finanzierbarkeitUtils, also exakt dieselben Werte
 * wie im Kundenprofil und in der Finanzierbarkeits-Karte.
 */
interface Props {
  /** Die Selbstauskunft dieses Investments, sonst null. */
  saData: Record<string, any> | null | undefined;
}

/** Eurobetrag mit Cent in der Anzeigesprache. */
const fmt = (v: number) => euroText(v, portalSprache(), 2);

export function EinnahmenAusgabenKarten({ saData }: Props) {
  const { t } = useTranslation();
  if (!saData) return null;

  const summiere = (
    a: Record<string, number>,
    b: Record<string, number> | null,
  ): Record<string, number> =>
    b ? Object.fromEntries(Object.keys(a).map((k) => [k, (a[k] || 0) + (b[k] || 0)])) : a;

  const p2 = saData.person2Data;
  const einnahmenValues = summiere(extractEinkuenfte(saData), p2 ? extractEinkuenfte(p2) : null);
  const ausgabenValues = summiere(extractAusgaben(saData), p2 ? extractAusgaben(p2) : null);
  const einnahmenGesamt = Object.values(einnahmenValues).reduce((a, b) => a + b, 0);
  const ausgabenGesamt = Object.values(ausgabenValues).reduce((a, b) => a + b, 0);
  if (einnahmenGesamt <= 0 && ausgabenGesamt <= 0) return null;

  const einnahmenZeilen: { key: string; value: number }[] = [
    { key: "salary", value: einnahmenValues.gehalt },
    { key: "selfemployed", value: einnahmenValues.selbstaendig },
    { key: "pension", value: einnahmenValues.renten },
    { key: "rental", value: einnahmenValues.mieteinnahmen },
    { key: "interest", value: einnahmenValues.zinsen },
    { key: "kindergeld", value: einnahmenValues.kindergeld },
    { key: "other", value: einnahmenValues.sonstige },
  ];
  const ausgabenZeilen: { key: string; value: number }[] = [
    { key: "rent", value: ausgabenValues.miete },
    { key: "utilities", value: ausgabenValues.nebenkosten },
    { key: "living", value: ausgabenValues.lebenshaltung },
    { key: "health_insurance", value: ausgabenValues.privateKV },
    { key: "car_costs", value: ausgabenValues.kfzKosten },
    { key: "mortgage", value: ausgabenValues.zinsTilgung },
    { key: "car_loan", value: ausgabenValues.autokredite },
    { key: "personal_loan", value: ausgabenValues.privatkredite },
    { key: "other_loans", value: ausgabenValues.sonstigeKredite },
    { key: "alimony", value: ausgabenValues.unterhalt },
    { key: "guarantees", value: ausgabenValues.buergschaften },
    { key: "insurance", value: ausgabenValues.versicherungen },
    { key: "other", value: ausgabenValues.sonstige },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="portal-card p-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-[hsl(var(--success))]" /> {t("portal.stammdaten.income_title")}
        </h2>
        <div className="space-y-2 text-sm">
          {einnahmenZeilen.filter((z) => z.value > 0).map((z) => (
            <div key={z.key} className="flex justify-between">
              <span className="text-muted-foreground">{t(`portal.stammdaten.income.${z.key}`)}</span>
              <span className="font-medium">{fmt(z.value)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>{t("portal.stammdaten.income.total")}</span>
            <span className="text-[hsl(var(--success))]">{fmt(einnahmenGesamt)}</span>
          </div>
        </div>
      </div>

      <div className="portal-card p-6">
        <h2 className="font-bold text-lg mb-4 flex items-center gap-2">
          <Wallet className="h-5 w-5 text-destructive" /> {t("portal.stammdaten.expenses_title")}
        </h2>
        <div className="space-y-2 text-sm">
          {ausgabenZeilen.filter((z) => z.value > 0).map((z) => (
            <div key={z.key} className="flex justify-between">
              <span className="text-muted-foreground">{t(`portal.stammdaten.expenses.${z.key}`)}</span>
              <span className="font-medium">{fmt(z.value)}</span>
            </div>
          ))}
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>{t("portal.stammdaten.expenses.total")}</span>
            <span className="text-destructive">{fmt(ausgabenGesamt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
