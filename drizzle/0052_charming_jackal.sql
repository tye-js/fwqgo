ALTER TABLE "knowledge_articles" ADD COLUMN "language" varchar(8);--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "translationSourceArticleId" integer;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "contentRevision" integer;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "translatedFromRevision" integer;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD COLUMN "contentUpdatedAt" timestamp;--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD COLUMN "enName" text;--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD COLUMN "enSlug" varchar(160);--> statement-breakpoint
ALTER TABLE "knowledge_categories" ADD COLUMN "enDescription" varchar(800);--> statement-breakpoint

UPDATE "knowledge_categories" AS category
SET
  "enName" = localized."enName",
  "enSlug" = localized."enSlug",
  "enDescription" = localized."enDescription"
FROM (
  VALUES
    ('server-configuration', 'Server Configuration', 'server-configuration', 'Guides to CPU, memory, storage, virtualization, bandwidth, and practical server sizing.'),
    ('network-routes', 'Network Routing', 'network-routes', 'Explanations and tests for carrier routes, BGP, MTR, traceroute, and cross-border connectivity.'),
    ('datacenter-regions', 'Data Centers & Regions', 'datacenter-regions', 'Region selection guidance based on latency, packet loss, user location, and deployment goals.'),
    ('ip-network', 'IP & Networking', 'ip-network', 'Practical guidance on IPv4, IPv6, ASN, DNS, IP types, ports, and connectivity troubleshooting.'),
    ('system-operations', 'Systems & Operations', 'system-operations', 'Step-by-step guides for Linux setup, SSH, Docker Compose, Nginx, backups, and maintenance.'),
    ('security-use-cases', 'Security & Use Cases', 'security-use-cases', 'Security, availability, monitoring, incident troubleshooting, and workload-based server selection.')
) AS localized("slug", "enName", "enSlug", "enDescription")
WHERE category."slug" = localized."slug";--> statement-breakpoint

UPDATE "knowledge_articles"
SET
  "language" = 'zh',
  "contentRevision" = 1,
  "translatedFromRevision" = NULL;--> statement-breakpoint

UPDATE "knowledge_articles"
SET "publishedAt" = GREATEST(
  "createdAt",
  COALESCE("updatedAt", "createdAt")
)
WHERE "published" = true
  AND "publishedAt" IS NULL;--> statement-breakpoint

UPDATE "knowledge_articles"
SET "contentUpdatedAt" = GREATEST(
  "createdAt",
  COALESCE("updatedAt", "createdAt"),
  COALESCE("publishedAt", "createdAt")
);--> statement-breakpoint

UPDATE "knowledge_articles"
SET "allowAiReference" = false
WHERE "published" = false
  AND "allowAiReference" = true;--> statement-breakpoint

DO $$
DECLARE
  localized_category_count integer;
BEGIN
  SELECT count(*)::integer
  INTO localized_category_count
  FROM "knowledge_categories"
  WHERE "slug" = ANY (ARRAY[
    'server-configuration',
    'network-routes',
    'datacenter-regions',
    'ip-network',
    'system-operations',
    'security-use-cases'
  ])
    AND NULLIF(BTRIM("enName"), '') IS NOT NULL
    AND NULLIF(BTRIM("enSlug"), '') IS NOT NULL
    AND NULLIF(BTRIM("enDescription"), '') IS NOT NULL;

  IF localized_category_count <> 6 THEN
    RAISE EXCEPTION 'knowledge category English localization backfill is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "knowledge_articles"
    WHERE "language" IS NULL
      OR "contentRevision" IS NULL
      OR "contentUpdatedAt" IS NULL
      OR "contentRevision" < 1
  ) THEN
    RAISE EXCEPTION 'knowledge article bilingual backfill is incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "knowledge_articles"
    WHERE ("published" = true AND "publishedAt" IS NULL)
      OR ("published" = false AND "allowAiReference" = true)
  ) THEN
    RAISE EXCEPTION 'knowledge article publication backfill is invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "knowledge_articles"
    WHERE "slug" = ANY (ARRAY[
      'vps-cloud-server-dedicated-server-differences',
      'vps-vs-cloud-vs-dedicated-servers',
      'vps-cpu-memory-storage-sizing',
      'how-to-size-cpu-ram-storage-for-vps',
      'bandwidth-traffic-port-speed-explained',
      'server-bandwidth-data-transfer-port-speed-guide',
      'kvm-lxc-openvz-virtualization-comparison',
      'kvm-vs-lxc-vs-openvz',
      'nvme-ssd-hdd-server-storage-guide',
      'nvme-vs-ssd-vs-hdd-for-servers',
      'cn2-gia-cn2-gt-163-network-routes',
      'cn2-gia-vs-cn2-gt-vs-chinanet-163',
      'cmi-cmin2-cuii-mobile-premium-network',
      'cmi-cmin2-cuii-route-comparison',
      'bgp-network-route-guide',
      'what-is-bgp-routing-for-hosting',
      'vps-route-test-mtr-traceroute',
      'how-to-test-vps-routes-with-mtr-and-traceroute',
      'iplc-iepl-dedicated-line-comparison',
      'iplc-vs-iepl-vs-public-internet',
      'server-region-guide-china-hong-kong-japan-singapore-us-west',
      'best-server-region-for-mainland-china-users',
      'latency-packet-loss-jitter-explained',
      'how-latency-packet-loss-and-jitter-affect-hosting',
      'hong-kong-vps-datacenter-selection-guide',
      'how-to-choose-a-hong-kong-vps',
      'japan-singapore-vps-region-selection',
      'japan-vs-singapore-vps',
      'us-vps-west-east-region-selection',
      'us-west-vs-us-east-vps',
      'ipv4-ipv6-dual-stack-server-guide',
      'ipv4-vs-ipv6-and-dual-stack-hosting',
      'native-broadcast-residential-ip-differences',
      'native-vs-broadcast-vs-residential-ip',
      'asn-ip-isp-lookup-guide',
      'how-to-look-up-asn-ip-owner-and-isp',
      'dns-records-a-aaaa-cname-guide',
      'a-aaaa-and-cname-dns-records-explained',
      'vps-ip-port-dns-troubleshooting',
      'troubleshoot-vps-ip-port-and-dns-issues',
      'new-vps-linux-initial-setup-checklist',
      'new-linux-vps-setup-checklist',
      'ssh-key-authentication-secure-setup',
      'set-up-ssh-key-authentication-safely',
      'docker-compose-deploy-web-app-guide',
      'deploy-web-apps-with-docker-compose',
      'nginx-reverse-proxy-https-guide',
      'nginx-reverse-proxy-and-https-setup',
      'server-backup-restore-strategy',
      'server-backup-and-restore-strategy',
      'linux-server-security-hardening-basics',
      'linux-server-hardening-checklist',
      'ddos-protection-high-defense-guide',
      'ddos-protection-mitigation-and-scrubbing',
      'website-502-504-connection-refused-troubleshooting',
      'troubleshoot-502-504-and-connection-refused',
      'server-monitoring-alerting-guide',
      'server-monitoring-and-alerting-basics',
      'server-selection-by-use-case',
      'choose-a-server-by-workload'
    ])
  ) THEN
    RAISE EXCEPTION 'a planned bilingual knowledge slug already exists';
  END IF;
