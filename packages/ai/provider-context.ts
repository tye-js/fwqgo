import { readDb } from "@fwqgo/db";
import { affServiceProviders } from "@fwqgo/db/schema";
import { parsePublicHttpUrl } from "@fwqgo/core/network-url";

const MAX_PROVIDER_FIELD_LENGTH = 12_000;

export type RewriteProviderFieldKind =
  "summary" | "refundPolicy" | "prohibitedUses";

export type RewriteProviderField = {
  kind: RewriteProviderFieldKind;
  label: string;
  content: string;
  sourceUrl: string;
};

export type RewriteProviderReference = {
  id: number;
  name: string;
  slug: string | null;
  officialUrl: string;
  fields: RewriteProviderField[];
};

export type RewriteProviderCandidate = {
  id: number;
  name: string;
  slug: string | null;
  aliases: string | null;
  officialUrl: string;
  summary: string | null;
  summarySourceUrl: string | null;
  refundPolicy: string | null;
  refundPolicySourceUrl: string | null;
  prohibitedUses: string | null;
  prohibitedUsesSourceUrl: string | null;
};

function normalizeProviderIdentity(value: string) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function splitProviderAliases(value: string | null) {
  return (value ?? "")
    .split(/[\n,;|，；]+/)
    .map(normalizeProviderIdentity)
    .filter(Boolean);
}

function providerIdentities(candidate: RewriteProviderCandidate) {
  return new Set(
    [
      normalizeProviderIdentity(candidate.name),
      candidate.slug ? normalizeProviderIdentity(candidate.slug) : "",
      ...splitProviderAliases(candidate.aliases),
    ].filter(Boolean),
  );
}

function normalizeOfficialHostname(value: string) {
  const candidate = /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : `https://${value.trim()}`;

  try {
    return new URL(candidate).hostname
      .trim()
      .toLowerCase()
      .replace(/\.$/, "")
      .replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function isOfficialProviderSourceUrl(
  sourceUrl: string,
  officialUrl: string,
) {
  const parsedSource = parsePublicHttpUrl(sourceUrl.trim());
  const officialHost = normalizeOfficialHostname(officialUrl);
  if (
    !parsedSource ||
    !officialHost ||
    parsedSource.username ||
    parsedSource.password
  ) {
    return false;
  }

  const sourceHost = parsedSource.hostname
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");

  return sourceHost === officialHost || sourceHost.endsWith(`.${officialHost}`);
}

function createProviderField(input: {
  kind: RewriteProviderFieldKind;
  label: string;
  content: string | null;
  sourceUrl: string | null;
  officialUrl: string;
}) {
  const content = input.content?.trim();
  const sourceUrl = input.sourceUrl?.trim();
  if (
    !content ||
    !sourceUrl ||
    !isOfficialProviderSourceUrl(sourceUrl, input.officialUrl)
  ) {
    return null;
  }

  return {
    kind: input.kind,
    label: input.label,
    content: content.slice(0, MAX_PROVIDER_FIELD_LENGTH),
    sourceUrl,
  } satisfies RewriteProviderField;
}

function sanitizeProviderCandidate(candidate: RewriteProviderCandidate) {
  const fields = [
    createProviderField({
      kind: "summary",
      label: "供应商介绍",
      content: candidate.summary,
      sourceUrl: candidate.summarySourceUrl,
      officialUrl: candidate.officialUrl,
    }),
    createProviderField({
      kind: "refundPolicy",
      label: "退款政策",
      content: candidate.refundPolicy,
      sourceUrl: candidate.refundPolicySourceUrl,
      officialUrl: candidate.officialUrl,
    }),
    createProviderField({
      kind: "prohibitedUses",
      label: "禁止事项",
      content: candidate.prohibitedUses,
      sourceUrl: candidate.prohibitedUsesSourceUrl,
      officialUrl: candidate.officialUrl,
    }),
  ].filter((field): field is RewriteProviderField => field !== null);

  if (fields.length === 0) return null;

  return {
    id: candidate.id,
    name: candidate.name,
    slug: candidate.slug,
    officialUrl: candidate.officialUrl,
    fields,
  } satisfies RewriteProviderReference;
}

export function selectRewriteProviderReferences(
  candidates: RewriteProviderCandidate[],
  requestedNames: string[],
) {
  const requestedKeys = [
    ...new Set(requestedNames.map(normalizeProviderIdentity).filter(Boolean)),
  ];
  const identitiesById = new Map(
    candidates.map((candidate) => [
      candidate.id,
      providerIdentities(candidate),
    ]),
  );
  const selected = new Map<number, RewriteProviderReference>();

  for (const requestedKey of requestedKeys) {
    const matches = candidates.filter((candidate) =>
      identitiesById.get(candidate.id)?.has(requestedKey),
    );
    if (matches.length !== 1) continue;

    const reference = sanitizeProviderCandidate(matches[0]!);
    if (reference) selected.set(reference.id, reference);
  }

  return [...selected.values()];
}

export async function retrieveRewriteProviderReferences(input: {
  names: string[];
}) {
  if (input.names.every((name) => !name.trim())) return [];

  const candidates = await readDb
    .select({
      id: affServiceProviders.id,
      name: affServiceProviders.name,
      slug: affServiceProviders.slug,
      aliases: affServiceProviders.aliases,
      officialUrl: affServiceProviders.officialUrl,
      summary: affServiceProviders.summary,
      summarySourceUrl: affServiceProviders.summarySourceUrl,
      refundPolicy: affServiceProviders.refundPolicy,
      refundPolicySourceUrl: affServiceProviders.refundPolicySourceUrl,
      prohibitedUses: affServiceProviders.prohibitedUses,
      prohibitedUsesSourceUrl: affServiceProviders.prohibitedUsesSourceUrl,
    })
    .from(affServiceProviders);

  return selectRewriteProviderReferences(candidates, input.names);
}

export function formatRewriteProviderContext(
  references: RewriteProviderReference[],
  maxLength = 12_000,
) {
  if (references.length === 0) {
    return "未匹配到带官网来源的供应商资料。不得补造退款政策、禁止事项或供应商承诺。";
  }

  const sections = references.map((reference) => {
    const fields = reference.fields
      .map(
        (field) =>
          `${field.label}（官网来源：${field.sourceUrl}）\n${field.content}`,
      )
      .join("\n\n");
    return `[供应商:${reference.id}] ${reference.name}\n${fields}`;
  });

  return sections.join("\n\n").slice(0, Math.max(0, maxLength));
}
