export const GARMENT_GROUPS = ["Tops", "Bottoms", "Accessories", "Other"] as const;
export type GarmentGroup = (typeof GARMENT_GROUPS)[number];

export const DEFAULT_OCCASIONS = ["Formal", "Smart casual", "Casual", "Home & activewear", "Other"] as const;

export type WardrobeTaxonomy = {
  occasions: string[];
  garmentTypes: Record<string, Record<GarmentGroup, string[]>>;
};

export type TaxonomyItem = {
  occasion?: string;
  occasions?: string[];
  garmentGroup?: string;
  garmentType?: string;
};

const DEFAULT_GARMENT_TYPES: Record<string, Record<GarmentGroup, string[]>> = {
  Formal: {
    Tops: ["Dress shirts", "Blazers", "Other"],
    Bottoms: ["Trousers", "Other"],
    Accessories: ["Towels", "Belts", "Accessories", "Other"],
    Other: ["Suits", "Dress shoes", "Other"],
  },
  "Smart casual": {
    Tops: ["Shirts", "Polos", "Overshirts", "Jackets / Hoodies", "Other"],
    Bottoms: ["Chinos", "Trousers", "Other"],
    Accessories: ["Towels", "Belts", "Accessories", "Other"],
    Other: ["Loafers", "Other"],
  },
  Casual: {
    Tops: ["T-shirts", "Polos", "Shirts", "Jackets / Hoodies", "Other"],
    Bottoms: ["Jeans", "Shorts", "Other"],
    Accessories: ["Towels", "Belts", "Accessories", "Other"],
    Other: ["Sneakers", "Other"],
  },
  "Home & activewear": {
    Tops: ["T-shirts / workout tops", "Other"],
    Bottoms: ["Shorts", "Other"],
    Accessories: ["Towels", "Belts", "Accessories", "Other"],
    Other: ["Swimwear", "Sleepwear", "Underwear & socks", "Other"],
  },
  Other: {
    Tops: ["Other"],
    Bottoms: ["Other"],
    Accessories: ["Towels", "Belts", "Accessories", "Other"],
    Other: ["Other"],
  },
};

function uniqueNames(values: unknown[]) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    if (typeof value !== "string") return [];
    const name = value.trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}

function hasOther(values: string[]) {
  return values.some((value) => value.toLocaleLowerCase() === "other");
}

function isRemovedGarmentType(value: string) {
  return ["joggers", "workout bottoms"].includes(value.toLocaleLowerCase());
}

const LEGACY_ACCESSORY_TYPES = new Set(["accessories", "belts", "towels"]);

function isLegacyAccessoryType(value: string) {
  return LEGACY_ACCESSORY_TYPES.has(value.toLocaleLowerCase());
}

function isHomeActivewear(occasion: string) {
  return occasion.toLocaleLowerCase() === "home & activewear";
}

function normalizeTaxonomyType(occasion: string, garmentGroup: GarmentGroup, value: string) {
  if (isHomeActivewear(occasion) && garmentGroup === "Tops" && ["t-shirts", "workout tops"].includes(value.toLocaleLowerCase())) {
    return "T-shirts / workout tops";
  }
  if (garmentGroup === "Tops" && ["jackets", "hoodies", "jackets / hoodies"].includes(value.toLocaleLowerCase())) {
    return "Jackets / Hoodies";
  }
  return value;
}

function cloneDefaultGarmentTypes() {
  return Object.fromEntries(
    Object.entries(DEFAULT_GARMENT_TYPES).map(([occasion, groups]) => [
      occasion,
      Object.fromEntries(GARMENT_GROUPS.map((group) => [group, [...groups[group]]])) as Record<GarmentGroup, string[]>,
    ]),
  ) as Record<string, Record<GarmentGroup, string[]>>;
}

export const DEFAULT_TAXONOMY: WardrobeTaxonomy = {
  occasions: [...DEFAULT_OCCASIONS],
  garmentTypes: cloneDefaultGarmentTypes(),
};

export function normalizeTaxonomy(value: unknown): WardrobeTaxonomy {
  const candidate = value && typeof value === "object"
    ? value as { occasions?: unknown; garmentTypes?: unknown }
    : {};
  const inputOccasions = Array.isArray(candidate.occasions) ? uniqueNames(candidate.occasions) : [];
  const occasions = uniqueNames(inputOccasions.length ? inputOccasions : DEFAULT_TAXONOMY.occasions);
  if (!hasOther(occasions)) occasions.push("Other");

  const inputGarmentTypes = candidate.garmentTypes && typeof candidate.garmentTypes === "object"
    ? candidate.garmentTypes as Record<string, unknown>
    : {};
  const garmentTypes: Record<string, Record<GarmentGroup, string[]>> = {};

  for (const occasion of occasions) {
    const inputGroups = inputGarmentTypes[occasion] && typeof inputGarmentTypes[occasion] === "object"
      ? inputGarmentTypes[occasion] as Record<string, unknown>
      : {};
    const defaults = DEFAULT_TAXONOMY.garmentTypes[occasion] ?? {
      Tops: ["Other"],
      Bottoms: ["Other"],
      Accessories: ["Towels", "Belts", "Accessories", "Other"],
      Other: ["Other"],
    };
    garmentTypes[occasion] = Object.fromEntries(GARMENT_GROUPS.map((group) => {
      const rawSupplied = Array.isArray(inputGroups[group]) ? inputGroups[group] as unknown[] : [];
      const supplied = uniqueNames(rawSupplied)
        .filter((value) => !isRemovedGarmentType(value))
        .map((value) => normalizeTaxonomyType(occasion, group, value))
        .filter((value) => group !== "Other" || !isLegacyAccessoryType(value));
      const legacyAccessories = group === "Accessories" && Array.isArray(inputGroups.Other)
        ? uniqueNames(inputGroups.Other as unknown[]).filter(isLegacyAccessoryType)
        : [];
      const values = group === "Accessories"
        ? uniqueNames([...(defaults[group] ?? []), ...supplied, ...legacyAccessories])
        : supplied.length ? supplied : [...(defaults[group] ?? ["Other"])];
      return [group, hasOther(values) ? values : [...values, "Other"]];
    })) as Record<GarmentGroup, string[]>;
  }

  return { occasions, garmentTypes };
}

