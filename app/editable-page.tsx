/*
THESIS: A split closet worktable makes location the primary fact; it refuses the generic page-editor preview and puts clothing cards directly in the first viewport.
OWN-WORLD: Cool chalk, ink navy, cobalt controls, and saffron draft signals; crisp worktable borders, A/B index plates, compact metadata, and tactile sortable cards.
STORY: Visitors immediately understand what lives at each place, can add or move a piece locally, and can tell whether the shared board is saved.
FIRST VIEWPORT: A compact brand/status rail sits above two equal location columns, each with its count, add action, and live sortable list; record actions stay in the utility rail.
FORM: Operate-mode split worktable, grounded direction 6 from seed 678f39ff, staged as two equal location surfaces with the card list as the hero interaction.
*/

"use client";

import {
  AlertCircle,
  ArrowLeftRight,
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Cloud,
  House,
  Info,
  GripVertical,
  LayoutGrid,
  Layers,
  List,
  Minus,
  Package,
  PanelBottom,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShoppingBag,
  Shirt,
  SlidersHorizontal,
  Sun,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragOverEvent,
  DragStartEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  UniqueIdentifier,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { upload } from "@vercel/blob/client";
import { DragEvent as ReactDragEvent, FormEvent, KeyboardEvent as ReactKeyboardEvent, useEffect, useRef, useState } from "react";
import {
  GARMENT_GROUPS,
  getAllGarmentTypeOptions,
  getGarmentGroupOptions,
  getGarmentTypeOptions,
  getOccasionOptions,
  DEFAULT_TAXONOMY,
  normalizeTaxonomy,
  normalizeFormGarmentType,
  normalizeStoredGarmentClassification,
  normalizeStoredGarmentGroup,
  normalizeStoredOccasions,
  normalizeStoredGarmentType,
  type GarmentGroup,
  type WardrobeTaxonomy,
} from "../lib/wardrobe-taxonomy";
import {
  COLOUR_OPTIONS,
  normalizeStoredColour,
  type WardrobeColour,
} from "../lib/wardrobe-colours";
import {
  cloneDefaultKeywordRules,
  getKeywordRuleTargetLabel,
  isKeywordRuleTarget,
  KEYWORD_RULE_LIMITS,
  normalizeKeywordRules,
  suggestKeywordClassification,
  getDefaultBrandOptions,
  type KeywordRule,
  type KeywordRuleTarget,
} from "../lib/keyword-rules";
import { formatItemName, getSuggestedItemName } from "../lib/wardrobe-names";
import { canUseDemoStorage, clearDemoRecord, DEMO_DRAFT_KEY, DEMO_SAVED_BOARD_KEY, readDemoRecord, writeDemoRecord } from "../lib/demo-storage";
import type { ClothingItem, Location, PhotoReference, WardrobeLocation } from "../lib/wardrobe-types";
import type { DemoStarterContent } from "../lib/demo-fixture";

type LoadState = "loading" | "ready" | "saving" | "error";
type ViewMode = "overview" | "list";
type BrowsePath = { occasion?: string; garmentGroup?: GarmentGroup };

type ItemForm = {
  name: string;
  occasions: string[];
  garmentGroup: GarmentGroup;
  garmentType: string;
  colour: WardrobeColour;
  brand: string;
  notes: string;
  quantity: number;
  location: Location;
  photo?: PhotoReference;
};

type ClassificationField = "occasion" | "garmentGroup" | "garmentType" | "brand" | "colour";
type FormManualFields = Record<ClassificationField, boolean>;
type KeywordRuleDraft = {
  keywords: string;
  occasion: string;
  garmentGroup: "" | GarmentGroup;
  garmentType: string;
  brand: string;
  colour: "" | WardrobeColour;
  priority: number;
  enabled: boolean;
};

const BOARD_SCHEMA_VERSION = 7;
const DRAFT_STORAGE_KEY = "wardrobe-inventory-unsaved-draft-v2";

export type WardrobePageConfig = {
  mode: "personal" | "demo";
  locations: WardrobeLocation[];
  demoStarter?: DemoStarterContent;
  brandLabel: string;
  title: string;
  eyebrow: string;
  description: string;
};

const emptyForm: ItemForm = {
  name: "",
  occasions: ["Casual"],
  garmentGroup: "Tops",
  garmentType: "Other",
  colour: "Unspecified",
  brand: "",
  notes: "",
  quantity: 1,
  location: "girlfriend",
};

const defaultManualFields: FormManualFields = {
  occasion: false,
  garmentGroup: false,
  garmentType: false,
  brand: false,
  colour: false,
};

const emptyKeywordRuleDraft: KeywordRuleDraft = {
  keywords: "",
  occasion: "",
  garmentGroup: "",
  garmentType: "",
  brand: "",
  colour: "",
  priority: 50,
  enabled: true,
};

const PHOTO_MAX_SIZE = 10 * 1024 * 1024;
const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

function getPhotoUrl(photo: PhotoReference) {
  return photo.localPath ?? `/api/photos?path=${encodeURIComponent(photo.pathname)}`;
}

function getPhotoExtension(contentType: PhotoReference["contentType"]) {
  return contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
}

function serializeBoard(items: ClothingItem[], taxonomy: WardrobeTaxonomy, keywordRules: KeywordRule[]) {
  return JSON.stringify({ schemaVersion: BOARD_SCHEMA_VERSION, items, taxonomy, keywordRules });
}

type SavedDraft = {
  schemaVersion: number;
  baseRevision: string | null;
  items: ClothingItem[];
  taxonomy: WardrobeTaxonomy;
  keywordRules: KeywordRule[];
  migrationRequired: boolean;
};

function readSavedDraft(): SavedDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(DRAFT_STORAGE_KEY) || "null") as Partial<SavedDraft> | null;
    if (
      !value ||
      (value.schemaVersion !== 2 && value.schemaVersion !== 3 && value.schemaVersion !== 4 && value.schemaVersion !== 5 && value.schemaVersion !== 6 && value.schemaVersion !== BOARD_SCHEMA_VERSION) ||
      !Array.isArray(value.items) ||
      !value.taxonomy ||
      (value.keywordRules !== undefined && !Array.isArray(value.keywordRules)) ||
      (typeof value.baseRevision !== "string" && value.baseRevision !== null) ||
      typeof value.migrationRequired !== "boolean"
    ) return null;
    return {
      ...(value as SavedDraft),
      schemaVersion: BOARD_SCHEMA_VERSION,
      keywordRules: Array.isArray(value.keywordRules) ? value.keywordRules : cloneDefaultKeywordRules(),
      migrationRequired: value.migrationRequired || value.schemaVersion !== BOARD_SCHEMA_VERSION,
    };
  } catch {
    return null;
  }
}

function writeSavedDraft(draft: SavedDraft) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // Draft recovery is best effort when browser storage is unavailable.
  }
}

function clearSavedDraft() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function formatDate(value: string | null) {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not saved yet";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function createItemId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `item-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getItemsForLocation(items: ClothingItem[], location: Location) {
  return items.filter((item) => item.location === location);
}

function getLocationName(location: Location, locations: WardrobeLocation[]) {
  return locations.find((candidate) => candidate.id === location)?.name ?? location;
}

function getLocationShortName(location: Location, locations: WardrobeLocation[]) {
  return locations.find((candidate) => candidate.id === location)?.shortName ?? location;
}

function normalizeOccasionSelection(primary: string, selected: string[]) {
  const selectedSet = new Set(selected);
  if (!(primary === "Formal" || primary === "Smart casual" || primary === "Casual")) return [primary];

  const occasions = [primary];
  const append = (occasion: string) => {
    if (occasion !== primary && selectedSet.has(occasion)) occasions.push(occasion);
  };

  if (primary === "Formal") {
    append("Smart casual");
    if (selectedSet.has("Smart casual")) append("Casual");
  } else if (primary === "Smart casual") {
    append("Formal");
    append("Casual");
  } else {
    append("Smart casual");
    if (selectedSet.has("Smart casual")) append("Formal");
  }

  return occasions;
}

function getOccasionChoices(primary: string, selected: string[]) {
  const hasSmartCasual = selected.includes("Smart casual");
  if (primary === "Formal") {
    return [
      { value: "Smart casual", label: "Also Smart casual" },
      ...(hasSmartCasual ? [{ value: "Casual", label: "Also Casual" }] : []),
    ];
  }
  if (primary === "Smart casual") {
    return [
      { value: "Formal", label: "Also Formal" },
      { value: "Casual", label: "Also Casual" },
    ];
  }
  if (primary === "Casual") {
    return [
      { value: "Smart casual", label: "Also Smart casual" },
      ...(hasSmartCasual ? [{ value: "Formal", label: "Also Formal" }] : []),
    ];
  }
  return [];
}

function getOtherLocation(location: Location): Location {
  return location === "girlfriend" ? "home" : "girlfriend";
}

function getTotalQuantity(items: ClothingItem[]) {
  return items.reduce((total, item) => total + item.quantity, 0);
}

function getItemsForOccasion(items: ClothingItem[], occasion: string) {
  return items.filter((item) => normalizeStoredOccasions(item.occasions, item.occasion).includes(occasion));
}

function getItemsForGroup(items: ClothingItem[], occasion: string, garmentGroup: GarmentGroup) {
  return getItemsForOccasion(items, occasion).filter((item) => item.garmentGroup === garmentGroup);
}

function clampQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(999, Math.max(1, Math.trunc(value)));
}

function clampTransferQuantity(value: number, available: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(available, Math.max(1, Math.trunc(value)));
}

function normalizeBrand(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function getBrandOptions(items: ClothingItem[], selectedBrand = "") {
  const values = Array.from(new Map(items
    .map((item) => normalizeBrand(item.brand))
    .filter(Boolean)
    .map((brand) => [brand.toLocaleLowerCase(), brand] as const)).values())
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  for (const brand of getDefaultBrandOptions()) {
    if (!values.some((candidate) => candidate.toLocaleLowerCase() === brand.toLocaleLowerCase())) values.push(brand);
  }
  if (selectedBrand && !values.some((brand) => brand.toLocaleLowerCase() === selectedBrand.toLocaleLowerCase())) {
    values.push(selectedBrand);
  }
  return values.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function normalizeItem(item: ClothingItem) {
  const occasions = normalizeStoredOccasions(item.occasions, item.occasion);
  const classification = normalizeStoredGarmentClassification(occasions, item.garmentGroup, item.garmentType);
  return {
    ...item,
    occasion: occasions[0],
    occasions,
    garmentGroup: classification.garmentGroup,
    garmentType: classification.garmentType,
    colour: normalizeStoredColour(item.colour),
    brand: normalizeBrand(item.brand),
    needsClassification: item.needsClassification === true,
    quantity: Math.max(1, item.quantity ?? 1),
  };
}

function sameOccasionSet(left: string[], right: string[]) {
  const normalize = (values: string[]) => values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean).sort();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.length === normalizedRight.length && normalizedLeft.every((value, index) => value === normalizedRight[index]);
}

function aggregateItems(items: ClothingItem[]) {
  const groups = new Map<string, ClothingItem>();
  for (const item of items) {
    const normalizedItem = normalizeItem(item);
    if (normalizedItem.needsClassification) {
      groups.set(`flagged::${normalizedItem.id}`, normalizedItem);
      continue;
    }
    const occasionKey = normalizedItem.occasions.map((occasion) => occasion.toLocaleLowerCase()).sort().join("|");
    const key = `${normalizedItem.location}::${normalizedItem.name.trim().toLocaleLowerCase()}::${occasionKey}::${normalizedItem.garmentGroup.toLocaleLowerCase()}::${normalizedItem.garmentType.trim().toLocaleLowerCase()}::${normalizedItem.colour.toLocaleLowerCase()}::${normalizedItem.brand.toLocaleLowerCase()}::${normalizedItem.photo?.pathname ?? ""}`;
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, normalizedItem);
      continue;
    }
    const notes = [existing.notes, normalizedItem.notes].filter(Boolean).filter((note, index, all) => all.indexOf(note) === index).join(" · ");
    groups.set(key, {
      ...existing,
      quantity: existing.quantity + normalizedItem.quantity,
      notes,
      updatedAt: existing.updatedAt > normalizedItem.updatedAt ? existing.updatedAt : normalizedItem.updatedAt,
    });
  }
  return Array.from(groups.values());
}

function getDropLocation(over: DragOverEvent["over"], items: ClothingItem[]): Location | null {
  if (!over) return null;
  const data = over.data.current as { location?: Location } | undefined;
  if (data?.location) return data.location;
  return items.find((item) => item.id === over.id)?.location ?? null;
}

function moveItemToLocation(
  items: ClothingItem[],
  activeId: UniqueIdentifier,
  location: Location,
  overId: UniqueIdentifier,
) {
  const active = items.find((item) => item.id === activeId);
  if (!active || active.location === location) return items;

  const remaining = items.filter((item) => item.id !== activeId);
  const destination = remaining.filter((item) => item.location === location);
  const targetIndex = destination.findIndex((item) => item.id === overId);
  const nextItem = { ...active, location, updatedAt: new Date().toISOString() };
  destination.splice(targetIndex < 0 ? destination.length : targetIndex, 0, nextItem);

  return [...remaining.filter((item) => item.location !== location), ...destination];
}

function reorderWithinLocation(items: ClothingItem[], location: Location, activeId: UniqueIdentifier, overId: UniqueIdentifier) {
  const locationItems = getItemsForLocation(items, location);
  const oldIndex = locationItems.findIndex((item) => item.id === activeId);
  const newIndex = locationItems.findIndex((item) => item.id === overId);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return items;
  const reordered = arrayMove(locationItems, oldIndex, newIndex);
  let index = 0;
  return items.map((item) => (item.location === location ? reordered[index++] : item));
}

function StatusIcon({ state, dirty }: { state: LoadState; dirty: boolean }) {
  if (state === "error") return <AlertCircle size={16} aria-hidden="true" />;
  if (state === "saving") return <Cloud size={16} aria-hidden="true" />;
  if (dirty) return <TriangleAlert size={16} aria-hidden="true" />;
  return <Check size={16} aria-hidden="true" />;
}

function PhotoThumbnail({ photo, name, onOpen }: { photo: PhotoReference; name: string; onOpen: (photo: PhotoReference, name: string) => void }) {
  return (
    <button className="photo-thumbnail" type="button" onClick={() => onOpen(photo, name)} aria-label={`View photo of ${name}`}>
      <img src={getPhotoUrl(photo)} alt="" loading="lazy" />
    </button>
  );
}

