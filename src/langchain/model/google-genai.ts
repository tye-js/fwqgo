import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} from "@google/generative-ai";

if (!process.env.GOOGLE_AI_API_KEY)
  throw new Error("GOOGLE_AI_API_KEY environment variable is not set");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-3-flash-preview",
  generationConfig: {
    temperature: 0.4,
    maxOutputTokens: 8192,
    topK: 2,
    topP: 0.8,
  },
  safetySettings: [
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_NONE,
    },
  ],
});

export default model;

// 辅助函数：创建聊天会话
export async function createChat() {
  return model.startChat({
    history: [],
    generationConfig: {
      temperature: 0.4,
      maxOutputTokens: 20240,
      topK: 1,
      topP: 0.8,
    },
  });
}
// 辅助函数：生成内容
export async function generateContent(prompt: string) {
  "use cache";
  const result = await model.generateContent(prompt);
  const response = result.response;
  return response.text();
}

// 辅助函数：以 JSON 格式生成内容
export async function generateJSON<T>(prompt: string): Promise<T> {
  "use cache";
  const result = await model.generateContent(prompt);
  const response = result.response;
  const text = response.text();
  console.log(text);
  // 移除 JSON 代码块标记
  const cleanedText = text.replace(/```json\n?|\n?```/g, "").trim();

  return JSON.parse(cleanedText) as T;
}

// 分段生成 HTML 内容
export async function generateHTMLContent(
  content: string,
  sectionLength = 8000,
): Promise<string> {
  "use cache";
  let htmlContent = "";
  let remainingContent = content;
  let sectionNumber = 1;

  while (remainingContent.length > 0) {
    const prompt = `你是一个专业的文章改写助手。这是第 ${sectionNumber} 部分的改写任务。
    请将以下内容改写成HTML格式，使用 <p>、<h2>、<ul> 等标签。
    
    原文：${remainingContent.slice(0, sectionLength)}
    
    只返回HTML内容，不要添加任何其他内容。`;

    try {
      const result = await model.generateContent(prompt);
      const response = result.response;
      const sectionHtml = response.text();

      htmlContent += sectionHtml;
      remainingContent = remainingContent.slice(sectionLength);
      sectionNumber++;

      // 添加延迟避免触发限制
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`Error generating section ${sectionNumber}:`, error);
      throw error;
    }
  }

  return htmlContent;
}
