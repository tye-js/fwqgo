export function buildOpenAiChatCompletionsEndpoint(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");

  if (!trimmed) {
    return trimmed;
  }

  if (/\/(?:v1\/)?chat\/completions$/i.test(trimmed)) {
    return trimmed;
  }

  if (/\/v1$/i.test(trimmed)) {
    return `${trimmed}/chat/completions`;
  }

  return `${trimmed}/v1/chat/completions`;
}

function cleanAiJsonText(text: string) {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractFirstJsonObject(text: string) {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === "{") {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }

    if (character === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAiJsonObject<T extends Record<string, unknown>>(
  text: string,
  errorLabel: string,
): T {
  const cleaned = cleanAiJsonText(text);
  let directError: unknown = null;
  let directParsed: unknown;

  try {
    directParsed = JSON.parse(cleaned);
  } catch (error) {
    directError = error;
  }

  if (directError === null) {
    if (!isJsonObject(directParsed)) {
      throw new Error(
        `${errorLabel}：JSON 格式损坏；原因：模型返回的 JSON 顶层不是对象`,
      );
    }
    return directParsed as T;
  }

  const candidate = extractFirstJsonObject(cleaned);
  if (!candidate) {
    const hasObjectStart = cleaned.includes("{");
    throw new Error(
      hasObjectStart
        ? `${errorLabel}：JSON 格式损坏；原因：模型输出可能被截断，缺少完整的右大括号`
        : `${errorLabel}：返回内容不是 JSON；原因：返回开头：${cleaned.slice(0, 120) || "空"}`,
    );
  }

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (!isJsonObject(parsed)) {
      throw new Error("模型返回的 JSON 顶层不是对象");
    }
    return parsed as T;
  } catch (error) {
    const detail =
      error instanceof Error
        ? error.message
        : directError instanceof Error
          ? directError.message
          : "无法解析模型返回值";
    throw new Error(`${errorLabel}：JSON 格式损坏；原因：${detail}`);
  }
}
