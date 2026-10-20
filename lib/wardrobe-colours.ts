export const COLOUR_OPTIONS = [
  "Unspecified",
  "Black",
  "White",
  "Grey",
  "Light Grey",
  "Dark Grey",
  "Navy",
  "Navy Blue",
  "Light Navy Blue",
  "Dark Navy Blue",
  "Blue",
  "Light Blue",
  "Dark Blue",
  "Green",
  "Light Green",
  "Dark Green",
  "Olive",
  "Light Olive",
  "Dark Olive",
  "Brown",
  "Beige",
  "Cream",
  "Yellow",
  "Light Yellow",
  "Dark Yellow",
  "Orange",
  "Light Orange",
  "Dark Orange",
  "Red",
  "Light Red",
  "Dark Red",
  "Pink",
  "Light Pink",
  "Dark Pink",
  "Purple",
  "Light Purple",
  "Dark Purple",
  "Multicolour",
  "Other",
] as const;

export type WardrobeColour = (typeof COLOUR_OPTIONS)[number];

export function normalizeStoredColour(value: unknown): WardrobeColour {
  if (typeof value !== "string") return "Unspecified";
  const normalized = value.trim().toLocaleLowerCase();
  return COLOUR_OPTIONS.find((colour) => colour.toLocaleLowerCase() === normalized) ?? "Unspecified";
}
