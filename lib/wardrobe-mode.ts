export type WardrobeMode = "personal" | "demo";

export function getWardrobeMode(): WardrobeMode {
  const configured = process.env.WARDROBE_MODE?.trim().toLocaleLowerCase();
  if (!configured || configured === "personal") return "personal";
  if (configured === "demo") return "demo";
  throw new Error("WARDROBE_MODE must be unset, personal, or demo.");
}
