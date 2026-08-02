import assert from "node:assert/strict";

import {
  calculateServerSizing,
  PUBLISHED_SERVER_SIZING_RULE_SET,
  stableRuleChecksum,
} from "@fwqgo/core/server-sizing";

const { checksum, ...withoutChecksum } = PUBLISHED_SERVER_SIZING_RULE_SET;
assert.equal(checksum, stableRuleChecksum(withoutChecksum));
assert.equal(PUBLISHED_SERVER_SIZING_RULE_SET.status, "published");

const base = {
  schemaVersion: 1 as const,
  workload: { kind: "api_saas" as const },
  traffic: {
    peakRps: 100,
    dynamicRatio: 1,
    edgeCacheHitRatio: 0,
    averageResponseTimeMs: 140,
    averageResponseBytes: 48 * 1024,
  },
  measurements: {
    evidence: "synthetic" as const,
    cpuMsPerRequest: 10,
    peakAppRssGiB: 1,
    representativeDataset: true,
  },
  data: {
    liveDataGiB: 10,
    monthlyGrowthGiB: 1,
    horizonMonths: 12,
    database: "postgresql" as const,
  },
  reliability: { rpoMinutes: 15, rtoMinutes: 60 },
  operations: { managedServicesAllowed: true, skill: "basic" as const },
};
const small = calculateServerSizing(base);
const large = calculateServerSizing({
  ...base,
  traffic: { ...base.traffic, peakRps: 400 },
});
assert.ok(small.recommended && large.recommended);
assert.ok(large.recommended.vcpu.min >= small.recommended.vcpu.min);
assert.ok(large.recommended.networkMbps.egress >= small.recommended.networkMbps.egress);
assert.ok(small.trace.length > 0);

console.log(
  `Server sizing verified: engine=${PUBLISHED_SERVER_SIZING_RULE_SET.engineVersion}, checksum=${checksum}, trace=${small.trace.length}`,
);
