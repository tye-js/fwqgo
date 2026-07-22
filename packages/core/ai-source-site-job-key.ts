import { parsePostgresIntegerId } from "./utils";

export const AI_SOURCE_SITE_JOB_KEY_PREFIX = "ai-source-site:";

export function getAiSourceSiteJobKey(sourceSiteId: number) {
  if (parsePostgresIntegerId(sourceSiteId) === null) {
    throw new RangeError("来源站 ID 必须是正整数");
  }

  return `${AI_SOURCE_SITE_JOB_KEY_PREFIX}${sourceSiteId}`;
}

export function parseAiSourceSiteJobKey(jobKey: string) {
  if (!jobKey.startsWith(AI_SOURCE_SITE_JOB_KEY_PREFIX)) return null;

  const sourceSiteIdText = jobKey.slice(AI_SOURCE_SITE_JOB_KEY_PREFIX.length);
  if (!/^[1-9]\d*$/.test(sourceSiteIdText)) return null;

  return parsePostgresIntegerId(sourceSiteIdText);
}
