import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { THEME_DARK, THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap"
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  // 600 exists for Reception's extension readout (46px/600 mono).
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap"
});

// App-wide theme boot (Reception handoff): html[data-theme="dark"] is THE
// global theme switch — today only Reception's --r-* tokens react to it, so
// every other surface renders identically until it grows dark tokens. Runs
// synchronously before paint to avoid a light flash; suppressHydrationWarning
// on <html> covers the server-markup mismatch this deliberately creates. The
// key/value literals are interpolated from lib/theme.ts at build time so the
// boot replay and ThemeToggle can never disagree.
const THEME_BOOT_SCRIPT =
  `try{if(localStorage.getItem('${THEME_STORAGE_KEY}')==='${THEME_DARK}')document.documentElement.dataset.theme='${THEME_DARK}'}catch(e){}`;

export const metadata: Metadata = {
  title: "Seat Planner",
  description: "Internal interactive office seating map"
};

// Matches the dark top chrome (--admin-chrome-bg) so mobile browser UI blends
// with the bar it sits against (#200).
export const viewport: Viewport = {
  themeColor: "#161616"
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`} suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
