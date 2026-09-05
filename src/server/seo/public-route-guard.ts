import { and, count, eq, or } from "drizzle-orm";

import { readDb } from "@fwqgo/db";
import {
  categories,
  knowledgeArticles,
  posts,
  postTags,
  tags,
} from "@fwqgo/db/schema";
import { getPublicPageCount } from "@fwqgo/core/public-content-policy";
import {
  PUBLIC_SERVER_TOPIC_SLUGS,
  type PublicResourceRoute,
  publicResourcePath,
} from "@fwqgo/core/public-route-policy";
import { resolveEnglishTagIdentity } from "@fwqgo/core/taxonomy";
import { publicPostCondition } from "@/server/posts/public-post-policy";
import { publicKnowledgeCondition } from "@/server/knowledge/public-knowledge-policy";
import { findPublicSlugRedirect } from "./public-slug-redirects";
import { loadPublicServerCollectionIdentity } from "@/server/offers/public-server-entities";

/** Runs in the Node proxy, before any PPR shell or loading boundary can flush. */
export async function resolvePublicResourcePath(
  route: PublicResourceRoute,
): Promise<string | null> {
  if (route.kind === "server_topic") {
    return PUBLIC_SERVER_TOPIC_SLUGS.some((slug) => slug === route.slug)
      ? publicResourcePath(route)
      : null;
  }
  if (route.kind === "post") {
    if (route.slug === "__fwqgo_article_static_shell__") return null;
    const [canonicalPost] = await readDb
      .select({ slug: posts.slug })
      .from(posts)
      .where(
        and(eq(posts.slug, route.slug), publicPostCondition(route.language)),
      )
      .limit(1);
    if (canonicalPost)
      return publicResourcePath({ ...route, slug: canonicalPost.slug });
    const alias = await findPublicSlugRedirect(
      "post",
      route.language,
      route.slug,
    );
    if (!alias?.postId) return null;
    const [post] = await readDb
      .select({ slug: posts.slug })
      .from(posts)
      .where(
        and(eq(posts.id, alias.postId), publicPostCondition(route.language)),
      )
      .limit(1);
    return post ? publicResourcePath({ ...route, slug: post.slug }) : null;
  }
  if (route.kind === "knowledge") {
    const [article] = await readDb
      .select({ slug: knowledgeArticles.slug })
      .from(knowledgeArticles)
      .where(
        and(
          eq(knowledgeArticles.slug, route.slug),
          publicKnowledgeCondition(route.language),
        ),
      )
      .limit(1);
    return article
      ? publicResourcePath({ ...route, slug: article.slug })
      : null;
  }
  if (route.kind === "archive") {
    const [row] = await readDb
      .select({ count: count() })
      .from(posts)
      .where(publicPostCondition(route.language));
    return route.page <= Math.max(getPublicPageCount(row?.count ?? 0), 1)
      ? publicResourcePath(route)
      : null;
  }
  if (route.kind === "category" || route.kind === "tag") {
    const alias = await findPublicSlugRedirect(
      route.kind,
      route.language,
      route.slug,
    );
    if (route.kind === "category") {
      const [category] = await readDb
        .select({
          id: categories.id,
          slug: categories.slug,
          enSlug: categories.enSlug,
        })
        .from(categories)
        .where(
          alias?.categoryId
            ? eq(categories.id, alias.categoryId)
            : route.language === "en"
              ? or(
                  eq(categories.enSlug, route.slug),
                  eq(categories.slug, route.slug),
                )
              : eq(categories.slug, route.slug),
        )
        .limit(1);
      if (!category) return null;
      const [row] = await readDb
        .select({ count: count() })
        .from(posts)
        .where(
          and(
            eq(posts.categoryId, category.id),
            publicPostCondition(route.language),
          ),
        );
      if (route.page > getPublicPageCount(row?.count ?? 0)) return null;
      return publicResourcePath({
        ...route,
        slug:
          route.language === "en" && category.enSlug?.trim()
            ? category.enSlug.trim()
            : category.slug,
      });
    }
    const [tag] = await readDb
      .select()
      .from(tags)
      .where(
        alias?.tagId
          ? eq(tags.id, alias.tagId)
          : route.language === "en"
            ? or(eq(tags.enSlug, route.slug), eq(tags.slug, route.slug))
            : eq(tags.slug, route.slug),
      )
      .limit(1);
    if (!tag) return null;
    const identity =
      route.language === "en" ? resolveEnglishTagIdentity(tag) : tag;
    if (!identity) return null;
    const [row] = await readDb
      .select({ count: count() })
      .from(postTags)
      .innerJoin(posts, eq(postTags.postId, posts.id))
      .where(
        and(eq(postTags.tagId, tag.id), publicPostCondition(route.language)),
      );
    return route.page <= getPublicPageCount(row?.count ?? 0)
      ? publicResourcePath({ ...route, slug: identity.slug })
      : null;
  }
  const entity = await loadPublicServerCollectionIdentity(
    route.kind,
    route.slug,
  );
  return entity ? publicResourcePath({ ...route, slug: entity.slug }) : null;
}
