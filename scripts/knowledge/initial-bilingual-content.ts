import { getReaderGuidance } from "./reader-guidance";

export const KNOWLEDGE_VERIFIED_DATE = "2026-07-26";
export const KNOWLEDGE_CONTENT_VERSION = 2;
export const KNOWLEDGE_CARD_VERSION = 1;

type KnowledgePriority = "P0" | "P1";
type KnowledgeLanguage = "zh" | "en";
export type KnowledgeContentRole =
  "decision_core" | "decision_reference" | "post_purchase_guide";

type LocalizedKnowledgeDraft = {
  title: string;
  slug: string;
  summary: string;
  keywords: string[];
  aliases: string[];
  retrievalTerms: string[];
  audience: string;
  avoid: string;
  takeaway: string;
  concepts: Array<readonly [term: string, explanation: string]>;
  steps: string[];
  commands?: Array<{
    label: string;
    language: "bash" | "nginx" | "yaml";
    code: string;
  }>;
  verification: string[];
  pitfalls: string[];
};

type KnowledgeCardCopy = {
  definition: string;
  highlights: string[];
  quickTip: string;
};

type KnowledgeSource = {
  grade: "A" | "B" | "C";
  url: string;
  zhLabel: string;
  enLabel: string;
  zhClaim: string;
  enClaim: string;
};

const sources = {
  nistCloud: {
    grade: "A",
    url: "https://csrc.nist.gov/pubs/sp/800/145/final",
    zhLabel: "NIST SP 800-145 云计算定义",
    enLabel: "NIST SP 800-145, The NIST Definition of Cloud Computing",
    zhClaim: "云计算的资源池、按需自助、弹性和可计量服务定义",
    enClaim:
      "Defines resource pooling, on-demand access, elasticity, and measured cloud service",
  },
  nistServerSecurity: {
    grade: "A",
    url: "https://csrc.nist.gov/pubs/sp/800/123/final",
    zhLabel: "NIST SP 800-123 通用服务器安全指南",
    enLabel: "NIST SP 800-123, Guide to General Server Security",
    zhClaim: "服务器规划、部署、维护和最小化服务的安全基线",
    enClaim:
      "Provides a baseline for planning, deploying, maintaining, and minimizing server services",
  },
  nistContingency: {
    grade: "A",
    url: "https://csrc.nist.gov/pubs/sp/800/34/r1/upd1/final",
    zhLabel: "NIST SP 800-34 Rev.1 应急与恢复指南",
    enLabel: "NIST SP 800-34 Rev.1, Contingency Planning Guide",
    zhClaim: "备份、恢复、替代位置和恢复测试的规划原则",
    enClaim:
      "Covers backup, recovery, alternate locations, and recovery testing principles",
  },
  rfc4271: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc4271",
    zhLabel: "RFC 4271 Border Gateway Protocol 4",
    enLabel: "RFC 4271, Border Gateway Protocol 4",
    zhClaim: "BGP 的路径属性、可达性通告和自治系统间路由机制",
    enClaim:
      "Defines BGP path attributes, reachability advertisements, and inter-AS routing",
  },
  rfc2680: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc2680",
    zhLabel: "RFC 2680 单向丢包指标",
    enLabel: "RFC 2680, One-way Packet Loss Metric",
    zhClaim: "丢包的可测量定义、采样边界和结果解释",
    enClaim:
      "Defines measurable packet loss, sampling boundaries, and result interpretation",
  },
  rfc2681: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc2681",
    zhLabel: "RFC 2681 往返时延指标",
    enLabel: "RFC 2681, Round-trip Delay Metric",
    zhClaim: "往返时延的测量定义和时钟、路径等限制",
    enClaim:
      "Defines round-trip delay measurement and its clock and path limitations",
  },
  rfc3393: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc3393",
    zhLabel: "RFC 3393 IP 包时延变化指标",
    enLabel: "RFC 3393, IP Packet Delay Variation Metric",
    zhClaim: "抖动对应的包时延变化定义和统计方法",
    enClaim:
      "Defines packet delay variation and statistical treatment related to jitter",
  },
  rfc8200: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc8200",
    zhLabel: "RFC 8200 IPv6 规范",
    enLabel: "RFC 8200, Internet Protocol Version 6",
    zhClaim: "IPv6 地址、基础首部和扩展首部的协议定义",
    enClaim: "Defines IPv6 addressing, the base header, and extension headers",
  },
  rfc791: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc791",
    zhLabel: "RFC 791 Internet Protocol",
    enLabel: "RFC 791, Internet Protocol",
    zhClaim: "IPv4 数据报、地址和分片的基础协议定义",
    enClaim: "Defines IPv4 datagrams, addressing, and fragmentation",
  },
  rfc1034: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc1034",
    zhLabel: "RFC 1034 DNS 概念与设施",
    enLabel: "RFC 1034, Domain Names - Concepts and Facilities",
    zhClaim: "DNS 名称空间、委派、缓存和解析模型",
    enClaim:
      "Defines the DNS namespace, delegation, caching, and resolution model",
  },
  rfc1035: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc1035",
    zhLabel: "RFC 1035 DNS 实现与规范",
    enLabel: "RFC 1035, Domain Names - Implementation and Specification",
    zhClaim: "DNS 报文和常用资源记录格式",
    enClaim: "Defines DNS messages and common resource record formats",
  },
  rdap: {
    grade: "A",
    url: "https://www.rfc-editor.org/rfc/rfc9083",
    zhLabel: "RFC 9083 RDAP 查询响应",
    enLabel: "RFC 9083, JSON Responses for RDAP",
    zhClaim: "IP 网络、ASN 和实体注册数据的标准查询响应",
    enClaim:
      "Defines standard responses for IP network, ASN, and registration entity data",
  },
  ianaAsn: {
    grade: "A",
    url: "https://www.iana.org/assignments/as-numbers/as-numbers.xhtml",
    zhLabel: "IANA 自治系统号注册表",
    enLabel: "IANA Autonomous System Numbers Registry",
    zhClaim: "ASN 编号空间和分配状态的权威注册信息",
    enClaim:
      "Provides the authoritative ASN number space and allocation status",
  },
  mtr: {
    grade: "A",
    url: "https://github.com/traviscross/mtr",
    zhLabel: "MTR 官方项目文档",
    enLabel: "MTR official project documentation",
    zhClaim: "MTR 的连续探测、报告模式和字段含义",
    enClaim: "Documents continuous probing, report mode, and MTR output fields",
  },
  iperf3: {
    grade: "A",
    url: "https://software.es.net/iperf/invoking.html",
    zhLabel: "ESnet iperf3 官方文档",
    enLabel: "ESnet iperf3 official documentation",
    zhClaim: "TCP、UDP 吞吐与并发流测试参数和结果边界",
    enClaim:
      "Documents TCP and UDP throughput tests, parallel streams, and result limits",
  },
  kvm: {
    grade: "A",
    url: "https://www.linux-kvm.org/page/Documents",
    zhLabel: "Linux KVM 官方文档",
    enLabel: "Linux KVM official documentation",
    zhClaim: "KVM 的硬件辅助虚拟化和虚拟机运行模型",
    enClaim:
      "Documents KVM hardware-assisted virtualization and virtual machine operation",
  },
  lxc: {
    grade: "A",
    url: "https://linuxcontainers.org/lxc/introduction/",
    zhLabel: "Linux Containers LXC 官方介绍",
    enLabel: "Linux Containers, LXC introduction",
    zhClaim: "系统容器共享宿主内核和隔离机制的基本模型",
    enClaim:
      "Explains the shared-kernel system container model and isolation mechanisms",
  },
  nvme: {
    grade: "A",
    url: "https://nvmexpress.org/specifications/",
    zhLabel: "NVM Express 官方规范",
    enLabel: "NVM Express official specifications",
    zhClaim: "NVMe 协议、队列和设备接口的规范边界",
    enClaim:
      "Defines the NVMe protocol, queue model, and device interface boundaries",
  },
  fio: {
    grade: "A",
    url: "https://fio.readthedocs.io/en/latest/fio_doc.html",
    zhLabel: "fio 官方文档",
    enLabel: "fio official documentation",
    zhClaim: "存储延迟、IOPS、带宽和测试作业参数",
    enClaim:
      "Documents storage latency, IOPS, bandwidth, and workload parameters",
  },
  dockerCompose: {
    grade: "A",
    url: "https://docs.docker.com/compose/",
    zhLabel: "Docker Compose 官方文档",
    enLabel: "Docker Compose official documentation",
    zhClaim: "Compose 模型、服务、网络、卷和生命周期命令",
    enClaim:
      "Documents the Compose model, services, networks, volumes, and lifecycle commands",
  },
  nginxProxy: {
    grade: "A",
    url: "https://nginx.org/en/docs/http/ngx_http_proxy_module.html",
    zhLabel: "Nginx HTTP Proxy 模块文档",
    enLabel: "Nginx HTTP proxy module documentation",
    zhClaim: "反向代理请求、首部、超时和上游连接配置",
    enClaim:
      "Documents proxied requests, headers, timeouts, and upstream connections",
  },
  certbot: {
    grade: "A",
    url: "https://eff-certbot.readthedocs.io/en/stable/using.html",
    zhLabel: "Certbot 官方使用文档",
    enLabel: "Certbot official user guide",
    zhClaim: "证书签发、安装、续期和验证流程",
    enClaim:
      "Documents certificate issuance, installation, renewal, and verification",
  },
  openssh: {
    grade: "A",
    url: "https://man.openbsd.org/sshd_config",
    zhLabel: "OpenSSH sshd_config 手册",
    enLabel: "OpenSSH sshd_config manual",
    zhClaim: "密钥认证、密码认证、root 登录和配置校验选项",
    enClaim:
      "Defines key authentication, password authentication, root login, and validation options",
  },
  ubuntuSecurity: {
    grade: "A",
    url: "https://documentation.ubuntu.com/server/how-to/security/",
    zhLabel: "Ubuntu Server 安全文档",
    enLabel: "Ubuntu Server security documentation",
    zhClaim: "系统更新、防火墙、账户和服务加固的操作边界",
    enClaim:
      "Documents updates, firewalling, accounts, and service hardening boundaries",
  },
  postgresBackup: {
    grade: "A",
    url: "https://www.postgresql.org/docs/current/backup.html",
    zhLabel: "PostgreSQL 备份与恢复文档",
    enLabel: "PostgreSQL backup and restore documentation",
    zhClaim: "SQL 转储、文件系统备份和连续归档的适用边界",
    enClaim:
      "Explains SQL dumps, file-system backups, and continuous archiving",
  },
  cisaDdos: {
    grade: "A",
    url: "https://www.cisa.gov/news-events/news/understanding-denial-service-attacks",
    zhLabel: "CISA 拒绝服务攻击说明",
    enLabel: "CISA, Understanding Denial-of-Service Attacks",
    zhClaim: "DoS/DDoS 风险、症状和缓解原则",
    enClaim: "Explains DoS and DDoS risks, symptoms, and mitigation principles",
  },
  googleSreMonitoring: {
    grade: "A",
    url: "https://sre.google/sre-book/monitoring-distributed-systems/",
    zhLabel: "Google SRE 分布式系统监控章节",
    enLabel: "Google SRE Book, Monitoring Distributed Systems",
    zhClaim: "延迟、流量、错误、饱和度和可操作告警原则",
    enClaim:
      "Defines latency, traffic, errors, saturation, and actionable alerting principles",
  },
  prometheus: {
    grade: "A",
    url: "https://prometheus.io/docs/practices/alerting/",
    zhLabel: "Prometheus 告警实践文档",
    enLabel: "Prometheus alerting practices",
    zhClaim: "告警规则、等待时间、标签和可操作通知的实践",
    enClaim:
      "Documents alert rules, pending duration, labels, and actionable notifications",
  },
  mef: {
    grade: "A",
    url: "https://www.mef.net/service-standards/",
    zhLabel: "MEF 服务标准",
    enLabel: "MEF service standards",
    zhClaim: "运营商以太网和连接服务的标准属性与服务边界",
    enClaim:
      "Defines standardized attributes and boundaries for carrier connectivity services",
  },
  ctgTransit: {
    grade: "A",
    url: "https://www.chinatelecomglobal.com/products/Internet-Access/IP-Transit",
    zhLabel: "中国电信国际 IP Transit 产品说明",
    enLabel: "China Telecom Global IP Transit service description",
    zhClaim: "运营商国际 IP Transit 的服务范围；不证明单台 VPS 的实际路径",
    enClaim:
      "Describes an operator IP transit service without proving the path of an individual VPS",
  },
  cmiTransit: {
    grade: "A",
    url: "https://www.cmi.chinamobile.com/en/solutions/internet-services/",
    zhLabel: "中国移动国际 Internet Services",
    enLabel: "China Mobile International Internet Services",
    zhClaim: "移动国际互联网连接服务范围；实际路由仍需端到端测量",
    enClaim:
      "Describes international connectivity services while endpoint routes still require measurement",
  },
  linuxNetworking: {
    grade: "A",
    url: "https://man7.org/linux/man-pages/man8/ss.8.html",
    zhLabel: "Linux ss(8) 手册",
    enLabel: "Linux ss(8) manual",
    zhClaim: "监听端口、连接状态和进程关联的检查方法",
    enClaim:
      "Documents inspection of listening ports, connection state, and associated processes",
  },
} as const satisfies Record<string, KnowledgeSource>;

type KnowledgeSourceKey = keyof typeof sources;

export type KnowledgeUnit = {
  id: `KB-${string}`;
  priority: KnowledgePriority;
  categorySlug:
    | "server-configuration"
    | "network-routes"
    | "datacenter-regions"
    | "ip-network"
    | "system-operations"
    | "security-use-cases";
  reviewMonths: 3 | 6 | 12;
  sourceKeys: KnowledgeSourceKey[];
  relatedIds: Array<`KB-${string}`>;
  contentRole?: KnowledgeContentRole;
  zh: LocalizedKnowledgeDraft;
  en: LocalizedKnowledgeDraft;
};

const POST_PURCHASE_GUIDE_IDS = new Set([
  "KB-021",
  "KB-022",
  "KB-023",
  "KB-024",
  "KB-025",
  "KB-026",
  "KB-028",
  "KB-029",
]);

const DECISION_REFERENCE_IDS = new Set([
  "KB-004",
  "KB-005",
  "KB-008",
  "KB-010",
  "KB-016",
  "KB-018",
  "KB-019",
  "KB-027",
]);

function knowledgeContentRole(unit: KnowledgeUnit): KnowledgeContentRole {
  if (unit.contentRole) return unit.contentRole;
  if (POST_PURCHASE_GUIDE_IDS.has(unit.id)) return "post_purchase_guide";
  if (DECISION_REFERENCE_IDS.has(unit.id)) return "decision_reference";
  return "decision_core";
}

