// scripts/test-cnstr-params.mjs
// One-off experiment: does ti_id=ALL filter PRC_CNSTR to interties only?
import { fetchOasisReport } from '../lib/oasis-client.mjs';

const now = new Date();
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

const variants = [
  { label: 'WITH ti_id=ALL (current)', params: { market_run_id: 'DAM', ti_id: 'ALL' } },
  { label: 'WITHOUT ti_id',            params: { market_run_id: 'DAM' } },
];

for (const v of variants) {
  try {
    const rows = await fetchOasisReport('PRC_CNSTR', v.params, start, end);
    const ids = [...new Set(rows.map((r) => r.TI_ID))];
    console.log(`\n${v.label}: ${rows.length} rows, ${ids.length} distinct constraints`);
    console.log(`  Headers: ${rows.length ? Object.keys(rows[0]).join(', ') : 'n/a'}`);
    console.log(`  Sample IDs: ${ids.slice(0, 12).join(', ')}`);
  } catch (err) {
    console.log(`\n${v.label}: FAILED — ${err.message.slice(0, 300)}`);
  }
  // Be polite to the rate limiter between calls
  await new Promise((r) => setTimeout(r, 20_000));
}
