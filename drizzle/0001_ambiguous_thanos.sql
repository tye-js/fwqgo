ALTER TABLE "Account" RENAME TO "accounts";--> statement-breakpoint
ALTER TABLE "AffServiceProvider" RENAME TO "aff_service_providers";--> statement-breakpoint
ALTER TABLE "Category" RENAME TO "categories";--> statement-breakpoint
ALTER TABLE "PostTag" RENAME TO "post_tags";--> statement-breakpoint
ALTER TABLE "Post" RENAME TO "posts";--> statement-breakpoint
ALTER TABLE "Session" RENAME TO "sessions";--> statement-breakpoint
ALTER TABLE "Tag" RENAME TO "tags";--> statement-breakpoint
ALTER TABLE "User" RENAME TO "users";--> statement-breakpoint
ALTER TABLE "VerificationToken" RENAME TO "verification_tokens";--> statement-breakpoint
ALTER TABLE "accounts" DROP CONSTRAINT "Account_provider_providerAccountId_key";--> statement-breakpoint
ALTER TABLE "aff_service_providers" DROP CONSTRAINT "AffServiceProvider_name_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "Category_name_unique";--> statement-breakpoint
ALTER TABLE "categories" DROP CONSTRAINT "Category_slug_unique";--> statement-breakpoint
ALTER TABLE "posts" DROP CONSTRAINT "Post_slug_unique";--> statement-breakpoint
ALTER TABLE "sessions" DROP CONSTRAINT "Session_sessionToken_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "Tag_name_unique";--> statement-breakpoint
ALTER TABLE "tags" DROP CONSTRAINT "Tag_slug_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "User_username_unique";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "User_email_unique";--> statement-breakpoint
ALTER TABLE "verification_tokens" DROP CONSTRAINT "VerificationToken_token_unique";--> statement-breakpoint
ALTER TABLE "verification_tokens" DROP CONSTRAINT "VerificationToken_identifier_token_key";--> statement-breakpoint
DROP INDEX "Category_parentId_idx";--> statement-breakpoint
DROP INDEX "PostTag_tagId_idx";--> statement-breakpoint
DROP INDEX "Post_title_idx";--> statement-breakpoint
DROP INDEX "Post_categoryId_idx";--> statement-breakpoint
DROP INDEX "Post_authorId_idx";--> statement-breakpoint
DROP INDEX "Post_recommendedTagName_idx";--> statement-breakpoint
DROP INDEX "Session_userId_idx";--> statement-breakpoint
ALTER TABLE "post_tags" DROP CONSTRAINT "PostTag_postId_tagId_pk";--> statement-breakpoint
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_postId_tagId_pk" PRIMARY KEY("postId","tagId");--> statement-breakpoint
CREATE INDEX "categories_parentId_idx" ON "categories" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "post_tags_tagId_idx" ON "post_tags" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "posts_title_idx" ON "posts" USING btree ("title");--> statement-breakpoint
CREATE INDEX "posts_categoryId_idx" ON "posts" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "posts_authorId_idx" ON "posts" USING btree ("authorId");--> statement-breakpoint
CREATE INDEX "posts_recommendedTagName_idx" ON "posts" USING btree ("recommendedTagName");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("userId");--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_provider_providerAccountId_key" UNIQUE("provider","providerAccountId");--> statement-breakpoint
ALTER TABLE "aff_service_providers" ADD CONSTRAINT "aff_service_providers_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_sessionToken_unique" UNIQUE("sessionToken");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_name_unique" UNIQUE("name");--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_slug_unique" UNIQUE("slug");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_token_unique" UNIQUE("token");--> statement-breakpoint
ALTER TABLE "verification_tokens" ADD CONSTRAINT "verification_tokens_identifier_token_key" UNIQUE("identifier","token");