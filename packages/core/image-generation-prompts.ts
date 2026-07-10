export const defaultCoverPromptTemplate = `为服务器/VPS推广文章生成一张专业封面图。

文章标题：{title}
文章摘要：{description}
关键词：{keywords}

画面要求：
- 主题必须围绕云服务器、VPS、数据中心、网络线路、优惠促销。
- 风格清晰、现代、科技感，适合专业服务器测评网站。
- 不要出现真实品牌 Logo、水印或二维码；可见文字及语言由系统追加的文章语言规则决定。
- 画面留出适合文章卡片裁切的中心主体，横版 16:9。`;

export const defaultEnglishCoverPromptTemplate = `English article cover override (highest priority):
- These rules override earlier conflicting instructions, including references to a Chinese website, Chinese typography, or "no readable text".
- This cover is for an English article and English public page.
- Do not render Chinese characters anywhere in the image.
- Preserve the article's main topic and at least two source-backed details when the source provides them, using both composition and concise typography.
- Include one short readable English headline plus up to three compact English fact labels. Keep all visible text under 25 words.
- Useful fact labels include provider, region, CPU, RAM, storage, bandwidth, network route, price, or discount, but only when explicitly present in the source information below.
- Do not invent brands, prices, discounts, specifications, locations, or performance claims.
- Avoid paragraphs, tiny text, fake dashboards, watermarks, QR codes, and real brand logos.

Source information to preserve:
- English title: {title}
- English summary: {description}
- English keywords: {keywords}
- Article context: {content}`;
