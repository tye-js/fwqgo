import { type posts } from "@fwqgo/db/schema";
import { type TagMain, type TagName } from "./tag.types";

// 继承 Drizzle 类型
type Post = typeof posts.$inferSelect;
export interface PostWithAuthor extends Post {
  author: {
    name: string;
    email: string;
  };
}

// API 请求响应类型
export interface PostApiResponse {
  code: number;
  data: Post[];
  message: string;
}

// 表单提交类型
export interface PostFormData {
  title: string;
  content: string;
  published: boolean;
}

// 组件 Props 类型
export interface PostListProps {
  posts: Pick<Post, "id" | "title" | "published">[];
  onEdit?: (id: number) => void;
  onDelete?: (id: number) => void;
}
// 用于卡片展示的字段的tags
export interface PostWithTags extends SelectedPost {
  tags: TagMain[];
}

// 用于卡片展示的字段
export type SelectedPost = Pick<
  Post,
  "id" | "title" | "description" | "slug" | "imgUrl" | "createdAt"
>;

// 用于更新Post详细页面的字段
export interface PostEditFormData {
  post: Pick<
    Post,
    | "id"
    | "content"
    | "views"
    | "description"
    | "imgUrl"
    | "recommendedTagName"
    | "keywords"
    | "categoryId"
    | "enTitle"
    | "enSlug"
    | "enContent"
    | "enKeywords"
    | "enDescription"
    | "enImgUrl"
    | "enUpdatedAt"
  >;
  tags: TagMain[];
}

// 创建文章时的输入类型
export type CreatePostParams = {
  post: Pick<
    Post,
    | "title"
    | "description"
    | "content"
    | "imgUrl"
    | "published"
    | "categoryId"
    | "recommendedTagName"
    | "keywords"
  >;
  tags: TagName[];
};

export type RecommendedPost = Pick<Post, "id" | "title" | "slug" | "imgUrl">;

// 侧边栏最新文章
export type LatestPostForSidebar = Pick<
  Post,
  "id" | "title" | "slug" | "imgUrl"
>;
