import { createTrustDocumentRoute } from "@/features/public/lib/trust-document-route";

const route = createTrustDocumentRoute("contact", "en");

export const generateMetadata = route.generateMetadata;

export default route.Page;
