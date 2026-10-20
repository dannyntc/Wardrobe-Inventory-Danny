import {
  GARMENT_GROUPS,
  getGarmentTypes,
  normalizeStoredGarmentClassification,
  type GarmentGroup,
  type WardrobeTaxonomy,
} from "./wardrobe-taxonomy";
import { COLOUR_OPTIONS, normalizeStoredColour, type WardrobeColour } from "./wardrobe-colours";

export type KeywordRuleTarget = {
  occasion?: string;
  garmentGroup?: GarmentGroup;
  garmentType?: string;
  brand?: string;
  colour?: WardrobeColour;
};

export type KeywordRule = {
  id: string;
  keywords: string[];
  enabled: boolean;
  priority: number;
  target: KeywordRuleTarget;
};

export type KeywordClassification = {
  occasion?: string;
  garmentGroup?: GarmentGroup;
  garmentType?: string;
  brand?: string;
  colour?: WardrobeColour;
  matchedKeywords: string[];
};

const MAX_RULES = 100;
const MAX_ALIASES_PER_RULE = 20;
const MAX_ALIAS_LENGTH = 80;

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    const normalized = value.trim();
    const key = normalized.toLocaleLowerCase();
    if (!normalized || seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function normalizePhrase(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[‐‑‒–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesPhrase(name: string, keyword: string) {
  const normalizedName = normalizePhrase(name);
  const normalizedKeyword = normalizePhrase(keyword);
  if (!normalizedName || !normalizedKeyword) return false;
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedKeyword)}(?=$|[^\\p{L}\\p{N}])`, "u").test(normalizedName);
}

function isGarmentGroup(value: unknown): value is GarmentGroup {
  return typeof value === "string" && GARMENT_GROUPS.includes(value as GarmentGroup);
}

function normalizeRuleBrand(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function normalizeRuleColour(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const colour = normalizeStoredColour(value);
  return colour === "Unspecified" && value.trim().toLocaleLowerCase() !== "unspecified" ? undefined : colour;
}

function normalizeTarget(value: unknown, taxonomy: WardrobeTaxonomy): KeywordRuleTarget {
  if (!value || typeof value !== "object") return {};
  const candidate = value as Record<string, unknown>;
  const target: KeywordRuleTarget = {};
  const occasionName = typeof candidate.occasion === "string" ? candidate.occasion.trim().toLocaleLowerCase() : "";
  const matchingOccasion = taxonomy.occasions.find((occasion) => occasion.toLocaleLowerCase() === occasionName);
  if (matchingOccasion) {
    target.occasion = matchingOccasion;
  }
  const suppliedGroup = isGarmentGroup(candidate.garmentGroup) ? candidate.garmentGroup : undefined;
  const suppliedType = typeof candidate.garmentType === "string" ? candidate.garmentType.trim() : "";
  const classification = normalizeStoredGarmentClassification(matchingOccasion, suppliedGroup, suppliedType);
  if (suppliedGroup) target.garmentGroup = classification.garmentGroup;
  const garmentTypeName = suppliedType ? classification.garmentType.toLocaleLowerCase() : "";
  if (garmentTypeName && target.garmentGroup) {
    const occasions = target.occasion ? [target.occasion] : taxonomy.occasions;
    for (const occasion of occasions) {
      const matchingOption = getGarmentTypes(occasion, target.garmentGroup, taxonomy)
        .find((option) => option.toLocaleLowerCase() === garmentTypeName);
      if (matchingOption) {
        target.garmentType = matchingOption;
        break;
      }
    }
  }
  const brand = normalizeRuleBrand(candidate.brand);
  if (brand) target.brand = brand;
  const colour = normalizeRuleColour(candidate.colour);
  if (colour) target.colour = colour;
  return target;
}

function normalizeRule(value: unknown, taxonomy: WardrobeTaxonomy, index: number): KeywordRule | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const keywords = uniqueStrings(Array.isArray(candidate.keywords) ? candidate.keywords : [])
    .map((keyword) => keyword.slice(0, MAX_ALIAS_LENGTH))
    .slice(0, MAX_ALIASES_PER_RULE);
  const target = normalizeTarget(candidate.target, taxonomy);
  if (!keywords.length) return null;
  const priority = typeof candidate.priority === "number" && Number.isFinite(candidate.priority)
    ? Math.max(0, Math.min(1000, Math.trunc(candidate.priority)))
    : 50;
  const hasTarget = isKeywordRuleTarget(target);
  return {
    id: typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim().slice(0, 80) : `rule-${index + 1}`,
    keywords,
    enabled: candidate.enabled !== false && hasTarget,
    priority,
    target,
  };
}

export const DEFAULT_KEYWORD_RULES: KeywordRule[] = [
  { id: "default-formal", keywords: ["formal", "dressy"], enabled: true, priority: 100, target: { occasion: "Formal" } },
  { id: "default-smart-casual", keywords: ["smart casual"], enabled: true, priority: 100, target: { occasion: "Smart casual" } },
  { id: "default-casual", keywords: ["casual"], enabled: true, priority: 100, target: { occasion: "Casual" } },
  { id: "default-home-activewear", keywords: ["home", "lounge", "workout", "gym"], enabled: true, priority: 100, target: { occasion: "Home & activewear" } },
  { id: "default-towels", keywords: ["towel", "towels"], enabled: true, priority: 90, target: { occasion: "Other", garmentGroup: "Accessories", garmentType: "Towels" } },
  { id: "default-uniqlo", keywords: ["uniqlo"], enabled: true, priority: 70, target: { occasion: "Casual", garmentGroup: "Tops", garmentType: "T-shirts", brand: "UNIQLO" } },
  { id: "default-army-shorts", keywords: ["army shorts"], enabled: true, priority: 90, target: { occasion: "Home & activewear", garmentGroup: "Bottoms", garmentType: "Shorts", brand: "Army" } },
  { id: "default-army-tee", keywords: ["army tee"], enabled: true, priority: 90, target: { occasion: "Home & activewear", garmentGroup: "Tops", garmentType: "T-shirts / workout tops", brand: "Army" } },
  { id: "default-padini", keywords: ["padini"], enabled: true, priority: 80, target: { brand: "Padini" } },
  { id: "default-hashira-shirt", keywords: ["hashira shirt"], enabled: true, priority: 90, target: { occasion: "Casual", garmentGroup: "Tops", garmentType: "T-shirts" } },
  { id: "default-dress-shirts", keywords: ["dress shirt", "dress shirts"], enabled: true, priority: 80, target: { occasion: "Formal", garmentGroup: "Tops", garmentType: "Dress shirts" } },
  { id: "default-formal-shirts", keywords: ["formal shirt", "formal shirts"], enabled: true, priority: 90, target: { occasion: "Formal", garmentGroup: "Tops", garmentType: "Dress shirts" } },
  { id: "default-t-shirts", keywords: ["t-shirt", "t-shirts", "tee", "tees"], enabled: true, priority: 50, target: { garmentGroup: "Tops", garmentType: "T-shirts" } },
  { id: "default-polos", keywords: ["polo", "polos"], enabled: true, priority: 50, target: { garmentGroup: "Tops", garmentType: "Polos" } },
  { id: "default-overshirts", keywords: ["overshirt", "overshirts"], enabled: true, priority: 50, target: { occasion: "Smart casual", garmentGroup: "Tops", garmentType: "Overshirts" } },
  { id: "default-shirts", keywords: ["shirt", "shirts"], enabled: true, priority: 50, target: { garmentGroup: "Tops", garmentType: "Shirts" } },
  { id: "default-hoodies", keywords: ["hoodie", "hoodies"], enabled: true, priority: 50, target: { garmentGroup: "Tops", garmentType: "Jackets / Hoodies" } },
  { id: "default-jackets", keywords: ["jacket", "jackets"], enabled: true, priority: 50, target: { garmentGroup: "Tops", garmentType: "Jackets / Hoodies" } },
  { id: "default-blazers", keywords: ["blazer", "blazers"], enabled: true, priority: 80, target: { occasion: "Formal", garmentGroup: "Tops", garmentType: "Blazers" } },
  { id: "default-jeans", keywords: ["jeans"], enabled: true, priority: 50, target: { garmentGroup: "Bottoms", garmentType: "Jeans" } },
  { id: "default-chinos", keywords: ["chinos"], enabled: true, priority: 50, target: { occasion: "Smart casual", garmentGroup: "Bottoms", garmentType: "Chinos" } },
  { id: "default-trousers", keywords: ["trousers", "trouser"], enabled: true, priority: 50, target: { occasion: "Smart casual", garmentGroup: "Bottoms", garmentType: "Trousers" } },
  { id: "default-shorts", keywords: ["shorts"], enabled: true, priority: 50, target: { garmentGroup: "Bottoms", garmentType: "Shorts" } },
  { id: "default-sneakers", keywords: ["sneakers", "sneaker", "trainers"], enabled: true, priority: 50, target: { occasion: "Casual", garmentGroup: "Other", garmentType: "Sneakers" } },
  { id: "default-loafers", keywords: ["loafers", "loafer"], enabled: true, priority: 50, target: { occasion: "Smart casual", garmentGroup: "Other", garmentType: "Loafers" } },
  { id: "default-suits", keywords: ["suit", "suits"], enabled: true, priority: 80, target: { occasion: "Formal", garmentGroup: "Other", garmentType: "Suits" } },
  { id: "default-dress-shoes", keywords: ["dress shoes", "dress shoe"], enabled: true, priority: 80, target: { occasion: "Formal", garmentGroup: "Other", garmentType: "Dress shoes" } },
  { id: "default-swimwear", keywords: ["swimwear", "swimming trunks"], enabled: true, priority: 50, target: { occasion: "Home & activewear", garmentGroup: "Other", garmentType: "Swimwear" } },
  { id: "default-sleepwear", keywords: ["sleepwear", "pyjamas", "pajamas"], enabled: true, priority: 50, target: { occasion: "Home & activewear", garmentGroup: "Other", garmentType: "Sleepwear" } },
];

export function cloneDefaultKeywordRules() {
  return DEFAULT_KEYWORD_RULES.map((rule) => ({ ...rule, keywords: [...rule.keywords], target: { ...rule.target } }));
}

export function normalizeKeywordRules(value: unknown, taxonomy: WardrobeTaxonomy): KeywordRule[] {
  const source = Array.isArray(value) ? [...value] : cloneDefaultKeywordRules();
  if (Array.isArray(value)) {
    for (const requiredRuleId of ["default-padini", "default-towels"]) {
      if (source.some((candidate) => candidate && typeof candidate === "object" && (candidate as { id?: unknown }).id === requiredRuleId)) continue;
      const requiredRule = DEFAULT_KEYWORD_RULES.find((rule) => rule.id === requiredRuleId);
      if (requiredRule) source.push(requiredRule);
    }
  }
  const seenIds = new Set<string>();
  return source
    .slice(0, MAX_RULES)
    .map((candidate, index) => {
      if (!candidate || typeof candidate !== "object") return normalizeRule(candidate, taxonomy, index);
      const record = candidate as Record<string, unknown>;
      const defaultBrand = record.id === "default-uniqlo"
        ? "UNIQLO"
        : record.id === "default-army-shorts" || record.id === "default-army-tee"
          ? "Army"
          : "";
      if (!defaultBrand || !record.target || typeof record.target !== "object" || (record.target as { brand?: unknown }).brand !== undefined) {
        return normalizeRule(candidate, taxonomy, index);
      }
      return normalizeRule({ ...record, target: { ...(record.target as object), brand: defaultBrand } }, taxonomy, index);
    })
    .filter((rule): rule is KeywordRule => {
      if (!rule || seenIds.has(rule.id)) return false;
      seenIds.add(rule.id);
      return true;
    });
}

export function getKeywordMatches(name: string, rules: KeywordRule[]) {
  return rules.flatMap((rule, ruleIndex) => {
    if (!rule.enabled) return [];
    const matchedKeywords = rule.keywords.filter((keyword) => matchesPhrase(name, keyword));
    if (!matchedKeywords.length) return [];
    return [{ rule, ruleIndex, matchedKeywords, matchLength: Math.max(...matchedKeywords.map((keyword) => normalizePhrase(keyword).length)) }];
  }).sort((a, b) => b.rule.priority - a.rule.priority || b.matchLength - a.matchLength || a.ruleIndex - b.ruleIndex);
}

export function suggestKeywordClassification(
  name: string,
  rules: KeywordRule[],
  taxonomy: WardrobeTaxonomy,
  overrides: Pick<KeywordClassification, "occasion" | "garmentGroup" | "brand" | "colour"> = {},
): KeywordClassification {
  const matches = getKeywordMatches(name, rules);
  const classification: KeywordClassification = { ...overrides, matchedKeywords: [] };
  const matchedKeywords = new Set<string>();

  for (const match of matches) {
    if (!classification.occasion && match.rule.target.occasion && taxonomy.occasions.includes(match.rule.target.occasion)) {
      classification.occasion = match.rule.target.occasion;
    }
    if (!classification.garmentGroup && match.rule.target.garmentGroup) {
      classification.garmentGroup = match.rule.target.garmentGroup;
    }
    if (!classification.brand && match.rule.target.brand) {
      classification.brand = match.rule.target.brand;
    }
    if (!classification.colour && match.rule.target.colour) {
      classification.colour = match.rule.target.colour;
    }
  }

  if (!classification.colour) {
    const matchedColours = COLOUR_OPTIONS.filter((colour) => colour !== "Unspecified" && colour !== "Other" && matchesPhrase(name, colour));
    const navyBlueVariantMatched = matchedColours.some((colour) => colour === "Navy Blue" || colour === "Light Navy Blue" || colour === "Dark Navy Blue");
    const specificColours = matchedColours
      .filter((colour) => !(navyBlueVariantMatched && (colour === "Navy" || colour === "Blue" || colour === "Light Blue" || colour === "Dark Blue")))
      .filter((colour) => !matchedColours.some((candidate) => candidate !== colour && candidate.toLocaleLowerCase().endsWith(` ${colour.toLocaleLowerCase()}`)));
    if (specificColours.length === 1) {
      classification.colour = specificColours[0];
      specificColours.forEach((colour) => matchedKeywords.add(colour));
    } else if (specificColours.length > 1) {
      classification.colour = "Multicolour";
      specificColours.forEach((colour) => matchedKeywords.add(colour));
    }
  }

  for (const match of matches) {
    const target = match.rule.target;
    if (!target.garmentType || !target.garmentGroup || target.garmentGroup !== classification.garmentGroup) continue;
    const candidateOccasions = classification.occasion
      ? [classification.occasion]
      : [
        taxonomy.occasions.find((occasion) => occasion.toLocaleLowerCase() === "casual"),
        ...taxonomy.occasions,
      ].filter((occasion, index, all): occasion is string => Boolean(occasion) && all.indexOf(occasion) === index);
    for (const occasion of candidateOccasions) {
      const options = getGarmentTypes(occasion, classification.garmentGroup, taxonomy);
      const matchingOption = options.find((option) => option.toLocaleLowerCase() === target.garmentType?.toLocaleLowerCase());
      if (!matchingOption) continue;
      if (!classification.occasion) classification.occasion = occasion;
      classification.garmentType = matchingOption;
      match.matchedKeywords.forEach((keyword) => matchedKeywords.add(keyword));
      break;
    }
    if (classification.garmentType) break;
  }

  for (const match of matches) {
    const target = match.rule.target;
    if (
      target.occasion && target.occasion === classification.occasion ||
      !target.occasion && classification.occasion ||
      target.brand && target.brand === classification.brand ||
      target.colour && target.colour === classification.colour
    ) {
      match.matchedKeywords.forEach((keyword) => matchedKeywords.add(keyword));
    }
  }

  classification.matchedKeywords = Array.from(matchedKeywords);
  return classification;
}

export function getKeywordRuleTargetLabel(rule: KeywordRule) {
  return [
    rule.target.occasion,
    rule.target.garmentGroup,
    rule.target.garmentType,
    rule.target.brand ? `Brand: ${rule.target.brand}` : "",
    rule.target.colour ? `Colour: ${rule.target.colour}` : "",
  ].filter(Boolean).join(" · ") || "No classification target";
}

export function isKeywordRuleTarget(value: KeywordRuleTarget) {
  return Boolean(value.occasion || value.garmentGroup || value.garmentType || value.brand || value.colour);
}

export function getDefaultBrandOptions() {
  return Array.from(new Set(DEFAULT_KEYWORD_RULES.map((rule) => rule.target.brand).filter((brand): brand is string => Boolean(brand))));
}

export const KEYWORD_RULE_LIMITS = {
  maxRules: MAX_RULES,
  maxAliasesPerRule: MAX_ALIASES_PER_RULE,
  maxAliasLength: MAX_ALIAS_LENGTH,
};
