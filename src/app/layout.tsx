import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteHeader } from "@/components/SiteHeader";
import { MonochromeBackground } from "@/components/MonochromeBackground";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_NAME = "Aubrey's White Space";
const DESCRIPTION =
  "A gallery and wiki for Aubrey's White Space, a Balatro mod: browse its custom Jokers, their effects, and artwork.";

// The preview image comes from src/app/opengraph-image.png (file-based metadata).
export const metadata: Metadata = {
  metadataBase: new URL("https://white-space-wiki.vercel.app"),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: DESCRIPTION,
  icons: { icon: "/images/favicon.ico" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <MonochromeBackground />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
        >
          Skip to content
        </a>
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-foreground">
          <p className="mx-auto max-w-6xl px-4 py-8 font-mono text-xs leading-relaxed text-muted sm:px-8">
            Fan-made wiki for Aubrey&apos;s White Space, a Balatro mod. Data and artwork are loaded from the mod&apos;s
            public GitHub repository. Not affiliated with LocalThunk or OMOCAT.
          </p>
        </footer>
      </body>
    </html>
  );
}