export function normalizeStoredOccasions(value: unknown, fallback: unknown = "Other") {
  const supplied = Array.isArray(value) ? value : [value ?? fallback];
  const occasions: string[] = [];
  const seen = new Set<string>();
  for (const candidate of supplied) {
    if (typeof candidate !== "string") continue;
    const occasion = candidate.trim();
    const key = occasion.toLocaleLowerCase();
    if (!occasion || seen.has(key)) continue;
    seen.add(key);
    occasions.push(occasion);
  }
  return occasions.length ? occasions : [typeof fallback === "string" && fallback.trim() ? fallback.trim() : "Other"];
}

function getItemOccasions(item: TaxonomyItem) {
  return normalizeStoredOccasions(item.occasions, item.occasion);
}

export function getOccasionOptions(items: TaxonomyItem[] = [], taxonomy: WardrobeTaxonomy = DEFAULT_TAXONOMY) {
  const retained = Array.from(new Set(items.flatMap((item) => getItemOccasions(item))))
    .filter((occasion) => !taxonomy.occasions.some((known) => known.toLocaleLowerCase() === occasion.toLocaleLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  return [...taxonomy.occasions, ...retained];
}

export function getGarmentGroupOptions() {
  return [...GARMENT_GROUPS];
}

export function getGarmentTypes(occasion: string, garmentGroup: string, taxonomy: WardrobeTaxonomy = DEFAULT_TAXONOMY) {
  if (!GARMENT_GROUPS.includes(garmentGroup as GarmentGroup)) return ["Other"];
  return taxonomy.garmentTypes[occasion]?.[garmentGroup as GarmentGroup] ?? ["Other"];
}

export function getGarmentTypeOptions(
  occasion: string | string[],
  garmentGroup: string,
  items: TaxonomyItem[] = [],
  taxonomy: WardrobeTaxonomy = DEFAULT_TAXONOMY,
) {
  const occasions = normalizeStoredOccasions(occasion);
  const options = uniqueNames(occasions.flatMap((candidateOccasion) => getGarmentTypes(candidateOccasion, garmentGroup, taxonomy)));
  const retained = Array.from(new Set(items
    .filter((item) => item.garmentGroup === garmentGroup && getItemOccasions(item).some((itemOccasion) => occasions.some((candidate) => candidate.toLocaleLowerCase() === itemOccasion.toLocaleLowerCase())))
    .map((item) => item.garmentType?.trim() || "")
    .filter(Boolean)))
    .filter((garmentType) => !options.some((option) => option.toLocaleLowerCase() === garmentType.toLocaleLowerCase()))
    .sort((a, b) => a.localeCompare(b));
  return [...options, ...retained];
}

export function getAllGarmentTypeOptions(
  items: TaxonomyItem[] = [],
  taxonomy: WardrobeTaxonomy = DEFAULT_TAXONOMY,
  occasion = "all",
  garmentGroup = "all",
) {
  const occasions = occasion === "all" ? getOccasionOptions(items, taxonomy) : [occasion];
  const groups = garmentGroup === "all" ? GARMENT_GROUPS : [garmentGroup as GarmentGroup];
  const options: string[] = [];

  for (const candidateOccasion of occasions) {
    for (const candidateGroup of groups) {
      options.push(...getGarmentTypeOptions(candidateOccasion, candidateGroup, items, taxonomy));
    }
  }

  return uniqueNames(options);
}

export function normalizeStoredGarmentGroup(value: unknown) {
  return typeof value === "string" && GARMENT_GROUPS.includes(value as GarmentGroup) ? value as GarmentGroup : "Other";
}

export function normalizeStoredGarmentType(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "Other";
  if (["joggers", "workout bottoms"].includes(normalized.toLocaleLowerCase())) return "Other";
  if (["jackets", "hoodies", "jackets / hoodies"].includes(normalized.toLocaleLowerCase())) return "Jackets / Hoodies";
  return normalized;
}

export function normalizeStoredGarmentClassification(
  occasionValue: unknown,
  garmentGroupValue: unknown,
  garmentTypeValue: unknown,
) {
  const occasions = normalizeStoredOccasions(occasionValue, "");
  let garmentGroup = normalizeStoredGarmentGroup(garmentGroupValue);
  let garmentType = normalizeStoredGarmentType(garmentTypeValue);
  if (garmentGroup === "Other" && isLegacyAccessoryType(garmentType)) {
    garmentGroup = "Accessories";
  }
  for (const occasion of occasions) {
    garmentType = normalizeTaxonomyType(occasion, garmentGroup, garmentType);
  }
  return { garmentGroup, garmentType };
}

export function normalizeFormGarmentType(
  occasion: string | string[],
  garmentGroup: string,
  value: unknown,
  items: TaxonomyItem[] = [],
  taxonomy: WardrobeTaxonomy = DEFAULT_TAXONOMY,
) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const options = getGarmentTypeOptions(occasion, garmentGroup, items, taxonomy);
  return normalized && options.some((option) => option.toLocaleLowerCase() === normalized.toLocaleLowerCase())
    ? options.find((option) => option.toLocaleLowerCase() === normalized.toLocaleLowerCase()) ?? normalized
    : "Other";
}
