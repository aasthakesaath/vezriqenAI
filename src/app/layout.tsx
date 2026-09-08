import type { Metadata } from "next";
import Header from "@/components/Header";
import SiteChrome from "@/components/SiteChrome";
import Footer from "@/components/Footer";
import { BRAND } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://vezriqen.com"),
  title: {
    default: `${BRAND} \u2014 Don\u2019t Just Make a Plan. Finish It.`,
    template: `%s \u2014 ${BRAND}`,
  },
  description:
    "Upload your plan and let Vezri help you follow it, get unstuck, adjust when life changes, and reach your goal.",
  applicationName: BRAND,
  openGraph: {
    siteName: BRAND,
    type: "website",
    title: `${BRAND} \u2014 Don\u2019t Just Make a Plan. Finish It.`,
    description:
      "Upload your plan and let Vezri help you follow it, get unstuck, adjust when life changes, and reach your goal.",
  },
  icons: { icon: "/brand/vezri.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-pill focus:bg-berry focus:px-5 focus:py-3 focus:text-white"
        >
          Skip to content
        </a>
        <SiteChrome header={<Header />} footer={<Footer />}>
          {children}
        </SiteChrome>
      </body>
    </html>
  );
}
