/**
 * 正文阅读时长估算。
 *
 * 中文按「字/分钟」、拉丁文按「词/分钟」分别折算再相加，因为两者的阅读速度
 * 差着一个数量级——只按字符数算会把英文文章估成中文文章的三分之一。
 *
 * 这里输入的是**已渲染的 HTML**（`renderArticlePresentation` 的产物），所以要先
 * 剥标签再计数，否则 `href`、`class` 里的字母会被算成正文词数。
 */

const CHINESE_CHARACTERS_PER_MINUTE = 400;
const LATIN_WORDS_PER_MINUTE = 220;

/** 任何有正文的文章至少显示 1 分钟，避免出现「约 0 分钟读完」。 */
const MINIMUM_READING_MINUTES = 1;

/**
 * 全局正则一律在函数内重新构造：模块级 `/g` 正则带 `lastIndex` 状态，
 * 并发渲染下会被互相污染。
 */
function countReadingUnits(plainText: string) {
  const chinesePattern = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g;
  const chineseCharacters = plainText.match(chinesePattern)?.length ?? 0;
  const latinWords =
    plainText
      .replace(
        /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff]/g,
        " ",
      )
      .match(/[A-Za-z0-9][A-Za-z0-9'’._-]*/g)?.length ?? 0;

  return { chineseCharacters, latinWords };
}

function decodeBasicEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** 把正文 HTML 压成一段纯文本，供计数使用。 */
export function toArticlePlainText(html: string) {
  return decodeBasicEntities(
    html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** 返回阅读分钟数；正文为空时返回 0，由调用方决定是否渲染这一段。 */
export function estimateArticleReadingMinutes(html: string) {
  const plainText = toArticlePlainText(html);
  if (!plainText) return 0;

  const { chineseCharacters, latinWords } = countReadingUnits(plainText);
  const minutes =
    chineseCharacters / CHINESE_CHARACTERS_PER_MINUTE +
    latinWords / LATIN_WORDS_PER_MINUTE;

  return Math.max(MINIMUM_READING_MINUTES, Math.round(minutes));
}
