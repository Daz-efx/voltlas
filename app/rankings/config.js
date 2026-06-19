// app/rankings/config.js
// Programmatic ranking pages, generated from public/data/latest.json.
// Each entry becomes /rankings/<slug>. Imported by the page and the sitemap.

export const RANKINGS = [
  {
    slug: "electricity-prices-by-country",
    h1: "Electricity prices by country",
    title: "Electricity prices by country",
    lede: "Household electricity prices ranked across every country Voltlas tracks — in US dollars per kilowatt-hour, all taxes included, from free official sources.",
    source: "country", scope: "all", metric: "elecRes", order: "desc", kind: "energy",
  },
  {
    slug: "cheapest-electricity-in-europe",
    h1: "Cheapest electricity in Europe",
    title: "Cheapest electricity in Europe",
    lede: "European countries ranked from cheapest to most expensive household electricity — in US dollars per kilowatt-hour, all taxes included.",
    source: "country", scope: "europe", metric: "elecRes", order: "asc", kind: "energy",
  },
  {
    slug: "most-expensive-electricity-in-europe",
    h1: "Most expensive electricity in Europe",
    title: "Most expensive electricity in Europe",
    lede: "European countries ranked from most to least expensive household electricity — in US dollars per kilowatt-hour, all taxes included.",
    source: "country", scope: "europe", metric: "elecRes", order: "desc", kind: "energy",
  },
  {
    slug: "natural-gas-prices-by-country",
    h1: "Natural gas prices by country",
    title: "Natural gas prices by country",
    lede: "Household natural gas prices ranked by country — in US dollars per kilowatt-hour, all taxes included, from free official sources.",
    source: "country", scope: "all", metric: "gasRes", order: "desc", kind: "energy",
  },
  {
    slug: "cheapest-natural-gas-in-europe",
    h1: "Cheapest natural gas in Europe",
    title: "Cheapest natural gas in Europe",
    lede: "European countries ranked from cheapest to most expensive household natural gas — in US dollars per kilowatt-hour, all taxes included.",
    source: "country", scope: "europe", metric: "gasRes", order: "asc", kind: "energy",
  },
  {
    slug: "us-electricity-prices-by-state",
    h1: "US electricity prices by state",
    title: "US electricity prices by state",
    lede: "US states ranked by residential electricity price — in US dollars per kilowatt-hour, from the EIA.",
    source: "us-elec-state", metric: "elecRes", order: "desc", kind: "energy",
  },
  {
    slug: "us-gas-prices-by-state",
    h1: "US gas prices by state",
    title: "US gas prices by state",
    lede: "US states ranked by retail gasoline price — shown per gallon and per litre, from the EIA's weekly survey.",
    source: "us-fuel-state", metric: "petrol", order: "desc", kind: "fuel",
  },
];
