import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { AnnouncerProvider } from "@/components/announcer";
import { TopNav } from "@/components/workspace/TopNav";

export const metadata: Metadata = {
  metadataBase: new URL("https://assay.dev"),
  title: "Assay: litmus test for AI agents",
  description: "Bring your agent.md. Find out where it breaks before you ship.",
  icons: {
    icon: [{ url: "/icon.png", type: "image/png" }]
  },
  openGraph: {
    title: "Assay: litmus test for AI agents",
    description: "Bring your agent.md. Find out where it breaks before you ship.",
    type: "website",
    images: [{ url: "/brand/assay-og.png", width: 1200, height: 630, alt: "Assay: litmus test for AI agents" }]
  },
  twitter: {
    card: "summary_large_image",
    title: "Assay: litmus test for AI agents",
    description: "Bring your agent.md. Find out where it breaks before you ship.",
    images: ["/brand/assay-og.png"]
  }
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('assay-theme');if(!t){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
