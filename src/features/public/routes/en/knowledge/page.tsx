import {
  buildKnowledgeIndexMetadata,
  KnowledgeIndexPage,
} from "@/features/public/routes/knowledge/page";

type KnowledgeSearchParams = {
  q?: string;
  category?: string;
  page?: string;
};

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
