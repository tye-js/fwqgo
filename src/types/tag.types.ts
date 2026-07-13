import { type tags } from "@fwqgo/db/schema";

type Tag = typeof tags.$inferSelect;

export interface TagMain {
  tag: Pick<Tag, "id" | "name" | "slug">;
}

export interface NewTag {
  tag: Pick<Tag, "name" | "slug"> & Partial<Pick<Tag, "id">>;
}

export type TagName = Pick<Tag, "name">;
