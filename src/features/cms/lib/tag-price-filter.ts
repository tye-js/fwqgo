export const priceLikeTagSearchTerms = [
  "价格",
  "价钱",
  "报价",
  "多少钱",
  "便宜",
  "低价",
  "优惠",
  "折扣",
  "促销",
  "特价",
  "券",
  "返利",
  "月付",
  "年付",
  "月缴",
  "年缴",
  "price",
  "pricing",
  "cheap",
  "coupon",
  "promo",
  "discount",
  "sale",
  "cost",
  "deal",
  "$",
  "¥",
  "￥",
] as const;

const priceLikeTagRegexes = [
  /(价格|价钱|报价|多少钱|便宜|低价|优惠|折扣|促销|特价|券|返利|月付|年付|月缴|年缴)/i,
  /\b(price|pricing|cheap|coupon|promo|discount|sale|cost|deal)\b/i,
  /[$¥￥€£]\s*\d+/i,
  /\d+(?:\.\d+)?\s*(元|美元|美金|港币|usd|hkd|cny|rmb|\/月|\/年)/i,
];

export function isPriceLikeTag(input: { name: string; slug?: string | null }) {
  const text = `${input.name} ${input.slug ?? ""}`.trim();

  return priceLikeTagRegexes.some((pattern) => pattern.test(text));
}
