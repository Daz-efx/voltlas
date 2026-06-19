// app/page.jsx — server component: reads the data file and passes it to the dashboard.
// Title/description/Open Graph are inherited from app/layout.tsx; here we add the
// home canonical and site-level structured data.
import fs from "node:fs";
import path from "node:path";
import Dashboard from "./components/Dashboard";

const SITE = "https://voltlas.com";

export const metadata = {
  alternates: { canonical: "/" },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "Voltlas",
      url: SITE,
      description:
        "Global electricity, natural gas, transport-fuel and energy-commodity prices from free official sources.",
    },
    {
      "@type": "Organization",
      name: "Voltlas",
      url: SITE,
    },
  ],
};

export default function Home() {
  const file = path.join(process.cwd(), "public", "data", "latest.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Dashboard {...data} />
    </>
  );
}
