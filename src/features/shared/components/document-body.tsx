import "@/styles/globals.css";

import { Inter, Outfit } from "next/font/google";

const fontInter = Inter({
  subsets: ["latin"],
  variable: "--font-ui",
});

const fontOutfit = Outfit({
  subsets: ["latin"],
  variable: "--font-editorial",
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
