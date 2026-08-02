import {
  INITIAL_NETWORK_EXPERIENCE_RULE_SNAPSHOT,
  matchNetworkExperience,
} from "@fwqgo/core/network-experience";

// The matcher is deliberately pure. This smoke check uses the same shape as a
// published snapshot without requiring a database or a network connection.
const result = matchNetworkExperience(
  {
    schemaVersion: 1,
    userRegion: "east_china",
    carrier: "telecom",
    accessType: "residential",
    destinationRegion: "hong_kong",
    workload: "web_api",
  },
  INITIAL_NETWORK_EXPERIENCE_RULE_SNAPSHOT,
);

if (result.status !== "matched" || result.carrierResults[0]?.suggestions[0]?.networkLineSlug !== "cn2-gia") {
  throw new Error("network experience matcher verification failed");
}

console.log("network experience matcher verification passed");
