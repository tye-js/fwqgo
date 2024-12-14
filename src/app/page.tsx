import { getPostsWithTags } from "@/app/_actions/post";
import ArticleCard from "./_components/article-card";
import Header from "@/app/_components/header";
import Footer from "@/app/_components/footer";
import { Separator } from "@/components/ui/separator";

export default async function Home() {
  const { data: posts } = await getPostsWithTags();
  return (
    <div className="flex flex-col bg-background">
      <Header />
      <Separator />
      <main className="container mx-auto mt-2 flex min-h-[90vh] flex-1 flex-col items-center justify-center gap-1 md:mt-4 md:gap-4">
        {posts?.map((post) => <ArticleCard key={post.id} post={post} />)}
      </main>
      <Separator className="mt-4" />
      <Footer />
    </div>
  );
}
