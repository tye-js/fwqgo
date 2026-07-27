export type KnowledgeReaderGuidance = {
  quickAnswer: string;
  profiles: Array<readonly [profile: string, reason: string]>;
};

type BilingualReaderGuidance = {
  zh: KnowledgeReaderGuidance;
  en: KnowledgeReaderGuidance;
};

export const readerGuidance: Record<string, BilingualReaderGuidance> = {
  "KB-001": {
    zh: {
      quickAnswer:
        "多数个人网站和刚起步的应用先用 VPS 就够了；需要快速扩缩容和平台能力时再看云服务器，长期高负载或必须控制整机时才考虑独立服务器。",
      profiles: [
        ["第一次买服务器的新手", "先弄清三类产品的责任边界，避免只看 CPU 和内存就下单。"],
        ["正在增长的小团队", "需要判断下一步是升级现有 VPS、迁移云平台，还是拆分数据库等组件。"],
        ["有稳定高负载的业务", "可以据此判断独占硬件带来的控制权，是否值得更高的迁移和运维成本。"],
      ],
    },
    en: {
      quickAnswer:
        "A VPS is enough for many personal sites and early applications. Consider cloud services when rapid scaling and platform features matter, and dedicated servers when sustained workloads or whole-machine control justify them.",
      profiles: [
        ["First-time hosting buyers", "Understand the responsibility boundaries before choosing from CPU and RAM numbers alone."],
        ["Small teams planning growth", "Decide whether to resize a VPS, move to a cloud platform, or separate components such as the database."],
        ["Teams with sustained heavy workloads", "Judge whether hardware control is worth the added migration and operating cost."],
      ],
    },
  },
  "KB-002": {
    zh: {
      quickAnswer:
        "先用真实业务测出 CPU、内存和磁盘中谁先到瓶颈，再只扩这一项；没有访问量、数据量和任务类型，就不存在可靠的固定配置答案。",
      profiles: [
        ["准备上线网站的站长", "把页面请求、缓存和后台任务换成可观察的资源需求。"],
        ["部署 API 或队列的开发者", "区分并发计算、常驻内存和突发任务对配置的不同影响。"],
        ["维护数据库的运维人员", "重点核对工作集、磁盘延迟和 IOPS，而不是只增加 CPU。"],
      ],
    },
    en: {
      quickAnswer:
        "Measure which of CPU, memory, or storage becomes the first bottleneck, then scale that resource. Without traffic, data size, and task behavior, there is no dependable fixed-size answer.",
      profiles: [
        ["Website owners preparing a launch", "Turn page requests, caches, and background jobs into observable resource needs."],
        ["API and queue developers", "Separate concurrent computation, resident memory, and burst work when sizing a host."],
        ["Database operators", "Focus on working set, storage latency, and IOPS instead of adding CPU by default."],
      ],
    },
  },
  "KB-003": {
    zh: {
      quickAnswer:
        "端口速度是理论上限，实际速度看线路和对端，月流量看累计传输了多少数据；选套餐时这三个数字必须一起看。",
      profiles: [
        ["内容网站和 API 运营者", "估算高峰并发时需要的实际吞吐，而不是只看月平均。"],
        ["下载、视频或文件分发业务", "同时核对端口上限、持续传输能力和月流量额度。"],
        ["执行异地备份的团队", "根据备份窗口和数据量判断能否在规定时间内传完。"],
      ],
    },
    en: {
      quickAnswer:
        "Port speed is a ceiling, real throughput depends on the path and remote endpoint, and data transfer is the accumulated volume. A hosting plan must be checked against all three.",
      profiles: [
        ["Content-site and API operators", "Estimate throughput during busy periods rather than relying on a monthly average."],
        ["Download, video, and file delivery services", "Check port limits, sustained transfer performance, and monthly allowance together."],
        ["Teams running off-site backups", "Use the backup window and data volume to confirm transfers can finish on time."],
      ],
    },
  },
  "KB-004": {
    zh: {
      quickAnswer:
        "普通网站通常不必纠结虚拟化名称；需要自定义内核、特殊文件系统或更明确隔离时优先核对 KVM，轻量且能接受共享内核时再看容器型方案。",
      profiles: [
        ["普通 VPS 买家", "知道哪些差异会影响使用，哪些只是商家标签。"],
        ["依赖内核功能的开发者", "提前确认模块、文件系统和系统版本是否能在该虚拟化方式下运行。"],
        ["重视隔离边界的团队", "把虚拟化类型与供应商资源策略、超售和宿主安全一起评估。"],
      ],
    },
    en: {
      quickAnswer:
        "Most ordinary websites do not need to optimize for a virtualization label. Check KVM first for custom kernels, special file systems, or clearer isolation; consider containers when a shared kernel is acceptable.",
      profiles: [
        ["General VPS buyers", "Learn which differences affect real use and which are only product labels."],
        ["Developers depending on kernel features", "Confirm modules, file systems, and operating-system requirements before purchase."],
        ["Teams concerned with isolation", "Evaluate virtualization together with resource policy, oversubscription, and host security."],
      ],
    },
  },
  "KB-005": {
    zh: {
      quickAnswer:
        "数据库和大量小文件先看延迟与随机 I/O，备份归档先看容量和顺序速度；NVMe 名称本身不能证明云盘一定快或一定可靠。",
      profiles: [
        ["数据库维护者", "根据查询延迟、写入和缓存情况判断是否真的受磁盘限制。"],
        ["日志与文件服务运营者", "区分大量小文件和大文件顺序传输的负载差异。"],
        ["备份与归档负责人", "在容量、恢复速度、异地副本和成本之间做取舍。"],
      ],
    },
    en: {
      quickAnswer:
        "Databases and small-file workloads care first about latency and random I/O, while backup archives emphasize capacity and sequential speed. An NVMe label alone does not prove a cloud volume is fast or durable.",
      profiles: [
        ["Database operators", "Determine whether query latency and writes are actually storage-bound."],
        ["Log and file-service operators", "Separate small-file workloads from large sequential transfers."],
        ["Backup and archive owners", "Balance capacity, restore speed, off-site copies, and cost."],
      ],
    },
  },
  "KB-006": {
    zh: {
      quickAnswer:
        "主要用户是中国电信时，可以把 CN2 GIA 作为候选，但不能只凭套餐标签下结论；购买前必须从目标地区测去程、回程和晚高峰表现。",
      profiles: [
        ["面向电信用户的网站运营者", "判断更好的跨境线路是否真的改善页面和接口体验。"],
        ["比较海外 VPS 的买家", "识别 GIA、GT、163 标签能说明什么，以及不能保证什么。"],
        ["排查跨境网络的运维人员", "按方向和时段保存路径证据，避免用一次 traceroute 下结论。"],
      ],
    },
    en: {
      quickAnswer:
        "For users on China Telecom, CN2 GIA can be a candidate, but a plan label is not proof. Test outbound and return paths from target regions, including busy periods, before buying.",
      profiles: [
        ["Sites serving China Telecom users", "Judge whether better cross-border routing improves page and API experience."],
        ["Buyers comparing overseas VPS plans", "Understand what GIA, GT, and 163 labels suggest and what they cannot guarantee."],
        ["Operators diagnosing cross-border routes", "Keep directional and time-based evidence instead of relying on one traceroute."],
      ],
    },
  },
  "KB-007": {
    zh: {
      quickAnswer:
        "移动用户多就重点实测 CMI 或 CMIN2，联通用户多就实测 CUII；名称只能帮你缩小候选范围，最终仍以目标省份和晚高峰结果为准。",
      profiles: [
        ["移动或联通用户占比较高的网站", "按真实用户运营商选择测试重点。"],
        ["跨境电商和 SaaS 团队", "比较线路对登录、支付回调和接口请求的实际影响。"],
        ["负责采购线路的人员", "要求商家提供测试地址、方向说明和覆盖范围。"],
      ],
    },
    en: {
      quickAnswer:
        "Test CMI or CMIN2 when China Mobile users dominate, and test CUII for China Unicom audiences. The label narrows candidates; target-region and busy-period measurements decide the result.",
      profiles: [
        ["Sites with many China Mobile or Unicom users", "Choose test priorities from the actual access-network mix."],
        ["Cross-border commerce and SaaS teams", "Measure effects on login, payment callbacks, and API requests."],
        ["Connectivity buyers", "Require test endpoints, route direction, and coverage details from the provider."],
      ],
    },
  },
  "KB-008": {
    zh: {
      quickAnswer:
        "普通用户买所谓 BGP 多线 VPS，主要得到的是多运营商接入的可能性，不需要自己配置 BGP；只有拥有 ASN、地址段和网络团队时，才考虑自行发布路由。",
      profiles: [
        ["比较多线服务器的普通买家", "看懂多线能改善可达性，但不会自动消除延迟和丢包。"],
        ["设计网络冗余的架构师", "评估多个上游、收敛时间和真实故障切换路径。"],
        ["拥有 ASN 与地址资源的团队", "了解自行运行 BGP 前需要的策略、过滤、监控和操作能力。"],
      ],
    },
    en: {
      quickAnswer:
        "For ordinary buyers, a multi-homed BGP VPS mainly offers possible reachability through multiple carriers; you do not run BGP yourself. Announcing routes is for teams with an ASN, address space, and network operations capability.",
      profiles: [
        ["Buyers comparing multi-carrier hosting", "Understand that more paths can help reachability without guaranteeing low latency."],
        ["Architects designing network resilience", "Evaluate upstream diversity, convergence time, and actual failover paths."],
        ["Teams holding an ASN and address space", "Review the policy, filtering, monitoring, and operations needed to announce routes."],
      ],
    },
  },
  "KB-009": {
    zh: {
      quickAnswer:
        "去程要从用户端测到服务器，回程要从服务器测回用户端；先看目的端是否真的丢包，再判断中间节点超时是否有意义。",
      profiles: [
        ["遇到晚高峰卡顿的站长", "比较不同时间和运营商的路径变化。"],
        ["购买线路前的 VPS 用户", "用可重复测试核对商家宣传，而不是只看一张截图。"],
        ["处理跨网故障的运维人员", "把 MTR、应用请求和时间线放在一起定位问题。"],
      ],
    },
    en: {
      quickAnswer:
        "Measure the outbound path from the user to the server and the return path from the server back to a controlled user endpoint. Check destination loss before treating an intermediate timeout as a fault.",
      profiles: [
        ["Site owners seeing busy-hour slowdowns", "Compare path changes across times and access networks."],
        ["VPS buyers checking route claims", "Use repeatable tests instead of trusting a single screenshot."],
        ["Operators handling cross-network incidents", "Correlate MTR output with application requests and the incident timeline."],
      ],
    },
  },
  "KB-010": {
    zh: {
      quickAnswer:
        "普通网站通常使用公网线路即可；只有站点互联对稳定性、带宽和故障处理有明确合同要求时，才值得认真评估 IPLC、IEPL 或其他专线。",
      profiles: [
        ["连接两地办公室或机房的企业", "把固定端点、带宽和可用性写成可验收条件。"],
        ["有稳定跨境传输需求的团队", "比较公网波动与受管理连接的实际业务成本。"],
        ["采购网络服务的负责人", "分清产品名称、交付边界、SLA 和合规责任。"],
      ],
    },
    en: {
      quickAnswer:
        "Ordinary public websites usually use the public Internet. Evaluate IPLC, IEPL, or another managed circuit when site-to-site connectivity has explicit contractual needs for stability, bandwidth, and incident handling.",
      profiles: [
        ["Enterprises linking offices or data centers", "Turn endpoints, bandwidth, and availability into acceptance criteria."],
        ["Teams with sustained cross-border transfers", "Compare public-path variability with the business cost of a managed connection."],
        ["Network procurement owners", "Separate product names from delivery scope, SLA, and compliance responsibility."],
      ],
    },
  },
  "KB-011": {
    zh: {
      quickAnswer:
        "没有对所有国内用户都最好的地区：先按用户运营商和省份筛出两三个候选，再用真实网站请求在晚高峰测试，结果通常比地理距离更可靠。",
      profiles: [
        ["用户主要在中国大陆的网站", "根据真实用户分布而不是个人所在地选择机房。"],
        ["需要兼顾亚洲与全球访问的团队", "用权重比较香港、日本、新加坡和美西。"],
        ["规划主备地区的运维人员", "同时评估访问体验、故障域、恢复和合规边界。"],
      ],
    },
    en: {
      quickAnswer:
        "No region is best for every mainland-China user. Shortlist two or three regions from the actual carrier and province mix, then test real requests during busy periods; that is more reliable than distance alone.",
      profiles: [
        ["Sites mainly serving mainland China", "Choose from real audience distribution rather than the operator's own location."],
        ["Teams balancing Asian and global access", "Weight Hong Kong, Japan, Singapore, and US West against actual users."],
        ["Operators planning primary and backup regions", "Include experience, failure domains, recovery, and compliance boundaries."],
      ],
    },
  },
  "KB-012": {
    zh: {
      quickAnswer:
        "网页打开慢通常更怕延迟，下载速度更容易被丢包拖低，语音和游戏还很怕抖动；不要只看平均 ping，要结合高分位和真实业务错误。",
      profiles: [
        ["网站和 API 运营者", "把网络数字对应到首屏、接口和登录体验。"],
        ["远程桌面、语音或游戏用户", "理解抖动和少量丢包为何会造成明显卡顿。"],
        ["比较机房与线路的买家", "建立相同端点、协议和时段的公平测试方法。"],
      ],
    },
    en: {
      quickAnswer:
        "Web interactions are often sensitive to latency, transfers slow down with loss, and voice or games are also sensitive to jitter. Do not rely on average ping alone; include tail latency and real application errors.",
      profiles: [
        ["Website and API operators", "Connect network measurements to page, API, and login experience."],
        ["Remote desktop, voice, and gaming users", "Understand why jitter and small loss can cause visible disruption."],
        ["Buyers comparing regions and routes", "Build fair tests with the same endpoints, protocols, and time windows."],
      ],
    },
  },
  "KB-013": {
    zh: {
      quickAnswer:
        "选香港 VPS 时先看主要用户来自哪里，再看线路、晚高峰和带宽限制；“香港机房”只能说明位置，不能保证大陆访问一定快。",
      profiles: [
        ["想免备案部署公开网站的用户", "在业务要求允许的前提下比较大陆访问和运维便利性。"],
        ["服务香港与亚太用户的团队", "根据用户权重选择本地或跨境互联更合适的方案。"],
        ["比较香港套餐的买家", "识别带宽、流量、线路方向和测试地址中的关键差异。"],
      ],
    },
    en: {
      quickAnswer:
        "Choose a Hong Kong VPS from the audience location, route behavior during busy periods, and bandwidth policy. A Hong Kong data-center label states location, not guaranteed performance into mainland China.",
      profiles: [
        ["Users deploying public sites without mainland hosting", "Compare mainland access and operating convenience where business rules permit."],
        ["Teams serving Hong Kong and Asia-Pacific", "Weight local and cross-border connectivity from the actual audience."],
        ["Buyers comparing Hong Kong plans", "Identify meaningful differences in bandwidth, transfer, route direction, and test endpoints."],
      ],
    },
  },
  "KB-014": {
    zh: {
      quickAnswer:
        "东北亚用户多时先测日本，东南亚用户多时先测新加坡；中国大陆用户两边都要按运营商实测，不要预设固定赢家。",
      profiles: [
        ["同时服务大陆与海外用户的网站", "按各地区流量占比计算整体体验。"],
        ["面向日本或东南亚的业务", "优先核对当地访问、支持时区和数据要求。"],
        ["规划亚洲主备机房的团队", "把网络测量与故障域、备份和恢复一起考虑。"],
      ],
    },
    en: {
      quickAnswer:
        "Test Japan first for a Northeast Asian audience and Singapore first for a Southeast Asian audience. For mainland China, test both by carrier instead of assuming a permanent winner.",
      profiles: [
        ["Sites serving both mainland and overseas users", "Weight overall experience by traffic from each region."],
        ["Businesses focused on Japan or Southeast Asia", "Prioritize local access, support hours, and data requirements."],
        ["Teams planning Asian primary and backup regions", "Combine network tests with failure domains, backup, and recovery."],
      ],
    },
  },
  "KB-015": {
    zh: {
      quickAnswer:
        "亚太用户多可以先测美西，欧洲和北美东部用户多可以先测美东；真正决定体验的是用户分布、互联路径和应用要往返多少次。",
      profiles: [
        ["面向全球用户的网站", "按地区流量和关键请求权重选择美国机房。"],
        ["跨境电商与 API 团队", "比较登录、结算和接口链路中的多次网络往返。"],
        ["规划美国主备地区的运维人员", "兼顾访问性能、灾备距离和数据复制成本。"],
      ],
    },
    en: {
      quickAnswer:
        "Start with US West when Asia-Pacific users dominate and US East when Europe or eastern North America dominates. User distribution, interconnection, and application round trips determine the real result.",
      profiles: [
        ["Globally distributed websites", "Choose a US region from traffic and critical-request weights."],
        ["Commerce and API teams", "Compare repeated network trips in login, checkout, and API flows."],
        ["Operators planning US primary and backup regions", "Balance access performance, failure distance, and replication cost."],
      ],
    },
  },
  "KB-016": {
    zh: {
      quickAnswer:
        "现阶段多数公网服务仍应保留 IPv4；只有当应用、防火墙、DNS 和监控都验证过 IPv6 后，再启用双栈，不能只加一条 AAAA 记录。",
      profiles: [
        ["准备给网站开启 IPv6 的站长", "按 DNS、监听、防火墙和证书顺序完整验证。"],
        ["IPv4 地址受限的团队", "理解 IPv6 能解决地址问题，但不能替代兼容性测试。"],
        ["维护双栈网络的运维人员", "分别监控两种地址族，避免只有一条路径悄悄失效。"],
      ],
    },
    en: {
      quickAnswer:
        "Most public services still need IPv4. Enable dual stack only after the application, firewall, DNS, and monitoring all work over IPv6; adding an AAAA record alone is not enough.",
      profiles: [
        ["Site owners enabling IPv6", "Validate DNS, listeners, firewall rules, and certificates as one path."],
        ["Teams constrained by IPv4 availability", "Use IPv6 for addressing without skipping compatibility tests."],
        ["Operators maintaining dual stack", "Monitor both address families so one path cannot fail silently."],
      ],
    },
  },
  "KB-017": {
    zh: {
      quickAnswer:
        "原生、广播和住宅 IP 没有统一行业定义，也不能保证某个平台一定识别或放行；购买前要分别查注册信息、ASN、实际路由和目标平台规则。",
      profiles: [
        ["比较主机商 IP 标签的买家", "知道每个标签可能混合了注册、路由和接入属性。"],
        ["需要正常访问第三方服务的团队", "先核对服务条款和真实可达性，不依赖商家口头承诺。"],
        ["排查 IP 归属的运维人员", "组合 RDAP、ASN 和路由结果保留可复核证据。"],
      ],
    },
    en: {
      quickAnswer:
        "Native, broadcast, and residential IP are not standardized hosting terms and cannot guarantee how a platform classifies or permits an address. Check registration, ASN, actual routing, and the target service's rules separately.",
      profiles: [
        ["Buyers comparing hosting IP labels", "See how each label may mix registration, routing, and access properties."],
        ["Teams needing legitimate third-party access", "Check service terms and real reachability instead of relying on a sales promise."],
        ["Operators investigating IP ownership", "Combine RDAP, ASN, and route evidence into a reviewable record."],
      ],
    },
  },
  "KB-018": {
    zh: {
      quickAnswer:
        "ASN 能告诉你某个网络由谁发布路由，RDAP 能看注册地址和实体信息，但两者都不能单独证明服务器物理位置或最终商家。",
      profiles: [
        ["核对供应商网络的买家", "确认 IP 注册、起源 ASN 和宣传信息是否基本一致。"],
        ["排查路由问题的运维人员", "从 ASN 变化判断上游或路由策略是否改变。"],
        ["做安全调查的人员", "把网络归属作为线索，而不是把它误当成用户身份。"],
      ],
    },
    en: {
      quickAnswer:
        "An ASN identifies the network announcing a route, while RDAP provides registration and entity data. Neither alone proves the server's physical location or final reseller.",
      profiles: [
        ["Buyers checking a provider network", "Compare registration, origin ASN, and marketing claims."],
        ["Operators diagnosing routes", "Use ASN changes as evidence of upstream or policy changes."],
        ["Security investigators", "Treat network ownership as a clue, not as proof of user identity."],
      ],
    },
  },
  "KB-019": {
    zh: {
      quickAnswer:
        "网站有 IPv4 就配 A，有 IPv6 就配 AAAA，子域要指向另一个域名时常用 CNAME；改记录前先确认服务和证书已经在目标地址正常工作。",
      profiles: [
        ["第一次绑定域名的站长", "理解域名记录与服务器 IP、端口和证书之间的关系。"],
        ["迁移网站或 API 的开发者", "用合理 TTL 和验证顺序减少切换期间的不可用。"],
        ["维护双栈服务的运维人员", "分别验证 A 与 AAAA 指向的完整访问链路。"],
      ],
    },
    en: {
      quickAnswer:
        "Use A for an IPv4 address, AAAA for IPv6, and commonly CNAME when a subdomain should follow another name. Confirm the service and certificate work at the target before publishing the record.",
      profiles: [
        ["Site owners connecting a first domain", "Understand how DNS relates to server addresses, ports, and certificates."],
        ["Developers migrating a site or API", "Use a controlled TTL and validation order to reduce cutover failures."],
        ["Operators maintaining dual stack", "Validate the complete A and AAAA access paths separately."],
      ],
    },
  },
  "KB-020": {
    zh: {
      quickAnswer:
        "先查域名解析到了哪里，再查服务器是否有路由、端口是否监听、防火墙是否放行，最后查 TLS 和应用；只有这些都排除后，才讨论 IP 是否被限制。",
      profiles: [
        ["网站突然打不开的站长", "按层排查，避免一上来就重装或关闭全部防火墙。"],
        ["端口从外网不通的开发者", "区分应用没监听、主机拦截和上游网络问题。"],
        ["处理复杂网络故障的运维人员", "用多个端点和明确时间线缩小问题边界。"],
      ],
    },
    en: {
      quickAnswer:
        "Check where DNS resolves, whether the server has a route, whether the port is listening and allowed, and then TLS and the application. Consider address blocking only after those layers are excluded.",
      profiles: [
        ["Site owners facing a sudden outage", "Troubleshoot by layer instead of reinstalling or disabling every firewall rule."],
        ["Developers with an unreachable port", "Separate missing listeners, host filtering, and upstream network faults."],
        ["Operators handling complex incidents", "Use multiple endpoints and a clear timeline to narrow the failure boundary."],
      ],
    },
  },
  "KB-021": {
    zh: {
      quickAnswer:
        "新 VPS 先确认控制台能救援，再创建独立管理账户并用第二个终端验证，然后才更新系统、收紧 SSH、防火墙和部署应用。",
      profiles: [
        ["第一次管理 Linux VPS 的用户", "按不会把自己锁在服务器外面的顺序完成初始化。"],
        ["准备上线网站的开发者", "在部署应用前补齐账户、时间、更新和基础监控。"],
        ["接手新主机的运维人员", "建立可审计、可恢复的统一交付清单。"],
      ],
    },
    en: {
      quickAnswer:
        "Confirm console recovery first, create a separate administrative account and verify it from a second terminal, then update the system, tighten SSH and firewall rules, and deploy the application.",
      profiles: [
        ["First-time Linux VPS administrators", "Follow an order that avoids locking yourself out."],
        ["Developers preparing a production site", "Establish accounts, time, updates, and basic monitoring before the app."],
        ["Operators receiving a new host", "Use a consistent, auditable, and recoverable handover checklist."],
      ],
    },
  },
  "KB-022": {
    zh: {
      quickAnswer:
        "先为每位管理员准备独立密钥，在第二个终端确认能登录和 sudo，再校验 SSH 配置，最后才禁用密码登录；原会话要一直保留到验证结束。",
      profiles: [
        ["仍在用密码登录 VPS 的用户", "安全切换到密钥，同时保留可恢复路径。"],
        ["管理多人访问的团队", "让每个人使用可单独撤销的身份，不再共享私钥。"],
        ["准备收紧 SSH 的运维人员", "在变更前校验权限、配置语法和带外入口。"],
      ],
    },
    en: {
      quickAnswer:
        "Give each administrator a separate key, verify login and sudo from a second terminal, validate the SSH configuration, and only then disable passwords. Keep the original session open until every check passes.",
      profiles: [
        ["VPS users still signing in with passwords", "Move to keys without losing the recovery path."],
        ["Teams managing multiple administrators", "Use identities that can be revoked individually instead of a shared private key."],
        ["Operators tightening SSH access", "Validate permissions, syntax, and out-of-band access before enforcement."],
      ],
    },
  },
  "KB-023": {
    zh: {
      quickAnswer:
        "单机上的网站、API 和辅助服务很适合用 Compose 管理，但生产上线还必须单独处理镜像版本、密钥、持久化数据、备份、监控和回滚。",
      profiles: [
        ["在一台 VPS 部署多个容器的开发者", "用一份声明管理服务、网络、卷和启动顺序。"],
        ["把测试环境推向生产的小团队", "补齐健康检查、固定版本和可回滚更新。"],
        ["维护单机应用的运维人员", "明确哪些数据必须持久化并纳入异地备份。"],
      ],
    },
    en: {
      quickAnswer:
        "Compose fits websites, APIs, and supporting services on one host, but production still needs explicit image versions, secrets, persistent data, backups, monitoring, and rollback.",
      profiles: [
        ["Developers running several containers on one VPS", "Describe services, networks, volumes, and startup relationships in one place."],
        ["Small teams moving from test to production", "Add health checks, pinned versions, and reversible updates."],
        ["Operators maintaining a single-host application", "Identify persistent data and include it in off-site backups."],
      ],
    },
  },
  "KB-024": {
    zh: {
      quickAnswer:
        "Nginx 反代能否正常工作，要同时满足域名解析、80/443 监听、上游地址、转发首部和证书都正确；每次改动先做语法校验再重载。",
      profiles: [
        ["给本地应用绑定域名的开发者", "把公网 HTTPS 请求安全地转发到应用端口。"],
        ["同机运行多个网站的用户", "按域名拆分 server 块并避免端口和证书混用。"],
        ["维护生产代理的运维人员", "核对超时、真实客户端地址、续期和回滚。"],
      ],
    },
    en: {
      quickAnswer:
        "A working Nginx reverse proxy requires correct DNS, listeners on 80 and 443, upstream address, forwarded headers, and certificates. Validate syntax before every reload.",
      profiles: [
        ["Developers attaching a domain to a local app", "Forward public HTTPS traffic safely to the application port."],
        ["Users hosting several sites on one machine", "Separate server blocks without mixing ports or certificates."],
        ["Operators maintaining a production proxy", "Review timeouts, client-address forwarding, renewal, and rollback."],
      ],
    },
  },
  "KB-025": {
    zh: {
      quickAnswer:
        "备份是否合格只看一件事：能否在可接受时间内恢复到可接受的数据点；同机副本和单个云快照都不能代替异地、可验证的恢复方案。",
      profiles: [
        ["维护网站和上传文件的站长", "确认数据库、文件、配置和密钥都被覆盖。"],
        ["负责数据库的运维人员", "从可接受丢失量和恢复时间选择转储、归档或快照组合。"],
        ["需要灾难恢复的团队", "通过隔离环境演练证明备份不是只有文件没有恢复能力。"],
      ],
    },
    en: {
      quickAnswer:
        "A backup is useful only if it restores to an acceptable point within an acceptable time. A same-host copy or one cloud snapshot does not replace an off-site, tested recovery plan.",
      profiles: [
        ["Site owners managing uploads", "Cover databases, files, configuration, and required secrets."],
        ["Database operators", "Choose dumps, archives, and snapshots from acceptable data loss and recovery time."],
        ["Teams needing disaster recovery", "Prove recovery in an isolated environment instead of only collecting files."],
      ],
    },
  },
  "KB-026": {
    zh: {
      quickAnswer:
        "服务器加固先从少开服务、独立账户、及时更新和最小防火墙规则做起；每一步都要保留控制台和回滚办法，不能一次运行未知脚本。",
      profiles: [
        ["刚上线自管理 VPS 的用户", "建立够用且不容易把业务关掉的安全基线。"],
        ["维护多个 Linux 主机的团队", "把账户、端口、补丁和日志变成可重复检查。"],
        ["准备处理安全整改的运维人员", "按风险和变更窗口逐项收紧，而不是一次全部修改。"],
      ],
    },
    en: {
      quickAnswer:
        "Start hardening by running fewer services, using separate accounts, applying updates, and enforcing minimal firewall rules. Keep console access and rollback for every step instead of running an unknown one-shot script.",
      profiles: [
        ["Users launching a self-managed VPS", "Build a practical baseline without accidentally blocking the service."],
        ["Teams maintaining several Linux hosts", "Make accounts, ports, patches, and logs repeatable to inspect."],
        ["Operators carrying out security remediation", "Tighten controls by risk and change window rather than all at once."],
      ],
    },
  },
  "KB-027": {
    zh: {
      quickAnswer:
        "“高防”不是统一规格，购买前要问清能防什么、在哪里清洗、超过阈值会怎样、切换要多久，以及正常用户是否会受影响。",
      profiles: [
        ["曾遭遇攻击的公网业务", "把历史攻击类型和规模转换为可验收的防护条件。"],
        ["游戏、接口和交易系统团队", "同时评估容量、误杀、延迟和故障切换。"],
        ["采购高防服务的负责人", "要求供应商给出清洗位置、处置流程和升级渠道。"],
      ],
    },
    en: {
      quickAnswer:
        "High-defense hosting is not a standard specification. Ask what attacks are covered, where scrubbing occurs, what happens above a threshold, how switching works, and how legitimate users are affected.",
      profiles: [
        ["Public services with prior attacks", "Turn attack type and scale into acceptance criteria."],
        ["Gaming, API, and transaction teams", "Evaluate capacity, false positives, latency, and failover together."],
        ["DDoS-service buyers", "Require the scrubbing location, response process, and escalation path."],
      ],
    },
  },
  "KB-028": {
    zh: {
      quickAnswer:
        "连接被拒绝先查端口有没有监听，502 先查代理能否拿到有效上游响应，504 先查上游为什么超时；不要一上来重启所有服务。",
      profiles: [
        ["网站突然出现 502 或 504 的站长", "根据错误类型先找到失败发生在哪一跳。"],
        ["维护 Nginx 与应用的开发者", "对照代理、应用和依赖日志还原请求链路。"],
        ["处理生产事故的运维人员", "保留日志和时间线，避免重启掩盖真正原因。"],
      ],
    },
    en: {
      quickAnswer:
        "For connection refused, check whether a port is listening. For 502, check whether the proxy receives a valid upstream response. For 504, find why the upstream timed out. Do not restart everything first.",
      profiles: [
        ["Site owners seeing 502 or 504", "Use the error type to locate the failing hop."],
        ["Developers maintaining Nginx and an app", "Correlate proxy, application, and dependency logs across one request."],
        ["Operators handling production incidents", "Preserve logs and the timeline instead of hiding evidence with broad restarts."],
      ],
    },
  },
  "KB-029": {
    zh: {
      quickAnswer:
        "先监控用户能看到的可用性、延迟和错误，再监控 CPU、内存、磁盘和证书；只有需要人立即处理的情况才发告警。",
      profiles: [
        ["只有一两台服务器的小团队", "从少量高价值检查开始，避免一开始堆满无用指标。"],
        ["经常被用户先发现故障的网站", "建立外部探测和明确的通知负责人。"],
        ["维护多服务的运维团队", "用服务目标、告警动作和运行手册控制告警疲劳。"],
      ],
    },
    en: {
      quickAnswer:
        "Monitor user-visible availability, latency, and errors first, then CPU, memory, disks, and certificates. Alert only when a person needs to act promptly.",
      profiles: [
        ["Small teams with one or two servers", "Start with a few high-value checks instead of collecting every metric."],
        ["Sites where users report incidents first", "Add external probes and a clear notification owner."],
        ["Operations teams with many services", "Use service objectives, actions, and runbooks to control alert fatigue."],
      ],
    },
  },
  "KB-030": {
    zh: {
      quickAnswer:
        "个人网站优先简单和可恢复，企业官网优先稳定与支持，跨境电商还要考虑用户地区和交易依赖，API 则更看并发、尾延迟和可观测性。",
      profiles: [
        ["准备个人网站或博客的新手", "选择维护负担小、备份简单且能平滑升级的起步方案。"],
        ["负责企业官网或跨境电商的团队", "把品牌可用性、数据、支付依赖和流量峰值纳入选型。"],
        ["部署 API 或 SaaS 的开发者", "按并发、依赖、尾延迟、限流和监控设计容量。"],
      ],
    },
    en: {
      quickAnswer:
        "Personal sites prioritize simplicity and recovery, corporate sites prioritize availability and support, cross-border commerce adds audience location and transaction dependencies, and APIs emphasize concurrency, tail latency, and observability.",
      profiles: [
        ["Beginners launching a personal site or blog", "Start with low maintenance, simple backup, and a clear upgrade path."],
        ["Corporate-site and cross-border commerce teams", "Include brand availability, data, payment dependencies, and demand peaks."],
        ["API and SaaS developers", "Size for concurrency, dependencies, tail latency, rate limits, and monitoring."],
      ],
    },
  },
};

export function getReaderGuidance(
  id: string,
  language: "zh" | "en",
): KnowledgeReaderGuidance {
  const guidance = readerGuidance[id]?.[language];
  if (!guidance) throw new Error(`${id} is missing ${language} reader guidance`);
  return guidance;
}
