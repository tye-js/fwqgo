import type { Metadata } from "next";

import { buildNetworkLinesMetadata } from "@/features/public/routes/tools/network-lines/page";
import { NetworkLineSelector } from "@/features/public/components/network-line-selector";
import Footer from "@/features/public/components/footer";
import Header from "@/features/public/components/header";

export function generateMetadata(): Metadata {
  return buildNetworkLinesMetadata("en");
}

export default function EnglishNetworkLinesPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header language="en" />
      <NetworkLineSelector language="en" />
      <Footer language="en" />
    </div>
  );
}