END $$;--> statement-breakpoint

ALTER TABLE "knowledge_articles" ALTER COLUMN "language" SET DEFAULT 'zh';--> statement-breakpoint
ALTER TABLE "knowledge_articles" ALTER COLUMN "language" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ALTER COLUMN "contentRevision" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ALTER COLUMN "contentRevision" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "knowledge_articles" ALTER COLUMN "contentUpdatedAt" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "knowledge_articles" ALTER COLUMN "contentUpdatedAt" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "knowledge_categories" ADD CONSTRAINT "knowledge_categories_enSlug_unique" UNIQUE("enSlug");--> statement-breakpoint

ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_language_check" CHECK ("language" in ('zh', 'en')) NOT VALID;--> statement-breakpoint
ALTER TABLE "knowledge_articles" VALIDATE CONSTRAINT "knowledge_articles_language_check";--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_translation_shape_check" CHECK (("language" = 'zh' and "translationSourceArticleId" is null and "translatedFromRevision" is null)
  or ("language" = 'en' and "translationSourceArticleId" is not null)) NOT VALID;--> statement-breakpoint
ALTER TABLE "knowledge_articles" VALIDATE CONSTRAINT "knowledge_articles_translation_shape_check";--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_contentRevision_check" CHECK ("contentRevision" >= 1) NOT VALID;--> statement-breakpoint
ALTER TABLE "knowledge_articles" VALIDATE CONSTRAINT "knowledge_articles_contentRevision_check";--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_translatedFromRevision_check" CHECK ("translatedFromRevision" is null or "translatedFromRevision" >= 1) NOT VALID;--> statement-breakpoint
ALTER TABLE "knowledge_articles" VALIDATE CONSTRAINT "knowledge_articles_translatedFromRevision_check";--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_translation_not_self_check" CHECK ("translationSourceArticleId" is null or "translationSourceArticleId" <> "id") NOT VALID;--> statement-breakpoint
ALTER TABLE "knowledge_articles" VALIDATE CONSTRAINT "knowledge_articles_translation_not_self_check";--> statement-breakpoint
ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_aiReference_published_check" CHECK (not "allowAiReference" or "published") NOT VALID;--> statement-breakpoint
ALTER TABLE "knowledge_articles" VALIDATE CONSTRAINT "knowledge_articles_aiReference_published_check";--> statement-breakpoint

ALTER TABLE "knowledge_articles" ADD CONSTRAINT "knowledge_articles_translation_source_fk" FOREIGN KEY ("translationSourceArticleId") REFERENCES "public"."knowledge_articles"("id") ON DELETE restrict ON UPDATE no action NOT VALID;--> statement-breakpoint
ALTER TABLE "knowledge_articles" VALIDATE CONSTRAINT "knowledge_articles_translation_source_fk";--> statement-breakpoint

CREATE INDEX "knowledge_articles_lang_pub_category_content_idx" ON "knowledge_articles" USING btree ("language", "published", "categoryId", "contentUpdatedAt");--> statement-breakpoint
CREATE INDEX "knowledge_articles_lang_pub_ai_content_idx" ON "knowledge_articles" USING btree ("language", "published", "allowAiReference", "contentUpdatedAt");--> statement-breakpoint
CREATE INDEX "knowledge_articles_translation_source_idx" ON "knowledge_articles" USING btree ("translationSourceArticleId");--> statement-breakpoint
CREATE UNIQUE INDEX "knowledge_articles_translation_source_lang_uidx" ON "knowledge_articles" USING btree ("translationSourceArticleId", "language") WHERE "translationSourceArticleId" is not null;
