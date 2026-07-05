import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { AnnouncerProvider } from "@/components/announcer";
import { TopNav } from "@/components/workspace/TopNav";

// Self-hosted type system (no runtime remote fetch - woff2 bundled in ./fonts).
// Display: Fraunces, a high-contrast old-style serif that echoes the serif
// "Specimen A" wordmark. Body/UI: Hanken Grotesk, a warm grotesque (deliberately
// NOT stock Inter). Mono: IBM Plex Mono, for the tool-call evidence lines.
const displaySerif = localFont({
  variable: "--font-fraunces",
  display: "swap",
  src: [
    { path: "./fonts/fraunces-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/fraunces-600.woff2", weight: "600", style: "normal" }
  ]
});
const bodySans = localFont({
  variable: "--font-hanken",
  display: "swap",
  src: [
    { path: "./fonts/hanken-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/hanken-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/hanken-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/hanken-700.woff2", weight: "700", style: "normal" }
  ]
});
const monoFont = localFont({
  variable: "--font-plex-mono",
  display: "swap",
  src: [
    { path: "./fonts/plexmono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plexmono-500.woff2", weight: "500", style: "normal" }
  ]
});

export const metadata: Metadata = {
  metadataBase: new URL("https://assay.dev"),
  title: "Assay - prove your AI agent's guardrails hold",
  description: "Point Assay at the agent.md you already ship. It runs real adversarial attacks in a sandbox and shows the exact destructive command your guardrails failed to block - before you deploy.",
  // Favicon + apple-touch-icon are provided by the App Router file convention
  // (src/app/icon.png, src/app/apple-icon.png). Next auto-injects correctly
  // hashed <link> tags; a manual `icons` entry pointing at /icon.png 404s
  // because no such file is served from /public - which is why the tab icon
  // never updated. Do not re-add it.
  openGraph: {
    title: "Assay - prove your AI agent's guardrails hold",
    description: "Point Assay at the agent.md you already ship. It runs real adversarial attacks in a sandbox and shows the exact destructive command your guardrails failed to block - before you deploy.",
    type: "website",
    images: [{ url: "/brand/assay-og.png", width: 1200, height: 630, alt: "Assay - prove your AI agent's guardrails hold" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Assay - prove your AI agent's guardrails hold",
    description: "Point Assay at the agent.md you already ship. It runs real adversarial attacks in a sandbox and shows the exact destructive command your guardrails failed to block - before you deploy.",
    images: ["/brand/assay-og.png"]
  }
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('assay-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${displaySerif.variable} ${bodySans.variable} ${monoFont.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <Providers>
          <AnnouncerProvider>
            <TopNav />
            {children}
          </AnnouncerProvider>
        </Providers>
      </body>
    </html>
  );
}