export const knowledgeUnits: KnowledgeUnit[] = [
  {
    id: "KB-001",
    priority: "P0",
    categorySlug: "server-configuration",
    reviewMonths: 12,
    sourceKeys: ["nistCloud", "nistServerSecurity"],
    relatedIds: ["KB-006", "KB-012", "KB-021"],
    zh: {
      title: "VPS、云服务器和独立服务器有什么区别？新手怎么选",
      slug: "vps-cloud-server-dedicated-server-differences",
      summary:
        "从资源隔离、弹性、管理责任和故障边界比较 VPS、云服务器与独立服务器，并给出按业务负载、扩容需求和运维能力选择产品形态的可执行方法。",
      keywords: [
        "VPS",
        "云服务器",
        "独立服务器",
        "虚拟化",
        "服务器选型",
        "资源隔离",
      ],
      aliases: ["虚拟专用服务器", "Virtual Private Server", "裸金属服务器"],
      retrievalTerms: [
        "VPS 和云服务器区别",
        "独立服务器怎么选",
        "新手服务器选型",
        "共享资源还是独享资源",
        "云主机适合什么业务",
        "裸金属服务器用途",
      ],
      audience:
        "正在为网站、API、数据库或开发环境选择第一台服务器，并希望先理解产品形态而不是只比较配置数字的用户。",
      avoid:
        "需要采购合同、合规认证或明确硬件拓扑的企业项目不能只依据产品名称，必须向供应商确认实例、网络和故障恢复条款。",
      takeaway:
        "VPS 强调虚拟机资源配额，云服务器通常增加可编排和弹性能力，独立服务器提供整机控制；真正的选择依据是隔离、扩容、可用性和运维责任。",
      concepts: [
        [
          "资源边界",
          "VPS 和云实例共享物理资源但由虚拟化隔离；独立服务器通常独占整机，仍可能共享上游网络和供电设施。",
        ],
        [
          "弹性能力",
          "云产品常提供镜像、快照、API 和快速扩缩容，但具体功能属于供应商实现，不能由“云”字自动推定。",
        ],
        [
          "管理责任",
          "无论哪种形态，自管理服务器通常都要求用户负责系统更新、账户、备份和应用安全。",
        ],
      ],
      steps: [
        "先记录业务的并发、数据量、磁盘延迟、网络和恢复时间目标。",
        "判断是否需要独占硬件、快速扩容、多可用区或自动化 API。",
        "用小规模基准和故障恢复演练验证候选产品，不用单一 CPU 型号或营销名称下结论。",
      ],
      verification: [
        "在实例内核对 CPU、内存、块设备和虚拟化信息，并与控制台配额对应。",
        "执行一次快照恢复或异地备份恢复，记录恢复时间和缺失步骤。",
      ],
      pitfalls: [
        "“云服务器”不是统一性能等级，相同名称可能对应不同超售、存储和网络实现。",
        "独立服务器降低计算资源争用，但不会自动解决备份、单机故障和上游网络中断。",
      ],
    },
    en: {
      title: "VPS vs Cloud Servers vs Dedicated Servers: How to Choose",
      slug: "vps-vs-cloud-vs-dedicated-servers",
      summary:
        "Compare VPS, cloud, and dedicated servers by isolation, elasticity, operational responsibility, and failure boundaries, then choose a platform from workload evidence instead of product labels alone.",
      keywords: [
        "VPS",
        "cloud server",
        "dedicated server",
        "virtualization",
        "server selection",
        "resource isolation",
      ],
      aliases: ["Virtual Private Server", "bare metal server"],
      retrievalTerms: [
        "VPS vs cloud server",
        "when to use a dedicated server",
        "first server selection",
        "shared or dedicated compute",
        "cloud instance use cases",
        "bare metal hosting",
      ],
      audience:
        "People selecting a first server for a website, API, database, or development environment who need to understand platform boundaries before comparing specifications.",
      avoid:
        "Enterprise procurement that requires contractual topology, compliance evidence, or recovery guarantees must validate the provider's exact instance, network, and support terms.",
      takeaway:
        "A VPS is primarily a virtual machine allocation, cloud services commonly add orchestration and elasticity, and dedicated servers provide control of a whole machine; isolation, scaling, availability, and operating responsibility decide the fit.",
      concepts: [
        [
          "Resource boundary",
          "VPS and cloud instances share physical infrastructure behind virtualization. Dedicated servers generally reserve a machine but can still share upstream power and network facilities.",
        ],
        [
          "Elasticity",
          "Cloud platforms often expose images, snapshots, APIs, and rapid resizing, but those capabilities are provider implementations rather than guarantees implied by the word cloud.",
        ],
        [
          "Operating responsibility",
          "With self-managed hosting, the customer normally remains responsible for patching, accounts, backups, and application security on every platform type.",
        ],
      ],
      steps: [
        "Record concurrency, data size, storage latency, network demand, recovery time, and recovery point objectives. specify measurable requirements before selecting a product.",
        "Decide whether the workload needs exclusive hardware, rapid scaling, multiple failure domains, or automation APIs.",
        "Run a small workload benchmark and a recovery exercise on each candidate instead of deciding from one CPU model or marketing label.",
      ],
      verification: [
        "Inspect CPU, memory, block devices, and virtualization from inside the instance and reconcile them with control-plane quotas.",
        "Restore one snapshot or off-site backup and record the elapsed time and every manual dependency.",
      ],
      pitfalls: [
        "Cloud server is not a universal performance tier; oversubscription, storage, and network implementations vary.",
        "Dedicated hardware reduces compute contention but does not automatically provide backups, redundancy, or protection from upstream outages.",
      ],
    },
  },
  {
    id: "KB-002",
    priority: "P0",
    categorySlug: "server-configuration",
    reviewMonths: 12,
    sourceKeys: ["googleSreMonitoring", "fio"],
    relatedIds: ["KB-001", "KB-023", "KB-028"],
    zh: {
      title: "CPU、内存、硬盘怎么配：按网站、应用和数据库选 VPS",
      slug: "vps-cpu-memory-storage-sizing",
      summary:
        "用 CPU 饱和度、内存工作集、磁盘延迟与容量增长来估算 VPS 配置，覆盖静态网站、动态应用和数据库，并说明如何通过监控与压测逐步校准余量。",
      keywords: [
        "VPS 配置",
        "CPU 核数",
        "服务器内存",
        "磁盘容量",
        "数据库性能",
        "容量规划",
      ],
      aliases: ["资源规格", "服务器容量规划"],
      retrievalTerms: [
        "VPS 需要几核",
        "网站需要多少内存",
        "数据库硬盘怎么选",
        "服务器配置估算",
        "CPU 内存容量规划",
        "VPS 配置不够怎么办",
      ],
      audience:
        "已有业务类型和大致访问量，希望从可测指标估算首个配置并保留合理扩容空间的站长和运维人员。",
      avoid:
        "没有流量模型、数据库大小或任务类型时，任何固定配置推荐都只是猜测；关键业务应先做样本压测。",
      takeaway:
        "CPU 由持续计算和并发决定，内存由工作集和缓存决定，存储同时受容量、延迟和 IOPS 约束；先测基线，再按瓶颈扩容。",
      concepts: [
        [
          "CPU 饱和",
          "持续高利用率、运行队列增长或请求排队说明计算余量不足，瞬时峰值本身不等于必须加核。",
        ],
        [
          "内存工作集",
          "应用常驻内存、数据库缓存和系统页缓存共同构成需求；频繁 swap 通常会显著放大延迟。",
        ],
        [
          "存储约束",
          "容量只是一项指标，数据库和队列还要观察随机 I/O 延迟、IOPS 与持久化语义。",
        ],
        [
          "估算公式",
          "峰值源站 RPS = 峰值总 RPS × [动态比例 + (1 - 动态比例) × (1 - 边缘缓存命中率)]；CPU 需求还要结合每请求 CPU 毫秒、目标利用率和后台余量。",
        ],
        [
          "网络需求",
          "出口 Mbps 由源站 RPS、平均响应体字节和网络利用率共同决定；上传、下载、备份和数据库复制应分开估算。",
        ],
      ],
      steps: [
        "列出 Web、后台任务、数据库、缓存和日志保留各自的资源需求。",
        "在代表性数据和并发下压测，记录 CPU、内存、磁盘延迟和错误率。",
        "为正常增长和故障处理保留余量，设置达到阈值后的扩容或拆分方案。",
      ],
      verification: [
        "高峰期同时查看 CPU 利用率、load、可用内存、swap、磁盘延迟和应用响应时间。",
        "扩容前后使用相同负载复测，确认瓶颈移动而不是只看单项资源下降。",
      ],
      pitfalls: [
        "只按日访问量估算会忽略缓存命中、请求复杂度和后台任务。",
        "把全部内存分给数据库会挤压系统和其他进程，反而触发回收或 OOM。",
      ],
    },
    en: {
      title: "How to Size CPU, RAM, and Storage for a VPS",
      slug: "how-to-size-cpu-ram-storage-for-vps",
      summary:
        "Size a VPS from CPU saturation, memory working set, storage latency, and data growth for websites, applications, and databases, then refine headroom with repeatable monitoring and load tests.",
      keywords: [
        "VPS sizing",
        "vCPU",
        "server memory",
        "storage capacity",
        "database performance",
        "capacity planning",
      ],
      aliases: ["resource sizing", "server capacity planning"],
      retrievalTerms: [
        "how many vCPU for a VPS",
        "RAM needed for a website",
        "database storage sizing",
        "server capacity estimate",
        "CPU and memory planning",
        "when to resize a VPS",
      ],
      audience:
        "Operators who know the workload type and rough demand and want an evidence-based initial size with a defined expansion margin.",
      avoid:
        "A fixed plan recommendation without a traffic model, data set, or task profile is speculation; critical services need a representative load test first.",
      takeaway:
        "CPU follows sustained computation and concurrency, RAM follows the working set and caches, and storage is constrained by capacity, latency, and IOPS. Establish a baseline and scale the measured bottleneck.",
      concepts: [
        [
          "CPU saturation",
          "Sustained utilization, a growing run queue, or request queueing indicates limited compute headroom; a short spike alone does not prove that more cores are needed.",
        ],
        [
          "Memory working set",
          "Resident application memory, database caches, and the operating system page cache all matter. Repeated swapping commonly causes severe latency.",
        ],
        [
          "Storage constraints",
          "Capacity is only one dimension. Databases and queues also depend on random I/O latency, IOPS, and persistence behavior.",
        ],
        [
          "Sizing formulas",
          "Peak origin RPS = peak total RPS × [dynamic ratio + (1 - dynamic ratio) × (1 - edge-cache hit ratio)]; CPU sizing also needs CPU milliseconds per request, target utilization, and background reserve.",
        ],
        [
          "Network demand",
          "Egress Mbps follows origin RPS, average response bytes, and the target network utilization; uploads, downloads, backups, and database replication should be estimated separately.",
        ],
      ],
      steps: [
        "List resource demand for the web process, jobs, database, cache, and retained logs separately.",
        "Load test representative data and concurrency while recording CPU, memory, storage latency, and errors.",
        "Reserve headroom for normal growth and incident work, and define the threshold that triggers resizing or service separation.",
      ],
      verification: [
        "At peak demand, correlate CPU, load, available memory, swap, storage latency, and application response time.",
        "Repeat the same workload before and after resizing to confirm that the actual bottleneck moved.",
      ],
      pitfalls: [
        "Daily visit counts ignore cache hit rate, request complexity, and background work.",
        "Allocating nearly all RAM to a database can starve the operating system and trigger reclaim or out-of-memory termination.",
      ],
    },
  },
  {
    id: "KB-003",
    priority: "P1",
    categorySlug: "server-configuration",
    reviewMonths: 12,
    sourceKeys: ["iperf3", "rfc2681"],
    relatedIds: ["KB-002", "KB-009", "KB-029"],
    zh: {
      title: "带宽、流量和端口速度是什么意思？怎么判断够不够用",
      slug: "bandwidth-traffic-port-speed-explained",
      summary:
        "区分端口速率、持续吞吐、月度流量和共享带宽，说明如何把页面大小、并发、峰值与传输方向换算为需求，并用 iperf3 和业务指标验证。",
      keywords: [
        "服务器带宽",
        "月度流量",
        "端口速度",
        "网络吞吐",
        "iperf3",
        "流量估算",
      ],
      aliases: ["Data Transfer", "Port Speed", "吞吐量"],
      retrievalTerms: [
        "100Mbps 端口够不够",
        "带宽和流量区别",
        "VPS 月流量怎么算",
        "共享带宽是什么意思",
        "服务器测速方法",
        "上下行带宽怎么看",
      ],
      audience:
        "需要估算网站、下载、备份或 API 网络容量，并能在客户端和服务器两端执行测试的用户。",
      avoid:
        "单次测速不能代表整月、所有地区或所有方向；跨境业务必须在目标网络和高峰时段重复测量。",
      takeaway:
        "端口速率是接口上限，吞吐是实际传输结果，流量是累计数据量；容量判断必须同时考虑峰值、持续时长、并发和链路质量。",
      concepts: [
        [
          "端口速率",
          "标称 1Gbps 表示接口理论上限，不等于单连接、跨网或全天都能达到。",
        ],
        [
          "月度流量",
          "流量按传输字节累计，供应商是否双向计费、如何取整必须查具体规则。",
        ],
        [
          "有效吞吐",
          "协议开销、时延、丢包、拥塞控制和对端性能都会使应用吞吐低于端口速率。",
        ],
      ],
      steps: [
        "按对象大小、请求次数、并发传输和备份窗口估算峰值与月度字节数。",
        "分别记录入站、出站和单连接、多连接需求。",
        "在目标地区使用受控 iperf3 节点和真实下载复测，保留时间与参数。",
      ],
      verification: [
        "对比接口计数器、供应商流量图和应用日志中的传输字节。",
        "用多次、双向、不同并发流测试区分单连接限制与总吞吐限制。",
      ],
      pitfalls: [
        "把 Mbps 当成 MB/s 会产生约八倍换算误差，且未计协议开销。",
        "公网测速服务器本身可能限速，不能只凭一个节点判断供应商端口。",
      ],
    },
    en: {
      title: "Server Bandwidth, Data Transfer, and Port Speed Explained",
      slug: "server-bandwidth-data-transfer-port-speed-guide",
      summary:
        "Separate port speed, sustained throughput, monthly data transfer, and shared capacity, then estimate demand from object size, concurrency, peaks, direction, and repeatable iperf3 measurements.",
      keywords: [
        "server bandwidth",
        "data transfer",
        "port speed",
        "network throughput",
        "iperf3",
        "traffic estimate",
      ],
      aliases: ["transfer quota", "link speed", "throughput"],
      retrievalTerms: [
        "is a 100 Mbps port enough",
        "bandwidth vs data transfer",
        "VPS monthly traffic estimate",
        "shared bandwidth meaning",
        "server throughput test",
        "inbound vs outbound bandwidth",
      ],
      audience:
        "People sizing network capacity for websites, downloads, backups, or APIs who can test from both a client and the server.",
      avoid:
        "One speed test cannot represent a full month, every region, or both directions. Cross-network traffic requires repeated tests from the target access networks and busy periods.",
      takeaway:
        "Port speed is an interface ceiling, throughput is an observed transfer rate, and data transfer is accumulated volume. Capacity must account for peak rate, duration, concurrency, and path quality.",
      concepts: [
        [
          "Port speed",
          "A 1 Gbps label is a theoretical interface ceiling, not a promise that one flow or every Internet path will sustain that rate.",
        ],
        [
          "Data transfer",
          "Transfer quotas count bytes over time. Whether inbound and outbound traffic are counted and how usage is rounded are provider-specific rules.",
        ],
        [
          "Useful throughput",
          "Protocol overhead, latency, loss, congestion control, and endpoint limits reduce application throughput below line rate.",
        ],
      ],
      steps: [
        "Estimate peak and monthly bytes from object sizes, request counts, concurrent transfers, and backup windows.",
        "Separate inbound, outbound, single-flow, and aggregate requirements.",
        "Test from relevant regions with controlled iperf3 endpoints and real application downloads, preserving time and parameters.",
      ],
      verification: [
        "Reconcile interface counters, provider usage graphs, and transfer bytes in application logs.",
        "Use repeated bidirectional tests with different parallel-stream counts to separate per-flow limits from aggregate capacity.",
      ],
      pitfalls: [
        "Confusing Mbps with MB/s creates an approximate eightfold error before protocol overhead.",
        "A public speed-test endpoint may be the bottleneck, so one destination cannot prove the server port limit.",
      ],
    },
  },
  {
    id: "KB-004",
    priority: "P1",
    categorySlug: "server-configuration",
    reviewMonths: 12,
    sourceKeys: ["kvm", "lxc"],
    relatedIds: ["KB-001", "KB-002", "KB-021"],
    zh: {
      title: "KVM、LXC 和 OpenVZ 虚拟化有什么区别",
      slug: "kvm-lxc-openvz-virtualization-comparison",
      summary:
        "比较 KVM 虚拟机与 LXC、OpenVZ 系统容器在内核共享、隔离、资源控制和操作系统兼容性上的差异，并给出需要自定义内核、容器密度或稳定隔离时的选择方法。",
      keywords: ["KVM", "LXC", "OpenVZ", "虚拟化", "系统容器", "内核隔离"],
      aliases: [
        "Kernel-based Virtual Machine",
        "Linux Containers",
        "Virtuozzo Containers",
      ],
      retrievalTerms: [
        "KVM 和 LXC 区别",
        "OpenVZ 是否共享内核",
        "VPS 虚拟化怎么选",
        "自定义内核 VPS",
        "容器型 VPS 限制",
        "虚拟机隔离",
      ],
      audience:
        "需要理解 VPS 底层隔离方式，或业务依赖自定义内核模块、特定文件系统和明确资源边界的用户。",
      avoid:
        "仅凭虚拟化名称不能推断性能和超售程度，实际宿主配置、资源策略和运营质量仍需测量。",
      takeaway:
        "KVM 运行独立客体内核，LXC 和传统 OpenVZ 采用共享宿主内核的系统容器模型；兼容性与隔离需求通常比理论开销更重要。",
      concepts: [
        [
          "内核模型",
          "KVM 客体拥有自己的内核；系统容器共享宿主 Linux 内核，因此不能任意替换内核。",
        ],
        [
          "隔离边界",
          "虚拟机提供硬件虚拟化边界，容器依赖命名空间、cgroup 和安全策略；两者都需要正确配置。",
        ],
        [
          "资源控制",
          "CPU、内存和 I/O 限额由平台策略执行，产品是否超售不能从 KVM 或 LXC 名称单独判断。",
        ],
      ],
      steps: [
        "列出内核模块、操作系统、文件系统和嵌套虚拟化需求。",
        "确认控制台是否支持所需镜像、救援模式和资源指标。",
        "在候选实例验证 cgroup、设备、内核功能和持续负载表现。",
      ],
      verification: [
        "检查 systemd-detect-virt、内核版本和 cgroup 限额，并与产品说明对应。",
        "测试重启、内核更新、磁盘与网络负载，确认功能和限制均可重复。",
      ],
      pitfalls: [
        "共享内核容器内看到的内核版本通常来自宿主，更新用户空间不会更换它。",
        "KVM 不等于无限资源或无超售，宿主存储与网络仍可能共享。",
      ],
    },
    en: {
      title: "KVM vs LXC vs OpenVZ: Virtualization Compared",
      slug: "kvm-vs-lxc-vs-openvz",
      summary:
        "Compare KVM virtual machines with LXC and OpenVZ system containers by kernel sharing, isolation, resource control, and operating-system compatibility, then select from workload requirements.",
      keywords: [
        "KVM",
        "LXC",
        "OpenVZ",
        "virtualization",
        "system containers",
        "kernel isolation",
      ],
      aliases: [
        "Kernel-based Virtual Machine",
        "Linux Containers",
        "Virtuozzo Containers",
      ],
      retrievalTerms: [
        "KVM vs LXC",
        "does OpenVZ share the kernel",
        "VPS virtualization choice",
        "custom kernel VPS",
        "container VPS limitations",
        "virtual machine isolation",
      ],
      audience:
        "Users who need to understand the isolation below a VPS, especially when software requires kernel modules, specific file systems, or explicit resource boundaries.",
      avoid:
        "A virtualization name alone does not reveal performance or oversubscription; host configuration, policy, and operating quality still require measurement.",
      takeaway:
        "KVM runs a separate guest kernel, while LXC and traditional OpenVZ use a system-container model that shares the host kernel. Compatibility and isolation requirements usually matter more than theoretical overhead.",
      concepts: [
        [
          "Kernel model",
          "A KVM guest owns its kernel. A system container shares the host Linux kernel and therefore cannot replace it freely.",
        ],
        [
          "Isolation boundary",
          "Virtual machines use a hardware-virtualization boundary; containers rely on namespaces, cgroups, and security policy. Both require correct configuration.",
        ],
        [
          "Resource controls",
          "Platform policy enforces CPU, memory, and I/O limits. KVM or LXC branding alone cannot prove the absence of oversubscription.",
        ],
      ],
      steps: [
        "List required kernel modules, operating systems, file systems, and nested virtualization features.",
        "Confirm available images, rescue access, and resource metrics in the control plane.",
        "Validate cgroups, devices, kernel features, and sustained workload behavior on a candidate instance.",
      ],
      verification: [
        "Inspect systemd-detect-virt, the kernel version, and cgroup limits and reconcile them with the service description.",
        "Repeat reboot, kernel-update, storage, and network tests to identify functional and resource limits.",
      ],
      pitfalls: [
        "The kernel visible inside a shared-kernel container normally belongs to the host; updating user space does not replace it.",
        "KVM does not imply unlimited or unshared capacity because host storage and networking can remain shared.",
      ],
    },
  },
  {
    id: "KB-005",
    priority: "P1",
    categorySlug: "server-configuration",
    reviewMonths: 12,
    sourceKeys: ["nvme", "fio"],
    relatedIds: ["KB-002", "KB-025", "KB-029"],
    zh: {
      title: "NVMe、SSD、HDD 怎么选：容量、IOPS 与数据库性能",
      slug: "nvme-ssd-hdd-server-storage-guide",
      summary:
        "从介质、接口、延迟、IOPS、顺序吞吐和持久性比较 NVMe、SATA SSD 与 HDD，说明如何用真实队列深度和数据集测试数据库、日志与归档负载。",
      keywords: ["NVMe", "SSD", "HDD", "IOPS", "磁盘延迟", "数据库存储"],
      aliases: ["固态硬盘", "机械硬盘", "Non-Volatile Memory Express"],
      retrievalTerms: [
        "NVMe 和 SSD 区别",
        "数据库需要多少 IOPS",
        "HDD 适合备份吗",
        "VPS 磁盘测速",
        "fio 怎么测试",
        "磁盘延迟怎么看",
      ],
      audience:
        "需要为数据库、日志、对象文件或备份选择存储，并能区分容量需求与 I/O 性能需求的用户。",
      avoid:
        "共享云盘的型号名称不等于物理介质独享，持久性、副本和突发额度必须依据供应商文档和实测确认。",
      takeaway:
        "NVMe 是面向非易失存储的协议和接口族，SSD 描述固态介质，HDD 使用机械介质；选型要看负载的延迟、随机 I/O、顺序吞吐、容量和恢复方案。",
      concepts: [
        [
          "延迟与 IOPS",
          "小块随机数据库 I/O 更依赖尾延迟和 IOPS，而不是大文件顺序读写峰值。",
        ],
        [
          "队列深度",
          "高队列深度可以提高吞吐，却可能隐藏单请求延迟；测试参数必须接近应用并发。",
        ],
        [
          "持久性",
          "设备速度不代表数据副本、断电保护或备份能力，故障域和恢复流程需要单独设计。",
        ],
      ],
      steps: [
        "从应用日志和数据库统计识别块大小、读写比例、同步写和并发。",
        "预留文件系统、日志、增长与维护空间，避免容量长期接近满盘。",
        "用 fio 的受控文件、直接 I/O 和接近生产的参数测试，并避免破坏现有数据。",
      ],
      verification: [
        "记录平均与高分位延迟、IOPS、带宽和测试期间 CPU iowait。",
        "在备份、检查点或批处理同时运行时观察业务响应，验证混合负载。",
      ],
      pitfalls: [
        "在系统盘直接运行写入型裸设备测试可能毁坏数据。",
        "缓存未控制的短测试容易测到内存缓存，而不是持续存储能力。",
      ],
    },
    en: {
      title: "NVMe vs SSD vs HDD for Servers",
      slug: "nvme-vs-ssd-vs-hdd-for-servers",
      summary:
        "Compare NVMe, SATA SSD, and HDD by media, interface, latency, IOPS, sequential throughput, and durability, then test databases, logs, and archives with realistic queue depth and data sets.",
      keywords: [
        "NVMe",
        "SSD",
        "HDD",
        "IOPS",
        "storage latency",
        "database storage",
      ],
      aliases: [
        "solid-state drive",
        "hard disk drive",
        "Non-Volatile Memory Express",
      ],
      retrievalTerms: [
        "NVMe vs SSD",
        "database IOPS requirement",
        "HDD for backups",
        "VPS disk benchmark",
        "fio storage test",
        "how to read disk latency",
      ],
      audience:
        "Users selecting storage for databases, logs, object files, or backups who can separate capacity requirements from I/O performance.",
      avoid:
        "A cloud-volume product name does not prove exclusive access to a physical medium. Durability, replication, and burst limits require provider evidence and measurement.",
      takeaway:
        "NVMe is a protocol and interface family for non-volatile storage, SSD describes solid-state media, and HDD uses mechanical media. Choose from latency, random I/O, sequential throughput, capacity, and recovery needs.",
      concepts: [
        [
          "Latency and IOPS",
          "Small random database I/O depends more on tail latency and operations per second than on peak sequential throughput.",
        ],
        [
          "Queue depth",
          "A deep queue can raise aggregate throughput while hiding per-request latency. Benchmark concurrency should resemble the application.",
        ],
        [
          "Durability",
          "Device speed does not provide replicas, power-loss protection, or backups. Failure domains and recovery remain separate design work.",
        ],
      ],
      steps: [
        "Use application and database metrics to identify block size, read/write ratio, synchronous writes, and concurrency.",
        "Reserve file-system, log, growth, and maintenance space so the volume does not operate near full capacity.",
        "Run fio against a controlled file with direct I/O and production-like parameters, never against live data devices.",
      ],
      verification: [
        "Record average and high-percentile latency, IOPS, bandwidth, and CPU iowait during the test.",
        "Observe application response while backup, checkpoint, or batch workloads run to validate mixed-load behavior.",
      ],
      pitfalls: [
        "A write benchmark against a system block device can destroy data.",
        "A short test with uncontrolled caching may measure memory cache rather than sustained storage performance.",
      ],
    },
  },
  {
    id: "KB-006",
    priority: "P0",
    categorySlug: "network-routes",
    reviewMonths: 6,
    sourceKeys: ["ctgTransit", "mtr", "rfc4271"],
    relatedIds: ["KB-001", "KB-009", "KB-012"],
    zh: {
      title: "CN2 GIA、CN2 GT 和 163 骨干网有什么区别",
      slug: "cn2-gia-cn2-gt-163-network-routes",
      summary:
        "解释主机市场中 CN2 GIA、CN2 GT 与 163 的常见含义，强调这些标签不是端到端协议保证，并给出按运营商、方向、时段用 MTR 验证实际路径的方法。",
      keywords: [
        "CN2 GIA",
        "CN2 GT",
        "163 骨干网",
        "中国电信线路",
        "MTR",
        "回程路由",
      ],
      aliases: ["ChinaNet Next Carrying Network", "ChinaNet 163"],
      retrievalTerms: [
        "CN2 GIA 和 GT 区别",
        "163 线路是什么",
        "电信回程怎么看",
        "CN2 路由验证",
        "去程回程不一致",
        "VPS 电信线路测试",
      ],
      audience:
        "面向中国大陆电信用户部署业务，需要理解线路标签并能从多个接入点验证去程和回程的用户。",
      avoid:
        "不能把商家标签当成永久路由或低延迟承诺；没有时间、源网络、目标和原始结果的截图也不能支撑长期结论。",
      takeaway:
        "CN2 GIA、CN2 GT 和 163 是主机市场对不同电信承载与接入方式的概括，不是应用层服务等级；只有按方向、运营商和时段测得的路径与质量才对当前业务有效。",
      concepts: [
        [
          "商业标签",
          "GIA、GT 的具体接入和覆盖可能随产品与地区变化，购买前应要求可验证测试地址。",
        ],
        [
          "去程与回程",
          "客户端到服务器和服务器返回客户端可能由不同 BGP 策略选择，不能用单向 traceroute 代替双向结论。",
        ],
        [
          "路径与质量",
          "出现某个骨干节点只能说明观测路径的一部分，延迟、丢包和拥塞仍需持续测量。",
        ],
        [
          "ASN 边界",
          "AS4134、AS4809 等 ASN 可帮助标记观测到的自治系统，但 ASN 本身不能证明 CN2 GIA、CN2 GT 或某个售卖实例的产品归属。",
        ],
      ],
      steps: [
        "准备目标实例或测试 IP，并记录供应商声称的方向、地区和运营商范围。",
        "从不同省份或接入网测去程，再从服务器向可控客户端测回程。",
        "在高峰和非高峰重复 MTR 报告，保存 DNS 关闭后的原始 IP 路径。",
      ],
      verification: [
        "对比多次结果中的自治系统、节点段和目的端丢包，不只看中间节点单次丢包。",
        "用真实 HTTPS 请求同步记录响应时间和错误率，确认路由变化是否影响应用。",
      ],
      pitfalls: [
        "中间路由器可能限制 ICMP，应以持续到目的端的损失和业务指标判断。",
        "线路可能因维护、拥塞或 BGP 策略改变，历史测评不能替代当前复测。",
      ],
    },
    en: {
      title: "CN2 GIA vs CN2 GT vs ChinaNet 163",
      slug: "cn2-gia-vs-cn2-gt-vs-chinanet-163",
      summary:
        "Understand how hosting providers use CN2 GIA, CN2 GT, and ChinaNet 163 labels, why they are not end-to-end protocol guarantees, and how to verify both directions with timed MTR evidence.",
      keywords: [
        "CN2 GIA",
        "CN2 GT",
        "ChinaNet 163",
        "China Telecom route",
        "MTR",
        "return path",
      ],
      aliases: ["ChinaNet Next Carrying Network", "ChinaNet 163"],
      retrievalTerms: [
        "CN2 GIA vs GT",
        "what is ChinaNet 163",
        "China Telecom return path",
        "verify a CN2 route",
        "asymmetric route",
        "test a VPS for China Telecom users",
      ],
      audience:
        "Operators serving China Telecom access networks in mainland China who can validate outbound and return paths from multiple controlled endpoints.",
      avoid:
        "A hosting label is not a permanent routing or latency commitment. A screenshot without time, source network, destination, and raw results cannot support a durable conclusion.",
      takeaway:
        "CN2 GIA, CN2 GT, and ChinaNet 163 are hosting-market descriptions of carrier access and transport patterns, not application service levels. Only measured paths and quality for a direction, carrier, and time window apply to a workload.",
      concepts: [
        [
          "Commercial labels",
          "The exact access and coverage represented by GIA or GT can vary by service and region, so a provider should expose a test endpoint.",
        ],
        [
          "Outbound and return paths",
          "Client-to-server and server-to-client traffic can follow different BGP policy. A one-way traceroute cannot establish both directions.",
        ],
        [
          "Path versus quality",
          "Seeing a particular backbone segment describes only an observed path; latency, loss, and congestion still require repeated measurement.",
        ],
        [
          "ASN boundary",
          "AS4134 and AS4809 can label an observed autonomous system, but an ASN alone cannot prove a CN2 GIA, CN2 GT, or a specific sold instance.",
        ],
      ],
      steps: [
        "Record the provider's claimed direction, region, and access-network scope for a test IP or candidate instance.",
        "Measure the outbound path from several access networks and the return path from the server to controlled clients.",
        "Repeat DNS-disabled MTR reports during busy and quiet periods and retain the raw IP paths.",
      ],
      verification: [
        "Compare autonomous systems, path segments, and loss that persists to the destination across repeated samples.",
        "Record HTTPS latency and error rate beside routing data to determine whether a path change affects the application.",
      ],
      pitfalls: [
        "Intermediate routers may rate-limit ICMP; destination loss and application metrics carry more weight than one hop.",
        "Maintenance, congestion, and BGP policy can change paths, so an old review is not a substitute for current testing.",
      ],
    },
  },
  {
    id: "KB-007",
    priority: "P1",
    categorySlug: "network-routes",
    reviewMonths: 6,
    sourceKeys: ["cmiTransit", "rfc4271", "mtr"],
    relatedIds: ["KB-006", "KB-009", "KB-014"],
    zh: {
      title: "CMI、CMIN2、CUII 和移动精品网怎么选",
      slug: "cmi-cmin2-cuii-mobile-premium-network",
      summary:
        "梳理 CMI、CMIN2、CUII 与“移动精品网”等市场术语的事实边界，避免把运营商名称等同于固定路径，并提供面向移动、联通接入用户的双向测量方法。",
      keywords: ["CMI", "CMIN2", "CUII", "移动精品网", "国际线路", "MTR"],
      aliases: ["China Mobile International", "China Unicom International"],
      retrievalTerms: [
        "CMI 和 CMIN2 区别",
        "CUII 线路是什么",
        "移动精品网怎么测",
        "移动用户 VPS 线路",
        "联通国际回程",
        "运营商路由选择",
      ],
      audience:
        "主要用户来自中国移动或中国联通网络，希望比较国际路由标签并以实际端到端结果选线路的运营人员。",
      avoid:
        "术语可能由不同商家以不同方式使用，不能在没有测试地址、方向和覆盖说明时推断全国或长期体验。",
      takeaway:
        "CMI、CMIN2、CUII 等名称指向运营商或产品体系，但主机套餐的接入、路由策略和拥塞水平必须针对目标地区与方向单独验证。",
      concepts: [
        [
          "运营商范围",
          "国际承载服务说明能证明运营商提供某类连接，不能证明一台实例当前使用完整或唯一的该路径。",
        ],
        [
          "接入差异",
          "同一运营商不同省份、固网与移动接入可能进入不同出口和互联点。",
        ],
        [
          "精品标签",
          "“精品网”不是通用协议字段，应要求商家给出可验证路由、服务范围和变更说明。",
        ],
      ],
      steps: [
        "按目标用户占比选择移动、联通及其他网络的代表性测试点。",
        "分别记录去程、回程、自治系统变化和目的端质量。",
        "用真实业务请求在多个时段复测，并建立线路变更告警。",
      ],
      verification: [
        "检查路径是否在多次样本中稳定，不用单个主机名或反向 DNS 判定。",
        "比较目的端丢包、延迟分布、吞吐和应用错误率。",
      ],
      pitfalls: [
        "把 CMI、CMIN2 或 CUII 当成性能等级会忽略地区、互联和拥塞差异。",
        "只从海外服务器测回程不能代表中国大陆客户端的去程。",
      ],
    },
    en: {
      title: "CMI, CMIN2, and CUII: Route Comparison",
      slug: "cmi-cmin2-cuii-route-comparison",
      summary:
        "Set factual boundaries for CMI, CMIN2, CUII, and premium-route marketing terms, then compare paths for China Mobile and China Unicom access networks with bidirectional evidence.",
      keywords: [
        "CMI",
        "CMIN2",
        "CUII",
        "premium route",
        "international transit",
        "MTR",
      ],
      aliases: ["China Mobile International", "China Unicom International"],
      retrievalTerms: [
        "CMI vs CMIN2",
        "what is CUII",
        "test a premium China Mobile route",
        "VPS for China Mobile users",
        "China Unicom return path",
        "carrier route selection",
      ],
      audience:
        "Operators whose users primarily access from China Mobile or China Unicom networks and who can select routes from current endpoint measurements.",
      avoid:
        "Providers may use these terms differently. Without a test endpoint, direction, and coverage statement, they cannot establish nationwide or long-term performance.",
      takeaway:
        "CMI, CMIN2, and CUII refer to carrier or product ecosystems, but the access, routing policy, and congestion of a hosting plan must be validated for each target region and direction.",
      concepts: [
        [
          "Carrier scope",
          "A carrier service description proves that a connectivity product exists, not that one instance uses its entire path exclusively.",
        ],
        [
          "Access variation",
          "Different provinces, fixed networks, and mobile access within one carrier can enter different exits and interconnection points.",
        ],
        [
          "Premium labels",
          "Premium network is not a standard protocol attribute. Require a measurable route, explicit scope, and a change policy.",
        ],
      ],
      steps: [
        "Choose representative China Mobile, China Unicom, and other user access networks from the expected user distribution.",
        "Record outbound path, return path, autonomous-system changes, and destination quality separately.",
        "Repeat real application requests across time windows and alert on material route changes.",
      ],
      verification: [
        "Confirm that a path persists across samples instead of relying on one hostname or reverse-DNS label.",
        "Compare destination loss, latency distribution, throughput, and application error rate.",
      ],
      pitfalls: [
        "Treating CMI, CMIN2, or CUII as a performance tier hides regional, interconnection, and congestion differences.",
        "A return-path test from the server does not establish the outbound path from a mainland China client.",
      ],
    },
  },
  {
    id: "KB-008",
    priority: "P1",
    categorySlug: "network-routes",
    reviewMonths: 12,
    sourceKeys: ["rfc4271", "mtr"],
    relatedIds: ["KB-003", "KB-009", "KB-010"],
    zh: {
      title: "BGP 线路是什么？多线网络适合哪些业务",
      slug: "bgp-network-route-guide",
      summary:
        "解释 BGP 如何在自治系统之间通告可达性和选择路径，区分多线接入、任播和自动故障切换，说明何时业务需要多运营商以及如何验证故障收敛。",
      keywords: ["BGP", "自治系统", "多线 BGP", "路由收敛", "网络冗余", "ASN"],
      aliases: ["Border Gateway Protocol", "边界网关协议"],
      retrievalTerms: [
        "BGP 线路是什么",
        "多线 BGP 有什么用",
        "ASN 和 BGP 关系",
        "BGP 故障切换",
        "服务器多运营商接入",
        "路由收敛时间",
      ],
      audience:
        "需要多运营商可达性、网络冗余或自有地址发布，并希望理解 BGP 能解决和不能解决什么的架构人员。",
      avoid:
        "单台普通 VPS 通常不需要自己运行公网 BGP；错误发布可能造成大范围路由事故，应由具备策略和监控能力的团队操作。",
      takeaway:
        "BGP 交换自治系统间的可达性和路径属性，多线可以增加路径选择与故障绕行机会，但不会自动保证低延迟、无丢包或快速收敛。",
      concepts: [
        [
          "可达性通告",
          "BGP 告诉相邻网络哪些前缀可经本网络到达，并携带 AS_PATH 等属性。",
        ],
        [
          "策略路由",
          "路径选择受本地策略、商业关系和属性影响，不一定选择地理最短或延迟最低路径。",
        ],
        [
          "收敛",
          "链路故障后通告传播和路径重选需要时间，期间可能出现丢包或路径抖动。",
        ],
      ],
      steps: [
        "明确是需要供应商多线接入，还是自有 ASN、地址和路由策略。",
        "设计前缀过滤、最大前缀、RPKI、监控和回滚责任。",
        "在维护窗口模拟单路故障并记录可达性、收敛时间和应用影响。",
      ],
      verification: [
        "从多个公开 Looking Glass 核对前缀、AS_PATH 和可见性，再结合自己的网络验证实际业务。",
        "将 BGP 事件时间与端到端探测和应用错误关联。",
      ],
      pitfalls: [
        "多线只说明存在多个连接或策略，不保证每个用户都走理想路径。",
        "没有过滤和路由授权验证的配置可能泄漏或劫持前缀。",
      ],
    },
    en: {
      title: "What Is BGP Routing and When Does Hosting Need It?",
      slug: "what-is-bgp-routing-for-hosting",
      summary:
        "Learn how BGP advertises reachability and selects inter-domain paths, how multihoming differs from anycast, and when a workload needs multiple carriers plus tested convergence behavior.",
      keywords: [
        "BGP",
        "autonomous system",
        "multihoming",
        "route convergence",
        "network redundancy",
        "ASN",
      ],
      aliases: ["Border Gateway Protocol", "inter-domain routing"],
      retrievalTerms: [
        "what is a BGP route",
        "benefits of multihoming",
        "ASN and BGP",
        "BGP failover",
        "multi-carrier hosting",
        "route convergence time",
      ],
      audience:
        "Architects who need multi-carrier reachability, network redundancy, or advertisement of their own address space and want clear BGP limits.",
      avoid:
        "A normal single VPS rarely needs to run public BGP. Incorrect advertisements can cause broad incidents and require experienced policy, monitoring, and rollback ownership.",
      takeaway:
        "BGP exchanges reachability and path attributes between autonomous systems. Multihoming creates more routing and failover options but does not guarantee low latency, zero loss, or instant convergence.",
      concepts: [
        [
          "Reachability advertisement",
          "BGP tells neighbors which prefixes are reachable through a network and carries attributes such as AS_PATH.",
        ],
        [
          "Policy routing",
          "Selection follows local policy, commercial relationships, and attributes, so it is not necessarily the geographically shortest or lowest-latency path.",
        ],
        [
          "Convergence",
          "After a failure, advertisement propagation and path reselection take time and can cause loss or route flapping.",
        ],
      ],
      steps: [
        "Decide whether the requirement is provider-managed multihoming or customer-owned ASN, addresses, and policy.",
        "Define prefix filters, maximum-prefix limits, RPKI handling, monitoring, and rollback responsibility.",
        "During a maintenance window, simulate one path failure and record reachability, convergence, and application impact.",
      ],
      verification: [
        "Use public looking glasses to verify prefix visibility and AS_PATH from multiple networks.",
        "Correlate BGP event timestamps with user-side route checks and application errors.",
      ],
      pitfalls: [
        "Multiple links do not guarantee that every user receives the preferred path.",
        "A configuration without route filtering and authorization validation can leak or hijack prefixes.",
      ],
    },
  },
  {
    id: "KB-009",
    priority: "P0",
    categorySlug: "network-routes",
    reviewMonths: 6,
    sourceKeys: ["mtr", "rfc2680", "rfc2681"],
    relatedIds: ["KB-006", "KB-012", "KB-028"],
    zh: {
      title: "怎么看 VPS 的去程和回程线路？MTR 与 Traceroute 检测指南",
      slug: "vps-route-test-mtr-traceroute",
      summary:
        "提供可复现的去程、回程路由检测流程，解释 Traceroute 与 MTR 的探测差异、ICMP 限速和非对称路由，并说明如何保存时间、源网络和目的端质量证据。",
      keywords: ["MTR", "Traceroute", "去程", "回程", "路由测试", "丢包"],
      aliases: ["tracert", "My Traceroute"],
      retrievalTerms: [
        "VPS 路由怎么看",
        "MTR 怎么用",
        "去程回程测试",
        "Traceroute 丢包判断",
        "非对称路由",
        "服务器线路检测",
      ],
      audience:
        "需要定位跨网延迟、丢包或路由变化，并能控制至少一个客户端和服务器端测试点的用户。",
      avoid:
        "不要扫描无授权目标或把单次中间节点超时公开为故障结论；测试应遵守网络和服务条款。",
      takeaway:
        "去程必须从客户端测向服务器，回程必须从服务器测向可控客户端；MTR 的连续样本比单次路径更有信息，但最终判断要看目的端和应用。",
      concepts: [
        [
          "TTL 探测",
          "Traceroute 通过递增 TTL 观察沿途响应，节点不响应不等于数据转发失败。",
        ],
        [
          "连续统计",
          "MTR 汇总多轮延迟和丢包，更适合发现持续异常，但采样协议和次数必须记录。",
        ],
        [
          "非对称路由",
          "BGP 策略常使两个方向不同，因此一侧结果不能代表另一侧。",
        ],
        [
          "单服务器观察窗口",
          "购买前后应覆盖工作时段、晚高峰和至少 24-72 小时的实际观察；单次结果只能作为线索，不能代替对具体服务器的验收。",
        ],
      ],
      steps: [
        "记录源 IP 所属网络、目标 IP、UTC 时间、协议、包数和解析设置。",
        "客户端运行报告模式 MTR 测去程，服务器对受控客户端运行对应回程。",
        "在高峰与非高峰重复，并同时发起 HTTPS 或 TCP 业务探测。",
      ],
      verification: [
        "只有丢包从某跳持续到目的端时才把它作为链路异常线索。",
        "比较多次结果的路径、目的端延迟分布和应用错误，而不是只看平均值。",
      ],
      pitfalls: [
        "中间节点 ICMP 限速会显示高丢包，后续节点和目的端正常时通常不是转发丢包。",
        "反向 DNS 名称可能陈旧或模糊，必要时结合 ASN/RDAP，而不是凭主机名猜线路。",
      ],
    },
    en: {
      title: "How to Test VPS Routes with MTR and Traceroute",
      slug: "how-to-test-vps-routes-with-mtr-and-traceroute",
      summary:
        "Run reproducible outbound and return-path tests with Traceroute and MTR, account for ICMP rate limiting and asymmetric routing, and retain source-network, time, and destination evidence.",
      keywords: [
        "MTR",
        "Traceroute",
        "outbound path",
        "return path",
        "route testing",
        "packet loss",
      ],
      aliases: ["tracert", "My Traceroute"],
      retrievalTerms: [
        "how to inspect a VPS route",
        "MTR report mode",
        "outbound and return path test",
        "traceroute packet loss",
        "asymmetric routing",
        "hosting route diagnostics",
      ],
      audience:
        "Users investigating cross-network latency, loss, or route changes who control at least one client and the server endpoint.",
      avoid:
        "Do not test unauthorized targets or publish one intermediate timeout as a fault conclusion. Testing must comply with network and service terms.",
      takeaway:
        "Measure the outbound path from client to server and the return path from server to a controlled client. MTR adds repeated samples, but destination and application behavior remain the decision evidence.",
      concepts: [
        [
          "TTL probing",
          "Traceroute increments TTL to observe responses along a path. A router that does not reply can still forward data normally.",
        ],
        [
          "Repeated statistics",
          "MTR aggregates latency and loss over many probes. Record protocol, report count, and options for reproducibility.",
        ],
        [
          "Asymmetric routing",
          "BGP policy commonly produces different paths in each direction, so one side cannot establish the other.",
        ],
        [
          "Exact-server observation window",
          "Before and after purchase, cover working hours, peak hours, and at least 24-72 hours of observation; a single result is only a lead, not an acceptance decision for the exact server.",
        ],
      ],
      steps: [
        "Record source network, destination IP, UTC time, probe protocol, count, and DNS-resolution setting.",
        "Run report-mode MTR from the client to the server, then from the server to a controlled client for the return path.",
        "Repeat during busy and quiet periods while running an HTTPS or TCP request.",
      ],
      verification: [
        "Treat loss as a path signal only when it persists from a hop through the destination.",
        "Compare paths, destination latency distributions, and application errors across samples rather than averages alone.",
      ],
      pitfalls: [
        "ICMP rate limiting can show severe loss at an intermediate hop while later hops and the destination remain healthy.",
        "Reverse-DNS names can be stale or ambiguous; use ASN and RDAP evidence instead of inferring a route from a hostname.",
      ],
    },
  },
  {
    id: "KB-010",
    priority: "P1",
    categorySlug: "network-routes",
    reviewMonths: 6,
    sourceKeys: ["mef", "rfc4271", "rfc2681"],
    relatedIds: ["KB-008", "KB-011", "KB-027"],
    zh: {
      title: "IPLC、IEPL、专线和普通国际线路有什么区别",
      slug: "iplc-iepl-dedicated-line-comparison",
      summary:
        "从服务边界、隔离方式、SLA、接入点和公网暴露比较 IPLC、IEPL、运营商专线与普通互联网连接，并说明为什么市场名称必须落实到合同与验收指标。",
      keywords: ["IPLC", "IEPL", "国际专线", "公网线路", "SLA", "运营商以太网"],
      aliases: [
        "International Private Leased Circuit",
        "International Ethernet Private Line",
      ],
      retrievalTerms: [
        "IPLC 和 IEPL 区别",
        "国际专线是什么",
        "专线和公网区别",
        "IEPL 是否走公网",
        "跨境专线验收",
        "运营商 SLA",
      ],
      audience:
        "需要稳定站点互联、企业网络延伸或可验收服务指标，并准备与运营商确认合同边界的团队。",
      avoid:
        "个人网站和普通公网服务通常不应仅因营销词购买所谓专线；合规、跨境数据和落地许可必须另行咨询专业机构。",
      takeaway:
        "IPLC、IEPL 和专线描述受管理的连接产品，普通国际线路依赖公网路由；名称本身不能证明隔离、带宽或可用性，合同端点和 SLA 才是验收依据。",
      concepts: [
        [
          "服务端点",
          "专线必须明确 A/Z 端、交付接口、带宽和责任边界，不能只写国家或城市。",
        ],
        [
          "隔离与转发",
          "受管理服务可使用专用或逻辑隔离承载，但具体技术和共享程度由产品定义。",
        ],
        [
          "服务等级",
          "时延、丢包、可用性、修复时间和测量方法都应在 SLA 中定义。",
        ],
      ],
      steps: [
        "写明两端地址、接口、容量、冗余、加密和业务流向。",
        "要求服务商给出产品标准、路径边界、维护通知和 SLA 测量方法。",
        "上线前执行吞吐、时延、丢包、故障切换和恢复验收。",
      ],
      verification: [
        "用独立监控持续测量合同端点，并保存维护窗口与故障工单。",
        "核对路由表和公网可达性，确认实际暴露面符合设计。",
      ],
      pitfalls: [
        "“专线”在转售市场可能只是优化公网隧道，必须验证交付和 SLA。",
        "专线不等于加密，敏感流量仍需按威胁模型配置加密和认证。",
      ],
    },
    en: {
      title: "IPLC vs IEPL vs the Public Internet",
      slug: "iplc-vs-iepl-vs-public-internet",
      summary:
        "Compare IPLC, IEPL, managed private connectivity, and public Internet service by endpoints, isolation, SLA, exposure, and acceptance tests, with contract terms taking priority over labels.",
      keywords: [
        "IPLC",
        "IEPL",
        "private circuit",
        "public Internet",
        "SLA",
        "Carrier Ethernet",
      ],
      aliases: [
        "International Private Leased Circuit",
        "International Ethernet Private Line",
      ],
      retrievalTerms: [
        "IPLC vs IEPL",
        "international private circuit",
        "private line vs Internet",
        "does IEPL use the public Internet",
        "cross-border circuit acceptance",
        "carrier SLA",
      ],
      audience:
        "Teams that need stable site interconnection, enterprise network extension, or measurable service objectives and can validate a carrier contract.",
      avoid:
        "A normal public website should not buy a product solely because it is marketed as a private line. Regulatory, cross-border data, and licensing questions require qualified advice.",
      takeaway:
        "IPLC, IEPL, and private-line terms describe managed connectivity products, while ordinary international traffic follows public routing. Contracted endpoints and SLA definitions, not the label, establish isolation, capacity, and availability.",
      concepts: [
        [
          "Service endpoints",
          "A managed circuit must define A and Z locations, handoff interfaces, capacity, and responsibility boundaries rather than only countries or cities.",
        ],
        [
          "Isolation and forwarding",
          "A service may use dedicated or logically isolated transport, but its technology and sharing model belong to the exact product definition.",
        ],
        [
          "Service level",
          "Latency, loss, availability, repair time, and the measurement method must be explicit in an SLA.",
        ],
      ],
      steps: [
        "Document both endpoints, interfaces, capacity, redundancy, encryption, and traffic direction.",
        "Request the product standard, path boundary, maintenance notification process, and SLA measurement method.",
        "Before acceptance, test throughput, delay, loss, failover, and restoration.",
      ],
      verification: [
        "Monitor the contracted endpoints independently and preserve maintenance notices and incident tickets.",
        "Inspect routing and public reachability to confirm that the actual exposure matches the design.",
      ],
      pitfalls: [
        "In resale markets, a private line label may describe an optimized public tunnel; validate the handoff and SLA.",
        "Private connectivity is not automatically encrypted. Sensitive traffic still needs encryption and authentication from its threat model.",
      ],
    },
  },
  {
    id: "KB-011",
    priority: "P0",
    categorySlug: "datacenter-regions",
    reviewMonths: 6,
    sourceKeys: ["rfc2680", "rfc2681", "mtr"],
    relatedIds: ["KB-001", "KB-006", "KB-012"],
    zh: {
      title: "国内访问网站，香港、日本、新加坡和美西机房怎么选",
      slug: "server-region-guide-china-hong-kong-japan-singapore-us-west",
      summary:
        "以中国大陆用户的实际接入网络为前提，比较香港、日本、新加坡与美国西海岸的时延、路径、合规和容灾因素，并提供先测后选的地区决策流程。",
      keywords: [
        "服务器地区",
        "香港机房",
        "日本 VPS",
        "新加坡 VPS",
        "美西 VPS",
        "中国大陆访问",
      ],
      aliases: ["Region Selection", "Data Center Location"],
      retrievalTerms: [
        "国内访问服务器地区",
        "香港还是日本 VPS",
        "新加坡机房延迟",
        "美西服务器适合谁",
        "中国大陆用户机房选择",
        "跨境网站部署地区",
      ],
      audience:
        "用户主要位于中国大陆，能够从目标省份和运营商测试候选地区，并需要在体验、业务边界和容灾之间取舍的团队。",
      avoid:
        "地区名称不能替代线路和实测，同一城市的不同机房、运营商与时段可能产生明显差异；合规问题也不能从延迟推导。",
      takeaway:
        "离用户更近通常有利于基础时延，但国际出口、互联、路由方向和拥塞会改变结果；应先按用户分布筛地区，再用真实业务与多运营商测量选实例。",
      concepts: [
        [
          "传播距离",
          "物理距离构成时延下限，但实际路径可能绕行，不能只看地图直线距离。",
        ],
        [
          "接入网络",
          "电信、移动、联通及不同省份可能使用不同国际出口，地区排名不会对所有用户一致。",
        ],
        [
          "三网矩阵",
          "按地区 × 电信/联通/移动 × 目标机房 × 业务类型记录覆盖和质量；缺失单元格不按零分或剩余指标重新归一化。",
        ],
        [
          "容灾与边界",
          "数据驻留、备案、供应链和单地区故障需要独立评估，最低延迟不是唯一目标。",
        ],
      ],
      steps: [
        "统计用户所在省份、运营商、业务交互频率和恢复目标。",
        "为每个候选地区获取测试 IP 或短期实例，并统一测试窗口。",
        "比较真实页面/API、MTR、丢包和抖动，再决定主地区与异地恢复位置。",
      ],
      verification: [
        "至少从主要运营商各一个代表性接入点在多个时段复测。",
        "把网络指标与页面关键请求、登录和上传等真实流程关联。",
      ],
      pitfalls: [
        "用一个家庭宽带测速代表全国用户会产生样本偏差。",
        "跨地区复制若没有定期恢复演练，只增加成本而不构成可用容灾。",
      ],
    },
    en: {
      title: "Choosing a Server Region for Users in Mainland China",
      slug: "best-server-region-for-mainland-china-users",
      summary:
        "Compare Hong Kong, Japan, Singapore, and US West for access from mainland China using carrier-specific latency, route, compliance, and recovery evidence, then select regions from controlled tests.",
      keywords: [
        "server region",
        "Hong Kong hosting",
        "Japan VPS",
        "Singapore VPS",
        "US West VPS",
        "mainland China access",
      ],
      aliases: ["region selection", "data center location"],
      retrievalTerms: [
        "server region for mainland China",
        "Hong Kong vs Japan VPS",
        "Singapore hosting latency",
        "when to use US West",
        "data center choice for Chinese users",
        "cross-border website region",
      ],
      audience:
        "Teams serving users in mainland China that can test candidate regions from representative provinces and carriers and balance experience, operating boundaries, and recovery.",
      avoid:
        "A region name cannot substitute for route evidence. Data centers, carriers, and time windows within one city can behave differently, and latency does not answer compliance questions.",
      takeaway:
        "Shorter distance often lowers the physical latency floor, but international exits, interconnection, direction, and congestion alter real results. Filter by user distribution, then select an instance from multi-carrier application tests.",
      concepts: [
        [
          "Propagation distance",
          "Physical distance sets a lower bound, but an Internet path may detour and cannot be estimated from a straight line on a map.",
        ],
        [
          "Access network",
          "Carriers and provinces can use different international exits, so one region will not rank identically for every user.",
        ],
        [
          "Three-carrier matrix",
          "Track coverage and quality by region × Telecom/Unicom/Mobile × destination × workload; missing cells must not be treated as zero or silently renormalized.",
        ],
        [
          "Recovery and boundaries",
          "Data location, regulatory duties, supply-chain risk, and region failure require separate decisions; minimum latency is not the only objective.",
        ],
      ],
      steps: [
        "Measure user distribution by province or area, carrier, interaction pattern, and recovery objective.",
        "Obtain a test IP or short-lived instance in each candidate region and use the same test windows.",
        "Compare real page or API flows, MTR, loss, and jitter before choosing the primary and recovery regions.",
      ],
      verification: [
        "Repeat from at least one representative endpoint on each major access carrier across several time windows.",
        "Correlate network metrics with critical page requests, sign-in, upload, and other real workflows.",
      ],
      pitfalls: [
        "One residential connection is not a representative sample for all mainland China users.",
        "Cross-region copies without routine restore exercises add cost but do not provide dependable recovery.",
      ],
    },
  },
  {
    id: "KB-012",
    priority: "P0",
    categorySlug: "datacenter-regions",
    reviewMonths: 12,
    sourceKeys: ["rfc2680", "rfc2681", "rfc3393"],
    relatedIds: ["KB-001", "KB-006", "KB-009"],
    zh: {
      title: "延迟、丢包和抖动如何影响网站与远程连接体验",
      slug: "latency-packet-loss-jitter-explained",
      summary:
        "解释往返延迟、丢包与包时延变化的测量含义，说明它们对网页请求、SSH、语音和大文件传输的不同影响，并给出避免平均值误判的验证方法。",
      keywords: [
        "网络延迟",
        "丢包率",
        "网络抖动",
        "RTT",
        "网站性能",
        "SSH 延迟",
      ],
      aliases: ["Round-trip Time", "Packet Delay Variation", "RTT"],
      retrievalTerms: [
        "延迟多少算高",
        "丢包影响网站吗",
        "网络抖动是什么",
        "SSH 卡顿原因",
        "RTT 怎么测",
        "网络质量指标",
      ],
      audience:
        "需要把网络测量结果解释为网站、远程管理、实时音视频或传输体验，并建立可比较基线的用户。",
      avoid:
        "一次 ping、平均值或中间节点数据不能单独证明服务质量；关键结论需要明确端点、样本、协议和时间窗口。",
      takeaway:
        "延迟描述等待时间，丢包描述未到达的探测，抖动描述时延变化；不同应用敏感点不同，应同时观察分布、目的端损失和业务错误。",
      concepts: [
        [
          "往返延迟",
          "RTT 包含请求到目标再返回的时间，交互密集协议会叠加多轮等待。",
        ],
        [
          "丢包",
          "传输协议可能重传丢失数据，导致吞吐下降和尾延迟上升；实时流通常无法等待完整重传。",
        ],
        [
          "抖动",
          "连续包的时延变化会造成播放缓冲、音视频不稳和交互节奏不一致。",
        ],
      ],
      steps: [
        "定义业务端点、用户网络、协议、样本量和高低峰测试窗口。",
        "采集 RTT 分位数、目的端丢包、时延变化和应用响应。",
        "在变更前后使用相同方法复测，保留原始数据而不是只存截图。",
      ],
      verification: [
        "同时查看中位数与高分位延迟，避免少量长尾被平均值隐藏。",
        "将丢包和抖动与 TCP 重传、请求错误或媒体缓冲事件对齐。",
      ],
      pitfalls: [
        "ICMP 与业务 TCP/UDP 可能受不同策略，ping 正常不代表应用必然正常。",
        "采样过短会漏掉周期拥塞，采样过密也可能触发设备限速。",
      ],
    },
    en: {
      title: "How Latency, Packet Loss, and Jitter Affect Hosting",
      slug: "how-latency-packet-loss-and-jitter-affect-hosting",
      summary:
        "Interpret round-trip latency, packet loss, and packet delay variation for web requests, SSH, real-time media, and file transfer, using distributions and destination evidence instead of averages alone.",
      keywords: [
        "network latency",
        "packet loss",
        "jitter",
        "RTT",
        "website performance",
        "SSH latency",
      ],
      aliases: ["round-trip time", "packet delay variation", "RTT"],
      retrievalTerms: [
        "what latency is high",
        "packet loss impact on websites",
        "what is network jitter",
        "why SSH feels slow",
        "how to measure RTT",
        "network quality metrics",
      ],
      audience:
        "Users who need to translate network measurements into web, remote administration, real-time media, or transfer behavior and establish a comparable baseline.",
      avoid:
        "One ping, an average, or an intermediate hop cannot establish service quality. A defensible result names endpoints, sample size, protocol, and time window.",
      takeaway:
        "Latency measures waiting time, loss records probes that do not arrive, and jitter describes changing delay. Applications react differently, so inspect distributions, destination loss, and business errors together.",
      concepts: [
        [
          "Round-trip delay",
          "RTT includes travel to the destination and back. Protocols with many sequential exchanges accumulate several rounds of waiting.",
        ],
        [
          "Packet loss",
          "Reliable transports may retransmit data, reducing throughput and increasing tail latency, while real-time streams often cannot wait for complete recovery.",
        ],
        [
          "Jitter",
          "Changing delay between packets can destabilize playback buffers, media, and interactive timing.",
        ],
      ],
      steps: [
        "Define business endpoints, user networks, protocols, sample size, and busy and quiet test windows.",
        "Collect RTT percentiles, destination loss, delay variation, and application response together.",
        "Repeat the same method before and after a change and retain raw data rather than screenshots alone.",
      ],
      verification: [
        "Review median and high-percentile latency so a small number of long delays are not hidden by the average.",
        "Align loss and jitter with TCP retransmissions, request errors, or media-buffer events.",
      ],
      pitfalls: [
        "ICMP and application TCP or UDP may receive different treatment; a healthy ping does not prove the application is healthy.",
        "A short sample misses periodic congestion, while overly aggressive probing may trigger device rate limits.",
      ],
    },
  },
  {
    id: "KB-013",
    priority: "P1",
    categorySlug: "datacenter-regions",
    reviewMonths: 6,
    sourceKeys: ["rfc2680", "rfc2681", "mtr"],
    relatedIds: ["KB-006", "KB-011", "KB-014"],
    zh: {
      title: "香港 VPS 怎么选：机房、线路、带宽与业务场景",
      slug: "hong-kong-vps-datacenter-selection-guide",
      summary:
        "从用户运营商、实际路由、带宽计量、机房故障域和业务边界选择香港 VPS，避免把地理接近或线路标签直接等同于中国大陆访问质量。",
      keywords: [
        "香港 VPS",
        "香港机房",
        "中国大陆访问",
        "国际带宽",
        "线路测试",
        "机房选择",
      ],
      aliases: ["Hong Kong VPS", "HK VPS"],
      retrievalTerms: [
        "香港 VPS 怎么选",
        "香港机房线路测试",
        "国内访问香港服务器",
        "香港带宽怎么看",
        "香港 VPS 适合什么业务",
        "香港机房延迟",
      ],
      audience:
        "面向中国大陆、香港或亚太用户部署网站与 API，并能在目标网络测试候选实例的用户。",
      avoid:
        "香港位置不自动满足任何许可、数据或业务合规要求，也不保证跨境带宽和每个内地运营商的体验。",
      takeaway:
        "香港的地理距离只是一个条件，真正影响体验的是机房接入、跨境互联、方向、时段和带宽策略；选型应以用户分布和可重复业务测试为准。",
      concepts: [
        ["机房与运营商", "同一地区不同设施可能使用不同上游、互联和故障域。"],
        ["线路方向", "去程与回程可不一致，针对内地用户必须双向测量。"],
        [
          "容量规则",
          "端口、共享带宽、月度流量和突发限制分别影响峰值与持续传输。",
        ],
      ],
      steps: [
        "记录目标用户运营商、业务交互和数据传输模式。",
        "获取每个候选机房测试 IP，统一执行多时段双向测试。",
        "验证备份、故障恢复、带宽计量和支持边界后再迁移生产。",
      ],
      verification: [
        "用真实域名、TLS 和页面/API 请求验证，不只测 ICMP。",
        "监控目的端延迟、丢包、吞吐与错误率，并保留线路变更基线。",
      ],
      pitfalls: [
        "低延迟测试 IP 可能与购买实例不在同一路由或资源池。",
        "把“直连”或“优化”当永久属性，会忽略运营商策略变化。",
      ],
    },
    en: {
      title: "How to Choose a Hong Kong VPS",
      slug: "how-to-choose-a-hong-kong-vps",
      summary:
        "Choose a Hong Kong VPS from user carriers, measured routes, bandwidth accounting, facility failure domains, and workload boundaries instead of assuming that geographic proximity guarantees quality.",
      keywords: [
        "Hong Kong VPS",
        "Hong Kong data center",
        "mainland China access",
        "international bandwidth",
        "route test",
        "data center selection",
      ],
      aliases: ["HK VPS", "Hong Kong virtual server"],
      retrievalTerms: [
        "how to choose Hong Kong VPS",
        "test Hong Kong hosting routes",
        "mainland China to Hong Kong server",
        "Hong Kong bandwidth limits",
        "Hong Kong VPS use cases",
        "Hong Kong hosting latency",
      ],
      audience:
        "Users deploying websites or APIs for mainland China, Hong Kong, or wider Asia-Pacific audiences who can test candidate instances from target networks.",
      avoid:
        "A Hong Kong location does not establish licensing, data, or business compliance and does not guarantee cross-border capacity or uniform performance across mainland carriers.",
      takeaway:
        "Geographic distance is one input. Facility connectivity, cross-border interconnection, direction, time window, and bandwidth policy determine real experience, so select from user distribution and repeatable application tests.",
      concepts: [
        [
          "Facility and carriers",
          "Facilities in one region can use different upstream providers, interconnection, and failure domains.",
        ],
        [
          "Route direction",
          "Outbound and return paths can differ, requiring bidirectional tests for mainland China users.",
        ],
        [
          "Capacity policy",
          "Port speed, shared capacity, transfer quota, and burst limits affect peak and sustained traffic differently.",
        ],
      ],
      steps: [
        "Record target access carriers, interactions, and data-transfer patterns.",
        "Obtain a test IP for each candidate facility and run consistent bidirectional tests across time windows.",
        "Validate backups, recovery, bandwidth accounting, and support boundaries before production migration.",
      ],
      verification: [
        "Use the real domain, TLS, and page or API requests rather than ICMP alone.",
        "Monitor destination latency, loss, throughput, and errors and retain a route-change baseline.",
      ],
      pitfalls: [
        "A fast test IP may use a different path or resource pool from the purchased instance.",
        "Treating direct or optimized as permanent ignores carrier policy changes.",
      ],
    },
  },
  {
    id: "KB-014",
    priority: "P1",
    categorySlug: "datacenter-regions",
    reviewMonths: 6,
    sourceKeys: ["rfc2680", "rfc2681", "mtr"],
    relatedIds: ["KB-007", "KB-011", "KB-015"],
    zh: {
      title: "日本和新加坡 VPS 怎么选：面向中国大陆与东南亚的部署建议",
      slug: "japan-singapore-vps-region-selection",
      summary:
        "按用户分布和运营商路径比较日本与新加坡 VPS，而不是使用固定地区排名；覆盖中国大陆与东南亚访问、跨区容灾、数据位置和真实业务验证。",
      keywords: [
        "日本 VPS",
        "新加坡 VPS",
        "服务器地区",
        "东南亚用户",
        "中国大陆访问",
        "跨区部署",
      ],
      aliases: ["Japan VPS", "Singapore VPS"],
      retrievalTerms: [
        "日本还是新加坡 VPS",
        "东南亚服务器地区",
        "国内访问日本服务器",
        "新加坡 VPS 延迟",
        "亚洲机房选择",
        "日本新加坡线路测试",
      ],
      audience:
        "用户同时分布在东北亚、东南亚或中国大陆，需要以权重和测量决定主地区与备份地区的团队。",
      avoid:
        "不存在适用于所有运营商和国家的固定胜者；业务许可、数据位置和供应商支持也必须独立确认。",
      takeaway:
        "日本常更接近东北亚用户，新加坡常更接近部分东南亚用户，但公网路径可改变这一顺序；应按真实用户网络加权比较。",
      concepts: [
        [
          "用户加权",
          "地区选择应按真实用户数量、关键交易和交互频率加权，而不是只看全局平均。",
        ],
        ["跨网互联", "运营商之间的互联和国际出口可能比城市间距离更影响结果。"],
        [
          "多地区策略",
          "静态内容可用 CDN，状态服务需要明确复制一致性、故障切换和恢复。",
        ],
      ],
      steps: [
        "将用户按国家或地区、运营商和关键流程分组。",
        "在日本、新加坡候选点运行同一组应用与路由测试。",
        "按业务权重评分，并为第二地区定义数据复制和切换方法。",
      ],
      verification: [
        "从每个主要用户组的真实网络分别复测高峰与非高峰，不上传测试结果到知识库。",
        "演练主地区不可用时的 DNS、流量和数据恢复。",
      ],
      pitfalls: [
        "公共云地区平均延迟不能代表某个具体供应商和线路。",
        "跨区数据库复制若未定义一致性目标，故障时可能产生数据冲突或丢失。",
      ],
    },
    en: {
      title: "Japan vs Singapore VPS: Which Region Fits Your Users?",
      slug: "japan-vs-singapore-vps",
      summary:
        "Compare Japan and Singapore VPS regions from weighted user networks rather than a fixed ranking, covering mainland China and Southeast Asia access, recovery, data location, and application tests.",
      keywords: [
        "Japan VPS",
        "Singapore VPS",
        "server region",
        "Southeast Asia users",
        "mainland China access",
        "multi-region deployment",
      ],
      aliases: ["Tokyo VPS", "Singapore virtual server"],
      retrievalTerms: [
        "Japan vs Singapore VPS",
        "server region for Southeast Asia",
        "mainland China to Japan server",
        "Singapore VPS latency",
        "Asia data center selection",
        "test Japan and Singapore routes",
      ],
      audience:
        "Teams serving Northeast Asia, Southeast Asia, or mainland China that can weight user groups and measure primary and recovery regions.",
      avoid:
        "There is no permanent winner for every country and carrier. Licensing, data location, and support boundaries require separate validation.",
      takeaway:
        "Japan is geographically closer to many Northeast Asian users and Singapore to parts of Southeast Asia, but Internet paths can reverse that order. Compare measured results weighted by real user networks.",
      concepts: [
        [
          "User weighting",
          "Weight region results by actual users, critical transactions, and interaction frequency rather than a global average.",
        ],
        [
          "Interconnection",
          "Carrier interconnection and international exits can affect performance more than city-to-city distance.",
        ],
        [
          "Multi-region design",
          "A CDN can distribute static content, while stateful services need explicit replication, failover, and recovery behavior.",
        ],
      ],
      steps: [
        "Group users by country or area, carrier, and critical workflow.",
        "Run the same application and route tests from candidate locations in Japan and Singapore.",
        "Score results by business weight and define data replication and switching for the secondary region.",
      ],
      verification: [
        "Repeat during busy and quiet periods from at least one real access network in each major user group.",
        "Exercise DNS, traffic, and data recovery when the primary region is unavailable.",
      ],
      pitfalls: [
        "A public-cloud regional average does not represent a specific provider and route.",
        "Cross-region database replication without a consistency objective can cause conflicts or data loss during failure.",
      ],
    },
  },
  {
    id: "KB-015",
    priority: "P1",
    categorySlug: "datacenter-regions",
    reviewMonths: 6,
    sourceKeys: ["rfc2680", "rfc2681", "mtr"],
    relatedIds: ["KB-011", "KB-012", "KB-030"],
    zh: {
      title: "美国 VPS 怎么选：西海岸、东海岸与全球用户访问差异",
      slug: "us-vps-west-east-region-selection",
      summary:
        "比较美国西海岸、东海岸和中部地区面向北美、欧洲、亚太用户的物理距离与公网路径差异，并给出按用户权重、应用交互和容灾目标选区的方法。",
      keywords: [
        "美国 VPS",
        "美西 VPS",
        "美东 VPS",
        "服务器地区",
        "全球用户",
        "美国机房",
      ],
      aliases: ["US West", "US East", "United States VPS"],
      retrievalTerms: [
        "美西还是美东 VPS",
        "美国服务器地区选择",
        "欧洲用户美东机房",
        "亚洲用户美西机房",
        "美国 VPS 延迟",
        "全球网站服务器位置",
      ],
      audience:
        "用户分布在北美、欧洲或亚太，需要在美国选择主地区或第二故障域的全球网站和 API 团队。",
      avoid:
        "“美西”或“美东”范围很大，城市、运营商和海缆入口不同；不能从海岸标签推断某个实例的全球体验。",
      takeaway:
        "西海岸通常减少到部分亚太用户的传播距离，东海岸通常更接近欧洲和北美东部，但最终结果取决于用户权重、互联路径和应用往返次数。",
      concepts: [
        [
          "大陆内距离",
          "美国境内跨洲传输也会增加 RTT，交互密集应用比批量传输更敏感。",
        ],
        ["海缆入口", "国际流量进入美国的地点与运营商策略可能造成绕行。"],
        [
          "业务分层",
          "静态资源、无状态 API 和主数据库可以采用不同的地区与缓存策略。",
        ],
      ],
      steps: [
        "按用户地区和关键请求统计业务权重。",
        "选择具体城市和网络的候选实例，执行相同端到端测试。",
        "评估 CDN、读副本或第二地区能否减少长距离交互并满足恢复目标。",
      ],
      verification: [
        "从北美、欧洲和亚太代表点采集应用时延与路由。",
        "测量跨区数据同步延迟，并演练主地区故障。",
      ],
      pitfalls: [
        "只测带宽会忽略 TLS、数据库和 API 多次往返的延迟成本。",
        "把主数据库远离主要写入用户可能放大所有事务等待。",
      ],
    },
    en: {
      title: "US West vs US East VPS: Region Selection Guide",
      slug: "us-west-vs-us-east-vps",
      summary:
        "Compare US West, US East, and central regions for North American, European, and Asia-Pacific users, then select a location from weighted demand, application round trips, and recovery goals.",
      keywords: [
        "US VPS",
        "US West VPS",
        "US East VPS",
        "server region",
        "global users",
        "US data center",
      ],
      aliases: [
        "United States VPS",
        "West Coast hosting",
        "East Coast hosting",
      ],
      retrievalTerms: [
        "US West vs US East VPS",
        "United States server region",
        "US East for European users",
        "US West for Asian users",
        "US VPS latency",
        "server location for global website",
      ],
      audience:
        "Global website and API teams serving North America, Europe, or Asia-Pacific that need a primary US region or a second failure domain.",
      avoid:
        "US West and US East cover many cities, carriers, and cable landings. A coast label cannot establish the global experience of a particular instance.",
      takeaway:
        "US West often shortens physical distance to parts of Asia-Pacific and US East to Europe and eastern North America, but user weight, interconnection, and application round trips determine the result.",
      concepts: [
        [
          "Continental distance",
          "Cross-country transport within the United States adds RTT, and chatty applications are more sensitive than bulk transfer.",
        ],
        [
          "Cable landing and entry",
          "International traffic can enter through different locations and detour according to carrier policy.",
        ],
        [
          "Service placement",
          "Static assets, stateless APIs, and a primary database can use different regions and caching strategies.",
        ],
      ],
      steps: [
        "Weight demand by user region and critical request path.",
        "Choose candidates by specific city and network and run identical endpoint tests.",
        "Evaluate whether a CDN, read replica, or second region reduces long-distance exchanges while meeting recovery goals.",
      ],
      verification: [
        "Collect application latency and routes from representative North American, European, and Asia-Pacific user access networks.",
        "Measure cross-region replication delay and exercise primary-region failure.",
      ],
      pitfalls: [
        "A bandwidth-only test misses the cost of repeated TLS, database, and API round trips.",
        "Placing the primary database far from the main writers can add delay to every transaction.",
      ],
    },
  },
  {
    id: "KB-016",
    priority: "P0",
    categorySlug: "ip-network",
    reviewMonths: 12,
    sourceKeys: ["rfc791", "rfc8200"],
    relatedIds: ["KB-019", "KB-021", "KB-026"],
    zh: {
      title: "IPv4 和 IPv6 有什么区别？服务器是否需要双栈",
      slug: "ipv4-ipv6-dual-stack-server-guide",
      summary:
        "比较 IPv4 与 IPv6 的地址、首部、邻居发现和部署差异，解释双栈的流量选择与故障模式，并给出 DNS、监听、防火墙和外部可达性的完整验证清单。",
      keywords: [
        "IPv4",
        "IPv6",
        "双栈",
        "AAAA 记录",
        "服务器网络",
        "Happy Eyeballs",
      ],
      aliases: [
        "Internet Protocol version 4",
        "Internet Protocol version 6",
        "Dual Stack",
      ],
      retrievalTerms: [
        "服务器需要 IPv6 吗",
        "IPv4 和 IPv6 区别",
        "双栈服务器配置",
        "AAAA 解析失败",
        "IPv6 防火墙",
        "网站开启 IPv6",
      ],
      audience:
        "计划让网站、API 或远程管理同时支持 IPv4 与 IPv6，并能控制 DNS、主机防火墙和应用监听的用户。",
      avoid:
        "不要仅添加 AAAA 记录而不验证服务、防火墙和回程；这会让部分客户端优先连接一条不可用路径。",
      takeaway:
        "IPv6 提供更大的地址空间和不同的基础协议机制，双栈让客户端在 IPv4 与 IPv6 间选择；是否需要双栈取决于用户可达性和完整运维能力。",
      concepts: [
        [
          "地址与首部",
          "IPv4 使用 32 位地址，IPv6 使用 128 位地址并采用不同基础首部和扩展机制。",
        ],
        [
          "双栈选择",
          "客户端可能优先或并行尝试两种协议，任一协议配置不完整都可能造成间歇性慢或失败。",
        ],
        [
          "独立安全面",
          "IPv6 监听、路由和防火墙规则与 IPv4 需要分别核对，不能假定自动继承。",
        ],
      ],
      steps: [
        "确认供应商分配方式、默认路由、网关和前缀长度。",
        "让应用监听所需地址，并为 IPv4、IPv6 分别配置最小防火墙规则。",
        "验证后再发布 A 与 AAAA，保留快速回滚 DNS 的方法。",
      ],
      verification: [
        "从仅 IPv4、仅 IPv6 和双栈网络测试 DNS、TCP、TLS 与 HTTP。",
        "检查访问日志中的地址族和错误，确认监控也覆盖两种协议。",
      ],
      pitfalls: [
        "IPv6 可 ping 不代表应用端口、防火墙和 TLS 均正常。",
        "把 IPv6 地址直接写入 URL 时必须使用方括号，否则端口解析会混淆。",
      ],
    },
    en: {
      title: "IPv4 vs IPv6: Does Your Server Need Dual Stack?",
      slug: "ipv4-vs-ipv6-and-dual-stack-hosting",
      summary:
        "Compare IPv4 and IPv6 addressing and protocol behavior, understand dual-stack selection and failures, and validate DNS, listeners, firewalls, TLS, and external reachability before publishing AAAA.",
      keywords: [
        "IPv4",
        "IPv6",
        "dual stack",
        "AAAA record",
        "server networking",
        "Happy Eyeballs",
      ],
      aliases: [
        "Internet Protocol version 4",
        "Internet Protocol version 6",
        "Dual Stack",
      ],
      retrievalTerms: [
        "does a server need IPv6",
        "IPv4 vs IPv6",
        "dual-stack server setup",
        "AAAA record failure",
        "IPv6 firewall",
        "enable IPv6 for a website",
      ],
      audience:
        "Operators preparing a website, API, or remote administration service for both address families who control DNS, host firewalling, and application listeners.",
      avoid:
        "Do not publish an AAAA record before validating service, firewall, and return path. Some clients may prefer a broken IPv6 path and experience delays or failures.",
      takeaway:
        "IPv6 provides a larger address space and different base protocol mechanisms. Dual stack lets clients choose IPv4 or IPv6, and its value depends on user reachability plus complete operational support.",
      concepts: [
        [
          "Address and header",
          "IPv4 uses 32-bit addresses, while IPv6 uses 128-bit addresses and a different base-header and extension model.",
        ],
        [
          "Dual-stack selection",
          "Clients may prefer or race address families, so an incomplete family can create intermittent delay or failure.",
        ],
        [
          "Separate security surface",
          "IPv6 listeners, routes, and firewall policy require explicit review rather than assumed inheritance from IPv4.",
        ],
      ],
      steps: [
        "Confirm the provider's addressing method, default route, gateway behavior, and prefix length.",
        "Bind the application to required addresses and implement minimal firewall rules independently for both families.",
        "Publish A and AAAA only after validation and retain a fast DNS rollback procedure.",
      ],
      verification: [
        "From IPv4-only, IPv6-only, and dual-stack networks, test DNS, TCP, TLS, and HTTP.",
        "Review access logs and failures by address family and ensure monitoring covers both.",
      ],
      pitfalls: [
        "A successful IPv6 ping does not prove that the application port, firewall, and TLS work.",
        "A literal IPv6 address in a URL requires brackets or the port delimiter becomes ambiguous.",
      ],
    },
  },
  {
    id: "KB-017",
    priority: "P1",
    categorySlug: "ip-network",
    reviewMonths: 6,
    sourceKeys: ["rdap", "ianaAsn"],
    relatedIds: ["KB-018", "KB-020", "KB-030"],
    zh: {
      title: "原生 IP、广播 IP 和住宅 IP 有什么区别",
      slug: "native-broadcast-residential-ip-differences",
      summary:
        "解释主机市场中原生 IP、广播 IP 与住宅 IP 的常见用法，明确它们不是统一协议分类，并给出用 RDAP、ASN、路由与目标服务规则核验归属和适用性的流程。",
      keywords: ["原生 IP", "广播 IP", "住宅 IP", "IP 归属", "ASN", "RDAP"],
      aliases: ["Native IP", "Announced IP", "Residential IP"],
      retrievalTerms: [
        "原生 IP 是什么",
        "广播 IP 和原生 IP 区别",
        "住宅 IP 怎么查",
        "IP 归属查询",
        "机房 IP 判断",
        "IP 解锁是否稳定",
      ],
      audience:
        "需要理解主机商 IP 标签、核验注册与路由归属，并评估正常业务可达性和平台规则的用户。",
      avoid:
        "这些市场术语不能保证第三方平台识别、访问权限或长期状态；不得用于规避服务条款、风控或地域限制。",
      takeaway:
        "原生、广播和住宅 IP 在主机市场没有统一技术标准，通常混合描述注册信息、路由发布和接入类型；应分别核验 RDAP、ASN、实际路由和目标服务政策。",
      concepts: [
        [
          "注册信息",
          "RIR/RDAP 显示地址块登记与联系信息，不必然等于终端实际位置或用途。",
        ],
        [
          "路由发布",
          "地址块可由某 ASN 通告；主机市场的“广播 IP”不要与 IP 协议中的广播地址混淆。",
        ],
        [
          "接入类型",
          "住宅、移动或机房分类常来自商业数据库，数据源、更新时间和判断规则不同。",
        ],
      ],
      steps: [
        "使用权威 RDAP 查询地址块、分配机构和更新时间。",
        "查询当前起源 ASN 和路由可见性，并从实例验证路径。",
        "阅读目标服务条款，以正常业务测试结果而非标签决定适用性。",
      ],
      verification: [
        "对比多个时间点的 RDAP 与 BGP 信息，记录变更。",
        "确认反向 DNS、地理数据库和平台识别只是辅助证据。",
      ],
      pitfalls: [
        "数据库显示住宅不代表连接具有家庭宽带的网络或信誉属性。",
        "IP 状态和第三方策略会变化，历史“可用”结论不能长期承诺。",
      ],
    },
    en: {
      title: "Native, Broadcast, and Residential IP Addresses Compared",
      slug: "native-vs-broadcast-vs-residential-ip",
      summary:
        "Clarify hosting-market uses of native, broadcast, and residential IP labels, which are not standard protocol classes, and verify registration, ASN, routing, and service-policy evidence separately.",
      keywords: [
        "native IP",
        "announced IP",
        "residential IP",
        "IP ownership",
        "ASN",
        "RDAP",
      ],
      aliases: ["broadcast IP hosting label", "consumer ISP IP"],
      retrievalTerms: [
        "what is a native IP",
        "native vs broadcast IP",
        "how to verify residential IP",
        "IP owner lookup",
        "data center IP detection",
        "IP reputation stability",
      ],
      audience:
        "Users who need to understand hosting IP labels, verify registration and routing, and assess legitimate service reachability and policy fit.",
      avoid:
        "These labels cannot guarantee third-party classification, access, or lasting status and must not be used to evade service terms, risk controls, or location restrictions.",
      takeaway:
        "Native, broadcast, and residential IP are not uniform technical categories in hosting. They mix registration, route origination, and access-type claims that require separate RDAP, ASN, path, and policy checks.",
      concepts: [
        [
          "Registration",
          "RIR and RDAP data identify an address allocation and contacts, not necessarily the endpoint's physical location or use.",
        ],
        [
          "Route origination",
          "An ASN may announce the prefix. The hosting label broadcast IP is not the protocol concept of an IP broadcast address.",
        ],
        [
          "Access classification",
          "Residential, mobile, and hosting labels often come from commercial databases with different sources and update schedules.",
        ],
      ],
      steps: [
        "Use authoritative RDAP to inspect the network allocation, allocating registry, and update time.",
        "Check current origin ASN and route visibility and validate the path from the instance.",
        "Read the target service terms and decide from legitimate business tests rather than a label.",
      ],
      verification: [
        "Compare RDAP and BGP evidence over time and record changes.",
        "Treat reverse DNS, geolocation databases, and platform classification as supporting rather than authoritative evidence.",
      ],
      pitfalls: [
        "A residential database label does not prove a home-access network or consumer reputation characteristics.",
        "Address status and third-party policy change, so a historical works claim cannot be a durable promise.",
      ],
    },
  },
  {
    id: "KB-018",
    priority: "P1",
    categorySlug: "ip-network",
    reviewMonths: 12,
    sourceKeys: ["rdap", "ianaAsn", "rfc4271"],
    relatedIds: ["KB-016", "KB-017", "KB-020"],
    zh: {
      title: "ASN 是什么？如何查询 IP 所属网络和运营商",
      slug: "asn-ip-isp-lookup-guide",
      summary:
        "解释自治系统号、IP 地址块注册与 BGP 起源的关系，提供使用 IANA、RIR RDAP 和路由视图查询 IP 所属网络的步骤，并说明注册人、起源 ASN 与实际服务商可能不同。",
      keywords: [
        "ASN",
        "自治系统",
        "IP 归属",
        "RDAP",
        "BGP 起源",
        "运营商查询",
      ],
      aliases: ["Autonomous System Number", "AS Number"],
      retrievalTerms: [
        "ASN 是什么",
        "IP 属于哪个运营商",
        "查询 IP 起源 ASN",
        "RDAP 怎么用",
        "IP 地址块注册人",
        "BGP 网络查询",
      ],
      audience:
        "需要调查路由归属、排查线路或记录供应商网络证据的运维、安全和采购人员。",
      avoid:
        "ASN 和注册信息不能直接证明服务器物理位置、最终转售商或用户身份，也不应作为单一归责证据。",
      takeaway:
        "ASN 标识参与统一路由策略的自治系统，RDAP 描述地址和实体注册信息，BGP 视图显示当前起源；三者组合比单一 IP 数据库更可靠。",
      concepts: [
        [
          "ASN",
          "自治系统用 ASN 在 BGP 中标识路由策略域，编号分配状态可由 IANA 与区域注册机构核对。",
        ],
        [
          "地址注册",
          "IP 前缀由 RIR 体系分配或再分配，登记组织不一定是面向用户的品牌。",
        ],
        [
          "路由起源",
          "当前通告前缀的起源 ASN 可能与登记组织不同，需结合授权和上游关系解释。",
        ],
      ],
      steps: [
        "从 IANA 或对应 RIR 的 RDAP 查询 IP 网络对象。",
        "记录前缀、登记实体、状态、事件时间和联系范围。",
        "查询当前 BGP 起源与 AS_PATH，并与供应商说明和实际 traceroute 对照。",
      ],
      verification: [
        "从两个独立路由观察点核对起源与可见前缀。",
        "保存查询时间和原始 URL，避免把动态结果写成永久事实。",
      ],
      pitfalls: [
        "WHOIS/RDAP 地址常是组织联系地址，不是服务器机房坐标。",
        "较大地址块的信息可能掩盖下游再分配或租用关系。",
      ],
    },
    en: {
      title: "How to Look Up an ASN, IP Owner, and ISP",
      slug: "how-to-look-up-asn-ip-owner-and-isp",
      summary:
        "Understand the relationship between autonomous system numbers, registered IP networks, and BGP origin, then combine IANA, RIR RDAP, and route views without confusing owners, origin ASNs, and resellers.",
      keywords: [
        "ASN",
        "autonomous system",
        "IP ownership",
        "RDAP",
        "BGP origin",
        "ISP lookup",
      ],
      aliases: ["Autonomous System Number", "AS Number"],
      retrievalTerms: [
        "what is an ASN",
        "who owns an IP address",
        "find BGP origin ASN",
        "how to use RDAP",
        "registered IP network",
        "carrier network lookup",
      ],
      audience:
        "Operations, security, and procurement staff investigating route ownership, connectivity, or provider network evidence.",
      avoid:
        "An ASN or registration record does not prove physical server location, the final reseller, or user identity and should not be the sole attribution evidence.",
      takeaway:
        "An ASN identifies an autonomous routing-policy domain, RDAP provides network and entity registration, and BGP views show current origin. Combining them is more reliable than one commercial IP database.",
      concepts: [
        [
          "ASN",
          "An autonomous system uses an ASN to identify its policy domain in BGP; IANA and regional registries publish allocation status.",
        ],
        [
          "Address registration",
          "The RIR system allocates and reassigns prefixes, and the registered organization may differ from the customer-facing brand.",
        ],
        [
          "Route origin",
          "The origin ASN announcing a prefix can differ from the registrant and requires routing authorization and upstream context.",
        ],
      ],
      steps: [
        "Query the IP network object through IANA or the responsible RIR RDAP service.",
        "Record the prefix, entities, status, event dates, and scope of contact data.",
        "Check current BGP origin and AS_PATH and compare them with provider documentation and an observed traceroute.",
      ],
      verification: [
        "Confirm origin and visible prefix from two independent routing observation points.",
        "Preserve query time and source URL so dynamic data is not presented as permanent fact.",
      ],
      pitfalls: [
        "A WHOIS or RDAP postal address is commonly an organizational contact, not the data center coordinates.",
        "A large aggregate record can hide downstream reassignment or leasing relationships.",
      ],
    },
  },
  {
    id: "KB-019",
    priority: "P0",
    categorySlug: "ip-network",
    reviewMonths: 12,
    sourceKeys: ["rfc1034", "rfc1035", "rfc8200"],
    relatedIds: ["KB-016", "KB-021", "KB-028"],
    zh: {
      title: "DNS 是什么？A、AAAA、CNAME 记录怎么配置",
      slug: "dns-records-a-aaaa-cname-guide",
      summary:
        "解释 DNS 委派、权威应答、缓存以及 A、AAAA、CNAME 的用途，给出从服务器监听到记录发布、TTL 与外部解析验证的安全配置流程。",
      keywords: ["DNS", "A 记录", "AAAA 记录", "CNAME", "域名解析", "TTL"],
      aliases: ["Domain Name System", "资源记录", "Resource Record"],
      retrievalTerms: [
        "A 记录怎么配置",
        "AAAA 记录是什么",
        "CNAME 和 A 区别",
        "DNS 解析不生效",
        "TTL 怎么设置",
        "网站域名指向服务器",
      ],
      audience:
        "需要把域名指向网站、API 或邮件之外的普通服务，并能管理权威 DNS 和服务器网络的用户。",
      avoid:
        "不要在服务、防火墙和 TLS 尚未验证时发布新地址；根域 CNAME 等行为还需遵守具体 DNS 提供商和协议限制。",
      takeaway:
        "A 将名称映射到 IPv4，AAAA 映射到 IPv6，CNAME 将一个名称设为另一规范名称；记录发布必须与服务监听、证书和实际可达性同步。",
      concepts: [
        [
          "权威与递归",
          "权威服务器保存区域数据，递归解析器代表客户端查询并按 TTL 缓存。",
        ],
        [
          "A 与 AAAA",
          "两类记录分别返回 IPv4 与 IPv6 地址，双栈客户端可能选择其中任一。",
        ],
        [
          "CNAME",
          "CNAME 为名称建立别名，别名节点通常不能同时承载其他冲突数据。",
        ],
      ],
      steps: [
        "先验证目标 IPv4/IPv6、端口、TLS 证书和虚拟主机配置。",
        "以合适 TTL 添加记录，变更前保留旧值和回滚计划。",
        "从多个递归解析器查询权威链、记录值和 DNSSEC 状态。",
      ],
      verification: [
        "使用 dig 查询权威服务器与公共递归解析器，比较 Answer 与 TTL。",
        "从外部网络用域名完成 TCP、TLS 和 HTTP 请求。",
      ],
      pitfalls: [
        "本地 hosts、浏览器和递归缓存会让不同用户看到不同阶段的结果。",
        "发布 AAAA 但 IPv6 服务不通，会造成部分客户端慢或失败。",
      ],
    },
    en: {
      title: "DNS Records Explained: A, AAAA, and CNAME",
      slug: "a-aaaa-and-cname-dns-records-explained",
      summary:
        "Understand DNS delegation, authoritative answers, caching, and A, AAAA, and CNAME records, then publish changes only after listeners, firewalling, TLS, TTL, and external resolution are verified.",
      keywords: [
        "DNS",
        "A record",
        "AAAA record",
        "CNAME",
        "domain resolution",
        "TTL",
      ],
      aliases: ["Domain Name System", "resource record", "RR"],
      retrievalTerms: [
        "how to configure an A record",
        "what is an AAAA record",
        "CNAME vs A record",
        "DNS change not visible",
        "how to choose TTL",
        "point a domain to a server",
      ],
      audience:
        "Users pointing a domain to a website, API, or other ordinary service who control authoritative DNS and the server network.",
      avoid:
        "Do not publish an address before service, firewall, and TLS validation. Apex CNAME behavior also depends on protocol constraints and the exact DNS provider.",
      takeaway:
        "A maps a name to IPv4, AAAA maps it to IPv6, and CNAME makes one name an alias of a canonical name. DNS publication must align with listeners, certificates, and real reachability.",
      concepts: [
        [
          "Authoritative and recursive",
          "Authoritative servers hold zone data, while recursive resolvers query on behalf of clients and cache according to TTL.",
        ],
        [
          "A and AAAA",
          "These records return IPv4 and IPv6 addresses respectively, and a dual-stack client may select either family.",
        ],
        [
          "CNAME",
          "CNAME aliases one name to another canonical name, and an alias node generally cannot carry conflicting data.",
        ],
      ],
      steps: [
        "Validate target IPv4 or IPv6, ports, TLS certificate, and virtual-host configuration first.",
        "Add records with an appropriate TTL and preserve old values plus a rollback plan.",
        "Query authoritative and multiple recursive resolvers for the chain, values, and DNSSEC status.",
      ],
      verification: [
        "Use dig against authoritative servers and public resolvers and compare the answer and TTL.",
        "From an external network, complete TCP, TLS, and HTTP requests with the domain name.",
      ],
      pitfalls: [
        "Local hosts files, browser caches, and recursive caches can expose different stages of a change.",
        "An AAAA record with a broken IPv6 service causes delay or failure for some clients.",
      ],
    },
  },
  {
    id: "KB-020",
    priority: "P1",
    categorySlug: "ip-network",
    reviewMonths: 6,
    sourceKeys: ["linuxNetworking", "rfc1034", "mtr"],
    relatedIds: ["KB-009", "KB-018", "KB-019"],
    zh: {
      title: "IP 被封、端口不通、DNS 解析失败：VPS 网络问题排查",
      slug: "vps-ip-port-dns-troubleshooting",
      summary:
        "用分层方法区分 DNS、路由、主机防火墙、应用监听和上游策略问题，提供从本机到外部网络的命令顺序，避免把所有连接失败都归因于 IP 被封。",
      keywords: [
        "VPS 网络排查",
        "端口不通",
        "DNS 失败",
        "IP 不可达",
        "防火墙",
        "ss 命令",
      ],
      aliases: ["Connection Timeout", "Network Unreachable"],
      retrievalTerms: [
        "VPS 端口打不开",
        "IP 被封怎么判断",
        "DNS 解析失败排查",
        "服务器连接超时",
        "防火墙端口检查",
        "网站外网无法访问",
      ],
      audience:
        "能够登录服务器控制台或救援环境，需要系统定位名称解析、网络路径、端口和应用故障的运维人员。",
      avoid:
        "不要在未知原因时关闭全部防火墙或把服务绑定到公网；先保留控制台访问和当前规则备份。",
      takeaway:
        "按 DNS 结果、IP 路由、TCP/UDP 端口、应用监听和 TLS/HTTP 顺序逐层定位；“IP 被封”只有在多端点对照排除其他层后才是候选解释。",
      concepts: [
        [
          "名称层",
          "DNS 可能返回旧地址、错误地址族或无记录，先直接比较域名与 IP。",
        ],
        ["传输层", "超时、拒绝和无路由代表不同阶段，需结合 ss、防火墙和抓包。"],
        ["应用层", "端口建立后仍可能因虚拟主机、TLS、反向代理或上游服务失败。"],
      ],
      steps: [
        "记录客户端错误、时间、源网络、域名、解析地址和目标端口。",
        "在服务器检查地址、路由、监听进程、防火墙与应用日志。",
        "从多个外部网络分别测试 IP 和域名，并用 MTR 或抓包定位边界。",
      ],
      verification: [
        "用 ss 确认服务监听正确地址族和端口，再从本机与外部连接。",
        "若仅某网络失败，比较路径和源地址策略，不先修改应用。",
      ],
      pitfalls: [
        "Connection refused 常表示目标主动拒绝或无监听，不等于路由被封。",
        "云防火墙、安全组和主机防火墙可能同时存在，修改一层不足以开放路径。",
      ],
    },
    en: {
      title: "Troubleshooting VPS IP, Port, and DNS Issues",
      slug: "troubleshoot-vps-ip-port-and-dns-issues",
      summary:
        "Separate DNS, routing, host firewall, application listener, and upstream policy failures with a layered workflow, instead of labeling every timeout as an IP block or disabling security controls.",
      keywords: [
        "VPS networking",
        "closed port",
        "DNS failure",
        "IP unreachable",
        "firewall",
        "ss command",
      ],
      aliases: [
        "connection timeout",
        "network unreachable",
        "connection refused",
      ],
      retrievalTerms: [
        "VPS port not reachable",
        "how to test an IP block",
        "DNS resolution troubleshooting",
        "server connection timeout",
        "check firewall port",
        "website not reachable externally",
      ],
      audience:
        "Operators with console or rescue access who need to isolate name resolution, path, port, and application failures systematically.",
      avoid:
        "Do not disable every firewall or expose the service publicly while the cause is unknown. Preserve console access and a backup of current rules first.",
      takeaway:
        "Work through DNS, IP routing, TCP or UDP, listener, and TLS or HTTP in order. An IP block becomes a candidate only after controlled endpoints exclude failures at the other layers.",
      concepts: [
        [
          "Name layer",
          "DNS can return an old address, a broken address family, or no record, so compare the domain and literal IP first.",
        ],
        [
          "Transport layer",
          "Timeout, refusal, and no-route errors occur at different stages and require listener, firewall, and packet evidence.",
        ],
        [
          "Application layer",
          "After a port connects, virtual hosts, TLS, reverse proxying, or an upstream application can still fail.",
        ],
      ],
      steps: [
        "Record the client error, time, source network, domain, resolved addresses, and destination port.",
        "On the server, inspect addresses, routes, listening processes, firewall policy, and application logs.",
        "From multiple external networks, test IP and domain separately and use MTR or packet capture to locate the boundary.",
      ],
      verification: [
        "Use ss to confirm the service listens on the intended address family and port, then connect locally and externally.",
        "If only one access network fails, compare path and source policy before changing the application.",
      ],
      pitfalls: [
        "Connection refused commonly means active rejection or no listener, not a blocked route.",
        "Cloud firewall, security group, and host firewall can coexist, so changing one layer may not open the full path.",
      ],
    },
  },
  {
    id: "KB-021",
    priority: "P0",
    categorySlug: "system-operations",
    reviewMonths: 6,
    sourceKeys: ["ubuntuSecurity", "openssh", "nistServerSecurity"],
    relatedIds: ["KB-001", "KB-012", "KB-026"],
    zh: {
      title: "新购 VPS 的 Linux 初始化清单：账户、更新、时区和 SSH",
      slug: "new-vps-linux-initial-setup-checklist",
      summary:
        "提供新 Linux VPS 上线前的可回滚初始化顺序：保留控制台、创建管理账户、更新系统、设置时间、验证 SSH、防火墙、日志和备份，再交付应用使用。",
      keywords: [
        "Linux 初始化",
        "VPS 设置",
        "SSH",
        "系统更新",
        "时区",
        "管理账户",
      ],
      aliases: ["Server Bootstrap", "Linux Baseline"],
      retrievalTerms: [
        "新 VPS 初始化",
        "Linux 服务器首次设置",
        "创建 sudo 用户",
        "VPS 修改时区",
        "SSH 上线检查",
        "服务器基础配置",
      ],
      audience:
        "刚获得自管理 Linux VPS，拥有供应商控制台或救援入口，并准备建立可恢复管理基线的用户。",
      avoid:
        "在新账户和密钥从第二个终端验证前，不要关闭 root 或密码登录；否则一次配置错误就可能锁死远程访问。",
      takeaway:
        "初始化的核心不是执行最多命令，而是按可回滚顺序建立第二管理入口、补丁、时间同步、最小网络暴露、日志和恢复能力。",
      concepts: [
        [
          "带外访问",
          "供应商控制台或救援模式是在 SSH 失效时恢复配置的最后入口，必须先确认可用。",
        ],
        [
          "管理身份",
          "日常管理应使用独立账户和 sudo 留痕，root 直接登录只在明确恢复流程中使用。",
        ],
        [
          "时间与更新",
          "正确时钟影响 TLS、日志和认证；补丁策略要包含重启窗口和失败回滚。",
        ],
      ],
      steps: [
        "记录实例、网络、控制台和当前登录方式，并保存配置快照。",
        "创建管理账户和密钥，在第二个终端完整验证 sudo 与重新登录。",
        "更新系统、设置 UTC 或业务时区、核对监听端口，再按最小需求配置防火墙。",
        "接入日志、监控与异地备份，完成一次恢复验证后再部署应用。",
      ],
      commands: [
        {
          label: "Debian/Ubuntu 基线检查示例",
          language: "bash",
          code: "sudo apt update\nsudo apt upgrade\nsudo adduser operator\nsudo usermod -aG sudo operator\ntimedatectl status\nss -lntup",
        },
      ],
      verification: [
        "保持原会话，使用新终端通过密钥登录并执行 sudo -v。",
        "重启后再次验证 SSH、时间同步、防火墙、监控和关键日志。",
      ],
      pitfalls: [
        "复制未知脚本会改变防火墙、仓库或 SSH，且难以审计回滚。",
        "只做快照而不做异地备份，无法覆盖账户、区域或供应商级故障。",
      ],
    },
    en: {
      title: "New Linux VPS Setup Checklist",
      slug: "new-linux-vps-setup-checklist",
      summary:
        "Bootstrap a Linux VPS in a recoverable order: preserve console access, create an administrator, patch the system, set time, validate SSH, limit exposure, and test logging and backups before deployment.",
      keywords: [
        "Linux setup",
        "VPS bootstrap",
        "SSH",
        "system updates",
        "time zone",
        "administrator account",
      ],
      aliases: ["server bootstrap", "Linux baseline"],
      retrievalTerms: [
        "new VPS setup",
        "first Linux server configuration",
        "create sudo user",
        "set VPS time zone",
        "SSH launch checklist",
        "server baseline configuration",
      ],
      audience:
        "Users receiving a self-managed Linux VPS with provider console or rescue access who need a recoverable administration baseline.",
      avoid:
        "Do not disable root or password login before a new account and key succeed from a second terminal, or one configuration error can remove remote access.",
      takeaway:
        "Bootstrap is not about running the most commands. Establish a second administrative path, patches, correct time, minimal exposure, logs, and recovery in an order that preserves rollback.",
      concepts: [
        [
          "Out-of-band access",
          "A provider console or rescue environment is the last recovery path when SSH fails and must be tested first.",
        ],
        [
          "Administrative identity",
          "Use a named account and sudo for routine work. Reserve direct root access for a documented recovery path.",
        ],
        [
          "Time and updates",
          "Correct time supports TLS, logs, and authentication. Patching needs a reboot window and failure rollback.",
        ],
      ],
      steps: [
        "Record instance, network, console, and current access details and preserve a configuration snapshot.",
        "Create an administrator and key, then verify sudo and a fresh login from a second terminal.",
        "Patch the system, select UTC or the operating time zone, inspect listeners, and implement minimal firewall policy.",
        "Connect logs, monitoring, and off-site backups and verify one restore before deploying the application.",
      ],
      commands: [
        {
          label: "Example Debian or Ubuntu baseline checks",
          language: "bash",
          code: "sudo apt update\nsudo apt upgrade\nsudo adduser operator\nsudo usermod -aG sudo operator\ntimedatectl status\nss -lntup",
        },
      ],
      verification: [
        "Keep the original session open while the new terminal authenticates with the key and runs sudo -v.",
        "After reboot, verify SSH, time synchronization, firewall policy, monitoring, and critical logs again.",
      ],
      pitfalls: [
        "An unreviewed bootstrap script can alter firewall, repositories, or SSH in ways that are difficult to audit or reverse.",
        "A local snapshot without an off-site backup does not cover account, region, or provider-level failure.",
      ],
    },
  },
  {
    id: "KB-022",
    priority: "P1",
    categorySlug: "system-operations",
    reviewMonths: 6,
    sourceKeys: ["openssh", "nistServerSecurity"],
    relatedIds: ["KB-021", "KB-026", "KB-020"],
    zh: {
      title: "SSH 密钥登录怎么配置：禁用密码前的安全切换方法",
      slug: "ssh-key-authentication-secure-setup",
      summary:
        "用保留回滚通道的方式部署 SSH 公钥认证：本地生成密钥、限制 authorized_keys 权限、校验 sshd 配置、从第二会话验证，再按风险决定是否关闭密码登录。",
      keywords: [
        "SSH 密钥",
        "公钥认证",
        "sshd_config",
        "密码登录",
        "authorized_keys",
        "服务器安全",
      ],
      aliases: ["Public Key Authentication", "SSH Key Authentication"],
      retrievalTerms: [
        "SSH 密钥登录配置",
        "禁用 SSH 密码登录",
        "authorized_keys 权限",
        "sshd 配置校验",
        "SSH 登录失败恢复",
        "服务器公钥认证",
      ],
      audience:
        "拥有控制台或现有稳定 SSH 会话，准备把日常管理从密码切换为独立密钥的管理员。",
      avoid:
        "没有带外恢复入口、共享同一私钥或无法撤销人员访问时，不应仓促关闭现有认证方式。",
      takeaway:
        "安全切换依赖独立身份、正确文件权限、配置语法校验和第二会话验证；禁用密码只是最后一步，不是第一步。",
      concepts: [
        [
          "密钥对",
          "私钥留在受控客户端，服务器只保存公钥；私钥泄漏时必须能按人员撤销。",
        ],
        [
          "文件权限",
          "用户家目录、.ssh 和 authorized_keys 的所有者或权限错误会让 sshd 拒绝密钥。",
        ],
        [
          "配置生效",
          "修改 sshd_config 前先用 sshd -t 校验，并选择 reload 而不是中断所有会话。",
        ],
      ],
      steps: [
        "为每名管理员生成独立密钥并设置本地保护。",
        "将公钥安装到目标账户，核对所有者与权限。",
        "校验 sshd 配置并 reload，保持旧会话不关闭。",
        "用第二会话测试密钥、sudo 和重连后，再决定 PasswordAuthentication。",
      ],
      commands: [
        {
          label: "密钥安装与服务端校验示例",
          language: "bash",
          code: "ssh-keygen -t ed25519 -a 64\nssh-copy-id operator@server.example\nssh operator@server.example\nsudo sshd -t\nsudo systemctl reload ssh",
        },
      ],
      verification: [
        "使用 ssh -v 确认实际采用的密钥和认证方法。",
        "通过控制台演练一次配置回退，并记录撤销单个公钥的方法。",
      ],
      pitfalls: [
        "把同一私钥复制给多人会失去身份追踪和单独撤销能力。",
        "直接重启 sshd 并关闭旧会话可能在语法、端口或防火墙错误时锁死服务器。",
      ],
    },
    en: {
      title: "How to Set Up SSH Key Authentication Safely",
      slug: "set-up-ssh-key-authentication-safely",
      summary:
        "Deploy SSH public-key authentication with rollback: generate individual keys, protect authorized_keys permissions, validate sshd syntax, test from a second session, and only then consider disabling passwords.",
      keywords: [
        "SSH key",
        "public key authentication",
        "sshd_config",
        "password login",
        "authorized_keys",
        "server security",
      ],
      aliases: ["SSH Key Authentication", "Public Key Authentication"],
      retrievalTerms: [
        "configure SSH key login",
        "disable SSH password login",
        "authorized_keys permissions",
        "validate sshd config",
        "recover failed SSH login",
        "server public key authentication",
      ],
      audience:
        "Administrators with console access or a stable existing SSH session who are moving routine access from passwords to individual keys.",
      avoid:
        "Do not rush to remove existing authentication without out-of-band recovery, individual keys, and a way to revoke each person's access.",
      takeaway:
        "A safe transition depends on separate identities, correct file permissions, syntax validation, and a second-session test. Disabling password authentication is the final step, not the first.",
      concepts: [
        [
          "Key pair",
          "The private key remains on a controlled client and the server stores only the public key. Compromise requires per-person revocation.",
        ],
        [
          "File permissions",
          "Incorrect ownership or permissions on the home directory, .ssh, or authorized_keys can make sshd reject a key.",
        ],
        [
          "Configuration activation",
          "Run sshd -t before applying changes and prefer a reload that preserves established sessions.",
        ],
      ],
      steps: [
        "Generate a separately protected key for every administrator.",
        "Install the public key for the target account and verify ownership and permissions.",
        "Validate sshd configuration and reload while keeping the old session open.",
        "From a second session, test key authentication, sudo, and reconnection before changing PasswordAuthentication.",
      ],
      commands: [
        {
          label: "Example key installation and server validation",
          language: "bash",
          code: "ssh-keygen -t ed25519 -a 64\nssh-copy-id operator@server.example\nssh operator@server.example\nsudo sshd -t\nsudo systemctl reload ssh",
        },
      ],
      verification: [
        "Use ssh -v to confirm the selected key and actual authentication method.",
        "Exercise one console rollback and document how to remove a single public key.",
      ],
      pitfalls: [
        "Sharing one private key removes individual attribution and revocation.",
        "Restarting sshd and closing the old session can lock out the server after a syntax, port, or firewall mistake.",
      ],
    },
  },
  {
    id: "KB-023",
    priority: "P0",
    categorySlug: "system-operations",
    reviewMonths: 3,
    sourceKeys: ["dockerCompose", "nistServerSecurity"],
    relatedIds: ["KB-002", "KB-021", "KB-028"],
    zh: {
      title: "Docker Compose 部署网站和应用的完整流程",
      slug: "docker-compose-deploy-web-app-guide",
      summary:
        "用 Docker Compose 将服务、网络、卷和配置声明化，覆盖镜像固定、密钥边界、配置校验、健康检查、日志、备份、更新与回滚，避免把一次启动当成生产部署完成。",
      keywords: [
        "Docker Compose",
        "容器部署",
        "compose.yaml",
        "应用发布",
        "容器网络",
        "持久化卷",
      ],
      aliases: ["docker compose", "Compose Specification"],
      retrievalTerms: [
        "Docker Compose 部署网站",
        "compose.yaml 怎么写",
        "容器应用上线",
        "Docker 卷备份",
        "Compose 更新回滚",
        "容器健康检查",
      ],
      audience:
        "在单机或小规模主机上部署多容器网站、API 与数据库辅助服务，并能维护镜像和持久化数据的用户。",
      avoid:
        "需要跨多节点调度、复杂自动扩缩容或严格多租户隔离时，应评估更适合的编排平台，不要强行用单机 Compose。",
      takeaway:
        "Compose 解决多容器声明和生命周期，不替代镜像供应链、密钥管理、备份、监控和恢复；上线必须包含验证与可回滚更新。",
      concepts: [
        [
          "声明模型",
          "compose.yaml 描述服务、网络、卷和依赖，但启动顺序不等于应用就绪。",
        ],
        [
          "持久化",
          "容器可替换，数据库和上传数据必须放入明确卷或外部服务并纳入备份。",
        ],
        [
          "版本与回滚",
          "镜像应使用可追踪版本或摘要，latest 无法证明部署内容或稳定回退。",
        ],
      ],
      steps: [
        "建立最小镜像、非 root 运行、只读配置和密钥注入边界。",
        "编写 Compose 服务、网络、卷、健康检查和资源限制，并执行配置校验。",
        "先在预发布启动并测试依赖、迁移、重启与数据恢复。",
        "生产更新前备份，拉取固定镜像，逐步启动并保留上一版本回滚信息。",
      ],
      commands: [
        {
          label: "Compose 校验与运行检查",
          language: "bash",
          code: "docker compose config --quiet\ndocker compose pull\ndocker compose up -d\ndocker compose ps\ndocker compose logs --tail=200",
        },
      ],
      verification: [
        "确认所有健康检查、端口、日志和外部请求正常，且重启后数据仍在。",
        "使用备份恢复一份隔离数据，并验证旧镜像与旧配置可以回退。",
      ],
      pitfalls: [
        "depends_on 不能替代应用健康检查和重试。",
        "把密钥写入镜像、仓库或 compose.yaml 会扩大泄漏范围。",
      ],
    },
    en: {
      title: "Deploying Web Apps with Docker Compose",
      slug: "deploy-web-apps-with-docker-compose",
      summary:
        "Declare services, networks, volumes, and configuration with Docker Compose while retaining image provenance, secret boundaries, health checks, logging, backup, update, and tested rollback.",
      keywords: [
        "Docker Compose",
        "container deployment",
        "compose.yaml",
        "application release",
        "container network",
        "persistent volume",
      ],
      aliases: ["docker compose", "Compose Specification"],
      retrievalTerms: [
        "deploy website with Docker Compose",
        "write compose.yaml",
        "container application release",
        "back up Docker volumes",
        "Compose update rollback",
        "container health check",
      ],
      audience:
        "Operators deploying multi-container websites, APIs, and supporting services on one host or a small environment who can maintain images and persistent data.",
      avoid:
        "Workloads requiring multi-node scheduling, complex autoscaling, or strict multi-tenant isolation should evaluate an appropriate orchestrator instead of stretching single-host Compose.",
      takeaway:
        "Compose manages multi-container declarations and lifecycle, not image supply chain, secrets, backup, monitoring, or recovery. A production release includes verification and a tested rollback.",
      concepts: [
        [
          "Declarative model",
          "compose.yaml describes services, networks, volumes, and dependencies, but start order does not mean application readiness.",
        ],
        [
          "Persistence",
          "Containers are replaceable. Databases and uploads need explicit volumes or external services plus backup coverage.",
        ],
        [
          "Version and rollback",
          "Use traceable tags or digests because latest does not identify deployed content or a stable rollback target.",
        ],
      ],
      steps: [
        "Define minimal images, non-root execution, read-only configuration, and secret injection boundaries.",
        "Declare services, networks, volumes, health checks, and resource limits and validate the configuration.",
        "In staging, test dependencies, migrations, restart, and data recovery.",
        "Before production update, back up data, pull fixed images, start incrementally, and preserve prior image and configuration identifiers.",
      ],
      commands: [
        {
          label: "Compose validation and runtime checks",
          language: "bash",
          code: "docker compose config --quiet\ndocker compose pull\ndocker compose up -d\ndocker compose ps\ndocker compose logs --tail=200",
        },
      ],
      verification: [
        "Confirm health checks, ports, logs, and external requests and verify that data survives a restart.",
        "Restore an isolated data copy and prove that the prior images and configuration can run.",
      ],
      pitfalls: [
        "depends_on is not a substitute for application health checks and retry behavior.",
        "Secrets committed to an image, repository, or compose.yaml expand the compromise scope.",
      ],
    },
  },
  {
    id: "KB-024",
    priority: "P1",
    categorySlug: "system-operations",
    reviewMonths: 3,
    sourceKeys: ["nginxProxy", "certbot"],
    relatedIds: ["KB-019", "KB-023", "KB-028"],
    zh: {
      title: "Nginx 反向代理与 HTTPS 配置指南",
      slug: "nginx-reverse-proxy-https-guide",
      summary:
        "从 DNS、上游监听、代理首部、超时到 TLS 证书配置 Nginx 反向代理，强调先用 nginx -t 校验、保留回滚配置、验证续期和端到端请求。",
      keywords: [
        "Nginx",
        "反向代理",
        "HTTPS",
        "TLS 证书",
        "proxy_pass",
        "Certbot",
      ],
      aliases: ["Reverse Proxy", "Transport Layer Security"],
      retrievalTerms: [
        "Nginx 反向代理配置",
        "网站开启 HTTPS",
        "proxy_pass 怎么写",
        "Nginx 证书续期",
        "502 上游错误",
        "TLS 配置检查",
      ],
      audience:
        "需要把公网域名和 TLS 终止交给 Nginx，再转发到本机或受控内网上游应用的管理员。",
      avoid:
        "不要在未知来源复制完整 TLS 配置或直接覆盖生产文件；不同 Nginx 版本、模块和应用首部需求必须验证。",
      takeaway:
        "可靠反向代理需要 DNS、监听、上游、首部、超时和证书全链路一致；语法校验、外部请求和自动续期演练缺一不可。",
      concepts: [
        [
          "上游边界",
          "应用应监听预期地址和端口，公网暴露范围由防火墙和代理设计决定。",
        ],
        [
          "代理首部",
          "Host、X-Forwarded-For 和协议首部影响应用生成 URL、日志和安全判断。",
        ],
        [
          "证书生命周期",
          "签发成功不等于长期有效，续期任务、挑战路径和 reload 都要验证。",
        ],
      ],
      steps: [
        "确认 DNS 已指向服务器，应用可从 Nginx 主机稳定访问。",
        "建立独立 server 块、proxy_pass、必要首部和合理超时。",
        "用 nginx -t 校验后 reload，再申请或安装证书。",
        "从外部验证 HTTP 跳转、TLS 链、主机名、上游响应和续期演练。",
      ],
      commands: [
        {
          label: "配置与证书检查",
          language: "bash",
          code: "sudo nginx -t\nsudo systemctl reload nginx\ncurl -I https://example.com\nsudo certbot renew --dry-run",
        },
      ],
      verification: [
        "使用外部客户端检查证书主机名、完整链、状态码和关键首部。",
        "查看 Nginx access/error 与上游日志，确认真实客户端地址和协议传递。",
      ],
      pitfalls: [
        "proxy_pass 尾部斜杠会影响 URI 拼接，修改前应针对路径用例测试。",
        "只开放 443 而证书续期仍依赖 HTTP 挑战时，续期可能静默失败。",
      ],
    },
    en: {
      title: "Nginx Reverse Proxy and HTTPS Setup Guide",
      slug: "nginx-reverse-proxy-and-https-setup",
      summary:
        "Configure an Nginx reverse proxy from DNS and upstream listeners through forwarded headers, timeouts, and TLS, with syntax validation, rollback, external requests, and renewal exercises.",
      keywords: [
        "Nginx",
        "reverse proxy",
        "HTTPS",
        "TLS certificate",
        "proxy_pass",
        "Certbot",
      ],
      aliases: ["Reverse Proxy", "Transport Layer Security"],
      retrievalTerms: [
        "configure Nginx reverse proxy",
        "enable HTTPS website",
        "how to use proxy_pass",
        "Nginx certificate renewal",
        "502 upstream error",
        "validate TLS configuration",
      ],
      audience:
        "Administrators terminating public DNS and TLS at Nginx before forwarding to a local or controlled private upstream application.",
      avoid:
        "Do not paste an unknown full TLS configuration or overwrite production files. Nginx version, modules, and application header requirements must be validated.",
      takeaway:
        "A reliable proxy aligns DNS, listeners, upstreams, headers, timeouts, and certificate lifecycle. Syntax checks, external requests, and renewal exercises are all release requirements.",
      concepts: [
        [
          "Upstream boundary",
          "The application listens on an intended address and port, while firewall and proxy design determine public exposure.",
        ],
        [
          "Forwarded headers",
          "Host, X-Forwarded-For, and protocol headers affect generated URLs, logs, and application security decisions.",
        ],
        [
          "Certificate lifecycle",
          "Successful issuance does not guarantee continuity. Renewal jobs, challenge paths, and reload behavior require testing.",
        ],
      ],
      steps: [
        "Confirm DNS points to the server and the application is reliably reachable from the Nginx host.",
        "Create a dedicated server block with proxy_pass, required headers, and bounded timeouts.",
        "Run nginx -t and reload before requesting or installing a certificate.",
        "Externally verify redirects, TLS chain, hostname, upstream response, and a renewal dry run.",
      ],
      commands: [
        {
          label: "Configuration and certificate checks",
          language: "bash",
          code: "sudo nginx -t\nsudo systemctl reload nginx\ncurl -I https://example.com\nsudo certbot renew --dry-run",
        },
      ],
      verification: [
        "From an external client, inspect certificate hostname, full chain, status code, and critical headers.",
        "Correlate Nginx access and error logs with upstream logs and confirm client address and protocol forwarding.",
      ],
      pitfalls: [
        "A trailing slash on proxy_pass changes URI mapping and needs path-specific tests.",
        "Certificate renewal can fail if it still uses an HTTP challenge while port 80 or its challenge path is unavailable.",
      ],
    },
  },
  {
    id: "KB-025",
    priority: "P1",
    categorySlug: "system-operations",
    reviewMonths: 6,
    sourceKeys: ["nistContingency", "postgresBackup"],
    relatedIds: ["KB-023", "KB-029", "KB-026"],
    zh: {
      title: "服务器备份与恢复怎么做：数据库、文件和异地备份",
      slug: "server-backup-restore-strategy",
      summary:
        "按恢复点与恢复时间目标设计数据库、上传文件、配置和密钥备份，区分快照、逻辑备份和连续归档，并用隔离恢复演练证明备份可用。",
      keywords: [
        "服务器备份",
        "数据恢复",
        "RPO",
        "RTO",
        "异地备份",
        "数据库备份",
      ],
      aliases: [
        "Recovery Point Objective",
        "Recovery Time Objective",
        "Disaster Recovery",
      ],
      retrievalTerms: [
        "服务器怎么备份",
        "数据库备份策略",
        "RPO 和 RTO",
        "异地备份怎么做",
        "快照是不是备份",
        "恢复演练",
      ],
      audience:
        "负责网站、数据库和上传文件的运维人员，需要把备份从“有文件”提升为可验证恢复能力。",
      avoid:
        "同机磁盘副本或供应商单个快照不能覆盖整机、账户、区域和供应商故障，也不能替代独立备份。",
      takeaway:
        "备份策略从业务可接受的数据丢失和恢复时间开始，覆盖所有依赖、至少一个异地故障域，并通过定期隔离恢复证明。",
      concepts: [
        [
          "RPO",
          "恢复点目标定义最多可接受丢失多长时间的数据，决定备份或日志归档频率。",
        ],
        [
          "RTO",
          "恢复时间目标定义服务需要多快恢复，包含获取凭据、重建基础设施和验证应用。",
        ],
        [
          "备份类型",
          "快照、逻辑导出、物理备份和连续归档覆盖的故障与恢复方式不同。",
        ],
      ],
      steps: [
        "清点数据库、上传文件、配置、证书、密钥依赖和重建文档。",
        "为每项设定 RPO/RTO、加密、保留与异地位置。",
        "自动执行并监控备份结果、大小、校验和与过期删除。",
        "在隔离环境定期恢复，验证数据一致性和完整业务流程。",
      ],
      commands: [
        {
          label: "逻辑备份与恢复示例，变量需按环境替换",
          language: "bash",
          code: 'pg_dump --format=custom --file=app.dump "$DATABASE_URL"\ncreatedb app_restore\npg_restore --dbname=app_restore --clean --if-exists app.dump',
        },
      ],
      verification: [
        "恢复后执行行数、关键对象、附件和应用登录等业务校验。",
        "测量完整恢复耗时并记录人工依赖，确认满足 RTO。",
      ],
      pitfalls: [
        "备份任务退出码成功不代表文件完整、密钥可用或应用一致。",
        "未测试的加密备份可能在事故时因密钥丢失而无法恢复。",
      ],
    },
    en: {
      title: "Server Backup and Restore Strategy",
      slug: "server-backup-and-restore-strategy",
      summary:
        "Design database, upload, configuration, and secret backups from recovery point and time objectives, distinguish snapshots from durable backups, and prove recovery with isolated restore exercises.",
      keywords: [
        "server backup",
        "data recovery",
        "RPO",
        "RTO",
        "off-site backup",
        "database backup",
      ],
      aliases: [
        "Recovery Point Objective",
        "Recovery Time Objective",
        "Disaster Recovery",
      ],
      retrievalTerms: [
        "how to back up a server",
        "database backup strategy",
        "RPO vs RTO",
        "off-site backup design",
        "is a snapshot a backup",
        "restore exercise",
      ],
      audience:
        "Operators responsible for websites, databases, and uploads who need to turn backup files into demonstrated recovery capability.",
      avoid:
        "A same-host copy or one provider snapshot does not cover machine, account, region, or provider failure and is not an independent backup.",
      takeaway:
        "Start with acceptable data loss and restoration time, cover every dependency and at least one off-site failure domain, and prove the plan through routine isolated recovery.",
      concepts: [
        [
          "RPO",
          "The recovery point objective defines the maximum acceptable time span of lost data and drives backup or log-archive frequency.",
        ],
        [
          "RTO",
          "The recovery time objective includes retrieving credentials, rebuilding infrastructure, and validating the application.",
        ],
        [
          "Backup type",
          "Snapshots, logical exports, physical backups, and continuous archiving address different failures and recovery methods.",
        ],
      ],
      steps: [
        "Inventory databases, uploads, configuration, certificates, key dependencies, and rebuild documentation.",
        "Assign RPO, RTO, encryption, retention, and an off-site location to each asset.",
        "Automate backups and monitor result, size, checksum, and retention deletion.",
        "Restore in an isolated environment on schedule and validate data consistency plus full business workflows.",
      ],
      commands: [
        {
          label:
            "Example logical backup and restore with environment-specific values",
          language: "bash",
          code: 'pg_dump --format=custom --file=app.dump "$DATABASE_URL"\ncreatedb app_restore\npg_restore --dbname=app_restore --clean --if-exists app.dump',
        },
      ],
      verification: [
        "After restore, check row counts, critical objects, attachments, sign-in, and other business invariants.",
        "Measure complete recovery time and manual dependencies and compare them with RTO.",
      ],
      pitfalls: [
        "A successful backup exit code does not prove file integrity, key availability, or application consistency.",
        "An untested encrypted backup may be unrecoverable after the encryption key is lost.",
      ],
    },
  },
  {
    id: "KB-026",
    priority: "P0",
    categorySlug: "security-use-cases",
    reviewMonths: 3,
    sourceKeys: ["nistServerSecurity", "ubuntuSecurity", "openssh"],
    relatedIds: ["KB-016", "KB-021", "KB-028"],
    zh: {
      title: "Linux 服务器基础加固：防火墙、最小权限和更新策略",
      slug: "linux-server-security-hardening-basics",
      summary:
        "建立可运维的 Linux 基础加固流程：资产与服务清点、最小端口、独立账户、补丁、日志、备份和恢复；强调每项控制都要验证并保留带外回滚。",
      keywords: [
        "Linux 加固",
        "服务器安全",
        "防火墙",
        "最小权限",
        "补丁管理",
        "SSH 安全",
      ],
      aliases: ["System Hardening", "Security Baseline"],
      retrievalTerms: [
        "Linux 服务器加固",
        "VPS 防火墙配置",
        "最小权限怎么做",
        "服务器补丁策略",
        "SSH 安全基线",
        "关闭无用服务",
      ],
      audience:
        "负责自管理 Linux 主机，希望从可验证基线降低暴露面，而不是套用一键脚本的管理员。",
      avoid:
        "安全控制必须与业务、恢复和可用性共同设计；在没有控制台和变更窗口时不要一次性收紧全部远程访问。",
      takeaway:
        "加固是持续的资产、配置、更新、监控和恢复过程；最小服务、最小权限与及时补丁只有在不破坏可恢复访问时才有效。",
      concepts: [
        [
          "攻击面",
          "监听服务、账户、软件包、计划任务和管理接口都属于需要清点和缩减的入口。",
        ],
        [
          "最小权限",
          "用户、进程和密钥只获得完成任务所需权限，并有撤销和审计路径。",
        ],
        [
          "补丁与恢复",
          "更新降低已知漏洞风险，但要结合测试、重启、回滚和备份。",
        ],
      ],
      steps: [
        "清点主机、开放端口、账户、sudo、软件源和关键数据。",
        "关闭无用服务，建立默认拒绝的最小入站规则并保留管理来源。",
        "实施独立 SSH 密钥、补丁窗口、日志和异常告警。",
        "定期复核基线，并演练控制台访问与备份恢复。",
      ],
      commands: [
        {
          label: "只读基线检查示例",
          language: "bash",
          code: "ss -lntup\nsudo ufw status verbose\nsudo sshd -T | head\nsystemctl --failed\nsudo journalctl -p warning --since today",
        },
      ],
      verification: [
        "从允许与不允许的外部网络分别验证端口策略。",
        "每次更新后验证重启、应用健康、日志和恢复入口。",
      ],
      pitfalls: [
        "一键加固脚本可能关闭业务端口、改变仓库或破坏 SSH，且难以审计。",
        "只改 SSH 端口不能替代密钥、最小暴露和补丁。",
      ],
    },
    en: {
      title: "Linux Server Hardening Checklist",
      slug: "linux-server-hardening-checklist",
      summary:
        "Build an operable Linux security baseline from asset inventory, minimal ports, separate identities, patching, logging, backup, and recovery, with validation and out-of-band rollback for each control.",
      keywords: [
        "Linux hardening",
        "server security",
        "firewall",
        "least privilege",
        "patch management",
        "SSH security",
      ],
      aliases: ["system hardening", "security baseline"],
      retrievalTerms: [
        "harden a Linux server",
        "VPS firewall setup",
        "implement least privilege",
        "server patch strategy",
        "SSH security baseline",
        "disable unused services",
      ],
      audience:
        "Administrators of self-managed Linux hosts who want to reduce exposure through a verifiable baseline rather than an opaque one-click script.",
      avoid:
        "Security controls must account for workload, recovery, and availability. Do not tighten every remote-access control at once without console access and a change window.",
      takeaway:
        "Hardening is an ongoing asset, configuration, update, monitoring, and recovery process. Minimal services, least privilege, and timely patches matter only when recoverable access remains intact.",
      concepts: [
        [
          "Attack surface",
          "Listening services, accounts, packages, scheduled jobs, and management interfaces all require inventory and reduction.",
        ],
        [
          "Least privilege",
          "Users, processes, and keys receive only required permissions plus a revocation and audit path.",
        ],
        [
          "Patching and recovery",
          "Updates reduce known-vulnerability exposure but require testing, reboot, rollback, and backup planning.",
        ],
      ],
      steps: [
        "Inventory the host, listeners, accounts, sudo access, repositories, and critical data.",
        "Disable unused services and implement default-deny inbound policy while preserving management sources.",
        "Use individual SSH keys, a patch window, central logs, and anomaly alerts.",
        "Review the baseline and exercise console and backup recovery regularly.",
      ],
      commands: [
        {
          label: "Read-only baseline inspection example",
          language: "bash",
          code: "ss -lntup\nsudo ufw status verbose\nsudo sshd -T | head\nsystemctl --failed\nsudo journalctl -p warning --since today",
        },
      ],
      verification: [
        "Test port policy from explicitly allowed and disallowed external networks.",
        "After each update, verify reboot, application health, logs, and recovery access.",
      ],
      pitfalls: [
        "A one-click hardening script can close business ports, replace repositories, or break SSH without an auditable rollback.",
        "Changing the SSH port does not replace keys, minimal exposure, and patching.",
      ],
    },
  },
  {
    id: "KB-027",
    priority: "P1",
    categorySlug: "security-use-cases",
    reviewMonths: 6,
    sourceKeys: ["cisaDdos", "nistServerSecurity", "googleSreMonitoring"],
    relatedIds: ["KB-010", "KB-026", "KB-029"],
    zh: {
      title: "DDoS 防护是什么？高防、清洗和业务可用性怎么理解",
      slug: "ddos-protection-high-defense-guide",
      summary:
        "解释容量型、协议型和应用层拒绝服务风险，区分上游清洗、边缘代理、限速与源站加固，说明“高防”不是统一规格并给出按威胁和可用性验收的方法。",
      keywords: [
        "DDoS 防护",
        "流量清洗",
        "高防服务器",
        "拒绝服务",
        "速率限制",
        "业务可用性",
      ],
      aliases: [
        "Distributed Denial of Service",
        "DDoS Mitigation",
        "Traffic Scrubbing",
      ],
      retrievalTerms: [
        "DDoS 防护是什么",
        "高防服务器怎么选",
        "流量清洗原理",
        "应用层 DDoS",
        "源站隐藏",
        "DDoS 防护验收",
      ],
      audience:
        "有明确公网业务、历史攻击或可用性目标，需要把防护能力落实到架构、监控和响应流程的团队。",
      avoid:
        "不得自行对公网发起压力或攻击测试；任何演练都需要书面授权、受控流量、供应商协调和停止条件。",
      takeaway:
        "DDoS 防护是容量、识别、过滤、架构和响应的组合；“高防”没有统一技术含义，必须按攻击类型、清洗位置、正常流量影响和切换流程验收。",
      concepts: [
        [
          "攻击类型",
          "容量耗尽、协议状态耗尽和应用资源耗尽需要不同检测与缓解控制。",
        ],
        [
          "缓解位置",
          "当攻击超过源站上游容量时，主机内防火墙无法恢复已被占满的链路。",
        ],
        [
          "业务降级",
          "限速、挑战和过滤会影响正常用户，需要为误报、绕过和紧急降级设定流程。",
        ],
      ],
      steps: [
        "建立正常流量基线、关键端点和最大可接受中断。",
        "确认供应商容量、检测、清洗、切换、日志和支持边界。",
        "分离源站、限制管理面、缓存可缓存内容并保护昂贵接口。",
        "在授权演练或历史事件复盘中验证告警、切换和恢复。",
      ],
      verification: [
        "监控边缘与源站流量、错误、延迟、连接和资源饱和度。",
        "检查攻击期间正常用户成功率及防护解除后的完整恢复。",
      ],
      pitfalls: [
        "宣传的防护峰值若没有协议、持续时间和清洗条件，无法直接比较。",
        "只隐藏源站 DNS 不足以保护曾暴露、邮件或其他直连地址。",
      ],
    },
    en: {
      title: "DDoS Protection, Mitigation, and Traffic Scrubbing",
      slug: "ddos-protection-mitigation-and-scrubbing",
      summary:
        "Separate volumetric, protocol, and application denial-of-service risks and evaluate upstream scrubbing, edge proxying, rate limits, origin controls, observability, and recovery instead of a vague protection label.",
      keywords: [
        "DDoS protection",
        "traffic scrubbing",
        "DDoS-protected hosting",
        "denial of service",
        "rate limiting",
        "service availability",
      ],
      aliases: [
        "Distributed Denial of Service",
        "DDoS mitigation",
        "traffic scrubbing",
      ],
      retrievalTerms: [
        "what is DDoS protection",
        "choose DDoS-protected hosting",
        "traffic scrubbing",
        "application-layer DDoS",
        "protect an origin server",
        "test DDoS mitigation",
      ],
      audience:
        "Teams with a public service, attack history, or availability objective that can map protection claims to architecture, monitoring, and incident response.",
      avoid:
        "Never launch an unapproved Internet stress or attack test. Any exercise needs written authorization, controlled traffic, provider coordination, and stop conditions.",
      takeaway:
        "DDoS protection combines capacity, detection, filtering, architecture, and response. Protection labels are not a standard tier and require acceptance criteria for attack type, mitigation location, legitimate-user impact, and switching.",
      concepts: [
        [
          "Attack class",
          "Volumetric exhaustion, protocol-state exhaustion, and application resource exhaustion require different controls.",
        ],
        [
          "Mitigation location",
          "When an attack fills the upstream circuit, a host firewall cannot recover capacity that is already exhausted.",
        ],
        [
          "Business degradation",
          "Rate limits, challenges, and filters affect legitimate users and need false-positive, bypass, and emergency-degradation procedures.",
        ],
      ],
      steps: [
        "Establish normal traffic, critical endpoints, and maximum acceptable interruption.",
        "Confirm provider capacity, detection, scrubbing, activation, logging, and support boundaries.",
        "Separate the origin, restrict management, cache safe content, and protect expensive endpoints.",
        "Validate alerting, activation, and recovery through an authorized exercise or incident review.",
      ],
      verification: [
        "Monitor edge and origin traffic, errors, latency, connections, and saturation.",
        "Measure legitimate-user success during mitigation and complete restoration after it ends.",
      ],
      pitfalls: [
        "A peak protection number without protocol, duration, and scrubbing conditions is not comparable evidence.",
        "Removing an origin from DNS does not protect previously exposed, mail, or other direct addresses.",
      ],
    },
  },
  {
    id: "KB-028",
    priority: "P0",
    categorySlug: "security-use-cases",
    reviewMonths: 3,
    sourceKeys: ["nginxProxy", "linuxNetworking", "googleSreMonitoring"],
    relatedIds: ["KB-012", "KB-019", "KB-023"],
    zh: {
      title: "502、504、连接被拒绝：网站不可访问排障流程",
      slug: "website-502-504-connection-refused-troubleshooting",
      summary:
        "按客户端、DNS、边缘代理、Nginx、上游应用和依赖分层排查 502、504 与 connection refused，提供先保留现场、再检查监听、日志、超时和资源的顺序。",
      keywords: [
        "502 Bad Gateway",
        "504 Gateway Timeout",
        "Connection Refused",
        "Nginx 排障",
        "网站故障",
        "上游服务",
      ],
      aliases: ["Bad Gateway", "Gateway Timeout", "连接被拒绝"],
      retrievalTerms: [
        "Nginx 502 怎么排查",
        "网站 504 原因",
        "connection refused 是什么",
        "上游服务不可用",
        "网站打不开排障",
        "反向代理错误",
      ],
      audience:
        "有服务器和反向代理日志访问权，需要在不扩大故障的情况下定位网站不可用边界的运维人员。",
      avoid:
        "不要先重启所有服务或删除日志；这会丢失时间线并可能把依赖故障扩散为全面中断。",
      takeaway:
        "refused 表示连接在某端被主动拒绝或无监听，502 表示网关收到无效上游响应，504 表示上游未在时间内完成；先定位哪一跳失败。",
      concepts: [
        [
          "连接拒绝",
          "目标主机可达但端口无监听、被主动拒绝或地址族不匹配时常出现。",
        ],
        [
          "502",
          "代理无法建立上游连接、协议响应无效或上游提前关闭时可返回 Bad Gateway。",
        ],
        [
          "504",
          "代理已等待上游但在配置的时间内未获得所需响应，根因可能是慢查询、拥塞或依赖阻塞。",
        ],
      ],
      steps: [
        "记录开始时间、受影响域名、请求 ID、客户端错误和最近变更。",
        "依次验证 DNS、代理本地上游连接、监听进程和防火墙。",
        "关联 Nginx、应用、数据库和系统日志，检查超时、饱和与重启。",
        "先恢复最小可用路径，再针对根因修复并复盘。",
      ],
      commands: [
        {
          label: "只读故障定位命令",
          language: "bash",
          code: 'curl -vk https://example.com/health\nss -lntup\nsudo nginx -t\nsudo journalctl -u nginx --since "15 minutes ago"\nsystemctl --failed',
        },
      ],
      verification: [
        "从代理主机直接请求上游健康端点，再从外部请求公开域名。",
        "恢复后确认错误率、尾延迟、队列和依赖连接回到基线。",
      ],
      pitfalls: [
        "盲目增大超时会延长资源占用并掩盖慢查询或死锁。",
        "健康检查若不覆盖关键依赖，进程存活也可能持续返回失败。",
      ],
    },
    en: {
      title: "Troubleshooting 502, 504, and Connection Refused Errors",
      slug: "troubleshoot-502-504-and-connection-refused",
      summary:
        "Trace 502, 504, and connection-refused failures across client, DNS, edge, Nginx, upstream application, and dependencies while preserving evidence before checking listeners, logs, timeouts, and saturation.",
      keywords: [
        "502 Bad Gateway",
        "504 Gateway Timeout",
        "connection refused",
        "Nginx troubleshooting",
        "website outage",
        "upstream service",
      ],
      aliases: ["Bad Gateway", "Gateway Timeout", "upstream failure"],
      retrievalTerms: [
        "troubleshoot Nginx 502",
        "website 504 cause",
        "what connection refused means",
        "upstream service unavailable",
        "website outage checklist",
        "reverse proxy error",
      ],
      audience:
        "Operators with server and reverse-proxy log access who need to locate an outage boundary without making the incident larger.",
      avoid:
        "Do not restart every service or delete logs first. That removes the timeline and can spread one dependency failure into a broader outage.",
      takeaway:
        "Refused commonly means active rejection or no listener, 502 means a gateway received an invalid upstream outcome, and 504 means the upstream did not complete in time. Locate the failing hop first.",
      concepts: [
        [
          "Connection refused",
          "It commonly appears when the host is reachable but no process listens, a rule rejects actively, or the address family is wrong.",
        ],
        [
          "502",
          "A proxy can return Bad Gateway when it cannot connect, receives an invalid protocol response, or the upstream closes early.",
        ],
        [
          "504",
          "A gateway waited but did not receive the required response before its timeout, possibly due to slow queries, saturation, or blocked dependencies.",
        ],
      ],
      steps: [
        "Record start time, affected domain, request ID, client error, and recent changes.",
        "Validate DNS, proxy-to-upstream connectivity, listeners, and firewall in order.",
        "Correlate Nginx, application, database, and system logs with timeouts, saturation, and restarts.",
        "Restore the smallest healthy path, then fix and review the root cause.",
      ],
      commands: [
        {
          label: "Read-only incident checks",
          language: "bash",
          code: 'curl -vk https://example.com/health\nss -lntup\nsudo nginx -t\nsudo journalctl -u nginx --since "15 minutes ago"\nsystemctl --failed',
        },
      ],
      verification: [
        "Request the upstream health endpoint directly from the proxy host and then the public domain externally.",
        "After recovery, confirm error rate, tail latency, queues, and dependency connections return to baseline.",
      ],
      pitfalls: [
        "Blindly raising timeouts increases resource retention and hides slow queries or deadlocks.",
        "A process-only health check can stay green while critical dependencies fail.",
      ],
    },
  },
  {
    id: "KB-029",
    priority: "P1",
    categorySlug: "security-use-cases",
    reviewMonths: 6,
    sourceKeys: ["googleSreMonitoring", "prometheus", "nistServerSecurity"],
    relatedIds: ["KB-012", "KB-025", "KB-028"],
    zh: {
      title: "服务器监控与告警怎么做：CPU、内存、磁盘、证书和可用性",
      slug: "server-monitoring-alerting-guide",
      summary:
        "围绕延迟、流量、错误和饱和度建立服务器与应用监控，覆盖 CPU、内存、磁盘、证书和外部可用性，并把告警设计为有负责人、有动作和可抑制的事件。",
      keywords: ["服务器监控", "告警", "CPU", "内存", "磁盘", "可用性"],
      aliases: ["Observability", "Alerting", "Golden Signals"],
      retrievalTerms: [
        "服务器监控哪些指标",
        "CPU 告警阈值",
        "磁盘空间告警",
        "证书到期监控",
        "网站可用性监控",
        "Prometheus 告警",
      ],
      audience:
        "需要在用户报障前发现容量、故障和证书风险，并能为每个告警指定处理动作的运维团队。",
      avoid:
        "只收集大量指标却没有服务目标、负责人和响应手册，会制造告警疲劳而不是提高可靠性。",
      takeaway:
        "监控应从用户可见的延迟、错误、流量和饱和度开始，再下钻主机资源；告警只针对需要及时人工动作的症状或风险。",
      concepts: [
        [
          "用户视角",
          "外部可用性检查和真实请求能发现 DNS、TLS、网络和应用全链路故障。",
        ],
        [
          "饱和度",
          "CPU 队列、可用内存、磁盘延迟、容量和连接池比单一利用率更接近瓶颈。",
        ],
        [
          "可操作告警",
          "告警应包含对象、影响、阈值持续时间、负责人、仪表盘和处置步骤。",
        ],
      ],
      steps: [
        "定义关键用户流程、服务目标和允许的错误预算。",
        "采集外部可用性、请求指标、资源饱和度、备份和证书期限。",
        "为告警设置持续时间、分级、去重、维护抑制和负责人。",
        "定期演练告警链并从事故中调整阈值和手册。",
      ],
      commands: [
        {
          label: "主机即时检查示例",
          language: "bash",
          code: "uptime\nfree -h\ndf -h\nss -s\nsystemctl --failed",
        },
      ],
      verification: [
        "制造受控的测试告警，确认通知、升级、恢复和关闭完整到达。",
        "从月度记录检查误报、漏报、无负责人和无处置动作的规则。",
      ],
      pitfalls: [
        "固定 CPU 百分比不能区分短峰值、排队和实际用户影响。",
        "监控系统与业务同一故障域时，事故中可能同时失去告警。",
      ],
    },
    en: {
      title: "Server Monitoring and Alerting Basics",
      slug: "server-monitoring-and-alerting-basics",
      summary:
        "Build monitoring around latency, traffic, errors, and saturation, including CPU, memory, storage, certificates, backups, and external availability, with owned and actionable alerts.",
      keywords: [
        "server monitoring",
        "alerting",
        "CPU",
        "memory",
        "disk",
        "availability",
      ],
      aliases: ["observability", "Golden Signals", "service monitoring"],
      retrievalTerms: [
        "server metrics to monitor",
        "CPU alert threshold",
        "disk space alert",
        "certificate expiry monitoring",
        "website uptime monitoring",
        "Prometheus alert rules",
      ],
      audience:
        "Operations teams that need to detect capacity, failures, and certificate risk before users report them and can assign an action to every alert.",
      avoid:
        "Collecting many metrics without objectives, ownership, and response procedures creates alert fatigue rather than reliability.",
      takeaway:
        "Start with user-visible latency, errors, traffic, and saturation and then inspect host resources. Page people only for symptoms or risks that require timely action.",
      concepts: [
        [
          "User perspective",
          "External availability checks and real requests cover DNS, TLS, network, and application failures end to end.",
        ],
        [
          "Saturation",
          "CPU queues, available memory, storage latency and capacity, and connection pools reveal constraints better than one utilization value.",
        ],
        [
          "Actionable alert",
          "An alert names the object, impact, sustained condition, owner, dashboard, and response procedure.",
        ],
      ],
      steps: [
        "Define critical user journeys, service objectives, and an acceptable error budget.",
        "Collect external availability, request signals, resource saturation, backup status, and certificate lifetime.",
        "Configure duration, severity, deduplication, maintenance suppression, and ownership.",
        "Exercise the alert chain and adjust rules and runbooks from incidents.",
      ],
      commands: [
        {
          label: "Immediate host inspection example",
          language: "bash",
          code: "uptime\nfree -h\ndf -h\nss -s\nsystemctl --failed",
        },
      ],
      verification: [
        "Trigger a controlled test alert and confirm notification, escalation, recovery, and closure.",
        "Review false positives, missed events, unowned rules, and alerts without actions each month.",
      ],
      pitfalls: [
        "A fixed CPU percentage cannot distinguish a short burst, queueing, and actual user impact.",
        "Monitoring in the same failure domain as the service can disappear during the incident it should report.",
      ],
    },
  },
  {
    id: "KB-030",
    priority: "P1",
    categorySlug: "security-use-cases",
    reviewMonths: 12,
    sourceKeys: ["nistCloud", "nistServerSecurity", "googleSreMonitoring"],
    relatedIds: ["KB-001", "KB-002", "KB-011"],
    zh: {
      title: "个人网站、企业官网、跨境电商和 API 服务如何选服务器",
      slug: "server-selection-by-use-case",
      summary:
        "把个人网站、企业官网、跨境电商与 API 服务拆成可用性、交互、数据、合规、峰值和运维需求，再据此选择地区、资源、网络、备份和托管责任。",
      keywords: [
        "服务器选型",
        "个人网站",
        "企业官网",
        "跨境电商",
        "API 服务",
        "业务负载",
      ],
      aliases: ["Workload Placement", "Hosting Selection"],
      retrievalTerms: [
        "个人网站服务器怎么选",
        "企业官网 VPS 配置",
        "跨境电商服务器",
        "API 服务部署",
        "按业务选服务器",
        "网站托管方案",
      ],
      audience:
        "已经明确业务类型，但需要把模糊场景转换为可验证的地区、容量、可靠性和管理要求的决策者。",
      avoid:
        "场景名称不能产生固定套餐答案；支付、个人数据、行业监管和跨境合规必须由合格人员单独评估。",
      takeaway:
        "先定义用户、关键流程、数据、峰值、恢复和团队能力，再选择产品形态；同一业务在不同规模和责任边界下会得到不同答案。",
      concepts: [
        [
          "个人网站",
          "通常重视成本可控、简单备份和维护便利，但仍需要补丁、TLS 和恢复。",
        ],
        [
          "企业与电商",
          "品牌可用性、交易依赖、数据保护、峰值和支持升级路径更关键。",
        ],
        [
          "API 服务",
          "并发、尾延迟、速率限制、依赖和可观测性通常比页面流量数字更能决定架构。",
        ],
      ],
      steps: [
        "列出用户地区、关键流程、数据敏感性、峰值和依赖。",
        "为可用性、RPO/RTO、性能和支持写出可测指标。",
        "选择地区、VPS/云/独服、网络和备份候选，并进行小规模验证。",
        "记录扩容、迁移、故障和退出供应商的触发条件。",
        "将项目规模映射为：个人/展示站优先单实例与可恢复备份；企业站优先可用性与托管边界；电商优先交易依赖、数据库与故障备用；API 优先峰值 RPS、尾延迟和限流。",
      ],
      verification: [
        "用代表性数据和用户路径压测，而不是只跑空页面基准。",
        "演练备份恢复、依赖故障和流量峰值，确认团队能执行手册。",
      ],
      pitfalls: [
        "为未来不确定增长过度配置会增加复杂度，却不自动提高可靠性。",
        "最低配置能启动不代表能承受峰值、维护和故障恢复。",
      ],
    },
    en: {
      title: "How to Choose a Server for Your Workload",
      slug: "choose-a-server-by-workload",
      summary:
        "Translate personal sites, corporate websites, cross-border commerce, and APIs into availability, interaction, data, compliance, peak, and operating requirements before selecting hosting.",
      keywords: [
        "server selection",
        "personal website",
        "corporate website",
        "cross-border commerce",
        "API hosting",
        "workload placement",
      ],
      aliases: ["workload placement", "hosting selection"],
      retrievalTerms: [
        "server for personal website",
        "VPS for corporate website",
        "cross-border commerce hosting",
        "deploy an API service",
        "choose hosting by workload",
        "website hosting architecture",
      ],
      audience:
        "Decision makers with a known workload type who need to convert it into measurable region, capacity, reliability, and management requirements.",
      avoid:
        "A workload label cannot produce one fixed plan. Payments, personal data, industry regulation, and cross-border compliance require qualified independent assessment.",
      takeaway:
        "Define users, critical journeys, data, peaks, recovery, and team capability before choosing a platform. The same workload leads to different answers at different scale and responsibility boundaries.",
      concepts: [
        [
          "Personal site",
          "Cost control, simple backup, and maintainability often dominate, but patching, TLS, and recovery still apply.",
        ],
        [
          "Corporate and commerce",
          "Brand availability, transaction dependencies, data protection, peaks, and support escalation become more important.",
        ],
        [
          "API service",
          "Concurrency, tail latency, rate limits, dependencies, and observability often determine architecture better than page-view counts.",
        ],
      ],
      steps: [
        "List user regions, critical journeys, data sensitivity, demand peaks, and dependencies.",
        "Write measurable availability, RPO, RTO, performance, and support objectives.",
        "Select region, VPS or cloud or dedicated platform, network, and backup candidates and validate at small scale.",
        "Document triggers for scaling, migration, failure response, and provider exit.",
        "Map the scale to a topology: personal or brochure sites favor one instance and recoverable backups; corporate sites favor availability and managed boundaries; commerce favors transaction dependencies, database capacity, and failure spare; APIs favor peak RPS, tail latency, and rate limits.",
      ],
      verification: [
        "Load test representative data and user journeys instead of an empty-page benchmark.",
        "Exercise backup recovery, dependency failure, and traffic peaks and confirm the team can follow the runbook.",
      ],
      pitfalls: [
        "Overprovisioning for undefined future growth adds complexity without automatically adding reliability.",
        "A minimum configuration that starts the service may not survive peaks, maintenance, or recovery.",
      ],
    },
  },
];

