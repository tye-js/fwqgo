/**
 * 外部评测站采集到的补充事实。这些字段只承载第三方公开页面已给出的信息，
 * 不参与供应商官网采集的字段锁判定，也不覆盖人工维护的价格与库存。
 */

export type ServerOfferCnPingCarrier = {
  ms: number | null;
  loss: number | null;
  city?: string | null;
  probes?: number | null;
};

export type ServerOfferCnPing = {
  ms: number | null;
  loss: number | null;
  date?: string | null;
  isp?: Record<string, ServerOfferCnPingCarrier> | null;
  src?: string[] | null;
  runs?: number | null;
};

export type ServerOfferGeoPingNode = {
  ms: number | null;
  loss: number | null;
  runs?: number | null;
};

export type ServerOfferGeoPing = {
  date?: string | null;
} & Record<string, ServerOfferGeoPingNode | string | null>;

export type ServerOfferTestIp = {
  loc?: string | null;
  ip: string;
  cnPing?: ServerOfferCnPing | null;
  geoPing?: ServerOfferGeoPing | null;
};
