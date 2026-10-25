// Library example: run with `pnpm build && node examples/library.mjs`.
import { checkDeterminism, formatReport, runRepeatedly } from '../dist/index.js';

// 1. Compare answers you already have.
const saved = [
  { income: 4250, expenses: 1873.42 },
  { expenses: 1873.42, income: 4250.0 },
];
console.log(formatReport(checkDeterminism(saved)));

// 2. Run a task several times. Replace `askAgent` with a call to your own agent or MCP client.
let calls = 0;
function askAgent() {
  calls += 1;
  // Simulates an agent whose third answer drifts by one cent.
  return Promise.resolve({ net: calls === 3 ? 2376.59 : 2376.58, sourceRows: [1, 2, 4] });
}

const report = await runRepeatedly(askAgent, { runs: 3 });
console.log(formatReport(report));

// 3. The same runs, allowing a one-cent tolerance.
calls = 0;
const tolerant = await runRepeatedly(askAgent, { runs: 3, tolerance: 0.01 });
console.log(formatReport(tolerant));
