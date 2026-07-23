export function compactSummary(text: string, maxLength = 180) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;

  const sentences =
    normalized.match(
      /[^。！？!?…]+(?:[。！？!?…]+[”’」』】）》]*)?|[。！？!?…]+/g,
    ) ?? [];
  const selected: string[] = [];
  let length = 0;

  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index].trim();
    if (!sentence) continue;
    if (length && length + sentence.length > maxLength) break;
    if (!length && sentence.length > maxLength)
      return `…${sentence.slice(-(maxLength - 1))}`;
    selected.unshift(sentence);
    length += sentence.length;
  }

  return selected.length
    ? selected.join("")
    : `…${normalized.slice(-(maxLength - 1))}`;
}

export function readableParagraphs(
  content: string,
  options: { maxLength?: number; preferredLength?: number } = {},
) {
  const maxLength = options.maxLength ?? 170;
  const preferredLength = options.preferredLength ?? 105;
  const sourceParagraphs = normalizeNarrativeTypography(content)
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return sourceParagraphs.flatMap(splitDialogueParagraphs).flatMap((source) => {
    if (isDialogueParagraph(source)) return [source];
    if (source.length <= maxLength) return [source];

    const units = quoteAwareSentenceUnits(source);
    const paragraphs: string[] = [];
    let current = "";

    for (const unit of units) {
      if (current && current.length + unit.length > maxLength) {
        paragraphs.push(current.trim());
        current = "";
      }
      current += unit;

      if (current.length >= preferredLength) {
        paragraphs.push(current.trim());
        current = "";
      }
    }

    if (current.trim()) paragraphs.push(current.trim());
    return paragraphs;
  });
}

export function summaryParagraphs(content: string) {
  const sentences = normalizeNarrativeTypography(content)
    .replace(/\s+/g, " ")
    .trim()
    .match(/[^。！？!?]+[。！？!?]?/g);
  if (!sentences?.length) return [];

  const paragraphs: string[] = [];
  let current = "";

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (/[：:]/.test(sentence)) {
      if (current) {
        paragraphs.push(current);
        current = "";
      }
      paragraphs.push(sentence);
      continue;
    }

    if (current && current.length + sentence.length > 70) {
      paragraphs.push(current);
      current = sentence;
    } else {
      current += sentence;
    }
  }

  if (current) paragraphs.push(current);
  return paragraphs;
}

function splitDialogueParagraphs(text: string) {
  const dialoguePattern = /“\u2009?[^“”]*?\u2009?”/g;
  const paragraphs: string[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = dialoguePattern.exec(text))) {
    const before = text.slice(cursor, match.index);
    const dialogue = match[0];
    const introducedByColon = /[：:]\s*$/.test(before);
    const startsParagraph = !before.trim() && match.index === cursor;
    const completeUtterance = /[。！？!?…]\u2009?”$/.test(dialogue);

    if (!completeUtterance || (!introducedByColon && !startsParagraph))
      continue;

    if (before.trim()) paragraphs.push(before.trim());
    paragraphs.push(dialogue.trim());
    cursor = match.index + dialogue.length;
  }

  const remainder = text.slice(cursor).trim();
  if (remainder) paragraphs.push(remainder);
  return paragraphs.length ? paragraphs : [text];
}

function isDialogueParagraph(text: string) {
  return /^“\u2009?[\s\S]*\u2009?”$/.test(text.trim());
}

function normalizeNarrativeTypography(text: string) {
  let openingDoubleQuote = true;
  let result = "";

  for (const character of text) {
    if (character === '"') {
      result += openingDoubleQuote ? "“" : "”";
      openingDoubleQuote = !openingDoubleQuote;
    } else {
      result += character;
    }
  }

  return result
    .replace(/“[ \t\u2009]*/g, "“\u2009")
    .replace(/[ \t\u2009]*”/g, "\u2009”");
}

function quoteAwareSentenceUnits(text: string) {
  const closingFor: Record<string, string> = {
    "“": "”",
    "「": "」",
    "『": "』",
  };
  const closingQuotes = new Set(Object.values(closingFor));
  const quoteStack: string[] = [];
  const units: string[] = [];
  let current = "";

  for (const character of text) {
    current += character;

    if (closingFor[character]) {
      quoteStack.push(closingFor[character]);
    } else if (
      closingQuotes.has(character) &&
      quoteStack.at(-1) === character
    ) {
      quoteStack.pop();
    }

    const sentenceEndedOutsideQuote =
      quoteStack.length === 0 && /[。！？!?…]/.test(character);

    if (sentenceEndedOutsideQuote) {
      units.push(current);
      current = "";
    }
  }

  if (current) units.push(current);
  return units;
}
