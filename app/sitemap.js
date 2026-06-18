// app/sitemap.js — generates /sitemap.xml listing the dashboard + every country page.
import fs from "node:fs";
import path from "node:path";

const SITE = "https://voltlas.com"; // confirm/update when you point the domain
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function sitemap() {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  const countries = data.DATA.filter((c) => c.elecRes != null).map((c) => ({
    url: `${SITE}/country/${slugify(c.geo)}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 0.7,
  }));
  return [{ url: SITE, lastModified: new Date(), changeFrequency: "weekly", priority: 1 }, ...countries];
}