function reviewDate(months: KnowledgeUnit["reviewMonths"]) {
  const date = new Date(`${KNOWLEDGE_VERIFIED_DATE}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function localizedDraft(unit: KnowledgeUnit, language: KnowledgeLanguage) {
  return unit[language];
}

function sourceNotes(unit: KnowledgeUnit, language: KnowledgeLanguage) {
  const nextReview = reviewDate(unit.reviewMonths);
  return unit.sourceKeys
    .map((key) => {
      const source = sources[key];
      const claim = language === "zh" ? source.zhClaim : source.enClaim;
      const reviewer =
        language === "zh" ? "Codex 技术编辑" : "Codex technical editor";
      const risk =
        language === "zh"
          ? "标准、软件版本、运营商路径或实施环境可能变化，须按复核日重验"
          : "Standards, software versions, carrier paths, or implementation environments may change; reverify by the review date";
      return `${source.grade}｜${KNOWLEDGE_VERIFIED_DATE}｜${source.url}｜${claim}｜${reviewer}｜${nextReview}｜${risk}`;
    })
    .join("\n");
}

function conciseSentence(value: string, language: KnowledgeLanguage) {
  const normalized = value.replace(/\s+/g, " ").trim();
  const separators = language === "zh" ? /[。！？；]/ : /[.!?;]/;
  const separatorIndex = normalized.search(separators);
  const sentence = (
    separatorIndex >= 0 ? normalized.slice(0, separatorIndex) : normalized
  ).trim();
  return language === "zh"
    ? `${sentence}。`
    : `${sentence.replace(/[,:]$/, "")}.`;
}

const knowledgeCardOverrides: Partial<
  Record<KnowledgeUnit["id"], Record<KnowledgeLanguage, KnowledgeCardCopy>>
> = {
  "KB-017": {
    zh: {
      definition: "区分 IP 注册信息、路由宣告与接入网络属性的常见市场标签。",
      highlights: [
        "**原生 IP**：通常指注册信息与使用地区较一致，仍需按目标服务实测。",
        "**广播 IP**：通过跨区域路由宣告使用，地理库结果可能不一致。",
        "**住宅 IP**：通常来自面向家庭用户的接入网络，仍需按目标服务规则实测风控表现。",
      ],
      quickTip:
        "同时核对 RDAP、ASN、路由和目标服务识别结果，单一数据库不能定论。",
    },
    en: {
      definition:
        "Common market labels that describe IP registration, route announcements, and access-network attributes.",
      highlights: [
        "**Native IP**: Usually means registration and usage regions broadly align, but the target service still needs testing.",
        "**Announced IP**: Used through cross-region route announcements, so geolocation databases may disagree.",
        "**Residential IP**: Usually originates from a consumer access network and does not guarantee low risk scoring.",
      ],
      quickTip:
        "Cross-check RDAP, ASN, routing, and the target service; one geolocation database is not conclusive.",
    },
  },
  "KB-024": {
    zh: {
      definition: "基于 Nginx 实现请求转发与 TLS 加密入口的核心配置。",
      highlights: [
        "**反向代理**：统一接入请求转发、上游选择与请求头处理。",
        "**HTTPS 部署**：配置证书、续期流程与 HTTP 到 HTTPS 重定向。",
        "**变更控制**：先校验配置，再平滑重载并保留可用回滚版本。",
      ],
      quickTip: "修改后先执行 `nginx -t`，确认通过再重载，并保留独立回滚通道。",
    },
    en: {
      definition:
        "Core Nginx configuration for request proxying and a TLS-encrypted ingress.",
      highlights: [
        "**Reverse proxy**: Centralizes request forwarding, upstream selection, and header handling.",
        "**HTTPS deployment**: Covers certificates, renewal, and HTTP-to-HTTPS redirects.",
        "**Change control**: Validate first, reload gracefully, and retain a working rollback version.",
      ],
      quickTip:
        "Run `nginx -t` before reloading and keep an independent rollback path available.",
    },
  },
  "KB-030": {
    zh: {
      definition:
        "根据业务交互类型、可靠性目标与风险边界选择服务器的参考框架。",
      highlights: [
        "**个人 / 展示型**：优先维护成本、基础缓存与可恢复备份。",
        "**企业 / 跨境电商**：重点核验可用性、数据保护、线路与 IP 适配性。",
        "**API / 高并发**：关注尾延迟、单核性能、依赖容量与高可用目标。",
      ],
      quickTip:
        "不包含随时间变化的商业报价，先把负载、RPO、RTO 与团队能力量化。",
    },
    en: {
      definition:
        "A server-selection framework based on workload interaction, reliability goals, and risk boundaries.",
      highlights: [
        "**Personal or brochure site**: Prioritize maintainability, basic caching, and recoverable backups.",
        "**Corporate or cross-border commerce**: Verify availability, data protection, routing, and IP suitability.",
        "**API or high concurrency**: Focus on tail latency, single-core performance, dependency capacity, and availability targets.",
      ],
      quickTip:
        "This excludes time-sensitive offers; quantify workload, RPO, RTO, and team capability first.",
    },
  },
};

function knowledgeCardCopy(
  unit: KnowledgeUnit,
  language: KnowledgeLanguage,
): KnowledgeCardCopy {
  const override = knowledgeCardOverrides[unit.id]?.[language];
  if (override) return override;
  const draft = localizedDraft(unit, language);
  const separator = language === "zh" ? "：" : ": ";
  return {
    definition: conciseSentence(draft.takeaway, language),
    highlights: draft.concepts
      .slice(0, 3)
      .map(
        ([term, explanation]) =>
          `**${term}**${separator}${conciseSentence(explanation, language)}`,
      ),
    quickTip: conciseSentence(
      draft.verification[0] ?? draft.pitfalls[0] ?? draft.takeaway,
      language,
    ),
  };
}

function renderLegacyContent(unit: KnowledgeUnit, language: KnowledgeLanguage) {
  const draft = localizedDraft(unit, language);
  const labels =
    language === "zh"
      ? {
          audience: "适合谁",
          avoid: "不适合谁",
          takeaway: "结论",
          concepts: "核心概念与判断表",
          term: "概念或判断项",
          explanation: "如何理解",
          steps: "操作步骤",
          commands: "参考命令",
          verification: "验证方法",
          pitfalls: "常见错误与风险",
          sources: "核验日期与来源",
          verified: "核验日期",
          review: "下次复核日期",
          related: "相关知识",
        }
      : {
          audience: "Who this is for",
          avoid: "When not to use it",
          takeaway: "Key takeaway",
          concepts: "Key concepts and decision table",
          term: "Concept or decision point",
          explanation: "How to interpret it",
          steps: "Steps",
          commands: "Reference commands",
          verification: "Verification",
          pitfalls: "Pitfalls and limits",
          sources: "Verification date and sources",
          verified: "Verified",
          review: "Next review",
          related: "Related knowledge",
        };
  const related = unit.relatedIds.map((relatedId) => {
    const relatedUnit = knowledgeUnits.find(
      (candidate) => candidate.id === relatedId,
    );
    if (!relatedUnit)
      throw new Error(`${unit.id} references missing ${relatedId}`);
    const relatedDraft = localizedDraft(relatedUnit, language);
    const href = `${language === "en" ? "/en" : ""}/knowledge/${relatedDraft.slug}`;
    return `- [${relatedDraft.title}](${href})`;
  });
  const sourceLines = unit.sourceKeys.map((key) => {
    const source = sources[key];
    const label = language === "zh" ? source.zhLabel : source.enLabel;
    const claim = language === "zh" ? source.zhClaim : source.enClaim;
    return `- [${label}](${source.url}): ${claim}`;
  });

  return [
    `## ${labels.audience}`,
    "",
    draft.audience,
    "",
    `## ${labels.avoid}`,
    "",
    draft.avoid,
    "",
    `## ${labels.takeaway}`,
    "",
    draft.takeaway,
    "",
    `## ${labels.concepts}`,
    "",
    `| ${labels.term} | ${labels.explanation} |`,
    "| --- | --- |",
    ...draft.concepts.map(
      ([term, explanation]) => `| ${term} | ${explanation} |`,
    ),
    "",
    `## ${labels.steps}`,
    "",
    ...draft.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    ...(draft.commands?.length
      ? [
          `## ${labels.commands}`,
          "",
          ...draft.commands.flatMap((command) => [
            `### ${command.label}`,
            "",
            `\`\`\`${command.language}`,
            command.code,
            "```",
            "",
          ]),
        ]
      : []),
    `## ${labels.verification}`,
    "",
    ...draft.verification.map((item) => `- ${item}`),
    "",
    `## ${labels.pitfalls}`,
    "",
    ...draft.pitfalls.map((item) => `- ${item}`),
    "",
    `## ${labels.sources}`,
    "",
    `- ${labels.verified}: ${KNOWLEDGE_VERIFIED_DATE}`,
    `- ${labels.review}: ${reviewDate(unit.reviewMonths)}`,
    ...sourceLines,
    "",
    `## ${labels.related}`,
    "",
    ...related,
  ].join("\n");
}

