import { createTrustDocumentRoute } from "@/features/public/lib/trust-document-route";

const route = createTrustDocumentRoute("affiliate-disclosure", "en");

export const generateMetadata = route.generateMetadata;

export default route.Page;
