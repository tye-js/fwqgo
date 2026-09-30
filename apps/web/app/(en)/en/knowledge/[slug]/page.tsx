// URL 对应的 SEO 元数据必须先进入初始 head，允许导航等待该读取。
// 此配置只声明导航预期，保留 Cache Components、ISR 和正文缓存。
export const instant = false;

export { generateMetadata } from "@/features/public/routes/en/knowledge/[slug]/page";

import RouteModuleDefault from "@/features/public/routes/en/knowledge/[slug]/page";

export default RouteModuleDefault;
