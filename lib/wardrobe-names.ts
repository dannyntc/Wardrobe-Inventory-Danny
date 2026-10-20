import type { WardrobeColour } from "./wardrobe-colours";

type NameSuggestionInput = {
  existingName: string;
  brand: string;
  colour: WardrobeColour | string;
  garmentGroup: string;
  garmentType: string;
};

const BRAND_DISPLAY_NAMES: Record<string, string> = {
  army: "Army",
  ntubs: "NTUBS",
  padini: "Padini",
  superdry: "Superdry",
  uniqlo: "UNIQLO",
};

const GARMENT_DISPLAY_NAMES: Record<string, string> = {
  accessories: "Accessory",
  belts: "Belt",
  chinos: "Chinos",
  "dress shirts": "Dress Shirt",
  "dress shoes": "Dress Shoes",
  jeans: "Jeans",
  jackets: "Jacket",
  loafers: "Loafers",
  polos: "Polo",
  shirts: "Shirt",
  shorts: "Shorts",
  sneakers: "Sneakers",
  suits: "Suit",
  "t-shirts": "T-shirt",
  "t-shirts / workout tops": "T-shirt",
  towels: "Towel",
  trousers: "Trousers",
};

const RETAINED_DESCRIPTORS = [
  { key: "checkered", label: "Checkered" },
  { key: "corduroy", label: "Corduroy" },
  { key: "hashira", label: "Hashira" },
  { key: "basic", label: "Basic" },
  { key: "long sleeve", label: "Long-sleeve" },
  { key: "long-sleeve", label: "Long-sleeve" },
] as const;

function titleCase(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word ? `${word[0].toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}` : word)
    .join(" ");
}

function canonicalBrand(value: string) {
  const normalized = value.trim();
  return BRAND_DISPLAY_NAMES[normalized.toLocaleLowerCase()] ?? normalized;
}

export function formatItemName(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => {
      const brand = BRAND_DISPLAY_NAMES[word.toLocaleLowerCase()];
      if (brand) return brand;
      return word ? `${word[0].toLocaleUpperCase()}${word.slice(1).toLocaleLowerCase()}` : word;
    })
    .join(" ");
}

function getColourLabel(colour: string, sourceName: string) {
  const normalized = colour.trim();
  if (!normalized || normalized.toLocaleLowerCase() === "unspecified") return "";

  const source = sourceName.toLocaleLowerCase();
  const colourKey = normalized.toLocaleLowerCase();
  const modifier = ["dark", "light"].find((candidate) => source.includes(`${candidate} ${colourKey}`));
  if (modifier) return `${titleCase(modifier)} ${titleCase(normalized)}`;
  if (colourKey === "olive" && source.includes("green")) return "Olive Green";
  return titleCase(normalized);
}

function getGarmentLabel(garmentGroup: string, garmentType: string, sourceName: string) {
  const source = sourceName.toLocaleLowerCase();
  if (source.includes("work pants")) return "Work Pants";
  if (source.includes("singlet")) return "Singlet";
  if (source.includes("workout top")) return "Workout Top";

  const normalizedType = garmentType.trim().toLocaleLowerCase();
  if (!normalizedType || normalizedType === "other") return "";
  if (normalizedType === "t-shirts / workout tops" && garmentGroup === "Tops") return "T-shirt";
  return GARMENT_DISPLAY_NAMES[normalizedType] ?? titleCase(garmentType.replace(/s$/i, ""));
}

function getDescriptors(sourceName: string, garmentLabel: string) {
  const source = sourceName.toLocaleLowerCase();
  return RETAINED_DESCRIPTORS
    .filter(({ key }) => source.includes(key))
    .map(({ label }) => label)
    .filter((label) => label !== garmentLabel);
}

export function getSuggestedItemName(input: NameSuggestionInput) {
  const sourceName = input.existingName.trim();
  const brand = canonicalBrand(input.brand);
  const colour = getColourLabel(input.colour, sourceName);
  const garment = getGarmentLabel(input.garmentGroup, input.garmentType, sourceName);
  if (!garment) return "";

  const descriptors = getDescriptors(sourceName, garment);
  return [brand, colour, ...descriptors, garment].filter(Boolean).join(" ");
}
