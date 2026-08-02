import type { Metadata } from "next";

import ServerSizingPage, {
  buildServerSizingMetadata,
} from "@/features/public/routes/tools/server-sizing/page";

export function generateMetadata(): Metadata {
  return buildServerSizingMetadata("en");
}

export default function EnglishServerSizingPage() {
  return <ServerSizingPage language="en" />;
}
