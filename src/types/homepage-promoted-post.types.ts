export type HomepagePromotedPostItem = {
  id: number;
  postId: number;
  sortOrder: number;
  createdAt: Date;
  post: {
    id: number;
    title: string;
    slug: string;
    published: boolean;
  } | null;
};
