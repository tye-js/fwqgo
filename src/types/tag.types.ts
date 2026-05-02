import { type tags } from "@/server/db/schema";

type Tag = typeof tags.$inferSelect;

export interface TagMain {
  tag: Pick<Tag, "id" | "name" | "slug">;
}

export interface NewTag {
  tag: Pick<Tag, "name" | "slug">;
}

export type TagName = Pick<Tag, "name">;
