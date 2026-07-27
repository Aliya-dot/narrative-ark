import type { AttributeDefinition } from "@/lib/types";

const LEGACY_ATTRIBUTE_LABELS: Record<string, string> = {
  hp: "生命",
  health: "生命",
  stamina: "体力",
  spirit: "精神",
  sanity: "精神",
  strength: "力量",
  agility: "敏捷",
  dexterity: "敏捷",
  blood_power: "血源之力",
  humanity: "人性",
  level: "等级",
  experience: "经验",
  xp: "经验",
  money: "金钱",
  gold: "金钱",
  mana: "法力",
  mp: "法力",
  attack: "攻击",
  defense: "防御",
  intelligence: "智力",
  perception: "感知",
  luck: "幸运",
  charisma: "魅力",
  willpower: "意志",
};

function normalizeAttributeId(attributeId: string) {
  return attributeId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function displayAttributeName(
  attributeId: string,
  definitions: Pick<AttributeDefinition, "id" | "name">[],
) {
  const configuredName = definitions
    .find((definition) => definition.id === attributeId)
    ?.name.trim();

  if (configuredName) return configuredName;

  const trimmedId = attributeId.trim();
  if (!trimmedId) return "未知属性";
  if (/[\u3400-\u9fff]/u.test(trimmedId)) return trimmedId;

  return (
    LEGACY_ATTRIBUTE_LABELS[normalizeAttributeId(trimmedId)] ?? "未命名属性"
  );
}
