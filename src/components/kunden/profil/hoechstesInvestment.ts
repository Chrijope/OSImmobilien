/** Die angezeigte Nummer entscheidet, unabhängig von Reihenfolge, Datum oder Stufe. */
export function hoechstesInvestment<T extends { nummer: number }>(investments: readonly T[]): T | undefined {
  return investments.reduce<T | undefined>((hoechstes, investment) =>
    !hoechstes || investment.nummer > hoechstes.nummer ? investment : hoechstes, undefined);
}

/** Ein geöffnetes Investment hat Vorrang vor der allgemeinen Zusammenfassung. */
export function investmentFuerNaechstenSchritt<T extends { id: string; nummer: number }>(investments: readonly T[], geoeffnetId?: string | null): T | undefined {
  return investments.find(investment => investment.id === geoeffnetId) ?? hoechstesInvestment(investments);
}
