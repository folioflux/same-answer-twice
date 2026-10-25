// A stand-in for a deterministic agent: it always computes the same totals the same way.
import { rows, sumCents } from './data.mjs';

const income = rows.filter((r) => r.amount > 0);
const expenses = rows.filter((r) => r.amount < 0);

const answer = {
  period: '2026-01',
  income: sumCents(income.map((r) => r.amount)),
  expenses: -sumCents(expenses.map((r) => r.amount)),
  net: sumCents(rows.map((r) => r.amount)),
  sourceRows: rows.map((r) => r.row),
  // A field that changes every run and should be ignored with --ignore-path.
  generatedAt: new Date().toISOString(),
};

process.stdout.write(`${JSON.stringify(answer)}\n`);
