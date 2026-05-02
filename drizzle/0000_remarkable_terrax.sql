CREATE TABLE "Account" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"refresh_token_expires_in" integer,
	CONSTRAINT "Account_provider_providerAccountId_key" UNIQUE("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "AffServiceProvider" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"affUrl" text NOT NULL,
	"affParam" text NOT NULL,
	"affValue" text NOT NULL,
	"officialUrl" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "AffServiceProvider_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "Category" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" varchar(800),
	"keywords" varchar(800),
	"parentId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "Category_name_unique" UNIQUE("name"),
	CONSTRAINT "Category_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "PostTag" (
	"postId" integer NOT NULL,
	"tagId" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "PostTag_postId_tagId_pk" PRIMARY KEY("postId","tagId")
);
--> statement-breakpoint
CREATE TABLE "Post" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" varchar(320) NOT NULL,
	"content" text NOT NULL,
	"keywords" varchar(800),
	"description" varchar(800),
	"imgUrl" text,
	"published" boolean DEFAULT false NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"views" integer DEFAULT 0 NOT NULL,
	"recommendedTagName" text,
	"authorId" text,
	"categoryId" integer NOT NULL,
	CONSTRAINT "Post_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "Session" (
	"id" text PRIMARY KEY NOT NULL,
	"sessionToken" text NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Session_sessionToken_unique" UNIQUE("sessionToken")
);
--> statement-breakpoint
CREATE TABLE "Tag" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"keywords" varchar(800),
	"description" varchar(800),
	"slug" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	CONSTRAINT "Tag_name_unique" UNIQUE("name"),
	CONSTRAINT "Tag_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "User" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "User_username_unique" UNIQUE("username"),
	CONSTRAINT "User_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "VerificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "VerificationToken_token_unique" UNIQUE("token"),
	CONSTRAINT "VerificationToken_identifier_token_key" UNIQUE("identifier","token")
);
--> statement-breakpoint
CREATE INDEX "Category_parentId_idx" ON "Category" USING btree ("parentId");--> statement-breakpoint
CREATE INDEX "PostTag_tagId_idx" ON "PostTag" USING btree ("tagId");--> statement-breakpoint
CREATE INDEX "Post_title_idx" ON "Post" USING btree ("title");--> statement-breakpoint
CREATE INDEX "Post_categoryId_idx" ON "Post" USING btree ("categoryId");--> statement-breakpoint
CREATE INDEX "Post_authorId_idx" ON "Post" USING btree ("authorId");--> statement-breakpoint
CREATE INDEX "Post_recommendedTagName_idx" ON "Post" USING btree ("recommendedTagName");--> statement-breakpoint
CREATE INDEX "Session_userId_idx" ON "Session" USING btree ("userId");