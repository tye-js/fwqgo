export function parseArticleTagInput(input: string, existingNames: string[]) {
  const seen = new Set(existingNames.map((name) => name.trim().toLowerCase()));
  const names: string[] = [];

  for (const part of input.split(/[,，\n]/)) {
    const name = part.trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }

  return names;
}
