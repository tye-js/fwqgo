import { createTrustDocumentRoute } from "@/features/public/lib/trust-document-route";

const route = createTrustDocumentRoute("terms", "zh");

export const generateMetadata = route.generateMetadata;

export default route.Page;
