// lib/oasis-client.mjs
// Shared client for CAISO OASIS SingleZip API.
// No auth required. Responses are ZIP files containing CSV (resultformat=6)
// or an XML error payload when the query fails.

import AdmZip from 'adm-zip';

const BASE = 'https://oasis.caiso.com/oasisapi/SingleZip';

/**
 * Format a Date as OASIS datetime: YYYYMMDDTHH:MM-0000 (UTC).
 */
export function oasisDate(d) {
  const iso = d.toISOString(); // 2026-07-08T14:30:00.000Z
  return (
    iso.slice(0, 4) + iso.slice(5, 7) + iso.slice(8, 10) +
    'T' + iso.slice(11, 16) + '-0000'
  );
}

/**
 * Fetch an OASIS report and return parsed CSV rows as objects.
 *
 * @param {string} queryname     e.g. 'PRC_CNSTR', 'TRNS_OUTAGE'
 * @param {object} params        additional query params (market_run_id, ti_id, etc.)
 * @param {Date}   start
 * @param {Date}   end
 * @returns {Promise<object[]>}  array of row objects keyed by CSV header
 */
export async function fetchOasisReport(queryname, params, start, end) {
  const qs = new URLSearchParams({
    queryname,
    startdatetime: oasisDate(start),
    enddatetime: oasisDate(end),
    resultformat: '6', // CSV
    version: params.version ?? '1',
    ...params,
  });
  delete params.version;

  const url = `${BASE}?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'voltlas.com data pipeline (contact: site owner)' },
  });

  if (!res.ok) {
    throw new Error(`OASIS HTTP ${res.status} for ${queryname}: ${url}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries();

  // OASIS returns an XML error file inside the zip on bad queries —
  // detect that before assuming success.
  const xmlEntry = entries.find((e) => e.entryName.toLowerCase().endsWith('.xml'));
  const csvEntry = entries.find((e) => e.entryName.toLowerCase().endsWith('.csv'));

  if (!csvEntry) {
    const errText = xmlEntry ? xmlEntry.getData().toString('utf8') : '(no payload)';
    const errMatch = errText.match(/<ERR_DESC>(.*?)<\/ERR_DESC>/s);
    throw new Error(
      `OASIS error for ${queryname}: ${errMatch ? errMatch[1].trim() : errText.slice(0, 500)}`
    );
  }

  return parseCsv(csvEntry.getData().toString('utf8'));
}

/**
 * Minimal CSV parser for OASIS output.
 * OASIS CSVs are simple: comma-delimited, first row headers,
 * fields may be quoted. Handles quoted fields containing commas.
 */
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toUpperCase());
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
    return row;
  });
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/**
 * Retry wrapper with exponential backoff — OASIS occasionally
 * returns transient 5xx or empty responses under load.
 */
export async function withRetry(fn, { attempts = 3, baseDelayMs = 15000 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        const delay = baseDelayMs * Math.pow(2, i);
        console.warn(`Attempt ${i + 1} failed (${err.message}), retrying in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}
