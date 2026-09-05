import {
  getKnowledgeIndexRenderMetadata,
  KnowledgeIndexRenderPage,
  type KnowledgeIndexRenderParams,
} from "@/features/public/routes/knowledge/index-render/[variant]/page";

export { generateStaticParams } from "@/features/public/routes/knowledge/index-render/[variant]/page";

export function generateMetadata({
  params,
}: {
  params: KnowledgeIndexRenderParams;
}) {
  return getKnowledgeIndexRenderMetadata("en", params);
}

export default function EnglishKnowledgeIndexRender({
  params,
}: {
  params: KnowledgeIndexRenderParams;
}) {
  return <KnowledgeIndexRenderPage language="en" params={params} />;
}
