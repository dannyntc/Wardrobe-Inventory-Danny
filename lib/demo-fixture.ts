import { cloneDefaultKeywordRules, type KeywordRule } from "./keyword-rules";
import type { WardrobeColour } from "./wardrobe-colours";
import { DEFAULT_TAXONOMY, type WardrobeTaxonomy } from "./wardrobe-taxonomy";
import type { ClothingItem, Location, PhotoReference } from "./wardrobe-types";

export type DemoStarterContent = {
  items: ClothingItem[];
  taxonomy: WardrobeTaxonomy;
  keywordRules: KeywordRule[];
};

const DEMO_DATE = "2026-01-15T00:00:00.000Z";

function demoPhoto(path: string, filename: string): PhotoReference {
  return {
    pathname: `demo/${filename}`,
    filename,
    contentType: "image/svg+xml",
    size: 0,
    localPath: path,
  };
}

function demoItem({
  id,
  name,
  occasion,
  garmentGroup,
  garmentType,
  colour,
  brand,
  quantity = 1,
  location,
  photo,
}: {
  id: string;
  name: string;
  occasion: string;
  garmentGroup: ClothingItem["garmentGroup"];
  garmentType: string;
  colour: WardrobeColour;
  brand: string;
  quantity?: number;
  location: Location;
  photo: PhotoReference;
}): ClothingItem {
  return {
    id,
    name,
    occasion,
    occasions: [occasion],
    garmentGroup,
    garmentType,
    colour,
    brand,
    needsClassification: false,
    notes: "",
    quantity,
    location,
    photo,
    createdAt: DEMO_DATE,
    updatedAt: DEMO_DATE,
  };
}

const shirt = demoPhoto("/demo-images/shirt.svg", "sample-shirt.svg");
const trousers = demoPhoto("/demo-images/trousers.svg", "sample-trousers.svg");
const accessories = demoPhoto("/demo-images/accessories.svg", "sample-accessories.svg");
const sneakers = demoPhoto("/demo-images/sneakers.svg", "sample-sneakers.svg");

const DEMO_ITEMS: ClothingItem[] = [
  demoItem({ id: "demo-001", name: "Sky blue dress shirt", occasion: "Formal", garmentGroup: "Tops", garmentType: "Dress shirts", colour: "Light Blue", brand: "Northline", location: "girlfriend", photo: shirt }),
  demoItem({ id: "demo-002", name: "Navy overshirt", occasion: "Smart casual", garmentGroup: "Tops", garmentType: "Overshirts", colour: "Navy Blue", brand: "Field Notes", location: "girlfriend", photo: shirt }),
  demoItem({ id: "demo-003", name: "Charcoal jeans", occasion: "Casual", garmentGroup: "Bottoms", garmentType: "Jeans", colour: "Dark Grey", brand: "Common Ground", location: "girlfriend", photo: trousers }),
  demoItem({ id: "demo-004", name: "White everyday sneakers", occasion: "Casual", garmentGroup: "Other", garmentType: "Sneakers", colour: "White", brand: "Stepwise", location: "girlfriend", photo: sneakers }),
  demoItem({ id: "demo-005", name: "Olive training tee", occasion: "Home & activewear", garmentGroup: "Tops", garmentType: "T-shirts / workout tops", colour: "Olive", brand: "Motion", quantity: 2, location: "girlfriend", photo: shirt }),
  demoItem({ id: "demo-006", name: "Sand chinos", occasion: "Smart casual", garmentGroup: "Bottoms", garmentType: "Chinos", colour: "Beige", brand: "Common Ground", location: "girlfriend", photo: trousers }),
  demoItem({ id: "demo-007", name: "Brown leather belt", occasion: "Formal", garmentGroup: "Accessories", garmentType: "Belts", colour: "Brown", brand: "Morrow", location: "girlfriend", photo: accessories }),
  demoItem({ id: "demo-008", name: "Black lounge shorts", occasion: "Home & activewear", garmentGroup: "Bottoms", garmentType: "Shorts", colour: "Black", brand: "Motion", location: "girlfriend", photo: trousers }),
  demoItem({ id: "demo-009", name: "White knit polo", occasion: "Smart casual", garmentGroup: "Tops", garmentType: "Polos", colour: "White", brand: "Harbor & Thread", location: "home", photo: shirt }),
  demoItem({ id: "demo-010", name: "Black weekend hoodie", occasion: "Casual", garmentGroup: "Tops", garmentType: "Jackets / Hoodies", colour: "Black", brand: "Northline", location: "home", photo: shirt }),
  demoItem({ id: "demo-011", name: "Indigo jeans", occasion: "Casual", garmentGroup: "Bottoms", garmentType: "Jeans", colour: "Blue", brand: "Common Ground", quantity: 2, location: "home", photo: trousers }),
  demoItem({ id: "demo-012", name: "Cream pocket tee", occasion: "Casual", garmentGroup: "Tops", garmentType: "T-shirts", colour: "Cream", brand: "Everyday", location: "home", photo: shirt }),
  demoItem({ id: "demo-013", name: "Navy tailored trousers", occasion: "Formal", garmentGroup: "Bottoms", garmentType: "Trousers", colour: "Navy", brand: "Morrow", location: "home", photo: trousers }),
  demoItem({ id: "demo-014", name: "Canvas tote", occasion: "Casual", garmentGroup: "Accessories", garmentType: "Accessories", colour: "Beige", brand: "Harbor & Thread", location: "home", photo: accessories }),
  demoItem({ id: "demo-015", name: "Grey sleep set", occasion: "Home & activewear", garmentGroup: "Other", garmentType: "Sleepwear", colour: "Grey", brand: "Rest Day", location: "home", photo: shirt }),
  demoItem({ id: "demo-016", name: "Black everyday sneakers", occasion: "Casual", garmentGroup: "Other", garmentType: "Sneakers", colour: "Black", brand: "Stepwise", location: "home", photo: sneakers }),
];

export function createDemoStarterContent(): DemoStarterContent {
  return {
    items: DEMO_ITEMS.map((item) => ({ ...item, photo: item.photo ? { ...item.photo } : undefined })),
    taxonomy: JSON.parse(JSON.stringify(DEFAULT_TAXONOMY)) as WardrobeTaxonomy,
    keywordRules: cloneDefaultKeywordRules(),
  };
}

