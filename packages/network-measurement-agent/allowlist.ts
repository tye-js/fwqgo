export type AgentTarget = {
  targetRevisionId: number;
  addressFamily: "ipv4" | "ipv6";
  targetAddress: string;
  targetPrefix: string;
  port: number | null;
};

export function assertTargetAllowlist(
  target: AgentTarget,
  allowedTargets: readonly AgentTarget[],
) {
  const allowed = allowedTargets.some(
    (item) =>
      item.targetRevisionId === target.targetRevisionId &&
      item.addressFamily === target.addressFamily &&
      item.targetAddress === target.targetAddress &&
      item.targetPrefix === target.targetPrefix &&
      item.port === target.port,
  );
  if (!allowed) throw new Error("目标不在服务端签发的 allowlist 中");
  return target;
}

export function normalizeSignedTargets(value: unknown): AgentTarget[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new Error("任务目标列表无效");
  }
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("任务目标格式无效");
    }
    const target = item as Record<string, unknown>;
    const targetRevisionId = target.targetRevisionId;
    const port = target.port;
    if (
      typeof targetRevisionId !== "number" ||
      !Number.isSafeInteger(targetRevisionId) ||
      targetRevisionId <= 0 ||
      (target.addressFamily !== "ipv4" && target.addressFamily !== "ipv6") ||
      typeof target.targetAddress !== "string" ||
      typeof target.targetPrefix !== "string" ||
      (port !== null &&
        port !== undefined &&
        (typeof port !== "number" ||
          !Number.isSafeInteger(port) ||
          port < 1 ||
          port > 65535))
    ) {
      throw new Error("任务目标字段无效");
    }
    return {
      targetRevisionId,
      addressFamily: target.addressFamily,
      targetAddress: target.targetAddress,
      targetPrefix: target.targetPrefix,
      port: port === undefined ? null : port,
    } satisfies AgentTarget;
  });
}
