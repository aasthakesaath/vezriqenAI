import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BRAND } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://vezriqen.com"),
  title: {
    default: `${BRAND} \u2014 Turn Your Plans Into Progress`,
    template: `%s \u2014 ${BRAND}`,
  },
  description:
    `Upload your plan. Vezri helps you stay on track, get unstuck, and keep moving toward your goal. Sign up free.`,
  applicationName: BRAND,
  openGraph: {
    siteName: BRAND,
    type: "website",
    title: `${BRAND} \u2014 Turn Your Plans Into Progress`,
    description:
      "Upload your plan. Vezri helps you stay on track, get unstuck, and keep moving toward your goal. Sign up free.",
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
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