function renderContent(unit: KnowledgeUnit, language: KnowledgeLanguage) {
  const draft = localizedDraft(unit, language);
  const guidance = getReaderGuidance(unit.id, language);
  const labels =
    language === "zh"
      ? {
          conclusion: "先说结论",
          basis: "判断依据",
          audience: "适合谁",
          avoid: "哪些情况不要直接照做",
          concepts: "关键点怎么理解",
          term: "关键点",
          explanation: "通俗解释",
          steps: "怎么做",
          commands: "参考命令",
          verification: "怎么确认结果",
          pitfalls: "常见误区与风险",
          sources: "核验日期与来源",
          verified: "核验日期",
          review: "下次复核日期",
          related: "接着看",
        }
      : {
          conclusion: "Quick answer",
          basis: "Why",
          audience: "Who this helps",
          avoid: "When not to follow this directly",
          concepts: "Key points in plain language",
          term: "Key point",
          explanation: "Plain-language explanation",
          steps: "What to do",
          commands: "Reference commands",
          verification: "How to verify the result",
          pitfalls: "Common mistakes and limits",
          sources: "Verification date and sources",
          verified: "Verified",
          review: "Next review",
          related: "Read next",
        };
  const related = unit.relatedIds.map((relatedId) => {
    const relatedUnit = knowledgeUnits.find(
      (candidate) => candidate.id === relatedId,
    );
    if (!relatedUnit)
      throw new Error(`${unit.id} references missing ${relatedId}`);
    const relatedDraft = localizedDraft(relatedUnit, language);
    const href = `${language === "en" ? "/en" : ""}/knowledge/${relatedDraft.slug}`;
    return `- [${relatedDraft.title}](${href})`;
  });
  const sourceLines = unit.sourceKeys.map((key) => {
    const source = sources[key];
    const label = language === "zh" ? source.zhLabel : source.enLabel;
    const claim = language === "zh" ? source.zhClaim : source.enClaim;
    return `- [${label}](${source.url}): ${claim}`;
  });
  const profileSeparator = language === "zh" ? "：" : ": ";
  const basisSeparator = language === "zh" ? "：" : ":";

  return [
    `## ${labels.conclusion}`,
    "",
    `> ${guidance.quickAnswer}`,
    "",
    `**${labels.basis}${basisSeparator}** ${draft.takeaway}`,
    "",
    `## ${labels.audience}`,
    "",
    draft.audience,
    "",
    ...guidance.profiles.map(
      ([profile, reason]) => `- **${profile}**${profileSeparator}${reason}`,
    ),
    "",
    `## ${labels.avoid}`,
    "",
    draft.avoid,
    "",
    `## ${labels.concepts}`,
    "",
    `| ${labels.term} | ${labels.explanation} |`,
    "| --- | --- |",
    ...draft.concepts.map(
      ([term, explanation]) => `| ${term} | ${explanation} |`,
    ),
    "",
    `## ${labels.steps}`,
    "",
    ...draft.steps.map((step, index) => `${index + 1}. ${step}`),
    "",
    ...(draft.commands?.length
      ? [
          `## ${labels.commands}`,
          "",
          ...draft.commands.flatMap((command) => [
            `### ${command.label}`,
            "",
            `\`\`\`${command.language}`,
            command.code,
            "```",
            "",
          ]),
        ]
      : []),
    `## ${labels.verification}`,
    "",
    ...draft.verification.map((item) => `- ${item}`),
    "",
    `## ${labels.pitfalls}`,
    "",
    ...draft.pitfalls.map((item) => `- ${item}`),
    "",
    `## ${labels.sources}`,
    "",
    `- ${labels.verified}: ${KNOWLEDGE_VERIFIED_DATE}`,
    `- ${labels.review}: ${reviewDate(unit.reviewMonths)}`,
    ...sourceLines,
    "",
    `## ${labels.related}`,
    "",
    ...related,
  ].join("\n");
}

