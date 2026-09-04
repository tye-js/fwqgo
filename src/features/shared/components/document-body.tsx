import "@/styles/globals.css";

import { Inter, Outfit } from "next/font/google";

const fontInter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  adjustFontFallback: true,
});

const fontOutfit = Outfit({
  subsets: ["latin"],
  variable: "--font-editorial",
  display: "swap",
  fallback: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
  adjustFontFallback: true,
  preload: false,
});

export function DocumentBody({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <body
      className={`${fontInter.variable} ${fontOutfit.variable} font-ui bg-background text-foreground`}
    >
      {children}
    </body>
  );
}
