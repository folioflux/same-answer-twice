// A stand-in for a non-deterministic agent. On even runs it "forgets" one row, the kind of
// silent drift that same-answer-twice is meant to catch.
import { rows, sumCents } from './data.mjs';

const run = Number(process.env.SAME_ANSWER_TWICE_RUN ?? '1');
const used = run % 2 === 0 ? rows.filter((r) => r.row !== 3) : rows;

const answer = {
  period: '2026-01',
  income: sumCents(used.filter((r) => r.amount > 0).map((r) => r.amount)),
  expenses: -sumCents(used.filter((r) => r.amount < 0).map((r) => r.amount)),
  net: sumCents(used.map((r) => r.amount)),
  sourceRows: used.map((r) => r.row),
};

process.stdout.write(`${JSON.stringify(answer)}\n`);
