// app/page.jsx — server component: reads the data file and passes it to the dashboard.
import fs from "node:fs";
import path from "node:path";
import Dashboard from "./components/Dashboard";

export const metadata = {
  title: "Voltlas — global energy, fuel & commodity prices",
  description: "What the world pays for electricity, gas, transport fuels and commodities, from free official sources.",
   robots: { index: false, follow: false },
};

export default function Home() {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return <Dashboard {...data} />;
}
