import { generateJSON } from "./model/google-genai";

interface ArticleOutput {
  title: string;
  description: string;
  keywords: string[];
  htmlContent: string;
  tagsName: string[];
  recommendTagName: string;
}

export default async function RewriteArticle(
  content: string,
): Promise<ArticleOutput> {
  "use cache";
  const prompt = `你是一个专业的推广文章写作助手，你了解各种服务器的配置，了解这些配置的优缺点，知道每款服务器的能跑通的应用类型，以及服务器适合的人群。请根据以下文本，写出更优秀的文章，要求：
  1. 需详细介绍商家特点及其最新活动、其硬件配置（CPU、内存、存储）、支持的网络线路（如 BGP、CN2）、适用地区（如亚太或北美），并列出其性能优势、适合的应用场景（如游戏加速、企业网站托管）
  2. 使用更专业和流畅的表达方式，文本中的服务器配置信息为主要信息，不要省略和折叠
  3. 分段展示，保持良好的文章结构，保持表格内数据的完整性，可优化，但不要删减。内容的最高标题都从二级标题开始，第一段不需要标题
  4. 结尾增加商家总结部分：总结商家的信息，优势
  5. 根据文章内容，生成5个适合seo的关键词，放到相关的关键词列表中
  6. 文章标题要包含商家名称、最低价格配置的服务器的价格、服务器特性、第一款服务器的配置规格、适用场景，优先级从前向后
  7. 第二段标题为：商家官方网站，商家替换成当前商家的名字，内容为带链接的官方网址，不需要修改链接，使用之前文章的链接就可以
  8. 如果有优惠码，则第三段标题为 [商家名字]优惠码，内容为优惠码的信息，如果没有，则不要这部分内容
  9. 根据文章内容，生成10个相关的标签，第一个标签是商家名，其余的是长尾SEO关键词，然后把所有的相关标签放到相关的标签列表中，不显示在文章中
  10. 推荐标签是商家名
  11. 倒数第二段为相关知识，分别科普当前商家的网络线路、服务器的特点、原生IP等信息

  原文：${content}
  
  请严格按照以下JSON格式返回，不要添加任何其他内容：
    {
      "title": "文章标题",
      "description": "120字以内的文章摘要",
      "keywords": ["关键词1", "关键词2", "关键词3"],
      "htmlContent": "使用HTML标签格式化的文章内容",
      "tagsName": ["标签1", "标签2"],
      "recommendTagName": "推荐标签"
    }`;
  const result = await generateJSON<ArticleOutput>(prompt);
  console.log("重写文章");
  return {
    title: result.title,
    description: result.description,
    keywords: result.keywords,
    htmlContent: result.htmlContent,
    tagsName: result.tagsName,
    recommendTagName: result.recommendTagName,
  };
  // const prompt = PromptTemplate.fromTemplate(template);

  // try {
  //   const chain = RunnableSequence.from([prompt, model]);
  //   const response = await chain.invoke({
  //     format_instructions: formatInstructions,
  //     text: content,
  //   });

  //   const result = await parser.parse(response.content.toString());
  //   console.log(result);

  //   return {
  //     title: result.title,
  //     description: result.description,
  //     keywords: result.keywords,
  //     htmlContent: result.content,
  //     tagsName: result.tagsName,
  //     recommendTagName: result.recommendTagName,
  //   };
  // } catch (error) {
  //   console.error("Failed to process AI response:", error);
  //   return {
  //     title: "",
  //     description: "",
  //     keywords: [],
  //     htmlContent: "",
  //     tagsName: [],
  //     recommendTagName: "",
  //   };
  // }
}
