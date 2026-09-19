import { createTrustDocumentRoute } from "@/features/public/lib/trust-document-route";

const route = createTrustDocumentRoute("privacy", "zh");

export const generateMetadata = route.generateMetadata;

export default route.Page;
