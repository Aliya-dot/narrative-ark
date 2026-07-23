const FRIENDLY_PARSE_ERROR =
  "模型返回的结构化内容不完整，已保留当前进度，请从当前阶段重试";

function stripModelWrapper(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error(FRIENDLY_PARSE_ERROR);
  return cleaned.slice(start, end + 1);
}

/**
 * Repairs only an unambiguous model typo: two adjacent JSON structures with a
 * missing comma. It never invents text or closes a truncated string/object.
 */
function insertMissingStructuralCommas(source: string) {
  let result = "";
  let inString = false;
  let escaped = false;
  let previousSignificant = "";
  let justClosedStringValue = false;
  const stack: string[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      result += char;
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') {
        inString = false;
        justClosedStringValue = true;
      }
      continue;
    }

    if (!/\s/.test(char)) {
      const container = stack.at(-1);
      const startsNextArrayValue =
        container === "[" &&
        (previousSignificant === "}" ||
          previousSignificant === "]" ||
          justClosedStringValue) &&
        (char === "{" || char === "[" || char === '"');
      const startsNextObjectProperty =
        container === "{" &&
        (previousSignificant === "}" ||
          previousSignificant === "]" ||
          justClosedStringValue) &&
        char === '"';

      if (startsNextArrayValue || startsNextObjectProperty) result += ",";
    }

    result += char;
    if (char === '"') {
      inString = true;
      justClosedStringValue = false;
    }
    else if (char === "{" || char === "[") stack.push(char);
    else if (char === "}" && stack.at(-1) === "{") stack.pop();
    else if (char === "]" && stack.at(-1) === "[") stack.pop();

    if (!/\s/.test(char)) {
      previousSignificant = char;
      if (char !== '"') justClosedStringValue = false;
    }
  }

  return result;
}

export function parseModelJson(text: string): unknown {
  const candidate = stripModelWrapper(text).replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(candidate);
  } catch {
    const normalized = candidate
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");
    try {
      return JSON.parse(normalized);
    } catch {
      try {
        return JSON.parse(insertMissingStructuralCommas(normalized));
      } catch {
        throw new Error(FRIENDLY_PARSE_ERROR);
      }
    }
  }
}
