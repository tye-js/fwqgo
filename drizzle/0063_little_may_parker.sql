ALTER TABLE "knowledge_articles" ADD COLUMN "contentRole" varchar(32) DEFAULT 'decision_core' NOT NULL;--> statement-breakpoint
UPDATE "knowledge_articles" SET "contentRole" = 'post_purchase_guide'
WHERE "slug" IN (
  'new-vps-linux-initial-setup-checklist',
  'ssh-key-authentication-secure-setup',
  'docker-compose-deploy-web-app-guide',
  'nginx-reverse-proxy-https-guide',
  'server-backup-restore-strategy',
  'linux-server-security-hardening-basics',
  'website-502-504-connection-refused-troubleshooting',
  'server-monitoring-alerting-guide'
);--> statement-breakpoint
UPDATE "knowledge_categories" SET
  "name" = '购买决策与配置',
  "description" = '先判断业务规模、资源边界和套餐字段，再决定是否适合购买。',
  "enName" = 'Buying Decisions & Sizing',
  "enDescription" = 'Decide fit from workload scale, resource boundaries, and structured plan fields.'
WHERE "slug" = 'server-configuration';--> statement-breakpoint
UPDATE "knowledge_categories" SET
  "name" = '三网与网络线路',
  "description" = '按电信、联通、移动和三网混合用户理解线路优势与测试边界。',
  "enName" = 'Carriers & Network Routes',
  "enDescription" = 'Interpret Telecom, Unicom, Mobile, and mixed-carrier route trade-offs without guarantees.'
WHERE "slug" = 'network-routes';--> statement-breakpoint
UPDATE "knowledge_categories" SET
  "name" = '地区与用户分布',
  "description" = '按大陆、海外或混合用户选择香港、日本、新加坡和美西等地区。',
  "enName" = 'Regions & Audience Location',
  "enDescription" = 'Choose Hong Kong, Japan, Singapore, US West, or other regions from audience location.'
WHERE "slug" = 'datacenter-regions';--> statement-breakpoint
UPDATE "knowledge_categories" SET
  "name" = 'IP、上游与服务政策',
  "description" = '理解 IP、ASN、DNS 和上游服务区域政策对可用性的影响。',
  "enName" = 'IP, Upstreams & Policies',
  "enDescription" = 'Understand how IP, ASN, DNS, and upstream service policies affect availability.'
WHERE "slug" = 'ip-network';--> statement-breakpoint
UPDATE "knowledge_categories" SET
  "name" = '购买后验收与运维',
  "description" = '购买后再看初始化、部署、备份、监控和故障恢复，避免混入购买决策。',
  "enName" = 'Post-purchase Operations',
  "enDescription" = 'Keep setup, deployment, backup, monitoring, and recovery guidance after purchase.'
WHERE "slug" = 'system-operations';--> statement-breakpoint
UPDATE "knowledge_categories" SET
  "name" = '业务场景与风险',
  "description" = '覆盖网站、API、电商、AI、流媒体、DDoS 与服务边界判断。',
  "enName" = 'Workloads & Risk Boundaries',
  "enDescription" = 'Cover websites, APIs, commerce, AI, streaming, DDoS, and service-boundary decisions.'
WHERE "slug" = 'security-use-cases';--> statement-breakpoint
ALTER TABLE "server_offers" ADD COLUMN "vcpuCount" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_contentRole_check" CHECK ("knowledge_articles"."contentRole" in ('decision_core', 'decision_reference', 'post_purchase_guide'));--> statement-breakpoint
ALTER TABLE "server_offers" ADD CONSTRAINT "server_offers_vcpuCount_check" CHECK ("server_offers"."vcpuCount" is null or "server_offers"."vcpuCount" > 0);
