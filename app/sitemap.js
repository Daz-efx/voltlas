// app/sitemap.js — generates /sitemap.xml: dashboard, about, ranking pages, comparison pages, country pages.
import fs from "node:fs";
import path from "node:path";
import { RANKINGS } from "./rankings/config";
import { COMPARISONS } from "./compare/config";
const SITE = "https://voltlas.com";
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
export default function sitemap() {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let registry = { constraints: {} };
  try {
    registry = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "caiso", "constraint-registry.json"), "utf8"));
  } catch {}
  const now = new Date();
  const countries = data.DATA.filter((c) => c.elecRes != null).map((c) => ({
    url: `${SITE}/country/${slugify(c.geo)}`, lastModified: now, changeFrequency: "monthly", priority: 0.7,
  }));
  const rankings = RANKINGS.map((r) => ({
    url: `${SITE}/rankings/${r.slug}`, lastModified: now, changeFrequency: "weekly", priority: 0.8,
  }));
  const comparisons = COMPARISONS.map(([a, b]) => ({
    url: `${SITE}/compare/${slugify(a)}-vs-${slugify(b)}`, lastModified: now, changeFrequency: "weekly", priority: 0.7,
  }));
  const commodities = (data.COMMODITIES || []).map((c) => ({
    url: `${SITE}/commodity/${slugify(c.name)}`, lastModified: now, changeFrequency: "weekly", priority: 0.8,
  }));
  return [
    { url: SITE, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE}/data`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE}/electricity-bill-calculator`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE}/congestion/caiso`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/congestion/caiso/constraint`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/congestion/caiso/most-congested`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...Object.keys(registry.constraints || {}).map((slug) => ({
      url: `${SITE}/congestion/caiso/constraint/${slug}`, lastModified: now, changeFrequency: "daily", priority: 0.6,
    })),
    { url: `${SITE}/congestion/caiso`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${SITE}/congestion/caiso/constraint`, lastModified: now, changeFrequency: "daily", priority: 0.7 },
    { url: `${SITE}/congestion/caiso/most-congested`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    ...Object.keys(registry.constraints || {}).map((slug) => ({
      url: `${SITE}/congestion/caiso/constraint/${slug}`, lastModified: now, changeFrequency: "daily", priority: 0.6,
    })),
    ...rankings, ...comparisons, ...commodities, ...countries,
  ];
}
