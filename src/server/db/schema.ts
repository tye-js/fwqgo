import { relations } from "drizzle-orm";
import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
  primaryKey,
  index,
  unique,
} from "drizzle-orm/pg-core";

// Post table
export const posts = pgTable(
  "posts",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    slug: varchar("slug", { length: 320 }).notNull().unique(),
    content: text("content").notNull(),
    keywords: varchar("keywords", { length: 800 }),
    description: varchar("description", { length: 800 }),
    imgUrl: text("imgUrl"),
    published: boolean("published").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
    views: integer("views").default(0).notNull(),
    recommendedTagName: text("recommendedTagName"),
    authorId: text("authorId"),
    categoryId: integer("categoryId").notNull(),
  },
  (table) => ({
    titleIdx: index("posts_title_idx").on(table.title),
    categoryIdx: index("posts_categoryId_idx").on(table.categoryId),
    authorIdx: index("posts_authorId_idx").on(table.authorId),
    recommendedTagIdx: index("posts_recommendedTagName_idx").on(
      table.recommendedTagName,
    ),
  }),
);

// Category table
export const categories = pgTable(
  "categories",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
    description: varchar("description", { length: 800 }),
    keywords: varchar("keywords", { length: 800 }),
    parentId: integer("parentId"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt"),
  },
  (table) => ({
    parentIdx: index("categories_parentId_idx").on(table.parentId),
  }),
);

// Tag table
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  keywords: varchar("keywords", { length: 800 }),
  description: varchar("description", { length: 800 }),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
});

// PostTag junction table
export const postTags = pgTable(
  "post_tags",
  {
    postId: integer("postId").notNull(),
    tagId: integer("tagId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.postId, table.tagId] }),
    tagIdx: index("post_tags_tagId_idx").on(table.tagId),
  }),
);

// User table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified"),
  image: text("image"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").notNull(),
});

// Account table
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("userId").notNull(),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
    refresh_token_expires_in: integer("refresh_token_expires_in"),
  },
  (table) => ({
    providerProviderAccountIdKey: unique(
      "accounts_provider_providerAccountId_key",
    ).on(table.provider, table.providerAccountId),
  }),
);

// Session table
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    sessionToken: text("sessionToken").notNull().unique(),
    userId: text("userId").notNull(),
    expires: timestamp("expires").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    userIdx: index("sessions_userId_idx").on(table.userId),
  }),
);

// VerificationToken table
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull().unique(),
    expires: timestamp("expires").notNull(),
  },
  (table) => ({
    identifierTokenKey: unique("verification_tokens_identifier_token_key").on(
      table.identifier,
      table.token,
    ),
  }),
);

// AffServiceProvider table
export const affServiceProviders = pgTable("aff_service_providers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  affUrl: text("affUrl").notNull(),
  affParam: text("affParam").notNull(),
  affValue: text("affValue").notNull(),
  officialUrl: text("officialUrl").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt"),
});

// Homepage promoted posts table
export const homepagePromotedPosts = pgTable(
  "homepage_promoted_posts",
  {
    id: serial("id").primaryKey(),
    postId: integer("postid").notNull().unique(),
    sortOrder: integer("sortorder").default(0).notNull(),
    createdAt: timestamp("createdat").defaultNow().notNull(),
  },
  (table) => ({
    postIdx: index("homepage_promoted_posts_postId_idx").on(table.postId),
    sortIdx: index("homepage_promoted_posts_sortOrder_idx").on(table.sortOrder),
  }),
);

// Relations
export const postsRelations = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
  category: one(categories, {
    fields: [posts.categoryId],
    references: [categories.id],
  }),
  recommendedTag: one(tags, {
    fields: [posts.recommendedTagName],
    references: [tags.name],
  }),
  tags: many(postTags),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, {
    fields: [categories.parentId],
    references: [categories.id],
    relationName: "category_hierarchy",
  }),
  children: many(categories, {
    relationName: "category_hierarchy",
  }),
  posts: many(posts),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  posts: many(postTags),
  recommendedPosts: many(posts),
}));

export const postTagsRelations = relations(postTags, ({ one }) => ({
  post: one(posts, {
    fields: [postTags.postId],
    references: [posts.id],
  }),
  tag: one(tags, {
    fields: [postTags.tagId],
    references: [tags.id],
  }),
}));

export const homepagePromotedPostsRelations = relations(
  homepagePromotedPosts,
  ({ one }) => ({
    post: one(posts, {
      fields: [homepagePromotedPosts.postId],
      references: [posts.id],
    }),
  }),
);

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  posts: many(posts),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));
