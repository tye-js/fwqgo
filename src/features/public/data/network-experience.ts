import type { NetworkExperienceRuleSetSnapshot } from "@fwqgo/core/network-experience";
import { cacheLife } from "next/cache";
import { cacheTags, tagCache } from "@fwqgo/cache/tags";
import { getPublishedNetworkExperienceRuleSnapshot as readSnapshot } from "@/server/network-experience/repository";

export async function getPublishedNetworkExperienceRuleSnapshot(): Promise<NetworkExperienceRuleSetSnapshot | null> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86_400 });
  tagCache(cacheTags.networkExperience);
  try {
    return await readSnapshot();
  } catch (error) {
    console.error("Failed to load published network experience rules:", error);
    return null;
  }
}
