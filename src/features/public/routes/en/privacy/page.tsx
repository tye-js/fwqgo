import { createTrustDocumentRoute } from "@/features/public/lib/trust-document-route";

const route = createTrustDocumentRoute("privacy", "en");

export const generateMetadata = route.generateMetadata;

export default route.Page;
