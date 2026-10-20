import type { WardrobeColour } from "./wardrobe-colours";
import type { GarmentGroup } from "./wardrobe-taxonomy";

export type Location = "girlfriend" | "home";

export type WardrobeLocation = {
  id: Location;
  letter: string;
  name: string;
  shortName: string;
  tone: string;
};

export type PhotoReference = {
  pathname: string;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp" | "image/svg+xml";
  size: number;
  localPath?: string;
};

export type ClothingItem = {
  id: string;
  name: string;
  occasion: string;
  occasions?: string[];
  garmentGroup: GarmentGroup;
  garmentType: string;
  colour: WardrobeColour;
  brand: string;
  needsClassification?: boolean;
  notes: string;
  quantity: number;
  location: Location;
  photo?: PhotoReference;
  createdAt: string;
  updatedAt: string;
};
