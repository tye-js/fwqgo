import {
  knowledgeUnits,
  renderKnowledgeRecord,
} from "./knowledge/initial-bilingual-content";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition)
    throw new Error(`Knowledge decision coverage failed: ${message}`);
}

const required: Record<string, { zh: RegExp[]; en: RegExp[] }> = {
  "KB-002": {
    zh: [/RPS/i, /CPU/i, /内存/, /存储/, /网络/],
    en: [/RPS/i, /CPU/i, /memory/i, /storage/i, /network/i],
  },
  "KB-006": {
    zh: [/AS4134/, /AS4809/, /CN2 GIA/, /CN2 GT/, /去程/, /回程/],
    en: [/AS4134/, /AS4809/, /CN2 GIA/, /CN2 GT/, /outbound/i, /return/i],
  },
  "KB-007": {
    zh: [/移动/, /联通/, /双向/, /地区/],
    en: [/Mobile/i, /Unicom/i, /bidirectional/i, /region/i],
  },
  "KB-009": {
    zh: [/MTR/, /Traceroute/i, /回程/, /七天|高峰/],
    en: [/MTR/i, /Traceroute/i, /return path/i, /seven-day|busy hours/i],
  },
  "KB-011": {
    zh: [/香港/, /日本/, /新加坡/, /美西/, /电信/, /移动/, /联通/, /矩阵/],
    en: [
      /Hong Kong/i,
      /Japan/i,
      /Singapore/i,
      /US West/i,
      /Telecom/i,
      /Mobile/i,
      /Unicom/i,
      /matrix/i,
    ],
  },
  "KB-030": {
    zh: [/个人/, /企业/, /电商/, /API/, /RPO/, /RTO/],
    en: [/personal/i, /corporate/i, /commerce/i, /API/i, /RPO/i, /RTO/i],
  },
};

for (const [id, patterns] of Object.entries(required)) {
  const unit = knowledgeUnits.find((item) => item.id === id);
  assert(unit, `${id} is missing`);
  for (const language of ["zh", "en"] as const) {
    const record = renderKnowledgeRecord(unit, language);
    const haystack = `${record.title}\n${record.summary}\n${record.content}`;
    for (const pattern of patterns[language]) {
      assert(pattern.test(haystack), `${id}/${language} is missing ${pattern}`);
    }
  }
}

console.log("Knowledge decision coverage verified: KB-002/006/007/009/011/030");
