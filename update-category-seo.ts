import { eq } from "drizzle-orm";
import { db } from "./src/server/db/index.ts";
import { categories } from "./src/server/db/schema.ts";

const seoByCategoryName: Record<
  string,
  { description: string; keywords: string }
> = {
  国外服务器: {
    description:
      "国外服务器分类汇总美国、日本、韩国、香港及欧洲等热门机房的 VPS、云服务器与独立服务器优惠信息，适合建站、跨境业务、外贸出海、流媒体及开发测试等场景。",
    keywords:
      "国外服务器,海外服务器,国外VPS,海外VPS,国外云服务器,海外云服务器,国外主机,国际服务器,便宜国外服务器,国外服务器推荐,海外服务器推荐,跨境服务器",
  },
  国内服务器: {
    description:
      "国内服务器分类提供大陆机房云服务器、VPS 与独立服务器优惠汇总，覆盖低延迟建站、企业应用部署、备案业务、电商系统和高可用业务等常见需求。",
    keywords:
      "国内服务器,国内VPS,国内云服务器,大陆服务器,大陆VPS,国内主机,国内高防服务器,国内机房服务器,备案服务器,低延迟服务器,国内服务器推荐,国内云主机",
  },
  站长推荐: {
    description:
      "站长推荐分类精选稳定性高、口碑好、性价比突出的 VPS、云服务器和独立服务器，重点关注线路质量、商家信誉、售后能力与长期使用体验。",
    keywords:
      "站长推荐服务器,站长推荐VPS,服务器推荐,VPS推荐,云服务器推荐,高性价比服务器,稳定服务器,建站服务器推荐,国外服务器推荐,国内服务器推荐,靠谱服务器商家",
  },
  高防服务器: {
    description:
      "高防服务器分类聚合适合防御 DDoS、CC 攻击和恶意流量清洗的高防 VPS、高防云服务器及高防独立服务器，适用于游戏、支付、站群和业务防护场景。",
    keywords:
      "高防服务器,高防VPS,高防云服务器,DDoS防御服务器,CC防护服务器,抗攻击服务器,游戏高防服务器,美国高防服务器,香港高防服务器,高防主机,高防独立服务器",
  },
  出海服务器: {
    description:
      "出海服务器分类面向跨境电商、外贸官网、海外投放、SaaS 和国际业务部署，汇总低延迟、稳定线路、多地域可选的海外服务器与云主机方案。",
    keywords:
      "出海服务器,企业出海服务器,跨境电商服务器,外贸服务器,海外业务服务器,国际线路服务器,海外云服务器,跨境服务器,海外建站服务器,全球节点服务器,出海VPS",
  },
  原生IP服务器: {
    description:
      "原生IP服务器分类汇总原生 IP、住宅属性 IP、ISP IP 与干净 IP 服务器资源，适合跨境电商、社媒运营、广告投放、流媒体解锁与账号环境隔离等用途。",
    keywords:
      "原生IP服务器,原生IP VPS,住宅IP服务器,ISP IP服务器,干净IP服务器,原生住宅IP,海外原生IP,流媒体原生IP,跨境电商IP服务器,社媒运营服务器,原生IP云服务器",
  },
  便宜的服务器: {
    description:
      "便宜的服务器分类整理价格实惠、配置均衡、性价比高的 VPS、云服务器和独立服务器优惠，适合个人建站、轻量应用、博客、测试环境和入门业务部署。",
    keywords:
      "便宜的服务器,便宜VPS,便宜云服务器,低价服务器,高性价比服务器,便宜国外服务器,便宜国内服务器,入门服务器,学生服务器,优惠服务器,特价VPS,便宜主机",
  },
  美国服务器: {
    description:
      "美国服务器分类汇总洛杉矶、圣何塞、西雅图等热门美国机房的 VPS、云服务器与独立服务器优惠，适合建站、跨境电商、外贸业务和国际访问场景。",
    keywords:
      "美国服务器,美国VPS,美国云服务器,洛杉矶服务器,洛杉矶VPS,圣何塞服务器,西雅图服务器,美国主机,便宜美国服务器,美国独立服务器,美国CN2服务器,美国机房VPS",
  },
  日本服务器: {
    description:
      "日本服务器分类聚合东京、大阪等日本机房服务器优惠，兼顾亚洲低延迟、国际带宽与稳定性，适合日区业务、游戏部署、外贸网站和亚太地区访问优化。",
    keywords:
      "日本服务器,日本VPS,日本云服务器,东京服务器,东京VPS,日本主机,低延迟日本服务器,亚洲服务器,日本独立服务器,日本机房服务器,日本线路VPS,便宜日本服务器",
  },
  韩国服务器: {
    description:
      "韩国服务器分类收录首尔等韩国机房的 VPS、云服务器和独立服务器方案，适合韩区业务、东亚低延迟访问、游戏加速、跨境建站和内容分发场景。",
    keywords:
      "韩国服务器,韩国VPS,韩国云服务器,首尔服务器,首尔VPS,韩国主机,韩国独立服务器,亚洲低延迟服务器,韩国机房服务器,便宜韩国服务器,韩国线路VPS,东亚服务器",
  },
  "香港服务器CN": {
    description:
      "香港服务器 CN 分类重点整理香港 CN2、直连、低延迟线路服务器优惠，适合大陆访问优化、免备案建站、跨境业务、外贸官网和高质量网络传输需求。",
    keywords:
      "香港服务器,香港VPS,香港云服务器,香港CN2服务器,香港CN2 VPS,香港直连服务器,香港免备案服务器,香港主机,低延迟香港服务器,香港独立服务器,香港线路VPS,大陆直连服务器",
  },
  不限流量服务器: {
    description:
      "不限流量服务器分类汇总支持大流量、无限流量或超高月流量配额的 VPS 与云服务器，适合下载分发、视频业务、站群项目和高访问量网站使用。",
    keywords:
      "不限流量服务器,无限流量服务器,不限流量VPS,无限流量VPS,大流量服务器,高流量云服务器,下载服务器,视频服务器,站群服务器,海外不限流量服务器,大带宽不限流量服务器",
  },
  超大带宽服务器: {
    description:
      "超大带宽服务器分类聚合 1Gbps、10Gbps 及更高带宽的 VPS、云服务器与独立服务器资源，适合流媒体、下载分发、直播、加速节点和高并发业务场景。",
    keywords:
      "超大带宽服务器,大带宽服务器,高带宽VPS,1Gbps服务器,10Gbps服务器,大带宽云服务器,高速服务器,流媒体服务器,下载分发服务器,直播服务器,高并发服务器,带宽充足服务器",
  },
  免费的服务器: {
    description:
      "免费的服务器分类整理免费 VPS、免费云服务器、试用服务器和限时体验活动，适合测试环境、个人学习、开发验证和低成本体验各类服务器产品。",
    keywords:
      "免费的服务器,免费服务器,免费VPS,免费云服务器,服务器试用,免费主机,免费国外服务器,云服务器试用,开发测试服务器,免费体验服务器,学生免费服务器,限时试用VPS",
  },
};

async function main() {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
    })
    .from(categories)
    .orderBy(categories.id);

  for (const row of rows) {
    const seo = seoByCategoryName[row.name];

    if (!seo) {
      console.warn(`Skipped category without SEO template: ${row.name}`);
      continue;
    }

    await db
      .update(categories)
      .set({
        description: seo.description,
        keywords: seo.keywords,
        updatedAt: new Date(),
      })
      .where(eq(categories.id, row.id));

    console.log(`Updated category #${row.id}: ${row.name}`);
  }
}

await main();
