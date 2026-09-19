import { createAboutRoute } from "@/features/public/lib/about-route";

const route = createAboutRoute("en");

export const generateMetadata = route.generateMetadata;

export default route.Page;
