import { createDemoStarterContent } from "../lib/demo-fixture";
import { getWardrobeMode } from "../lib/wardrobe-mode";
import type { WardrobePageConfig } from "./editable-page";
import { EditablePage } from "./editable-page";

const PERSONAL_LOCATIONS: WardrobePageConfig["locations"] = [
  {
    id: "girlfriend",
    letter: "A",
    name: process.env.WARDROBE_LOCATION_A_NAME || "Location A",
    shortName: process.env.WARDROBE_LOCATION_A_SHORT_NAME || "Location A",
    tone: "blue",
  },
  {
    id: "home",
    letter: "B",
    name: process.env.WARDROBE_LOCATION_B_NAME || "Location B",
    shortName: process.env.WARDROBE_LOCATION_B_SHORT_NAME || "Location B",
    tone: "amber",
  },
];

const DEMO_LOCATIONS: WardrobePageConfig["locations"] = [
  { id: "girlfriend", letter: "A", name: "Location A", shortName: "Location A", tone: "blue" },
  { id: "home", letter: "B", name: "Location B", shortName: "Location B", tone: "amber" },
];

export default function Page() {
  const mode = getWardrobeMode();
  const config: WardrobePageConfig = mode === "demo"
    ? {
      mode,
      locations: DEMO_LOCATIONS,
      demoStarter: createDemoStarterContent(),
      brandLabel: "Wardrobe demo",
      title: "Where clothes live.",
      eyebrow: "Fictional clothing inventory",
      description: "Explore the board, try the filters, move pieces between locations, and save a sandbox copy in this browser.",
    }
    : {
      mode,
      locations: PERSONAL_LOCATIONS,
      brandLabel: process.env.WARDROBE_BRAND_LABEL || "Wardrobe",
      title: "Where things live.",
      eyebrow: "Men’s clothing inventory",
      description: "Keep track of your clothes at both places. Add items, adjust quantities, move them between homes, and save your changes.",
    };

  return <EditablePage config={config} />;
}
