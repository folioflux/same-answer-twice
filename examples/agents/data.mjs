// A tiny synthetic ledger used by the example agents. Not real data.
export const rows = [
  { row: 1, date: '2026-01-02', description: 'Client payment A', amount: 2500.0 },
  { row: 2, date: '2026-01-05', description: 'Office rent', amount: -950.0 },
  { row: 3, date: '2026-01-09', description: 'Software licence', amount: -49.99 },
  { row: 4, date: '2026-01-15', description: 'Client payment B', amount: 1750.0 },
  { row: 5, date: '2026-01-20', description: 'Train tickets', amount: -86.3 },
  { row: 6, date: '2026-01-28', description: 'Bank fee', amount: -12.5 },
];

/** Sums amounts in integer cents so the result does not depend on addition order. */
export function sumCents(amounts) {
  return amounts.reduce((total, amount) => total + Math.round(amount * 100), 0) / 100;
}