function ColourAutocomplete({
  value,
  onChange,
}: {
  value: WardrobeColour;
  onChange: (value: WardrobeColour) => void;
}) {
  const [query, setQuery] = useState<string>(value);
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const listId = "colour-autocomplete-options";
  const matches: WardrobeColour[] = query.trim()
    ? COLOUR_OPTIONS.filter((colour) => colour.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : [];

  useEffect(() => {
    setQuery(value);
  }, [value]);

  function selectColour(colour: WardrobeColour) {
    onChange(colour);
    setQuery(colour);
    setOpen(false);
    setHighlightedIndex(0);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && matches.length) {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp" && matches.length) {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && open && matches[highlightedIndex]) {
      event.preventDefault();
      selectColour(matches[highlightedIndex]);
    } else if (event.key === "Escape") {
      setQuery(value);
      setOpen(false);
      setHighlightedIndex(0);
    }
  }

  return (
    <div className="colour-autocomplete">
      <input
        role="combobox"
        aria-autocomplete="list"
        aria-haspopup="listbox"
        aria-expanded={open && matches.length > 0}
        aria-controls={listId}
        aria-activedescendant={open && matches[highlightedIndex] ? `${listId}-${matches[highlightedIndex]}` : undefined}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(event.target.value.trim().length > 0);
          setHighlightedIndex(0);
        }}
        onFocus={(event) => event.currentTarget.select()}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          window.setTimeout(() => {
            setQuery(value);
            setOpen(false);
            setHighlightedIndex(0);
          }, 0);
        }}
        placeholder="Type to search colours"
      />
      {open && matches.length ? (
        <div className="colour-suggestions" id={listId} role="listbox" aria-label="Matching colours">
          {matches.map((colour, index) => (
            <button
              className="colour-suggestion"
              data-active={index === highlightedIndex || undefined}
              id={`${listId}-${colour}`}
              key={colour}
              type="button"
              role="option"
              aria-selected={colour === value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectColour(colour)}
            >
              {colour}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SortableItem({
  item,
  locations,
  dragDisabled = false,
  expanded = false,
  showGarmentType = true,
  onToggleExpanded,
  onEdit,
  onDelete,
  onMove,
  onQuantityChange,
  onKeyboardMove,
  onPhotoOpen,
}: {
  item: ClothingItem;
  locations: WardrobeLocation[];
  dragDisabled?: boolean;
  expanded?: boolean;
  showGarmentType?: boolean;
  onToggleExpanded: (itemId: string) => void;
  onEdit: (item: ClothingItem) => void;
  onDelete: (item: ClothingItem) => void;
  onMove: (item: ClothingItem) => void;
  onQuantityChange: (item: ClothingItem, quantity: number) => void;
  onKeyboardMove: (event: ReactKeyboardEvent<HTMLButtonElement>, item: ClothingItem) => void;
  onPhotoOpen: (photo: PhotoReference, name: string) => void;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: item.id,
    data: { type: "item", location: item.location },
    disabled: dragDisabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const occasions = normalizeStoredOccasions(item.occasions, item.occasion);
  const detailId = `item-details-${item.id}`;

  return (
    <article ref={setNodeRef} className={`item-card${expanded ? " item-card-expanded" : ""}`} data-dragging={isDragging || undefined} style={style}>
      {item.photo ? <PhotoThumbnail photo={item.photo} name={item.name} onOpen={onPhotoOpen} /> : null}
      <div className="item-card-main">
        <button
          className="item-card-summary"
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? detailId : undefined}
          onClick={() => onToggleExpanded(item.id)}
        >
          <span className="item-card-summary-copy">
            <h3>{item.name}</h3>
            {showGarmentType ? <span className="item-card-summary-type">{item.garmentType}</span> : null}
          </span>
          <span className="quantity-chip">× {item.quantity}</span>
          <ChevronDown className="item-card-chevron" size={17} aria-hidden="true" />
        </button>
        {expanded ? (
          <div className="item-card-details" id={detailId}>
            <div className="item-detail-list">
              <span className="item-detail"><strong>Occasion</strong>{occasions.join(", ")}</span>
              <span className="item-detail"><strong>Category</strong>{item.garmentGroup} · {item.garmentType}</span>
              {item.colour !== "Unspecified" ? <span className="item-detail"><strong>Colour</strong>{item.colour}</span> : null}
              {item.brand ? <span className="item-detail"><strong>Brand</strong>{item.brand}</span> : null}
            </div>
            {item.needsClassification ? <span className="classification-chip">Needs classification</span> : null}
            {item.notes ? <p className="item-notes">{item.notes}</p> : null}
            <div className="card-quantity-editor" role="group" aria-label={`Quantity for ${item.name}`}>
              <span className="card-quantity-label">Qty</span>
              <button
                className="card-quantity-step"
                type="button"
                onClick={() => onQuantityChange(item, item.quantity - 1)}
                disabled={item.quantity <= 1}
                aria-label={`Decrease ${item.name} quantity`}
              >
                <Minus size={14} aria-hidden="true" />
              </button>
              <input
                aria-label={`${item.name} quantity`}
                inputMode="numeric"
                min="1"
                max="999"
                type="number"
                value={item.quantity}
                onChange={(event) => onQuantityChange(item, Number(event.target.value))}
              />
              <button
                className="card-quantity-step"
                type="button"
                onClick={() => onQuantityChange(item, item.quantity + 1)}
                disabled={item.quantity >= 999}
                aria-label={`Increase ${item.name} quantity`}
              >
                <Plus size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <div className="item-card-actions">
          <button className="card-action" type="button" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button className="card-action card-action-danger" type="button" onClick={() => onDelete(item)} aria-label={`Delete ${item.name}`}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
          <button
            className="card-action move-card-button"
            type="button"
            onClick={() => onMove(item)}
            aria-label={`Move some or all of ${item.name} to ${getLocationName(getOtherLocation(item.location), locations)}`}
            title={`Move some or all to ${getLocationName(getOtherLocation(item.location), locations)}`}
          >
            <ArrowLeftRight size={16} aria-hidden="true" />
          </button>
          {!dragDisabled ? (
            <button
              className="drag-handle"
              type="button"
              {...attributes}
              {...listeners}
              onKeyDown={(event) => {
                onKeyboardMove(event, item);
                listeners?.onKeyDown?.(event);
              }}
              aria-label={`Reorder or move ${item.name}`}
              title="Drag to reorder or move"
            >
              <GripVertical size={18} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      ) : !dragDisabled ? (
        <div className="item-card-collapsed-actions">
          <button
            className="drag-handle"
            type="button"
            {...attributes}
            {...listeners}
            onKeyDown={(event) => {
              onKeyboardMove(event, item);
              listeners?.onKeyDown?.(event);
            }}
            aria-label={`Reorder or move ${item.name}`}
            title="Drag to reorder or move"
          >
            <GripVertical size={18} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </article>
  );
}

function OverviewTile({
  label,
  icon,
  types,
  pieces,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  types: number;
  pieces: number;
  onClick: () => void;
}) {
  const Icon = icon;

  return (
    <button className="overview-tile" type="button" onClick={onClick}>
      <span className="overview-tile-icon" aria-hidden="true">
        <Icon size={19} strokeWidth={2.3} fill="currentColor" />
      </span>
      <span className="overview-tile-copy">
        <strong>{label}</strong>
        <span>{types} {types === 1 ? "type" : "types"} · {pieces} {pieces === 1 ? "piece" : "pieces"}</span>
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  );
}

function getCategoryIcon(label: string, kind: "occasion" | "garmentGroup"): LucideIcon {
  const normalized = label.trim().toLocaleLowerCase();

  if (kind === "occasion") {
    if (normalized === "formal" || normalized.includes("dress") || normalized.includes("black tie")) return BriefcaseBusiness;
    if (normalized === "smart casual" || normalized.includes("smart") || normalized.includes("business") || normalized.includes("office")) return Shirt;
    if (normalized === "home & activewear" || normalized.includes("home") || normalized.includes("active") || normalized.includes("gym") || normalized.includes("workout")) return House;
    if (normalized === "casual" || normalized.includes("casual") || normalized.includes("weekend")) return Sun;
    return Layers;
  }

  if (normalized === "tops" || normalized.includes("top") || normalized.includes("shirt") || normalized.includes("upper")) return Shirt;
  if (normalized === "bottoms" || normalized.includes("bottom") || normalized.includes("trouser") || normalized.includes("jean") || normalized.includes("short")) return PanelBottom;
  if (normalized === "accessories" || normalized.includes("accessor") || normalized.includes("belt") || normalized.includes("towel") || normalized.includes("bag")) return ShoppingBag;
  if (normalized === "other") return Package;
  return Layers;
}

function LocationOverview({
  location,
  locations,
  items,
  taxonomy,
  browsePath,
  onNavigate,
  onBack,
  onAdd,
  onLocationRef,
  expandedItemId,
  onToggleExpanded,
  onEdit,
  onDelete,
  onMove,
  onQuantityChange,
  onKeyboardMove,
  onPhotoOpen,
}: {
  location: WardrobeLocation;
  locations: WardrobeLocation[];
  items: ClothingItem[];
  taxonomy: WardrobeTaxonomy;
  browsePath: BrowsePath;
  onNavigate: (location: Location, path: BrowsePath) => void;
  onBack: (location: Location) => void;
  onAdd: (location: Location, context?: BrowsePath) => void;
  onLocationRef: (location: Location, node: HTMLElement | null) => void;
  expandedItemId: string | null;
  onToggleExpanded: (itemId: string) => void;
  onEdit: (item: ClothingItem) => void;
  onDelete: (item: ClothingItem) => void;
  onMove: (item: ClothingItem) => void;
  onQuantityChange: (item: ClothingItem, quantity: number) => void;
  onKeyboardMove: (event: ReactKeyboardEvent<HTMLButtonElement>, item: ClothingItem) => void;
  onPhotoOpen: (photo: PhotoReference, name: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `overview-column-${location.id}`,
    data: { type: "column", location: location.id },
  });

  function setColumnRef(node: HTMLElement | null) {
    setNodeRef(node);
    onLocationRef(location.id, node);
  }

  const selectedOccasion = browsePath.occasion;
  const selectedGroup = browsePath.garmentGroup;
  const groupItems = selectedOccasion && selectedGroup ? getItemsForGroup(items, selectedOccasion, selectedGroup) : [];
  const itemGroups = Array.from(new Map(groupItems.map((item) => [item.garmentType, [] as ClothingItem[]])).keys())
    .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: "base" }))
    .map((garmentType) => ({
      garmentType,
      items: groupItems.filter((item) => item.garmentType === garmentType),
    }));

  const pageLabel = selectedGroup && selectedOccasion ? selectedGroup : selectedOccasion ?? "All occasions";

  return (
    <section ref={setColumnRef} className="location-column overview-column" data-tone={location.tone} data-over={isOver || undefined} aria-label={location.name}>
      <header className="location-header">
        <div className="location-title-group">
          <span className="location-letter" aria-hidden="true">{location.letter}</span>
          <div>
            <p className="location-kicker">{location.shortName}</p>
            <h2>{location.name}</h2>
          </div>
        </div>
        <div className="location-tools">
          <span className="item-count">{getTotalQuantity(items)} {getTotalQuantity(items) === 1 ? "piece" : "pieces"}</span>
          <button className="add-button" type="button" onClick={() => onAdd(location.id, browsePath)}>
            <Plus size={16} aria-hidden="true" />
            Add
          </button>
        </div>
      </header>

      <div className="overview-body">
        {selectedOccasion ? (
          <button className="overview-back" type="button" onClick={() => onBack(location.id)}>
            <ChevronLeft size={16} aria-hidden="true" />
            {selectedGroup ? selectedOccasion : "All occasions"}
          </button>
        ) : null}
        <div className="overview-breadcrumb" aria-live="polite">
          <span>{location.shortName}</span>
          {selectedOccasion ? <><ChevronRight size={14} aria-hidden="true" /><strong>{pageLabel}</strong></> : null}
        </div>

        {!selectedOccasion ? (
          <div className="overview-grid" aria-label={`${location.name} occasions`}>
            {taxonomy.occasions.map((occasion) => {
              const matchingItems = getItemsForOccasion(items, occasion);
              return (
                <OverviewTile
                  key={occasion}
                  label={occasion}
                  icon={getCategoryIcon(occasion, "occasion")}
                  types={matchingItems.length}
                  pieces={getTotalQuantity(matchingItems)}
                  onClick={() => onNavigate(location.id, { occasion })}
                />
              );
            })}
          </div>
        ) : !selectedGroup ? (
          <div className="overview-grid" aria-label={`${selectedOccasion} garment groups`}>
            {GARMENT_GROUPS.map((garmentGroup) => {
              const matchingItems = getItemsForGroup(items, selectedOccasion, garmentGroup);
              return (
                <OverviewTile
                  key={garmentGroup}
                  label={garmentGroup}
                  icon={getCategoryIcon(garmentGroup, "garmentGroup")}
                  types={matchingItems.length}
                  pieces={getTotalQuantity(matchingItems)}
                  onClick={() => onNavigate(location.id, { occasion: selectedOccasion, garmentGroup })}
                />
              );
            })}
          </div>
        ) : (
          <div className="overview-item-groups">
            <div className="overview-section-heading">
              <div>
                <p className="section-label">{selectedOccasion}</p>
                <h3>{selectedGroup}</h3>
              </div>
              <span>{groupItems.length} {groupItems.length === 1 ? "type" : "types"}</span>
            </div>
            {itemGroups.length ? itemGroups.map(({ garmentType, items: typeItems }) => (
              <section className="overview-item-group" key={garmentType}>
                <header>
                  <h4>{garmentType}</h4>
                  <span>{getTotalQuantity(typeItems)} {getTotalQuantity(typeItems) === 1 ? "piece" : "pieces"}</span>
                </header>
                <SortableContext items={typeItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
                  <div className="overview-item-list">
                    {typeItems.map((item) => (
                      <SortableItem
                        key={item.id}
                        item={item}
                        locations={locations}
                        dragDisabled
                        expanded={expandedItemId === item.id}
                        showGarmentType={false}
                        onToggleExpanded={onToggleExpanded}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        onMove={onMove}
                        onQuantityChange={onQuantityChange}
                        onKeyboardMove={onKeyboardMove}
                        onPhotoOpen={onPhotoOpen}
                      />
                    ))}
                  </div>
                </SortableContext>
              </section>
            )) : (
              <button className="empty-column overview-empty" type="button" onClick={() => onAdd(location.id, browsePath)}>
                <span className="empty-icon"><Shirt size={22} aria-hidden="true" /></span>
                <span className="empty-title">Nothing in {selectedGroup.toLocaleLowerCase()} yet</span>
                <span className="empty-copy">Add the first piece for {selectedOccasion}.</span>
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function LocationColumn({
  location,
  locations,
  items,
  totalItems,
  hasActiveFilters,
  onAdd,
  onLocationRef,
  onClearFilters,
  expandedItemId,
  onToggleExpanded,
  onEdit,
  onDelete,
  onMove,
  onQuantityChange,
  onKeyboardMove,
  onPhotoOpen,
}: {
  location: WardrobeLocation;
  locations: WardrobeLocation[];
  items: ClothingItem[];
  totalItems: ClothingItem[];
  hasActiveFilters: boolean;
  onAdd: (location: Location) => void;
  onLocationRef: (location: Location, node: HTMLElement | null) => void;
  onClearFilters: () => void;
  expandedItemId: string | null;
  onToggleExpanded: (itemId: string) => void;
  onEdit: (item: ClothingItem) => void;
  onDelete: (item: ClothingItem) => void;
  onMove: (item: ClothingItem) => void;
  onQuantityChange: (item: ClothingItem, quantity: number) => void;
  onKeyboardMove: (event: ReactKeyboardEvent<HTMLButtonElement>, item: ClothingItem) => void;
  onPhotoOpen: (photo: PhotoReference, name: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: `column-${location.id}`,
    data: { type: "column", location: location.id },
  });

  function setColumnRef(node: HTMLElement | null) {
    setNodeRef(node);
    onLocationRef(location.id, node);
  }

  return (
    <section ref={setColumnRef} className="location-column" data-tone={location.tone} data-over={isOver || undefined} aria-label={location.name}>
      <header className="location-header">
        <div className="location-title-group">
          <span className="location-letter" aria-hidden="true">{location.letter}</span>
          <div>
            <p className="location-kicker">{location.shortName}</p>
            <h2>{location.name}</h2>
          </div>
        </div>
        <div className="location-tools">
          <span className="item-count">
            {hasActiveFilters && items.length !== totalItems.length ? `${items.length} of ${totalItems.length} types` : `${items.length} ${items.length === 1 ? "type" : "types"}`}
            {items.length > 0 ? ` · ${getTotalQuantity(items)} ${getTotalQuantity(items) === 1 ? "piece" : "pieces"}` : ""}
          </span>
          <button className="add-button" type="button" onClick={() => onAdd(location.id)}>
            <Plus size={16} aria-hidden="true" />
            Add
          </button>
        </div>
      </header>

      <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
        <div className="item-list">
          {items.length > 0 ? (
            items.map((item) => (
              <SortableItem
                key={item.id}
                item={item}
                locations={locations}
                expanded={expandedItemId === item.id}
                onToggleExpanded={onToggleExpanded}
                onEdit={onEdit}
                onDelete={onDelete}
                onMove={onMove}
                onQuantityChange={onQuantityChange}
                onKeyboardMove={onKeyboardMove}
                onPhotoOpen={onPhotoOpen}
              />
            ))
          ) : (
            <button className="empty-column" type="button" onClick={hasActiveFilters ? onClearFilters : () => onAdd(location.id)}>
              <span className="empty-icon"><Shirt size={22} aria-hidden="true" /></span>
              <span className="empty-title">{hasActiveFilters ? "No matching pieces" : "Nothing here yet"}</span>
              <span className="empty-copy">{hasActiveFilters ? "Clear the filters to see everything here." : "Add the first piece or drag one across."}</span>
            </button>
          )}
        </div>
      </SortableContext>
    </section>
  );
}

type DemoStoredBoard = {
  schemaVersion: number;
  items: ClothingItem[];
  taxonomy: WardrobeTaxonomy;
  keywordRules: KeywordRule[];
  updatedAt: string | null;
};

type DemoStoredDraft = {
  schemaVersion: number;
  items: ClothingItem[];
  taxonomy: WardrobeTaxonomy;
  keywordRules: KeywordRule[];
  migrationRequired: boolean;
};

function isDemoStoredBoard(value: unknown): value is DemoStoredBoard {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoStoredBoard>;
  return candidate.schemaVersion === BOARD_SCHEMA_VERSION
    && Array.isArray(candidate.items)
    && candidate.items.every((item) => isDemoItem(item))
    && Boolean(candidate.taxonomy && typeof candidate.taxonomy === "object")
    && Array.isArray(candidate.keywordRules)
    && (candidate.updatedAt === null || typeof candidate.updatedAt === "string");
}

function isDemoStoredDraft(value: unknown): value is DemoStoredDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DemoStoredDraft>;
  return candidate.schemaVersion === BOARD_SCHEMA_VERSION
    && Array.isArray(candidate.items)
    && candidate.items.every((item) => isDemoItem(item))
    && Boolean(candidate.taxonomy && typeof candidate.taxonomy === "object")
    && Array.isArray(candidate.keywordRules)
    && typeof candidate.migrationRequired === "boolean";
}

function isDemoItem(value: unknown): value is ClothingItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ClothingItem>;
  return typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && typeof candidate.occasion === "string"
    && typeof candidate.garmentGroup === "string"
    && typeof candidate.garmentType === "string"
    && typeof candidate.colour === "string"
    && typeof candidate.brand === "string"
    && typeof candidate.notes === "string"
    && typeof candidate.quantity === "number"
    && (candidate.location === "girlfriend" || candidate.location === "home")
    && typeof candidate.createdAt === "string"
    && typeof candidate.updatedAt === "string";
}

export function EditablePage({ config }: { config: WardrobePageConfig }) {
  const locations = config.locations;
  const isDemoMode = config.mode === "demo";
  const [items, setItems] = useState<ClothingItem[]>([]);
  const [taxonomy, setTaxonomy] = useState<WardrobeTaxonomy>(DEFAULT_TAXONOMY);
  const [keywordRules, setKeywordRules] = useState<KeywordRule[]>(cloneDefaultKeywordRules());
  const [savedSnapshot, setSavedSnapshot] = useState(serializeBoard([], DEFAULT_TAXONOMY, cloneDefaultKeywordRules()));
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [message, setMessage] = useState("Loading board");
  const [storageConfigured, setStorageConfigured] = useState<boolean | null>(null);
  const [legacyContentPreserved, setLegacyContentPreserved] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [loadedRevision, setLoadedRevision] = useState<string | null>(null);
  const [hasLoadedBoard, setHasLoadedBoard] = useState(false);
  const [mobileAddLocation, setMobileAddLocation] = useState<Location>("girlfriend");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferItem, setTransferItem] = useState<ClothingItem | null>(null);
  const [transferQuantity, setTransferQuantity] = useState(1);
  const [transferError, setTransferError] = useState("");
  const [taxonomyDialogOpen, setTaxonomyDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ItemForm>(emptyForm);
  const [formManualFields, setFormManualFields] = useState<FormManualFields>(defaultManualFields);
  const [formError, setFormError] = useState("");
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoUploadProgress, setPhotoUploadProgress] = useState<number | null>(null);
  const [photoPreview, setPhotoPreview] = useState<{ photo: PhotoReference; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [occasionFilter, setOccasionFilter] = useState("all");
  const [garmentGroupFilter, setGarmentGroupFilter] = useState("all");
  const [garmentTypeFilter, setGarmentTypeFilter] = useState("all");
  const [colourFilter, setColourFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [browsePaths, setBrowsePaths] = useState<Record<Location, BrowsePath>>({ girlfriend: {}, home: {} });
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [dragStartItems, setDragStartItems] = useState<ClothingItem[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [taxonomyError, setTaxonomyError] = useState("");
  const [keywordRuleError, setKeywordRuleError] = useState("");
  const [keywordRuleDraft, setKeywordRuleDraft] = useState<KeywordRuleDraft>(emptyKeywordRuleDraft);
  const [editingKeywordRuleId, setEditingKeywordRuleId] = useState<string | null>(null);
  const [newOccasionName, setNewOccasionName] = useState("");
  const [newGarmentTypeName, setNewGarmentTypeName] = useState("");
  const [newGarmentTypeOccasion, setNewGarmentTypeOccasion] = useState("Casual");
  const [newGarmentTypeGroup, setNewGarmentTypeGroup] = useState<GarmentGroup>("Tops");
  const [editingOccasionName, setEditingOccasionName] = useState<string | null>(null);
  const [occasionEditValue, setOccasionEditValue] = useState("");
  const [editingGarmentType, setEditingGarmentType] = useState<{ occasion: string; garmentGroup: GarmentGroup; name: string } | null>(null);
  const [garmentTypeEditValue, setGarmentTypeEditValue] = useState("");
  const dialogRef = useRef<HTMLElement | null>(null);
  const transferDialogRef = useRef<HTMLElement | null>(null);
  const taxonomyDialogRef = useRef<HTMLElement | null>(null);
  const photoDialogRef = useRef<HTMLElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const dialogReturnFocusRef = useRef<HTMLElement | null>(null);
  const locationNodesRef = useRef<Partial<Record<Location, HTMLElement | null>>>({});
  const mobileAddLocationRef = useRef<Location>("girlfriend");
  const mobileSaveBarRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const isDirty = migrationRequired || serializeBoard(items, taxonomy, keywordRules) !== savedSnapshot;
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const hasActiveFilters = Boolean(normalizedSearch || occasionFilter !== "all" || garmentGroupFilter !== "all" || garmentTypeFilter !== "all" || colourFilter !== "all" || brandFilter !== "all");
  const activeFilterCount = [normalizedSearch, occasionFilter, garmentGroupFilter, garmentTypeFilter, colourFilter, brandFilter].filter((value) => value && value !== "all").length;
  const occasionOptions = getOccasionOptions(items, taxonomy);
  const garmentGroupOptions = getGarmentGroupOptions();
  const formOccasionOptions = editingId ? occasionOptions : taxonomy.occasions;
  const formGarmentGroupOptions = garmentGroupOptions;
  const formGarmentTypeOptions = getGarmentTypeOptions(form.occasions, form.garmentGroup, editingId ? items : [], taxonomy);
  const occasionChoices = getOccasionChoices(form.occasions[0] ?? "Other", form.occasions);
  const keywordRuleGarmentTypeOptions = keywordRuleDraft.garmentGroup
    ? keywordRuleDraft.occasion
      ? getGarmentTypeOptions(keywordRuleDraft.occasion, keywordRuleDraft.garmentGroup, items, taxonomy)
      : getAllGarmentTypeOptions(items, taxonomy, "all", keywordRuleDraft.garmentGroup)
    : ["Other"];
  const formKeywordSuggestion = form.name.trim()
    ? suggestKeywordClassification(form.name, keywordRules, taxonomy, {
      occasion: formManualFields.occasion ? form.occasions[0] : undefined,
      garmentGroup: formManualFields.garmentGroup ? form.garmentGroup : undefined,
      brand: formManualFields.brand ? form.brand : undefined,
      colour: formManualFields.colour ? form.colour : undefined,
    })
    : null;
  const suggestedItemName = getSuggestedItemName({
    existingName: form.name,
    brand: form.brand,
    colour: form.colour,
    garmentGroup: form.garmentGroup,
    garmentType: form.garmentType,
  });
  const shouldShowNameSuggestion = Boolean(suggestedItemName && suggestedItemName !== form.name.trim());
  const garmentTypeFilterOptions = getAllGarmentTypeOptions(items, taxonomy, occasionFilter, garmentGroupFilter);
  const brandFilterOptions = getBrandOptions(items, brandFilter !== "all" && brandFilter !== "Unspecified" ? brandFilter : "");
  const filteredItems = items.filter((item) => {
    const itemOccasions = normalizeStoredOccasions(item.occasions, item.occasion);
    const matchesOccasion = occasionFilter === "all" || itemOccasions.includes(occasionFilter);
    const matchesGarmentGroup = garmentGroupFilter === "all" || item.garmentGroup === garmentGroupFilter;
    const matchesGarmentType = garmentTypeFilter === "all" || item.garmentType === garmentTypeFilter;
    const matchesColour = colourFilter === "all" || item.colour === colourFilter;
    const matchesBrand = brandFilter === "all"
      || (brandFilter === "Unspecified" ? !item.brand : item.brand.toLocaleLowerCase() === brandFilter.toLocaleLowerCase());
    const haystack = `${item.name} ${itemOccasions.join(" ")} ${item.garmentGroup} ${item.garmentType} ${item.colour} ${item.brand} ${item.notes}`.toLocaleLowerCase();
    return matchesOccasion && matchesGarmentGroup && matchesGarmentType && matchesColour && matchesBrand && (!normalizedSearch || haystack.includes(normalizedSearch));
  });
  const activeItem = activeId ? items.find((item) => item.id === activeId) ?? null : null;
  const currentTransferItem = transferItem ? items.find((item) => item.id === transferItem.id) ?? null : null;
  const saveDisabled = !isDirty || !hasLoadedBoard || state === "loading" || state === "saving";
  const statusLabel = state === "loading"
    ? "Loading board"
    : state === "saving"
      ? "Saving board"
      : state === "error"
        ? message
        : isDirty
          ? "Unsaved changes"
          : message;

  async function loadContent() {
    setState("loading");
    setMessage("Loading board");
    setHasLoadedBoard(false);

    if (isDemoMode) {
      const starter = config.demoStarter;
      if (!starter) {
        setState("error");
        setMessage("The demo starter wardrobe is unavailable.");
        return;
      }

      const storageAvailable = canUseDemoStorage();
      const saved = readDemoRecord(DEMO_SAVED_BOARD_KEY, isDemoStoredBoard);
      const draft = readDemoRecord(DEMO_DRAFT_KEY, isDemoStoredDraft);
      const savedItems = aggregateItems(saved?.items ?? starter.items);
      const savedTaxonomy = normalizeTaxonomy(saved?.taxonomy ?? starter.taxonomy);
      const savedKeywordRules = normalizeKeywordRules(saved?.keywordRules ?? starter.keywordRules, savedTaxonomy);
      const draftItems = draft ? aggregateItems(draft.items) : null;
      const draftTaxonomy = draft ? normalizeTaxonomy(draft.taxonomy) : null;
      const draftKeywordRules = draft && draftTaxonomy ? normalizeKeywordRules(draft.keywordRules, draftTaxonomy) : null;
      const restoredDraft = Boolean(draftItems && draftTaxonomy && draftKeywordRules);
      const nextItems = draftItems ?? savedItems;
      const nextTaxonomy = draftTaxonomy ?? savedTaxonomy;
      const nextKeywordRules = draftKeywordRules ?? savedKeywordRules;

      setItems(nextItems);
      setTaxonomy(nextTaxonomy);
      setKeywordRules(nextKeywordRules);
      setSavedSnapshot(serializeBoard(savedItems, savedTaxonomy, savedKeywordRules));
      setLastSavedAt(saved?.updatedAt ?? null);
      setStorageConfigured(storageAvailable);
      setLegacyContentPreserved(false);
      setMigrationRequired(restoredDraft ? draft?.migrationRequired ?? false : false);
      setLoadedRevision(null);
      setHasLoadedBoard(true);
      setState("ready");
      setMessage(
        restoredDraft
          ? "Restored unsaved demo draft"
          : saved
            ? "Loaded saved demo in this browser"
            : storageAvailable
              ? "Demo ready · saves in this browser"
              : "Demo ready · browser saving unavailable",
      );
      return;
    }

    try {
      const response = await fetch("/api/content", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load the board.");
      const savedItems = aggregateItems(data.content.items as ClothingItem[]);
      const savedTaxonomy = normalizeTaxonomy(data.content.taxonomy);
      const savedKeywordRules = normalizeKeywordRules(data.content.keywordRules, savedTaxonomy);
      const draft = readSavedDraft();
      const draftItems = draft ? aggregateItems(draft.items) : null;
      const draftTaxonomy = draft ? normalizeTaxonomy(draft.taxonomy) : null;
      const draftKeywordRules = draft && draftTaxonomy ? normalizeKeywordRules(draft.keywordRules, draftTaxonomy) : null;
      const restoredDraft = Boolean(draftItems && draftTaxonomy && draftKeywordRules);
      const nextItems = draftItems ?? savedItems;
      const nextTaxonomy = draftTaxonomy ?? savedTaxonomy;
      const nextKeywordRules = draftKeywordRules ?? savedKeywordRules;
      setItems(nextItems);
      setTaxonomy(nextTaxonomy);
      setKeywordRules(nextKeywordRules);
      setSavedSnapshot(serializeBoard(savedItems, savedTaxonomy, savedKeywordRules));
      setLastSavedAt(data.content.updatedAt ?? null);
      setStorageConfigured(data.storageConfigured);
      setLegacyContentPreserved(Boolean(data.legacyContentPreserved));
      setMigrationRequired(restoredDraft ? Boolean(draft?.migrationRequired) : Boolean(data.migrationRequired));
      setLoadedRevision(data.revision ?? data.etag ?? null);
      setHasLoadedBoard(true);
      setState("ready");
      setMessage(
        restoredDraft
          ? "Restored unsaved draft"
          : data.source === "legacy"
          ? "Legacy content preserved"
          : data.source === "migration"
            ? "Existing items need classification"
          : data.source === "blob"
            ? "Loaded latest saved board"
            : data.storageConfigured
              ? "Ready for your first piece"
              : "Local mode · Blob storage not configured",
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to load the board.");
    }
  }

  useEffect(() => {
    void loadContent();
  }, []);

  useEffect(() => {
    if (!hasLoadedBoard) return;

    let frame = 0;
    const rootStyle = document.documentElement.style;
    const scheduleMeasurement = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const saveBar = mobileSaveBarRef.current;
        const saveBarHeight = saveBar?.getBoundingClientRect().height ?? 64;
        rootStyle.setProperty("--mobile-save-bar-height", `${saveBarHeight}px`);
        const usableBottom = Math.min(window.innerHeight, saveBar?.getBoundingClientRect().top ?? window.innerHeight);
        const marker = Math.max(0, usableBottom / 2);
        const sections = locations.flatMap((location) => {
          const node = locationNodesRef.current[location.id];
          return node ? [{ location: location.id, rect: node.getBoundingClientRect() }] : [];
        });
        if (!sections.length) return;

        const containing = sections.find(({ rect }) => rect.top <= marker && rect.bottom >= marker);
        const distances = sections.map((section) => ({
          ...section,
          distance: marker < section.rect.top ? section.rect.top - marker : marker > section.rect.bottom ? marker - section.rect.bottom : 0,
        }));
        const nearestDistance = Math.min(...distances.map((section) => section.distance));
        const nearest = distances.filter((section) => section.distance === nearestDistance);
        const nextLocation = containing?.location
          ?? (nearest.some((section) => section.location === mobileAddLocationRef.current)
            ? mobileAddLocationRef.current
            : nearest[0]?.location ?? mobileAddLocationRef.current);

        if (nextLocation !== mobileAddLocationRef.current) {
          mobileAddLocationRef.current = nextLocation;
          setMobileAddLocation(nextLocation);
        }
      });
    };

    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(scheduleMeasurement);
    for (const location of locations) {
      const node = locationNodesRef.current[location.id];
      if (node) resizeObserver?.observe(node);
    }
    if (mobileSaveBarRef.current) resizeObserver?.observe(mobileSaveBarRef.current);
    window.addEventListener("scroll", scheduleMeasurement, { passive: true });
    window.addEventListener("resize", scheduleMeasurement);
    scheduleMeasurement();

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      window.removeEventListener("scroll", scheduleMeasurement);
      window.removeEventListener("resize", scheduleMeasurement);
      rootStyle.removeProperty("--mobile-save-bar-height");
    };
  }, [hasLoadedBoard, items.length, filteredItems.length, dialogOpen, transferItem, taxonomyDialogOpen, photoPreview, locations]);

  useEffect(() => {
    if (!hasLoadedBoard) return;
    if (!isDirty) {
      if (isDemoMode) clearDemoRecord(DEMO_DRAFT_KEY);
      else clearSavedDraft();
      return;
    }
    if (isDemoMode) {
      writeDemoRecord(DEMO_DRAFT_KEY, {
        schemaVersion: BOARD_SCHEMA_VERSION,
        items: aggregateItems(items),
        taxonomy,
        keywordRules,
        migrationRequired,
      } satisfies DemoStoredDraft);
    } else {
      writeSavedDraft({
        schemaVersion: BOARD_SCHEMA_VERSION,
        baseRevision: loadedRevision,
        items: aggregateItems(items),
        taxonomy,
        keywordRules,
        migrationRequired,
      });
    }
  }, [hasLoadedBoard, isDirty, items, taxonomy, keywordRules, migrationRequired, loadedRevision, isDemoMode]);

  useEffect(() => {
    function confirmBeforeUnload(event: BeforeUnloadEvent) {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", confirmBeforeUnload);
    return () => window.removeEventListener("beforeunload", confirmBeforeUnload);
  }, [isDirty]);

  function handleReload() {
    if (isDirty && !window.confirm("You have unsaved changes. Reload and discard this draft?")) return;
    if (isDemoMode) clearDemoRecord(DEMO_DRAFT_KEY);
    else clearSavedDraft();
    void loadContent();
  }

  function resetDemo() {
    if (!isDemoMode) return;
    if (!window.confirm("Reset the demo to its fictional starter wardrobe? Your browser-saved demo changes will be removed.")) return;
    clearDemoRecord(DEMO_SAVED_BOARD_KEY);
    clearDemoRecord(DEMO_DRAFT_KEY);
    setSearchQuery("");
    setOccasionFilter("all");
    setGarmentGroupFilter("all");
    setGarmentTypeFilter("all");
    setColourFilter("all");
    setBrandFilter("all");
    setFiltersOpen(false);
    setViewMode("overview");
    setBrowsePaths({ girlfriend: {}, home: {} });
    setExpandedItemId(null);
    setDialogOpen(false);
    setTransferItem(null);
    setTaxonomyDialogOpen(false);
    void loadContent();
  }

  async function saveContent(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!isDirty || !hasLoadedBoard) return;
    setState("saving");
    setMessage(isDemoMode ? "Saving demo in this browser" : "Saving board to Blob");

    if (isDemoMode) {
      const savedContent: DemoStoredBoard = {
        schemaVersion: BOARD_SCHEMA_VERSION,
        items: aggregateItems(items),
        taxonomy,
        keywordRules,
        updatedAt: new Date().toISOString(),
      };
      if (!writeDemoRecord(DEMO_SAVED_BOARD_KEY, savedContent)) {
        setStorageConfigured(false);
        setState("error");
        setMessage("This browser blocked local saving. Your changes remain open, but Save could not persist them.");
        return;
      }
      setItems(savedContent.items);
      setTaxonomy(savedContent.taxonomy);
      setKeywordRules(savedContent.keywordRules);
      setSavedSnapshot(serializeBoard(savedContent.items, savedContent.taxonomy, savedContent.keywordRules));
      setLastSavedAt(savedContent.updatedAt);
      setStorageConfigured(true);
      setLegacyContentPreserved(false);
      setMigrationRequired(false);
      setLoadedRevision(null);
      clearDemoRecord(DEMO_DRAFT_KEY);
      setState("ready");
      setMessage("Saved in this browser");
      return;
    }

    try {
      const response = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaVersion: BOARD_SCHEMA_VERSION, revision: loadedRevision, items: aggregateItems(items), taxonomy, keywordRules }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 || data.code === "CONFLICT") {
          if (typeof data.revision === "string" || data.revision === null) {
            setLoadedRevision(data.revision);
          }
          setState("error");
          setMessage(data.error || "The saved board changed. Your draft is safe; save again to apply it to the latest board.");
          return;
        }
        throw new Error(data.error || "Unable to save the board.");
      }
      const savedItems = aggregateItems(data.content.items as ClothingItem[]);
      const savedTaxonomy = normalizeTaxonomy(data.content.taxonomy);
      const savedKeywordRules = normalizeKeywordRules(data.content.keywordRules, savedTaxonomy);
      setItems(savedItems);
      setTaxonomy(savedTaxonomy);
      setKeywordRules(savedKeywordRules);
      setSavedSnapshot(serializeBoard(savedItems, savedTaxonomy, savedKeywordRules));
      setLastSavedAt(data.content.updatedAt ?? null);
      setStorageConfigured(true);
      setLegacyContentPreserved(false);
      setMigrationRequired(false);
      setLoadedRevision(data.revision ?? data.blob?.etag ?? null);
      setState("ready");
      setMessage("Saved to Vercel Blob");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Unable to save the board.");
    }
  }

  function clearFilters() {
    setSearchQuery("");
    setOccasionFilter("all");
    setGarmentGroupFilter("all");
    setGarmentTypeFilter("all");
    setColourFilter("all");
    setBrandFilter("all");
  }

  function updateOccasionFilter(occasion: string) {
    setOccasionFilter(occasion);
    setGarmentTypeFilter((current) => current === "all" || occasion === "all" || getAllGarmentTypeOptions(items, taxonomy, occasion, garmentGroupFilter).includes(current) ? current : "all");
  }

  function updateGarmentGroupFilter(garmentGroup: string) {
    setGarmentGroupFilter(garmentGroup);
    setGarmentTypeFilter((current) => current === "all" || garmentGroup === "all" || getAllGarmentTypeOptions(items, taxonomy, occasionFilter, garmentGroup).includes(current) ? current : "all");
  }

  async function handlePhotoFile(file: File | undefined) {
    if (!file) return;
    if (!PHOTO_CONTENT_TYPES.includes(file.type as (typeof PHOTO_CONTENT_TYPES)[number])) {
      setFormError("Use a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > PHOTO_MAX_SIZE) {
      setFormError("Photos must be 10 MB or smaller.");
      return;
    }

    setFormError("");
    setPhotoUploading(true);
    setPhotoUploadProgress(0);
    try {
      const contentType = file.type as PhotoReference["contentType"];
      const pathname = `content/photos/photo-${createItemId()}.${getPhotoExtension(contentType)}`;
      const blob = await upload(pathname, file, {
        access: "private",
        handleUploadUrl: "/api/uploads",
        contentType,
        onUploadProgress: ({ percentage }) => setPhotoUploadProgress(percentage),
      });
      setForm((current) => ({
        ...current,
        photo: { pathname: blob.pathname, filename: file.name, contentType, size: file.size },
      }));
      setPhotoUploadProgress(100);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to upload this photo. Try again.");
    } finally {
      setPhotoUploading(false);
    }
  }

  function handlePhotoDrop(event: ReactDragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (photoUploading) return;
    if (event.dataTransfer.files.length !== 1) {
      setFormError("Drop one photo at a time.");
      return;
    }
    void handlePhotoFile(event.dataTransfer.files[0]);
  }

  function removePhoto() {
    setForm((current) => ({ ...current, photo: undefined }));
    setPhotoUploadProgress(null);
    setFormError("");
  }

  function openPhotoPreview(photo: PhotoReference, name: string) {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPhotoPreview({ photo, name });
  }

  function closePhotoPreview() {
    setPhotoPreview(null);
  }

  function openAddDialog(location: Location = "girlfriend", context: BrowsePath = {}) {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingId(null);
    setForm({
      ...emptyForm,
      location,
      occasions: context.occasion ? [context.occasion] : emptyForm.occasions,
      garmentGroup: context.garmentGroup ?? emptyForm.garmentGroup,
    });
    setFormManualFields(defaultManualFields);
    setFormError("");
    setPhotoUploadProgress(null);
    setDialogOpen(true);
  }

  function openEditDialog(item: ClothingItem) {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setEditingId(item.id);
    setFormManualFields({
      occasion: true,
      garmentGroup: true,
      garmentType: true,
      brand: Boolean(normalizeBrand(item.brand)),
      colour: normalizeStoredColour(item.colour) !== "Unspecified",
    });
    const occasions = normalizeStoredOccasions(item.occasions, item.occasion);
    setForm({
      name: item.name,
      occasions,
      garmentGroup: normalizeStoredGarmentGroup(item.garmentGroup),
      garmentType: normalizeStoredGarmentType(item.garmentType),
      colour: normalizeStoredColour(item.colour),
      brand: normalizeBrand(item.brand),
      notes: item.notes,
      quantity: item.quantity,
      location: item.location,
      photo: item.photo,
    });
    setFormError("");
    setPhotoUploadProgress(null);
    setDialogOpen(true);
  }

  function openTransferDialog(item: ClothingItem) {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTransferItem(item);
    setTransferQuantity(1);
    setTransferError("");
  }

  function openTaxonomyDialog() {
    dialogReturnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTaxonomyError("");
    setKeywordRuleError("");
    setKeywordRuleDraft(emptyKeywordRuleDraft);
    setEditingKeywordRuleId(null);
    setNewOccasionName("");
    setNewGarmentTypeName("");
    setNewGarmentTypeOccasion(taxonomy.occasions[0] ?? "Other");
    setNewGarmentTypeGroup("Tops");
    setEditingOccasionName(null);
    setEditingGarmentType(null);
    setTaxonomyDialogOpen(true);
  }

  function closeDialog() {
    if (photoUploading) return;
    setDialogOpen(false);
    setFormError("");
  }

  function closeTransferDialog() {
    setTransferItem(null);
    setTransferError("");
  }

  function closeTaxonomyDialog() {
    setTaxonomyDialogOpen(false);
    setTaxonomyError("");
    setEditingOccasionName(null);
    setEditingGarmentType(null);
  }

  function resetKeywordRuleEditor() {
    setKeywordRuleDraft({ ...emptyKeywordRuleDraft });
    setEditingKeywordRuleId(null);
    setKeywordRuleError("");
  }

  function updateKeywordRuleDraft<Key extends keyof KeywordRuleDraft>(key: Key, value: KeywordRuleDraft[Key]) {
    setKeywordRuleDraft((current) => {
      if (key === "occasion") return { ...current, occasion: value as string, garmentType: "" };
      if (key === "garmentGroup") return { ...current, garmentGroup: value as "" | GarmentGroup, garmentType: "" };
      return { ...current, [key]: value };
    });
    setKeywordRuleError("");
  }

  function startKeywordRuleEdit(rule: KeywordRule) {
    setEditingKeywordRuleId(rule.id);
    setKeywordRuleDraft({
      keywords: rule.keywords.join(", "),
      occasion: rule.target.occasion ?? "",
      garmentGroup: rule.target.garmentGroup ?? "",
      garmentType: rule.target.garmentType ?? "",
      brand: rule.target.brand ?? "",
      colour: rule.target.colour ?? "",
      priority: rule.priority,
      enabled: rule.enabled,
    });
    setKeywordRuleError("");
  }

  function saveKeywordRule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keywords = Array.from(new Map(
      keywordRuleDraft.keywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean)
        .map((keyword) => [keyword.toLocaleLowerCase(), keyword] as const),
    ).values()).slice(0, KEYWORD_RULE_LIMITS.maxAliasesPerRule);
    if (!keywords.length) {
      setKeywordRuleError("Add at least one keyword or phrase, separated by commas.");
      return;
    }
    if (keywordRuleDraft.keywords.split(",").some((keyword) => keyword.trim().length > KEYWORD_RULE_LIMITS.maxAliasLength)) {
      setKeywordRuleError(`Each keyword must be ${KEYWORD_RULE_LIMITS.maxAliasLength} characters or fewer.`);
      return;
    }
    if (keywordRules.length >= KEYWORD_RULE_LIMITS.maxRules && !editingKeywordRuleId) {
      setKeywordRuleError(`You can save up to ${KEYWORD_RULE_LIMITS.maxRules} keyword rules.`);
      return;
    }

    const target: KeywordRuleTarget = {};
    if (keywordRuleDraft.occasion) target.occasion = keywordRuleDraft.occasion;
    if (keywordRuleDraft.garmentGroup) target.garmentGroup = keywordRuleDraft.garmentGroup;
    if (keywordRuleDraft.garmentType) target.garmentType = keywordRuleDraft.garmentType;
    if (keywordRuleDraft.brand.trim()) target.brand = keywordRuleDraft.brand.trim();
    if (keywordRuleDraft.colour) target.colour = keywordRuleDraft.colour;
    if (target.garmentType && !target.garmentGroup) {
      setKeywordRuleError("Choose a group before choosing a garment type.");
      return;
    }
    if (!isKeywordRuleTarget(target)) {
      setKeywordRuleError("Choose at least one field for the rule to pre-fill.");
      return;
    }

    const priority = Number.isFinite(keywordRuleDraft.priority)
      ? Math.min(1000, Math.max(0, Math.trunc(keywordRuleDraft.priority)))
      : 50;
    const nextRule: KeywordRule = {
      id: editingKeywordRuleId ?? `rule-${createItemId()}`,
      keywords,
      enabled: keywordRuleDraft.enabled,
      priority,
      target,
    };
    setKeywordRules((current) => normalizeKeywordRules(
      editingKeywordRuleId
        ? current.map((rule) => rule.id === editingKeywordRuleId ? nextRule : rule)
        : [...current, nextRule],
      taxonomy,
    ));
    resetKeywordRuleEditor();
  }

  function toggleKeywordRule(id: string) {
    setKeywordRules((current) => current.map((rule) => rule.id === id ? { ...rule, enabled: !rule.enabled } : rule));
  }

  function deleteKeywordRule(rule: KeywordRule) {
    if (!window.confirm(`Delete the keyword rule for “${rule.keywords.join(", ")}”?`)) return;
    setKeywordRules((current) => current.filter((candidate) => candidate.id !== rule.id));
    if (editingKeywordRuleId === rule.id) resetKeywordRuleEditor();
  }

  function addOccasion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newOccasionName.trim();
    if (!name) {
      setTaxonomyError("Give the new occasion a name.");
      return;
    }
    if (occasionOptions.some((occasion) => occasion.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setTaxonomyError("That occasion already exists.");
      return;
    }
    setTaxonomy((current) => {
      const otherIndex = current.occasions.findIndex((occasion) => occasion.toLocaleLowerCase() === "other");
      const occasions = otherIndex < 0
        ? [...current.occasions, name]
        : [...current.occasions.slice(0, otherIndex), name, ...current.occasions.slice(otherIndex)];
      return {
        occasions,
        garmentTypes: {
          ...current.garmentTypes,
          [name]: { Tops: ["Other"], Bottoms: ["Other"], Accessories: ["Other"], Other: ["Other"] },
        },
      };
    });
    setNewOccasionName("");
    setTaxonomyError("");
  }

  function startOccasionEdit(occasion: string) {
    setEditingOccasionName(occasion);
    setOccasionEditValue(occasion);
    setTaxonomyError("");
  }

  function renameOccasion(occasion: string) {
    const name = occasionEditValue.trim();
    if (!name) {
      setTaxonomyError("Occasion names cannot be empty.");
      return;
    }
    if (occasion.toLocaleLowerCase() === "other") {
      setTaxonomyError("The Other occasion is required as a safe fallback.");
      return;
    }
    if (occasionOptions.some((candidate) => candidate !== occasion && candidate.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setTaxonomyError("That occasion already exists.");
      return;
    }
    setTaxonomy((current) => {
      const nextGarmentTypes = { ...current.garmentTypes };
      nextGarmentTypes[name] = Object.fromEntries(GARMENT_GROUPS.map((group) => [
        group,
        getGarmentTypeOptions(occasion, group, items, current),
      ])) as Record<GarmentGroup, string[]>;
      delete nextGarmentTypes[occasion];
      const occasions = current.occasions.includes(occasion)
        ? current.occasions.map((candidate) => candidate === occasion ? name : candidate)
        : [...current.occasions.filter((candidate) => candidate.toLocaleLowerCase() !== "other"), name, "Other"];
      return { occasions, garmentTypes: nextGarmentTypes };
    });
    setKeywordRules((current) => current.map((rule) => rule.target.occasion === occasion
      ? { ...rule, target: { ...rule.target, occasion: name } }
      : rule));
    setKeywordRuleDraft((current) => current.occasion === occasion ? { ...current, occasion: name } : current);
    setItems((current) => current.map((item) => {
      const occasions = normalizeStoredOccasions(item.occasions, item.occasion);
      if (!occasions.includes(occasion)) return item;
      const nextOccasions = occasions.map((candidate) => candidate === occasion ? name : candidate);
      return { ...item, occasion: nextOccasions[0], occasions: nextOccasions, updatedAt: new Date().toISOString() };
    }));
    setEditingOccasionName(null);
    setTaxonomyError("");
  }

  function deleteOccasion(occasion: string) {
    if (occasion.toLocaleLowerCase() === "other") {
      setTaxonomyError("The Other occasion is required as a safe fallback.");
      return;
    }
    const affectedItems = items.filter((item) => normalizeStoredOccasions(item.occasions, item.occasion).includes(occasion)).length;
    const detail = affectedItems ? ` ${affectedItems} item${affectedItems === 1 ? " will" : "s will"} move to Other / Other / Other.` : "";
    if (!window.confirm(`Delete the ${occasion} occasion?${detail}`)) return;
    setTaxonomy((current) => {
      const garmentTypes = { ...current.garmentTypes };
      delete garmentTypes[occasion];
      return { occasions: current.occasions.filter((candidate) => candidate !== occasion), garmentTypes };
    });
    setKeywordRules((current) => current.map((rule) => {
      if (rule.target.occasion !== occasion) return rule;
      const target = { ...rule.target };
      delete target.occasion;
      delete target.garmentType;
      return { ...rule, target, enabled: isKeywordRuleTarget(target) ? rule.enabled : false };
    }));
    setKeywordRuleDraft((current) => current.occasion === occasion ? { ...current, occasion: "", garmentType: "" } : current);
    setItems((current) => current.map((item) => {
      const occasions = normalizeStoredOccasions(item.occasions, item.occasion);
      if (!occasions.includes(occasion)) return item;
      const nextOccasions = occasions.filter((candidate) => candidate !== occasion);
      if (nextOccasions.length) return { ...item, occasion: nextOccasions[0], occasions: nextOccasions, updatedAt: new Date().toISOString() };
      return { ...item, occasion: "Other", occasions: ["Other"], garmentGroup: "Other", garmentType: "Other", updatedAt: new Date().toISOString() };
    }));
    setTaxonomyError("");
  }

  function addGarmentType(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newGarmentTypeName.trim();
    const occasion = newGarmentTypeOccasion;
    const garmentGroup = newGarmentTypeGroup;
    if (!name) {
      setTaxonomyError("Give the new garment type a name.");
      return;
    }
    if (getGarmentTypeOptions(occasion, garmentGroup, items, taxonomy).some((candidate) => candidate.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setTaxonomyError("That garment type already exists in this occasion and group.");
      return;
    }
    setTaxonomy((current) => {
      const currentOptions = getGarmentTypeOptions(occasion, garmentGroup, items, current);
      const otherIndex = currentOptions.findIndex((candidate) => candidate.toLocaleLowerCase() === "other");
      const garmentTypeOptions = otherIndex < 0
        ? [...currentOptions, name]
        : [...currentOptions.slice(0, otherIndex), name, ...currentOptions.slice(otherIndex)];
      const occasions = current.occasions.includes(occasion)
        ? current.occasions
        : [...current.occasions.filter((candidate) => candidate.toLocaleLowerCase() !== "other"), occasion, "Other"];
      return {
        occasions,
        garmentTypes: {
          ...current.garmentTypes,
          [occasion]: {
            ...(current.garmentTypes[occasion] ?? { Tops: ["Other"], Bottoms: ["Other"], Accessories: ["Other"], Other: ["Other"] }),
            [garmentGroup]: garmentTypeOptions,
          },
        },
      };
    });
    setNewGarmentTypeName("");
    setTaxonomyError("");
  }

  function startGarmentTypeEdit(occasion: string, garmentGroup: GarmentGroup, name: string) {
    setEditingGarmentType({ occasion, garmentGroup, name });
    setGarmentTypeEditValue(name);
    setTaxonomyError("");
  }

  function renameGarmentType(occasion: string, garmentGroup: GarmentGroup, oldName: string) {
    const name = garmentTypeEditValue.trim();
    if (!name) {
      setTaxonomyError("Garment type names cannot be empty.");
      return;
    }
    if (oldName.toLocaleLowerCase() === "other") {
      setTaxonomyError("The Other garment type is required as a safe fallback.");
      return;
    }
    if (getGarmentTypeOptions(occasion, garmentGroup, items, taxonomy).some((candidate) => candidate !== oldName && candidate.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setTaxonomyError("That garment type already exists in this occasion and group.");
      return;
    }
    setTaxonomy((current) => ({
      occasions: current.occasions.includes(occasion) ? current.occasions : [...current.occasions, occasion],
      garmentTypes: {
        ...current.garmentTypes,
        [occasion]: {
          ...(current.garmentTypes[occasion] ?? { Tops: ["Other"], Bottoms: ["Other"], Accessories: ["Other"], Other: ["Other"] }),
          [garmentGroup]: getGarmentTypeOptions(occasion, garmentGroup, items, current).map((candidate) => candidate === oldName ? name : candidate),
        },
      },
    }));
    setKeywordRules((current) => current.map((rule) => rule.target.occasion === occasion && rule.target.garmentGroup === garmentGroup && rule.target.garmentType === oldName
      ? { ...rule, target: { ...rule.target, garmentType: name } }
      : rule));
    setKeywordRuleDraft((current) => current.occasion === occasion && current.garmentGroup === garmentGroup && current.garmentType === oldName
      ? { ...current, garmentType: name }
      : current);
    setItems((current) => current.map((item) => normalizeStoredOccasions(item.occasions, item.occasion).includes(occasion) && item.garmentGroup === garmentGroup && item.garmentType === oldName
      ? { ...item, garmentType: name, updatedAt: new Date().toISOString() }
      : item));
    setEditingGarmentType(null);
    setTaxonomyError("");
  }

  function deleteGarmentType(occasion: string, garmentGroup: GarmentGroup, garmentType: string) {
    if (garmentType.toLocaleLowerCase() === "other") {
      setTaxonomyError("The Other garment type is required as a safe fallback.");
      return;
    }
    const affectedItems = items.filter((item) => normalizeStoredOccasions(item.occasions, item.occasion).includes(occasion) && item.garmentGroup === garmentGroup && item.garmentType === garmentType).length;
    const detail = affectedItems ? ` ${affectedItems} item${affectedItems === 1 ? " will" : "s will"} move to Other in this group.` : "";
    if (!window.confirm(`Delete ${garmentType} from ${occasion} / ${garmentGroup}?${detail}`)) return;
    setTaxonomy((current) => ({
      ...current,
      garmentTypes: {
        ...current.garmentTypes,
        [occasion]: {
          ...(current.garmentTypes[occasion] ?? { Tops: ["Other"], Bottoms: ["Other"], Accessories: ["Other"], Other: ["Other"] }),
          [garmentGroup]: getGarmentTypeOptions(occasion, garmentGroup, items, current).filter((candidate) => candidate !== garmentType),
        },
      },
    }));
    setKeywordRules((current) => current.map((rule) => {
      if (rule.target.occasion !== occasion || rule.target.garmentGroup !== garmentGroup || rule.target.garmentType !== garmentType) return rule;
      const target = { ...rule.target };
      delete target.garmentType;
      return { ...rule, target, enabled: isKeywordRuleTarget(target) ? rule.enabled : false };
    }));
    setKeywordRuleDraft((current) => current.occasion === occasion && current.garmentGroup === garmentGroup && current.garmentType === garmentType
      ? { ...current, garmentType: "" }
      : current);
    setItems((current) => current.map((item) => normalizeStoredOccasions(item.occasions, item.occasion).includes(occasion) && item.garmentGroup === garmentGroup && item.garmentType === garmentType
      ? { ...item, garmentType: "Other", updatedAt: new Date().toISOString() }
      : item));
    setTaxonomyError("");
  }

  useEffect(() => {
    if (!dialogOpen && !transferItem && !taxonomyDialogOpen && !photoPreview) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusableSelector = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex=\"-1\"])";
    const activeDialogRef = dialogOpen ? dialogRef : transferItem ? transferDialogRef : taxonomyDialogOpen ? taxonomyDialogRef : photoDialogRef;
    const focusDialog = () => {
      const firstFocusable = activeDialogRef.current?.querySelector<HTMLElement>(focusableSelector);
      firstFocusable?.focus();
    };
    const focusFrame = window.requestAnimationFrame(focusDialog);

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (dialogOpen) closeDialog();
        if (transferItem) closeTransferDialog();
        if (taxonomyDialogOpen) closeTaxonomyDialog();
        if (photoPreview) closePhotoPreview();
        return;
      }
      if (event.key !== "Tab" || !activeDialogRef.current) return;

      const focusableElements = Array.from(activeDialogRef.current.querySelectorAll<HTMLElement>(focusableSelector));
      if (!focusableElements.length) return;
      const firstFocusable = focusableElements[0];
      const lastFocusable = focusableElements[focusableElements.length - 1];
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault();
        lastFocusable.focus();
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault();
        firstFocusable.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleDialogKeyDown);
      document.body.style.overflow = previousOverflow;
      dialogReturnFocusRef.current?.focus();
      dialogReturnFocusRef.current = null;
    };
  }, [dialogOpen, transferItem, taxonomyDialogOpen, photoPreview]);

  function applyKeywordAutofill(current: ItemForm, manualFields: FormManualFields) {
    const suggestion = suggestKeywordClassification(current.name, keywordRules, taxonomy, {
      occasion: manualFields.occasion ? current.occasions[0] : undefined,
      garmentGroup: manualFields.garmentGroup ? current.garmentGroup : undefined,
      brand: manualFields.brand ? current.brand : undefined,
      colour: manualFields.colour ? current.colour : undefined,
    });
    const occasion = manualFields.occasion ? current.occasions[0] : suggestion.occasion ?? emptyForm.occasions[0];
    const occasions = manualFields.occasion ? current.occasions : [occasion];
    const garmentGroup = manualFields.garmentGroup ? current.garmentGroup : suggestion.garmentGroup ?? emptyForm.garmentGroup;
    const garmentTypeOptions = getGarmentTypeOptions(occasions, garmentGroup, items, taxonomy);
    const garmentType = manualFields.garmentType && garmentTypeOptions.some((option) => option.toLocaleLowerCase() === current.garmentType.toLocaleLowerCase())
      ? current.garmentType
      : suggestion.garmentType && garmentTypeOptions.some((option) => option.toLocaleLowerCase() === suggestion.garmentType?.toLocaleLowerCase())
        ? suggestion.garmentType
        : emptyForm.garmentType;
    const brand = manualFields.brand ? current.brand : suggestion.brand ?? "";
    const colour = manualFields.colour ? current.colour : suggestion.colour ?? "Unspecified";
    return { ...current, occasions, garmentGroup, garmentType, brand, colour };
  }

  function updatePrimaryOccasion(value: string) {
    const nextManualFields = { ...formManualFields, occasion: true, garmentGroup: false, garmentType: false };
    setFormManualFields(nextManualFields);
    setForm((current) => applyKeywordAutofill({
      ...current,
      occasions: normalizeOccasionSelection(value, current.occasions),
      garmentGroup: "Other",
      garmentType: "Other",
    }, nextManualFields));
  }

  function toggleOccasionTag(occasion: string, checked: boolean) {
    const nextManualFields = { ...formManualFields, occasion: true };
    setFormManualFields(nextManualFields);
    setForm((current) => {
      const primary = current.occasions[0] ?? "Other";
      const selected = new Set(current.occasions);
      if (checked) {
        selected.add(occasion);
        if (occasion === "Casual" && primary !== "Casual") selected.add("Smart casual");
        if (occasion === "Formal" && primary === "Casual") selected.add("Smart casual");
      } else {
        selected.delete(occasion);
        if (occasion === "Smart casual") {
          selected.delete("Casual");
          if (primary === "Casual") selected.delete("Formal");
        }
      }
      return applyKeywordAutofill({ ...current, occasions: normalizeOccasionSelection(primary, Array.from(selected)) }, nextManualFields);
    });
  }

  function updateForm<Key extends keyof ItemForm>(key: Key, value: ItemForm[Key]) {
    if (key === "name") {
      setForm((current) => {
        const next = { ...current, name: value as string };
        return applyKeywordAutofill(next, formManualFields);
      });
      return;
    }
    if (key === "garmentGroup") {
      const nextManualFields = { ...formManualFields, garmentGroup: true, garmentType: false };
      setFormManualFields(nextManualFields);
      setForm((current) => applyKeywordAutofill({ ...current, garmentGroup: value as GarmentGroup, garmentType: "Other" }, nextManualFields));
      return;
    }
    if (key === "garmentType") {
      setFormManualFields((currentFields) => ({ ...currentFields, garmentType: true }));
      setForm((current) => ({ ...current, garmentType: value as string }));
      return;
    }
    if (key === "brand") {
      const brand = value as string;
      setFormManualFields((currentFields) => ({ ...currentFields, brand: Boolean(brand.trim()) }));
      setForm((current) => ({ ...current, brand }));
      return;
    }
    if (key === "colour") {
      const colour = value as WardrobeColour;
      setFormManualFields((currentFields) => ({ ...currentFields, colour: colour !== "Unspecified" }));
      setForm((current) => ({ ...current, colour }));
      return;
    }
    setForm((current) => {
      return {
        ...current,
        [key]: value,
      };
    });
  }

  function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = formatItemName(form.name);
    if (!name) {
      setFormError("Give this piece a name before adding it.");
      return;
    }
    if (!Number.isInteger(form.quantity) || form.quantity < 1 || form.quantity > 999) {
      setFormError("Quantity must be a whole number from 1 to 999.");
      return;
    }

    const now = new Date().toISOString();
    if (editingId) {
      setItems((current) => current.map((item) => (
        item.id === editingId
          ? {
            ...item,
            name,
            occasion: normalizeStoredOccasions(form.occasions)[0],
            occasions: normalizeStoredOccasions(form.occasions),
            garmentGroup: normalizeStoredGarmentGroup(form.garmentGroup),
            garmentType: normalizeFormGarmentType(form.occasions, form.garmentGroup, form.garmentType, current, taxonomy),
            colour: normalizeStoredColour(form.colour),
            brand: normalizeBrand(form.brand),
            needsClassification: false,
            notes: form.notes.trim(),
            quantity: form.quantity,
            location: form.location,
            photo: form.photo,
            updatedAt: now,
          }
          : item
      )));
    } else {
      setItems((current) => {
        const occasions = normalizeStoredOccasions(form.occasions);
        const occasion = occasions[0];
        const garmentGroup = normalizeStoredGarmentGroup(form.garmentGroup);
        const garmentType = normalizeFormGarmentType(occasions, garmentGroup, form.garmentType, current, taxonomy);
        const notes = form.notes.trim();
        const colour = normalizeStoredColour(form.colour);
        const brand = normalizeBrand(form.brand);
        const duplicate = current.find((item) => !item.needsClassification && item.location === form.location && item.name.toLocaleLowerCase() === name.toLocaleLowerCase() && sameOccasionSet(item.occasions ?? [item.occasion], occasions) && item.garmentGroup === garmentGroup && item.garmentType === garmentType && item.colour === colour && item.brand.toLocaleLowerCase() === brand.toLocaleLowerCase() && item.photo?.pathname === form.photo?.pathname);
        if (duplicate) {
          return current.map((item) => item.id === duplicate.id ? { ...item, quantity: item.quantity + form.quantity, notes: [item.notes, notes].filter(Boolean).filter((note, index, all) => all.indexOf(note) === index).join(" · "), updatedAt: now } : item);
        }
        return [...current, { id: createItemId(), name, occasion, occasions, garmentGroup, garmentType, colour, brand, needsClassification: false, notes, quantity: form.quantity, location: form.location, ...(form.photo ? { photo: form.photo } : {}), createdAt: now, updatedAt: now }];
      });
    }
    closeDialog();
  }

  function deleteItem(item: ClothingItem) {
    if (!window.confirm(`Delete “${item.name}” from the board?`)) return;
    setItems((current) => current.filter((candidate) => candidate.id !== item.id));
  }

  function completeTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!transferItem) return;
    const source = items.find((item) => item.id === transferItem.id);
    if (!source) {
      setTransferError("This item is no longer on the board. Close this dialog and try again.");
      return;
    }

    if (!Number.isInteger(transferQuantity) || transferQuantity < 1 || transferQuantity > source.quantity) {
      setTransferError(`Move a whole number from 1 to ${source.quantity}.`);
      return;
    }

    const destination = getOtherLocation(source.location);
    const destinationMatch = items.find((candidate) => (
      candidate.id !== source.id &&
      !candidate.needsClassification &&
      candidate.location === destination &&
      candidate.name.toLocaleLowerCase() === source.name.toLocaleLowerCase() &&
      sameOccasionSet(candidate.occasions ?? [candidate.occasion], source.occasions ?? [source.occasion]) &&
      candidate.garmentGroup === source.garmentGroup &&
      candidate.garmentType === source.garmentType &&
      candidate.colour === source.colour &&
      candidate.brand.toLocaleLowerCase() === source.brand.toLocaleLowerCase() &&
      candidate.photo?.pathname === source.photo?.pathname
    ));

    if (destinationMatch && destinationMatch.quantity + transferQuantity > 999) {
      setTransferError("The destination quantity cannot exceed 999 pieces.");
      return;
    }

    const now = new Date().toISOString();
    setItems((current) => {
      const currentSource = current.find((item) => item.id === source.id);
      if (!currentSource || currentSource.quantity < transferQuantity) return current;
      const remainingQuantity = currentSource.quantity - transferQuantity;
      const currentDestination = current.find((item) => item.id === destinationMatch?.id);

      if (currentDestination) {
        return current
          .filter((item) => item.id !== currentSource.id)
          .map((item) => item.id === currentDestination.id
            ? {
              ...item,
              quantity: item.quantity + transferQuantity,
              notes: [item.notes, currentSource.notes].filter(Boolean).filter((note, index, all) => all.indexOf(note) === index).join(" · "),
              updatedAt: now,
            }
            : item)
          .concat(remainingQuantity > 0 ? [{ ...currentSource, quantity: remainingQuantity, updatedAt: now }] : []);
      }

      if (remainingQuantity === 0) {
        return current.map((item) => item.id === currentSource.id
          ? { ...currentSource, location: destination, updatedAt: now }
          : item);
      }

      return [
        ...current.map((item) => item.id === currentSource.id
          ? { ...currentSource, quantity: remainingQuantity, updatedAt: now }
          : item),
        { ...currentSource, id: createItemId(), quantity: transferQuantity, location: destination, createdAt: now, updatedAt: now },
      ];
    });

    const pieceLabel = transferQuantity === 1 ? "piece" : "pieces";
    setAnnouncement(`${transferQuantity} ${pieceLabel} of ${source.name} moved from ${getLocationName(source.location, locations)} to ${getLocationName(destination, locations)}. Changes are unsaved.`);
    closeTransferDialog();
  }

  function updateItemQuantity(item: ClothingItem, quantity: number) {
    const nextQuantity = clampQuantity(quantity);
    if (nextQuantity === item.quantity) return;
    const now = new Date().toISOString();
    setItems((current) => current.map((candidate) => (
      candidate.id === item.id
        ? { ...candidate, quantity: nextQuantity, updatedAt: now }
        : candidate
    )));
  }

  function handleDragStart(event: DragStartEvent) {
    setExpandedItemId(null);
    setActiveId(event.active.id);
    setDragStartItems(items.map((item) => ({ ...item })));
  }

  function handleDragOver(event: DragOverEvent) {
    const location = getDropLocation(event.over, items);
    if (!location || !activeId) return;
    setItems((current) => moveItemToLocation(current, activeId, location, event.over?.id ?? event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over) {
      setItems((current) => {
        const activeItemAtDrop = current.find((item) => item.id === active.id);
        const overItem = current.find((item) => item.id === over.id);
        if (!activeItemAtDrop || !overItem || active.id === over.id) return current;
        return reorderWithinLocation(current, activeItemAtDrop.location, active.id, over.id);
      });
    }
    setActiveId(null);
    setDragStartItems(null);
  }

  function handleDragCancel() {
    if (dragStartItems) setItems(dragStartItems);
    setActiveId(null);
    setDragStartItems(null);
  }

  function handleKeyboardMove(event: ReactKeyboardEvent<HTMLButtonElement>, item: ClothingItem) {
    if (activeId !== item.id || (event.code !== "ArrowLeft" && event.code !== "ArrowRight")) return;
    event.preventDefault();
    const nextLocation: Location = event.code === "ArrowLeft" ? "girlfriend" : "home";
    if (item.location === nextLocation) return;
    setItems((current) => moveItemToLocation(current, item.id, nextLocation, `column-${nextLocation}`));
  }

  function navigateOverview(location: Location, path: BrowsePath) {
    setExpandedItemId(null);
    setBrowsePaths((current) => ({ ...current, [location]: path }));
  }

  function goBackOverview(location: Location) {
    setExpandedItemId(null);
    setBrowsePaths((current) => {
      const currentPath = current[location];
      return {
        ...current,
        [location]: currentPath.garmentGroup
          ? { occasion: currentPath.occasion }
          : {},
      };
    });
  }

  function getMobileAddContext() {
    if (viewMode !== "overview" || hasActiveFilters) return {};
    return browsePaths[mobileAddLocationRef.current];
  }

  const storageLabel = storageConfigured === null
    ? isDemoMode ? "Checking browser saving" : "Checking storage"
    : storageConfigured
      ? isDemoMode ? "Saved in this browser" : "Blob storage connected"
      : isDemoMode ? "Browser saving unavailable" : "Local mode · storage unavailable";

  return (
    <main className="app-shell">
      <header className="masthead">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true"><Shirt size={22} /></span>
          <div>
            <p className="system-label">{config.brandLabel}</p>
            <h1>{config.title}</h1>
          </div>
        </div>
        <div className={`status-strip status-${state}`} data-dirty={isDirty || undefined} role="status" aria-live="polite">
          <StatusIcon state={state} dirty={isDirty} />
          <span>{statusLabel}</span>
        </div>
      </header>

      <section className="utility-rail" aria-label="Board controls">
        <div>
          <p className="section-label">{config.eyebrow}</p>
          <p className="lede">{config.description}</p>
        </div>
        <div className="utility-actions">
          {isDemoMode ? (
            <button className="secondary-button manage-button" type="button" onClick={resetDemo} disabled={state === "loading" || state === "saving"}>
              <RefreshCw size={17} aria-hidden="true" />
              Reset demo
            </button>
          ) : null}
          <button className="secondary-button manage-button" type="button" onClick={openTaxonomyDialog} disabled={state === "loading" || state === "saving"}>
            <Settings2 size={17} aria-hidden="true" />
            Manage wardrobe structure
          </button>
          <button className="save-button" type="button" onClick={() => void saveContent()} disabled={saveDisabled}>
            <Save size={17} aria-hidden="true" />
            {state === "saving" ? "Saving" : isDirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </section>

      {isDemoMode ? (
        <aside className="demo-banner" role="status">
          <Info size={19} aria-hidden="true" />
          <div>
            <strong>Public demo · fictional wardrobe</strong>
            <p>Your edits save only in this browser. They do not change the personal wardrobe or other visitors’ demos.</p>
          </div>
          <span className="demo-storage-label">{storageLabel}</span>
        </aside>
      ) : null}

      {legacyContentPreserved ? (
        <aside className="notice-banner" role="status">
          <TriangleAlert size={19} aria-hidden="true" />
          <div>
            <strong>Legacy page content preserved.</strong>
            <p>The old page document is still untouched in Blob. Your first explicit Save will replace it with this clothing board.</p>
          </div>
        </aside>
      ) : null}

      {migrationRequired ? (
        <aside className="notice-banner" role="status">
          <TriangleAlert size={19} aria-hidden="true" />
          <div>
            <strong>Some saved items need classification.</strong>
            <p>Existing entries are preserved under Other / Other / Other until you assign an occasion, group, and garment type. Save when you are ready.</p>
          </div>
        </aside>
      ) : null}

      {state === "error" ? (
        <aside className="error-banner" role="alert">
          <AlertCircle size={19} aria-hidden="true" />
          <div>
            <strong>{storageConfigured === false ? "Blob storage is unavailable." : "The board needs attention."}</strong>
            <p>{message}</p>
          </div>
        </aside>
      ) : null}

      <section className="board-filters" aria-label="Browse and filter clothing">
        <div className="search-field">
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            aria-label="Search clothing"
            placeholder="Search shirts, chinos, shoes, or notes"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          {searchQuery ? <button type="button" className="clear-filter-button" onClick={() => setSearchQuery("")} aria-label="Clear search"><X size={16} aria-hidden="true" /></button> : null}
        </div>
        <div className="browse-mode-toggle" role="group" aria-label="View mode">
          <button className="view-mode-button" data-active={viewMode === "overview" || undefined} type="button" onClick={() => { setExpandedItemId(null); setViewMode("overview"); }}>
            <LayoutGrid size={15} aria-hidden="true" />
            Overview
          </button>
          <button className="view-mode-button" data-active={viewMode === "list" || undefined} type="button" onClick={() => { setExpandedItemId(null); setViewMode("list"); }}>
            <List size={15} aria-hidden="true" />
            List
          </button>
        </div>
        <button className="filter-toggle" type="button" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen} aria-controls="wardrobe-filter-options">
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filters{activeFilterCount ? ` · ${activeFilterCount}` : ""}
        </button>
        <div className={`filter-options${filtersOpen ? " filter-options-open" : ""}`} id="wardrobe-filter-options">
          <label className="category-filter">
            <span>Occasion</span>
            <select value={occasionFilter} onChange={(event) => updateOccasionFilter(event.target.value)} aria-label="Filter by occasion">
              <option value="all">All occasions</option>
              {occasionOptions.map((occasion) => <option key={occasion} value={occasion}>{occasion}</option>)}
            </select>
          </label>
          <label className="category-filter">
            <span>Group</span>
            <select value={garmentGroupFilter} onChange={(event) => updateGarmentGroupFilter(event.target.value)} aria-label="Filter by garment group">
              <option value="all">All groups</option>
              {garmentGroupOptions.map((garmentGroup) => <option key={garmentGroup} value={garmentGroup}>{garmentGroup}</option>)}
            </select>
          </label>
          <label className="category-filter">
            <span>Garment type</span>
            <select value={garmentTypeFilter} onChange={(event) => setGarmentTypeFilter(event.target.value)} aria-label="Filter by garment type">
              <option value="all">All garment types</option>
              {garmentTypeFilterOptions.map((garmentType) => <option key={garmentType} value={garmentType}>{garmentType}</option>)}
            </select>
          </label>
          <label className="category-filter">
            <span>Colour</span>
            <select value={colourFilter} onChange={(event) => setColourFilter(event.target.value)} aria-label="Filter by colour">
              <option value="all">All colours</option>
              {COLOUR_OPTIONS.map((colour) => <option key={colour} value={colour}>{colour}</option>)}
            </select>
          </label>
          <label className="category-filter">
            <span>Brand</span>
            <select value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)} aria-label="Filter by brand">
              <option value="all">All brands</option>
              <option value="Unspecified">Unspecified</option>
              {brandFilterOptions.map((brand) => <option key={brand} value={brand}>{brand}</option>)}
            </select>
          </label>
          {hasActiveFilters ? <button className="clear-filters-button" type="button" onClick={clearFilters}>Clear filters</button> : null}
        </div>
        <span className="filter-result" aria-live="polite">
          {hasActiveFilters ? `${filteredItems.length} of ${items.length} types shown` : `${items.length} ${items.length === 1 ? "type" : "types"} · ${getTotalQuantity(items)} ${getTotalQuantity(items) === 1 ? "piece" : "pieces"}`}
        </span>
      </section>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <section className="board-grid" aria-label="Clothing locations">
          {locations.map((location) => (
            viewMode === "overview" && !hasActiveFilters ? (
              <LocationOverview
                key={location.id}
                location={location}
                locations={locations}
                items={getItemsForLocation(items, location.id)}
                taxonomy={taxonomy}
                browsePath={browsePaths[location.id]}
                onNavigate={navigateOverview}
                onBack={goBackOverview}
                onAdd={openAddDialog}
                onLocationRef={(locationId, node) => {
                  locationNodesRef.current[locationId] = node;
                }}
                expandedItemId={expandedItemId}
                onToggleExpanded={(itemId) => setExpandedItemId((current) => current === itemId ? null : itemId)}
                onEdit={openEditDialog}
                onDelete={deleteItem}
                onMove={openTransferDialog}
                onQuantityChange={updateItemQuantity}
                onKeyboardMove={handleKeyboardMove}
                onPhotoOpen={openPhotoPreview}
              />
            ) : (
              <LocationColumn
                key={location.id}
                location={location}
                locations={locations}
                items={getItemsForLocation(filteredItems, location.id)}
                totalItems={getItemsForLocation(items, location.id)}
                hasActiveFilters={hasActiveFilters}
                onAdd={openAddDialog}
                onLocationRef={(locationId, node) => {
                  locationNodesRef.current[locationId] = node;
                }}
                onClearFilters={clearFilters}
                expandedItemId={expandedItemId}
                onToggleExpanded={(itemId) => setExpandedItemId((current) => current === itemId ? null : itemId)}
                onEdit={openEditDialog}
                onDelete={deleteItem}
                onMove={openTransferDialog}
                onQuantityChange={updateItemQuantity}
                onKeyboardMove={handleKeyboardMove}
                onPhotoOpen={openPhotoPreview}
              />
            )
          ))}
        </section>
        <DragOverlay dropAnimation={null}>
          {activeItem ? (
            <article className="item-card item-card-overlay">
              {activeItem.photo ? <img className="photo-thumbnail photo-thumbnail-static" src={getPhotoUrl(activeItem.photo)} alt="" /> : null}
              <div className="item-card-main">
                <div className="item-card-summary">
                  <span className="item-card-summary-copy">
                    <h3>{activeItem.name}</h3>
                    <span className="item-card-summary-type">{activeItem.garmentType}</span>
                  </span>
                  <span className="quantity-chip">× {activeItem.quantity}</span>
                </div>
              </div>
              <GripVertical size={18} aria-hidden="true" />
            </article>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="sr-only" aria-live="polite">{announcement}</p>

      {hasLoadedBoard && !dialogOpen && !transferItem && !taxonomyDialogOpen && !photoPreview && !activeId ? (
        <button
          className="mobile-add-button"
          type="button"
          onClick={() => openAddDialog(mobileAddLocationRef.current, getMobileAddContext())}
          aria-label={`Open clothing form for ${getLocationName(mobileAddLocationRef.current, locations)}`}
        >
          <Plus size={17} aria-hidden="true" />
          {getLocationShortName(mobileAddLocation, locations)}
        </button>
      ) : null}

      {!dialogOpen ? (
        <div ref={mobileSaveBarRef} className="mobile-save-bar" aria-label="Mobile save controls">
          <div className="mobile-save-status" role="status" aria-live="polite">
            <StatusIcon state={state} dirty={isDirty} />
            <span>{isDirty ? "Unsaved changes" : state === "saving" ? "Saving board" : "Board saved"}</span>
          </div>
          <button className="save-button" type="button" onClick={() => void saveContent()} disabled={saveDisabled}>
            <Save size={17} aria-hidden="true" />
            {state === "saving" ? "Saving" : isDirty ? "Save changes" : "Saved"}
          </button>
        </div>
      ) : null}

      <footer className="board-footer">
        <div className="board-footnote">
          <span className="storage-indicator"><span aria-hidden="true" />{storageLabel}</span>
          <span>Last saved: {formatDate(lastSavedAt)}</span>
        </div>
        <button className="reload-button" type="button" onClick={handleReload} disabled={state === "loading" || state === "saving"}>
          <RefreshCw size={16} aria-hidden="true" />
          Reload {isDirty ? "draft" : "board"}
        </button>
      </footer>

      {dialogOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeDialog(); }}>
          <section ref={dialogRef} className="item-dialog" role="dialog" aria-modal="true" aria-labelledby="item-dialog-title">
            <div className="dialog-heading">
              <div>
                <p className="section-label">{editingId ? "Update piece" : "New piece"}</p>
                <h2 id="item-dialog-title">{editingId ? "Edit clothing" : "Add clothing"}</h2>
              </div>
              <button className="dialog-close" type="button" onClick={closeDialog} disabled={photoUploading} aria-label="Close dialog">
                <X size={19} aria-hidden="true" />
              </button>
            </div>
            <form className="item-form" onSubmit={submitItem}>
              <label>
                Name
                <input autoFocus value={form.name} onChange={(event) => updateForm("name", event.target.value)} placeholder="e.g. Navy Oxford shirt" />
                {shouldShowNameSuggestion ? (
                  <span className="name-suggestion" role="status">
                    Suggested name: <strong>{suggestedItemName}</strong>
                    <button
                      className="plain-button name-suggestion-action"
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, name: suggestedItemName }))}
                    >
                      Use suggested name
                    </button>
                  </span>
                ) : null}
                {formKeywordSuggestion?.matchedKeywords.length && Object.values(formManualFields).some((isManual) => !isManual) ? (
                  <span className="keyword-autofill-status" role="status">
                    Auto-filled from “{formKeywordSuggestion.matchedKeywords.join("”, “")}”
                  </span>
                ) : null}
              </label>
              <div className="form-grid">
                <label>
                  Occasion
                  <select value={form.occasions[0] ?? "Other"} onChange={(event) => updatePrimaryOccasion(event.target.value)}>
                    {formOccasionOptions.map((occasion) => <option key={occasion}>{occasion}</option>)}
                  </select>
                  {occasionChoices.length ? (
                    <span className="occasion-secondary-options">
                      {occasionChoices.map((choice) => (
                        <span className="occasion-secondary-option" key={choice.value}>
                          <input
                            type="checkbox"
                            checked={form.occasions.includes(choice.value)}
                            onChange={(event) => toggleOccasionTag(choice.value, event.target.checked)}
                          />
                          {choice.label}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </label>
                <label>
                  Group
                  <select value={form.garmentGroup} onChange={(event) => updateForm("garmentGroup", event.target.value as GarmentGroup)}>
                    {formGarmentGroupOptions.map((garmentGroup) => <option key={garmentGroup}>{garmentGroup}</option>)}
                  </select>
                </label>
                <label>
                  Garment type
                  <select value={form.garmentType} onChange={(event) => updateForm("garmentType", event.target.value)}>
                    {formGarmentTypeOptions.map((garmentType) => <option key={garmentType}>{garmentType}</option>)}
                  </select>
                </label>
                <label>
                  Brand
                  <input maxLength={80} value={form.brand} onChange={(event) => updateForm("brand", event.target.value)} placeholder="e.g. UNIQLO" />
                </label>
                <label>
                  Colour
                  <ColourAutocomplete value={form.colour} onChange={(colour) => updateForm("colour", colour)} />
                </label>
                <label>
                  Location
                  <select value={form.location} onChange={(event) => updateForm("location", event.target.value as Location)}>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </label>
                <label>
                  Quantity
                  <span className="quantity-control">
                    <button type="button" className="quantity-stepper" onClick={() => updateForm("quantity", clampQuantity(form.quantity - 1))} aria-label="Decrease quantity">−</button>
                    <input aria-label="Quantity" type="number" min="1" max="999" value={form.quantity} onChange={(event) => updateForm("quantity", clampQuantity(Number(event.target.value)))} />
                    <button type="button" className="quantity-stepper" onClick={() => updateForm("quantity", clampQuantity(form.quantity + 1))} aria-label="Increase quantity">+</button>
                  </span>
                </label>
              </div>
              {isDemoMode ? (
                <div className="photo-upload-field demo-photo-field">
                  <div className="photo-upload-heading">
                    <span>Sample image</span>
                    <span className="photo-upload-hint">Visitor uploads are disabled</span>
                  </div>
                  {form.photo ? (
                    <div className="photo-uploaded">
                      <img src={getPhotoUrl(form.photo)} alt="" />
                      <div className="photo-uploaded-copy">
                        <strong>Fictional sample illustration</strong>
                        <span>Included with the public demo</span>
                      </div>
                    </div>
                  ) : (
                    <div className="demo-photo-empty">
                      <Shirt size={20} aria-hidden="true" />
                      <span>New demo pieces do not use personal photos.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="photo-upload-field">
                  <div className="photo-upload-heading">
                    <span>Photo <span className="label-optional">Optional</span></span>
                    <span className="photo-upload-hint">JPEG, PNG, or WebP · max 10 MB</span>
                  </div>
                  <div className={`photo-dropzone${photoUploading ? " photo-dropzone-uploading" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={handlePhotoDrop}>
                    {form.photo ? (
                      <div className="photo-uploaded">
                        <img src={getPhotoUrl(form.photo)} alt="" />
                        <div className="photo-uploaded-copy">
                          <strong>{photoUploading ? "Replacing photo…" : "Photo attached"}</strong>
                          <span>{form.photo.filename}</span>
                        </div>
                        <div className="photo-uploaded-actions">
                          <button className="plain-button" type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>Replace</button>
                          <button className="plain-button plain-button-danger" type="button" onClick={removePhoto} disabled={photoUploading}>Remove</button>
                        </div>
                      </div>
                    ) : (
                      <div className="photo-dropzone-empty">
                        <span>Drop a clothing photo here</span>
                        <button className="secondary-button" type="button" onClick={() => photoInputRef.current?.click()} disabled={photoUploading}>Browse</button>
                      </div>
                    )}
                    <input
                      ref={photoInputRef}
                      className="photo-file-input"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => {
                        void handlePhotoFile(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                  </div>
                  {photoUploading ? <p className="photo-upload-status" role="status">Uploading photo {Math.round(photoUploadProgress ?? 0)}%</p> : null}
                </div>
              )}
              <label>
                Notes <span className="label-optional">Optional</span>
                <textarea rows={4} value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} placeholder="e.g. Size M, slim fit, linen, or dry-clean only" />
              </label>
              {formError ? <p className="form-error" role="alert">{formError}</p> : null}
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={closeDialog} disabled={photoUploading}>Cancel</button>
                <button className="save-button" type="submit" disabled={photoUploading}>{editingId ? "Save piece" : "Add piece"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {currentTransferItem ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeTransferDialog(); }}>
          <section ref={transferDialogRef} className="item-dialog transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-dialog-title">
            <div className="dialog-heading">
              <div>
                <p className="section-label">Partial transfer</p>
                <h2 id="transfer-dialog-title">Move clothing</h2>
              </div>
              <button className="dialog-close" type="button" onClick={closeTransferDialog} aria-label="Close transfer dialog">
                <X size={19} aria-hidden="true" />
              </button>
            </div>
            <div className="transfer-summary" aria-label={`Move ${currentTransferItem.name} between locations`}>
              <span>{getLocationName(currentTransferItem.location, locations)}</span>
              <ArrowLeftRight size={18} aria-hidden="true" />
              <span>{getLocationName(getOtherLocation(currentTransferItem.location), locations)}</span>
            </div>
            <form className="item-form transfer-form" onSubmit={completeTransfer}>
              <p className="transfer-item-name">{currentTransferItem.name}</p>
              <label>
                Pieces to move
                <span className="quantity-control transfer-quantity">
                  <button type="button" className="quantity-stepper" onClick={() => setTransferQuantity((current) => Math.max(1, current - 1))} disabled={transferQuantity <= 1} aria-label="Decrease pieces to move">−</button>
                  <input
                    aria-label="Pieces to move"
                    type="number"
                    min="1"
                    max={currentTransferItem.quantity}
                    value={transferQuantity}
                    onChange={(event) => setTransferQuantity(clampTransferQuantity(Number(event.target.value), currentTransferItem.quantity))}
                  />
                  <button type="button" className="quantity-stepper" onClick={() => setTransferQuantity((current) => Math.min(currentTransferItem.quantity, current + 1))} disabled={transferQuantity >= currentTransferItem.quantity} aria-label="Increase pieces to move">+</button>
                </span>
              </label>
              <p className="transfer-preview" role="status" aria-live="polite">
                {currentTransferItem.quantity - transferQuantity} {currentTransferItem.quantity - transferQuantity === 1 ? "piece" : "pieces"} stays at {getLocationName(currentTransferItem.location, locations)} · {transferQuantity} {transferQuantity === 1 ? "piece" : "pieces"} moves to {getLocationName(getOtherLocation(currentTransferItem.location), locations)}
              </p>
              {transferError ? <p className="form-error" role="alert">{transferError}</p> : null}
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={closeTransferDialog}>Cancel</button>
                <button className="save-button" type="submit">Move {transferQuantity} {transferQuantity === 1 ? "piece" : "pieces"}</button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {photoPreview ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closePhotoPreview(); }}>
          <section ref={photoDialogRef} className="photo-dialog" role="dialog" aria-modal="true" aria-labelledby="photo-dialog-title">
            <div className="dialog-heading">
              <div>
                <p className="section-label">Clothing photo</p>
                <h2 id="photo-dialog-title">{photoPreview.name}</h2>
              </div>
              <button className="dialog-close" type="button" onClick={closePhotoPreview} aria-label="Close photo preview">
                <X size={19} aria-hidden="true" />
              </button>
            </div>
            <img className="photo-preview-image" src={getPhotoUrl(photoPreview.photo)} alt={`${photoPreview.name} clothing photo`} />
          </section>
        </div>
      ) : null}

      {taxonomyDialogOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeTaxonomyDialog(); }}>
          <section ref={taxonomyDialogRef} className="taxonomy-dialog" role="dialog" aria-modal="true" aria-labelledby="taxonomy-dialog-title">
            <div className="dialog-heading">
              <div>
                <p className="section-label">Wardrobe structure</p>
                <h2 id="taxonomy-dialog-title">Manage occasions &amp; types</h2>
              </div>
              <button className="dialog-close" type="button" onClick={closeTaxonomyDialog} aria-label="Close wardrobe structure manager">
                <X size={19} aria-hidden="true" />
              </button>
            </div>
            <p className="taxonomy-intro">Organize items as Occasion → Tops, Bottoms, Accessories, or Other → Garment type. Changes stay as a draft until you save the board.</p>
            {taxonomyError ? <p className="form-error" role="alert">{taxonomyError}</p> : null}

            <form className="taxonomy-add-form" onSubmit={addOccasion}>
              <label>
                New occasion
                <input value={newOccasionName} onChange={(event) => setNewOccasionName(event.target.value)} placeholder="e.g. Travel" />
              </label>
              <button className="secondary-button" type="submit"><Plus size={16} aria-hidden="true" /> Add occasion</button>
            </form>

            <div className="taxonomy-list">
              {occasionOptions.map((occasion) => {
                const isProtected = occasion.toLocaleLowerCase() === "other";
                const isEditing = editingOccasionName === occasion;
                return (
                  <section className="taxonomy-group" key={occasion}>
                    <div className="taxonomy-group-heading">
                      {isEditing ? (
                        <form className="taxonomy-inline-form" onSubmit={(event) => { event.preventDefault(); renameOccasion(occasion); }}>
                          <input aria-label={`Rename ${occasion}`} value={occasionEditValue} onChange={(event) => setOccasionEditValue(event.target.value)} />
                          <button className="secondary-button" type="submit">Save</button>
                          <button className="plain-button" type="button" onClick={() => setEditingOccasionName(null)}>Cancel</button>
                        </form>
                      ) : (
                        <div className="taxonomy-name-line">
                          <h3>{occasion}</h3>
                          {!taxonomy.occasions.includes(occasion) ? <span className="taxonomy-retained">Existing item</span> : null}
                        </div>
                      )}
                      {!isEditing ? (
                        <div className="taxonomy-actions">
                          <button className="plain-button" type="button" onClick={() => startOccasionEdit(occasion)} disabled={isProtected}>Rename</button>
                          <button className="plain-button plain-button-danger" type="button" onClick={() => deleteOccasion(occasion)} disabled={isProtected}>Delete</button>
                        </div>
                      ) : null}
                    </div>
                    <div className="taxonomy-subcategory-list">
                      {GARMENT_GROUPS.map((garmentGroup) => {
                        const garmentTypeOptions = getGarmentTypeOptions(occasion, garmentGroup, items, taxonomy);
                        return (
                          <div className="taxonomy-type-group" key={`${occasion}-${garmentGroup}`}>
                            <h4 className="taxonomy-group-label">{garmentGroup}</h4>
                            {garmentTypeOptions.map((garmentType) => {
                              const isGarmentTypeProtected = garmentType.toLocaleLowerCase() === "other";
                              const isEditingGarmentType = editingGarmentType?.occasion === occasion && editingGarmentType.garmentGroup === garmentGroup && editingGarmentType.name === garmentType;
                              const isRetained = !taxonomy.garmentTypes[occasion]?.[garmentGroup]?.some((candidate) => candidate === garmentType);
                              return (
                                <div className="taxonomy-subcategory-row" key={`${occasion}-${garmentGroup}-${garmentType}`}>
                                  {isEditingGarmentType ? (
                                    <form className="taxonomy-inline-form" onSubmit={(event) => { event.preventDefault(); renameGarmentType(occasion, garmentGroup, garmentType); }}>
                                      <input aria-label={`Rename ${garmentType}`} value={garmentTypeEditValue} onChange={(event) => setGarmentTypeEditValue(event.target.value)} />
                                      <button className="secondary-button" type="submit">Save</button>
                                      <button className="plain-button" type="button" onClick={() => setEditingGarmentType(null)}>Cancel</button>
                                    </form>
                                  ) : (
                                    <>
                                      <span>{garmentType} {isRetained ? <span className="taxonomy-retained">Existing item</span> : null}</span>
                                      <span className="taxonomy-actions">
                                        <button className="plain-button" type="button" onClick={() => startGarmentTypeEdit(occasion, garmentGroup, garmentType)} disabled={isGarmentTypeProtected}>Rename</button>
                                        <button className="plain-button plain-button-danger" type="button" onClick={() => deleteGarmentType(occasion, garmentGroup, garmentType)} disabled={isGarmentTypeProtected}>Delete</button>
                                      </span>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>

            <form className="taxonomy-add-form" onSubmit={addGarmentType}>
              <label>
                Occasion
                <select value={newGarmentTypeOccasion} onChange={(event) => setNewGarmentTypeOccasion(event.target.value)}>
                  {occasionOptions.map((occasion) => <option key={occasion}>{occasion}</option>)}
                </select>
              </label>
              <label>
                Group
                <select value={newGarmentTypeGroup} onChange={(event) => setNewGarmentTypeGroup(event.target.value as GarmentGroup)}>
                  {garmentGroupOptions.map((garmentGroup) => <option key={garmentGroup}>{garmentGroup}</option>)}
                </select>
              </label>
              <label>
                New garment type
                <input value={newGarmentTypeName} onChange={(event) => setNewGarmentTypeName(event.target.value)} placeholder="e.g. Linen shirts" />
              </label>
              <button className="secondary-button" type="submit"><Plus size={16} aria-hidden="true" /> Add type</button>
            </form>

            <section className="keyword-rules-panel" aria-labelledby="keyword-rules-title">
              <div className="keyword-rules-heading">
                <div>
                  <p className="section-label">Name matching</p>
                  <h3 id="keyword-rules-title">Keyword autofill rules</h3>
                </div>
                <span className="keyword-rules-count">{keywordRules.length} / {KEYWORD_RULE_LIMITS.maxRules}</span>
              </div>
              <p className="taxonomy-intro">When you add or edit a piece, matching words in its name can pre-fill selected fields, including brand and colour. Higher-priority rules win conflicts, and you can still edit every field before saving.</p>
              {keywordRuleError ? <p className="form-error" role="alert">{keywordRuleError}</p> : null}

              <div className="keyword-rule-list">
                {keywordRules.map((rule) => (
                  <div className={`keyword-rule-row${rule.enabled ? "" : " keyword-rule-row-disabled"}`} key={rule.id}>
                    <div className="keyword-rule-copy">
                      <strong>{rule.keywords.join(", ")}</strong>
                      <span>{getKeywordRuleTargetLabel(rule)} · Priority {rule.priority}</span>
                    </div>
                    <div className="keyword-rule-actions">
                      <button className="plain-button" type="button" onClick={() => startKeywordRuleEdit(rule)}>Edit</button>
                      <button className="plain-button" type="button" onClick={() => toggleKeywordRule(rule.id)}>{rule.enabled ? "Disable" : "Enable"}</button>
                      <button className="plain-button plain-button-danger" type="button" onClick={() => deleteKeywordRule(rule)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>

              <form className="keyword-rule-editor" onSubmit={saveKeywordRule}>
                <div className="keyword-rule-editor-heading">
                  <div>
                    <h4>{editingKeywordRuleId ? "Edit keyword rule" : "Add keyword rule"}</h4>
                    <p>Use commas for aliases such as <span aria-label="t-shirt, tee">t-shirt, tee</span>.</p>
                  </div>
                  {editingKeywordRuleId ? <button className="plain-button" type="button" onClick={resetKeywordRuleEditor}>Cancel edit</button> : null}
                </div>
                <label className="keyword-rule-wide">
                  Keywords or phrases
                  <input value={keywordRuleDraft.keywords} onChange={(event) => updateKeywordRuleDraft("keywords", event.target.value)} placeholder="e.g. oxford, dress shirt" />
                </label>
                <div className="keyword-rule-grid">
                  <label>
                    Occasion
                    <select value={keywordRuleDraft.occasion} onChange={(event) => updateKeywordRuleDraft("occasion", event.target.value)}>
                      <option value="">No occasion change</option>
                      {occasionOptions.map((occasion) => <option key={occasion}>{occasion}</option>)}
                    </select>
                  </label>
                  <label>
                    Group
                    <select value={keywordRuleDraft.garmentGroup} onChange={(event) => updateKeywordRuleDraft("garmentGroup", event.target.value as "" | GarmentGroup)}>
                      <option value="">No group change</option>
                      {garmentGroupOptions.map((garmentGroup) => <option key={garmentGroup}>{garmentGroup}</option>)}
                    </select>
                  </label>
                  <label>
                    Garment type
                    <select
                      value={keywordRuleDraft.garmentType}
                      disabled={!keywordRuleDraft.garmentGroup}
                      onChange={(event) => updateKeywordRuleDraft("garmentType", event.target.value)}
                    >
                      <option value="">No garment type change</option>
                      {keywordRuleGarmentTypeOptions.map((garmentType) => <option key={garmentType}>{garmentType}</option>)}
                    </select>
                  </label>
                  <label>
                    Brand
                    <input maxLength={80} value={keywordRuleDraft.brand} onChange={(event) => updateKeywordRuleDraft("brand", event.target.value)} placeholder="e.g. Padini" />
                  </label>
                  <label>
                    Colour
                    <select value={keywordRuleDraft.colour} onChange={(event) => updateKeywordRuleDraft("colour", event.target.value as "" | WardrobeColour)}>
                      <option value="">No colour change</option>
                      {COLOUR_OPTIONS.filter((colour) => colour !== "Unspecified").map((colour) => <option key={colour}>{colour}</option>)}
                    </select>
                  </label>
                  <label>
                    Priority
                    <input type="number" min="0" max="1000" step="1" value={keywordRuleDraft.priority} onChange={(event) => updateKeywordRuleDraft("priority", Number(event.target.value))} />
                  </label>
                </div>
                <label className="keyword-rule-enabled">
                  <input type="checkbox" checked={keywordRuleDraft.enabled} onChange={(event) => updateKeywordRuleDraft("enabled", event.target.checked)} />
                  Enabled for new entries
                </label>
                <div className="keyword-rule-editor-actions">
                  <button className="secondary-button" type="submit">{editingKeywordRuleId ? "Save rule" : "Add rule"}</button>
                  {editingKeywordRuleId ? <button className="plain-button" type="button" onClick={resetKeywordRuleEditor}>Cancel</button> : null}
                </div>
              </form>
            </section>

            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={closeTaxonomyDialog}>Done</button>
              <button className="save-button" type="button" onClick={() => { closeTaxonomyDialog(); void saveContent(); }} disabled={saveDisabled}>
                <Save size={17} aria-hidden="true" />
                {state === "saving" ? "Saving" : "Save changes"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