function renderRecord(
  unit: KnowledgeUnit,
  language: KnowledgeLanguage,
  content: string,
) {
  const draft = localizedDraft(unit, language);
  const summary =
    language === "zh" && draft.summary.length < 80
      ? `${draft.summary}内容以可重复验证和明确风险边界为准，不涉及随时间变化的商业条件。`
      : draft.summary;
  const card = knowledgeCardCopy(unit, language);
  return {
    title: draft.title,
    slug: draft.slug,
    summary,
    definition: card.definition,
    highlights: card.highlights,
    quickTip: card.quickTip,
    contentRole: knowledgeContentRole(unit),
    content,
    keywords: draft.keywords.join(", "),
    aliases: draft.aliases.join(", ") || null,
    retrievalTerms: draft.retrievalTerms.join(", "),
    sourceNotes: sourceNotes(unit, language),
  };
}

export function renderKnowledgeRecord(
  unit: KnowledgeUnit,
  language: KnowledgeLanguage,
) {
  return renderRecord(unit, language, renderContent(unit, language));
}

export function renderLegacyKnowledgeRecord(
  unit: KnowledgeUnit,
  language: KnowledgeLanguage,
) {
  return renderRecord(unit, language, renderLegacyContent(unit, language));
}

export function knowledgeUnitsForPhase(phase: "pilots" | "p0" | "p1") {
  const pilotIds = new Set(["KB-001", "KB-006", "KB-012", "KB-021"]);
  if (phase === "pilots") {
    return knowledgeUnits.filter((unit) => pilotIds.has(unit.id));
  }
  if (phase === "p0") {
    return knowledgeUnits.filter(
      (unit) => unit.priority === "P0" && !pilotIds.has(unit.id),
    );
  }
  return knowledgeUnits.filter((unit) => unit.priority === "P1");
}
