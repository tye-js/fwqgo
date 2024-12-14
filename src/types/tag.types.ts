import { type Tag } from "@prisma/client";

export interface TagMain {
  tag: Pick<Tag, "id" | "name" | "slug">;
}

export interface NewTag {
  tag: Pick<Tag, "name" | "slug">;
}
