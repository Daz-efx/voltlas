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

  // --- Fuel rankings (EC Weekly Oil Bulletin for the EU + EIA for the US) ---
  {
    slug: "cheapest-petrol-in-europe",
    h1: "Cheapest gasoline in Europe",
    title: "Cheapest gasoline in Europe",
    lede: "European countries ranked from cheapest to most expensive gasoline (Euro-95) at the pump — in US dollars per litre, all taxes included, from the EC Weekly Oil Bulletin.",
    source: "fuel-country", scope: "europe", metric: "petrol", order: "asc", kind: "fuel", unit: "L",
  },
  {
    slug: "most-expensive-petrol-in-europe",
    h1: "Most expensive gasoline in Europe",
    title: "Most expensive gasoline in Europe",
    lede: "European countries ranked from most to least expensive gasoline (Euro-95) at the pump — in US dollars per litre, all taxes included, from the EC Weekly Oil Bulletin.",
    source: "fuel-country", scope: "europe", metric: "petrol", order: "desc", kind: "fuel", unit: "L",
  },
  {
    slug: "cheapest-diesel-in-europe",
    h1: "Cheapest diesel in Europe",
    title: "Cheapest diesel in Europe",
    lede: "European countries ranked from cheapest to most expensive automotive diesel at the pump — in US dollars per litre, all taxes included, from the EC Weekly Oil Bulletin.",
    source: "fuel-country", scope: "europe", metric: "diesel", order: "asc", kind: "fuel", unit: "L",
  },
  {
    slug: "most-expensive-diesel-in-europe",
    h1: "Most expensive diesel in Europe",
    title: "Most expensive diesel in Europe",
    lede: "European countries ranked from most to least expensive automotive diesel at the pump — in US dollars per litre, all taxes included, from the EC Weekly Oil Bulletin.",
    source: "fuel-country", scope: "europe", metric: "diesel", order: "desc", kind: "fuel", unit: "L",
  },
  {
    slug: "petrol-prices-by-country",
    h1: "Gasoline prices by country",
    title: "Gasoline prices by country",
    lede: "Pump prices for gasoline (Euro-95) ranked across every country Voltlas tracks — in US dollars per litre, all taxes included, from free official sources.",
    source: "fuel-country", scope: "all", metric: "petrol", order: "desc", kind: "fuel", unit: "L",
  },
  {
    slug: "diesel-prices-by-country",
    h1: "Diesel prices by country",
    title: "Diesel prices by country",
    lede: "Pump prices for automotive diesel ranked across every country Voltlas tracks — in US dollars per litre, all taxes included, from free official sources.",
    source: "fuel-country", scope: "all", metric: "diesel", order: "desc", kind: "fuel", unit: "L",
  },
];
