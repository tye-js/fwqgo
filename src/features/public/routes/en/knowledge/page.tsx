import {
  buildKnowledgeIndexMetadata,
  KnowledgeIndexPage,
  type KnowledgeSearchParams,
} from "@/features/public/routes/knowledge/page";

export function generateMetadata(props: {
  searchParams: Promise<KnowledgeSearchParams>;
}) {
  return buildKnowledgeIndexMetadata("en", props.searchParams);
}

export default function EnglishKnowledgeIndexPage(props: {
  searchParams: Promise<KnowledgeSearchParams>;
}) {
  return <KnowledgeIndexPage language="en" searchParams={props.searchParams} />;
}
