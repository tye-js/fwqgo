import type { ProviderMonitorConfig } from "@fwqgo/core/provider-monitor-config";
import {
  decryptSecret,
  encryptSecret,
  hasSecretEncryptionKey,
  isEncryptedSecret,
  isMaskedSecret,
} from "@fwqgo/core/secret-envelope";

const SENSITIVE_HEADER_PATTERN =
  /(?:^|[-_])(authorization|cookie|api[-_]?key|auth[-_]?token|access[-_]?token|secret)(?:$|[-_])/i;

export function isSensitiveProviderHeader(name: string) {
  const normalized = name.trim().toLowerCase();
  return (
    normalized === "authorization" ||
    normalized === "cookie" ||
    normalized === "x-api-key" ||
    normalized === "api-key" ||
    SENSITIVE_HEADER_PATTERN.test(normalized)
  );
}

function cloneWithHeaders(
  config: ProviderMonitorConfig,
  headers: Record<string, string>,
): ProviderMonitorConfig {
  return { ...config, headers };
}

export function maskProviderMonitorSecrets(config: ProviderMonitorConfig) {
  return cloneWithHeaders(
    config,
    Object.fromEntries(
      Object.entries(config.headers).map(([name, value]) => [
        name,
        isSensitiveProviderHeader(name) && value ? "********" : value,
      ]),
    ),
  );
}

export function prepareProviderMonitorSecrets(
  config: ProviderMonitorConfig,
  existing?: ProviderMonitorConfig | null,
) {
  const headers = Object.fromEntries(
    Object.entries(config.headers).map(([name, value]) => {
      if (!isSensitiveProviderHeader(name) || !value) return [name, value];
      if (isMaskedSecret(value)) {
        return [name, existing?.headers[name] ?? ""];
      }
      return [name, isEncryptedSecret(value) ? value : encryptSecret(value)];
    }),
  );
  return cloneWithHeaders(config, headers);
}

export function mergeMaskedProviderMonitorSecrets(
  config: ProviderMonitorConfig,
  existing?: ProviderMonitorConfig | null,
) {
  return cloneWithHeaders(
    config,
    Object.fromEntries(
      Object.entries(config.headers).map(([name, value]) => [
        name,
        isSensitiveProviderHeader(name) && isMaskedSecret(value)
          ? (existing?.headers[name] ?? "")
          : value,
      ]),
    ),
  );
}

export function resolveProviderMonitorSecrets(config: ProviderMonitorConfig) {
  let needsMigration = false;
  const headers = Object.fromEntries(
    Object.entries(config.headers).map(([name, value]) => {
      if (!isSensitiveProviderHeader(name) || !value) return [name, value];
      const decrypted = decryptSecret(value);
      needsMigration ||= decrypted.needsMigration;
      return [name, decrypted.value];
    }),
  );
  const resolved = cloneWithHeaders(config, headers);
  return {
    config: resolved,
    storageConfig:
      needsMigration && hasSecretEncryptionKey()
        ? prepareProviderMonitorSecrets(resolved)
        : config,
    needsMigration: needsMigration && hasSecretEncryptionKey(),
  };
}
