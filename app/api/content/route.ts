import { BlobPreconditionFailedError, get, head, put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  DEFAULT_TAXONOMY,
  GARMENT_GROUPS,
  getGarmentTypes,
  normalizeStoredGarmentClassification,
  normalizeStoredOccasions,
  normalizeTaxonomy,
  type GarmentGroup,
  type WardrobeTaxonomy,
} from "../../../lib/wardrobe-taxonomy";
import {
  cloneDefaultKeywordRules,
  KEYWORD_RULE_LIMITS,
  normalizeKeywordRules,
  type KeywordRule,
} from "../../../lib/keyword-rules";
import { normalizeStoredColour, type WardrobeColour } from "../../../lib/wardrobe-colours";
import { formatItemName } from "../../../lib/wardrobe-names";
import { getWardrobeMode } from "../../../lib/wardrobe-mode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_PATH = process.env.CONTENT_BLOB_PATH || "content/home.json";
const LEGACY_COPIES_PREFIX = process.env.CONTENT_COPIES_PREFIX || "content/copies";
const LEGACY_COPIES_INDEX_PATH = `${LEGACY_COPIES_PREFIX}/index.json`;
const CONTENT_BACKUPS_PREFIX = process.env.CONTENT_BACKUPS_PREFIX || "content/backups";
const BOARD_SCHEMA_VERSION = 7;
const LOCATIONS = ["girlfriend", "home"] as const;
type Location = (typeof LOCATIONS)[number];

type ClothingItem = {
  id: string;
  name: string;
  occasion: string;
  occasions?: string[];
  garmentGroup: GarmentGroup;
  garmentType: string;
  colour: WardrobeColour;
  brand: string;
  needsClassification: boolean;
  notes: string;
  quantity: number;
  location: Location;
  photo?: PhotoReference;
  createdAt: string;
  updatedAt: string;
};

type PhotoReference = {
  pathname: string;
  filename: string;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
};

type BoardContent = {
  schemaVersion?: number;
  items: ClothingItem[];
  taxonomy?: WardrobeTaxonomy;
  keywordRules?: KeywordRule[];
  updatedAt?: string;
};

type LegacyClothingItem = {
  id: string;
  name: string;
  category: string;
  subCategory?: string;
  notes: string;
  quantity?: number;
  location: Location;
  createdAt: string;
  updatedAt: string;
};

type LegacyBoardContent = {
  schemaVersion?: number;
  items: LegacyClothingItem[];
  taxonomy?: unknown;
  updatedAt?: string;
};

type LegacyCopySummary = {
  id: string;
  updatedAt: string;
};

type LoadedBoard = {
  content: BoardContent;
  migrationRequired: boolean;
};

const emptyBoard: BoardContent = { schemaVersion: BOARD_SCHEMA_VERSION, items: [], taxonomy: DEFAULT_TAXONOMY, keywordRules: cloneDefaultKeywordRules() };

async function streamToText(stream: ReadableStream<Uint8Array>) {
  return await new Response(stream).text();
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      "Cache-Control": "private, no-store",
      ...(init?.headers || {}),
    },
  });
}

function isLocation(value: unknown): value is Location {
  return typeof value === "string" && LOCATIONS.includes(value as Location);
}

function isTimestamp(value: unknown) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function getSchemaVersionStatus(value: unknown): "missing" | "legacy" | "supportedLegacy" | "supported" | "unsupported" | "invalid" {
  if (!value || typeof value !== "object") return "invalid";
  const schemaVersion = (value as Record<string, unknown>).schemaVersion;
  if (schemaVersion === undefined) return "missing";
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) return "invalid";
  if (schemaVersion === BOARD_SCHEMA_VERSION) return "supported";
  if (schemaVersion === 6 || schemaVersion === 5 || schemaVersion === 4 || schemaVersion === 3 || schemaVersion === 2) return "supportedLegacy";
  if (schemaVersion === 1) return "legacy";
  return "unsupported";
}

function isQuantity(value: unknown) {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 999);
}

function normalizeBrand(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function isPhotoReference(value: unknown): value is PhotoReference {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.pathname === "string" && /^content\/photos\/[a-zA-Z0-9_-]+\.(?:jpe?g|png|webp)$/i.test(candidate.pathname) &&
    typeof candidate.filename === "string" && candidate.filename.trim().length > 0 && candidate.filename.length <= 255 &&
    (candidate.contentType === "image/jpeg" || candidate.contentType === "image/png" || candidate.contentType === "image/webp") &&
    typeof candidate.size === "number" && Number.isInteger(candidate.size) && candidate.size > 0 && candidate.size <= 10 * 1024 * 1024
  );
}

function isKeywordRule(value: unknown, taxonomy: WardrobeTaxonomy) {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const target = candidate.target;
  if (!target || typeof target !== "object") return false;
  const targetRecord = target as Record<string, unknown>;
  const occasionName = typeof targetRecord.occasion === "string" ? targetRecord.occasion.trim().toLocaleLowerCase() : "";
  const canonicalOccasion = typeof targetRecord.occasion === "string"
    ? taxonomy.occasions.find((occasion) => occasion.toLocaleLowerCase() === occasionName)
    : undefined;
  const hasOccasion = Boolean(canonicalOccasion);
  const hasGroup = typeof targetRecord.garmentGroup === "string" && GARMENT_GROUPS.includes(targetRecord.garmentGroup as GarmentGroup);
  const classification = normalizeStoredGarmentClassification(canonicalOccasion, hasGroup ? targetRecord.garmentGroup : undefined, targetRecord.garmentType);
  const canonicalGroup = hasGroup ? classification.garmentGroup : undefined;
  const garmentTypeName = typeof targetRecord.garmentType === "string" ? classification.garmentType.toLocaleLowerCase() : "";
  const hasGarmentType = Boolean(canonicalGroup && garmentTypeName) && (canonicalOccasion
    ? getGarmentTypes(canonicalOccasion, canonicalGroup ?? "Other", taxonomy).some((garmentType) => garmentType.toLocaleLowerCase() === garmentTypeName)
    : taxonomy.occasions.some((occasion) => getGarmentTypes(occasion, canonicalGroup ?? "Other", taxonomy).some((garmentType) => garmentType.toLocaleLowerCase() === garmentTypeName)));
  const targetFieldsValid =
    (targetRecord.occasion === undefined || hasOccasion) &&
    (targetRecord.garmentGroup === undefined || hasGroup) &&
    (targetRecord.garmentType === undefined || hasGarmentType) &&
    (targetRecord.brand === undefined || (typeof targetRecord.brand === "string" && targetRecord.brand.trim().length > 0 && targetRecord.brand.length <= 80)) &&
    (targetRecord.colour === undefined || normalizeStoredColour(targetRecord.colour) !== "Unspecified" || String(targetRecord.colour).trim().toLocaleLowerCase() === "unspecified");
  const hasBrand = typeof targetRecord.brand === "string" && targetRecord.brand.trim().length > 0;
  const hasColour = typeof targetRecord.colour === "string" && normalizeStoredColour(targetRecord.colour) !== "Unspecified";
  const hasTarget = hasOccasion || hasGroup || hasGarmentType || hasBrand || hasColour;
  return (
    typeof candidate.id === "string" && candidate.id.trim().length > 0 && candidate.id.length <= 80 &&
    Array.isArray(candidate.keywords) && candidate.keywords.length > 0 && candidate.keywords.length <= KEYWORD_RULE_LIMITS.maxAliasesPerRule &&
    candidate.keywords.every((keyword) => typeof keyword === "string" && keyword.trim().length > 0 && keyword.length <= KEYWORD_RULE_LIMITS.maxAliasLength) &&
    typeof candidate.enabled === "boolean" &&
    typeof candidate.priority === "number" && Number.isInteger(candidate.priority) && candidate.priority >= 0 && candidate.priority <= 1000 &&
    targetFieldsValid &&
    (hasTarget || candidate.enabled === false)
  );
}

function isKeywordRules(value: unknown, taxonomy: WardrobeTaxonomy) {
  if (!Array.isArray(value) || value.length > KEYWORD_RULE_LIMITS.maxRules) return false;
  const ids = new Set<string>();
  return value.every((rule) => {
    if (!isKeywordRule(rule, taxonomy)) return false;
    const id = (rule as { id: string }).id;
    if (ids.has(id)) return false;
    ids.add(id);
    return true;
  });
}

function isVersion2ClothingItem(value: unknown): value is ClothingItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" && candidate.id.trim().length > 0 &&
    typeof candidate.name === "string" && candidate.name.trim().length > 0 &&
    ((typeof candidate.occasion === "string" && candidate.occasion.trim().length > 0) ||
      (Array.isArray(candidate.occasions) && candidate.occasions.length > 0 && candidate.occasions.every((occasion) => typeof occasion === "string" && occasion.trim().length > 0))) &&
    typeof candidate.garmentGroup === "string" && candidate.garmentGroup.trim().length > 0 &&
    typeof candidate.garmentType === "string" && candidate.garmentType.trim().length > 0 &&
    (candidate.colour === undefined || typeof candidate.colour === "string") &&
    (candidate.brand === undefined || typeof candidate.brand === "string") &&
    (candidate.needsClassification === undefined || typeof candidate.needsClassification === "boolean") &&
    typeof candidate.notes === "string" &&
    isQuantity(candidate.quantity) &&
    (candidate.photo === undefined || isPhotoReference(candidate.photo)) &&
    isLocation(candidate.location) &&
    isTimestamp(candidate.createdAt) &&
    isTimestamp(candidate.updatedAt)
  );
}

function isLegacyClothingItem(value: unknown): value is LegacyClothingItem {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" && candidate.id.trim().length > 0 &&
    typeof candidate.name === "string" && candidate.name.trim().length > 0 &&
    typeof candidate.category === "string" &&
    (candidate.subCategory === undefined || typeof candidate.subCategory === "string") &&
    typeof candidate.notes === "string" &&
    isQuantity(candidate.quantity) &&
    isLocation(candidate.location) &&
    isTimestamp(candidate.createdAt) &&
    isTimestamp(candidate.updatedAt)
  );
}

function isBoardContent(value: unknown): value is BoardContent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const schemaStatus = getSchemaVersionStatus(value);
  const taxonomy = normalizeTaxonomy(candidate.taxonomy);
  return (
    (schemaStatus === "supported" || schemaStatus === "supportedLegacy") &&
    Array.isArray(candidate.items) &&
    candidate.items.length <= 500 &&
    candidate.items.every(isVersion2ClothingItem) &&
    (candidate.taxonomy === undefined || (typeof candidate.taxonomy === "object" && candidate.taxonomy !== null)) &&
    ((schemaStatus === "supportedLegacy" && (candidate.keywordRules === undefined || isKeywordRules(candidate.keywordRules, taxonomy))) ||
      (schemaStatus === "supported" && isKeywordRules(candidate.keywordRules, taxonomy))) &&
    (candidate.updatedAt === undefined || isTimestamp(candidate.updatedAt))
  );
}

function isLegacyBoardContent(value: unknown): value is LegacyBoardContent {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const schemaStatus = getSchemaVersionStatus(value);
  return (
    (schemaStatus === "missing" || schemaStatus === "legacy") &&
    Array.isArray(candidate.items) &&
    candidate.items.length <= 500 &&
    candidate.items.every(isLegacyClothingItem) &&
    (candidate.taxonomy === undefined || (typeof candidate.taxonomy === "object" && candidate.taxonomy !== null)) &&
    (candidate.updatedAt === undefined || isTimestamp(candidate.updatedAt))
  );
}

function isLegacyPageContent(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.kicker === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.body === "string" &&
    typeof candidate.ctaLabel === "string" &&
    typeof candidate.ctaUrl === "string"
  );
}

function normalizeBoard(value: BoardContent): BoardContent {
  const now = new Date().toISOString();
  const taxonomy = normalizeTaxonomy(value.taxonomy);
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    items: value.items.map((item) => {
      const occasions = normalizeStoredOccasions(item.occasions, item.occasion);
      const classification = normalizeStoredGarmentClassification(occasions, item.garmentGroup, item.garmentType);
      return {
        id: item.id.trim(),
        name: formatItemName(item.name),
        occasion: occasions[0],
        occasions,
        garmentGroup: classification.garmentGroup,
        garmentType: classification.garmentType,
        colour: normalizeStoredColour(item.colour),
        brand: normalizeBrand(item.brand),
        needsClassification: item.needsClassification === true,
        notes: item.notes.trim(),
        quantity: item.quantity ?? 1,
        location: item.location,
        ...(item.photo ? { photo: item.photo } : {}),
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };
    }),
    taxonomy,
    keywordRules: normalizeKeywordRules(value.keywordRules, taxonomy),
    updatedAt: now,
  };
}

function normalizeLoadedBoard(value: BoardContent): BoardContent {
  const taxonomy = normalizeTaxonomy(value.taxonomy);
  return {
    ...value,
    schemaVersion: BOARD_SCHEMA_VERSION,
    taxonomy,
    keywordRules: normalizeKeywordRules(value.keywordRules, taxonomy),
    items: value.items.map((item) => {
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
        quantity: item.quantity ?? 1,
        ...(item.photo ? { photo: item.photo } : {}),
      };
    }),
  };
}

function appendPreviousClassification(notes: string, category: string, subCategory?: string) {
  const previousClassification = [category.trim(), subCategory?.trim()].filter(Boolean).join(" / ");
  if (!previousClassification) return notes.trim();
  const marker = `Previous classification: ${previousClassification}`;
  if (notes.includes(marker)) return notes.trim();
  return [notes.trim(), marker].filter(Boolean).join(" · ");
}

function migrateLegacyBoard(value: LegacyBoardContent): BoardContent {
  return {
    schemaVersion: BOARD_SCHEMA_VERSION,
    items: value.items.map((item) => ({
      id: item.id.trim(),
      name: item.name.trim(),
      occasion: "Other",
      occasions: ["Other"],
      garmentGroup: "Other",
      garmentType: "Other",
      colour: "Unspecified",
      brand: "",
      needsClassification: true,
      notes: appendPreviousClassification(item.notes, item.category, item.subCategory),
      quantity: item.quantity ?? 1,
      location: item.location,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    })),
    taxonomy: DEFAULT_TAXONOMY,
    keywordRules: cloneDefaultKeywordRules(),
    updatedAt: value.updatedAt,
  };
}

function getRequestRevision(value: unknown): string | null | undefined {
  if (!value || typeof value !== "object") return undefined;
  const revision = (value as Record<string, unknown>).revision;
  if (revision === undefined) return undefined;
  return typeof revision === "string" || revision === null ? revision : undefined;
}

function makeBackupPath(etag: string) {
  const safeEtag = etag.replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 80) || "unknown";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${CONTENT_BACKUPS_PREFIX}/${timestamp}-${safeEtag}-${randomUUID()}.json`;
}

function isConflictError(error: unknown) {
  if (error instanceof BlobPreconditionFailedError) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; statusCode?: number; name?: string; message?: string };
  return (
    candidate.status === 409 ||
    candidate.status === 412 ||
    candidate.statusCode === 409 ||
    candidate.statusCode === 412 ||
    candidate.name === "BlobPreconditionFailedError" ||
    candidate.message?.toLocaleLowerCase().includes("precondition") === true
  );
}

async function getAuthoritativeRevision(fallback: string) {
  try {
    const metadata = await head(CONTENT_PATH);
    return metadata.etag || fallback;
  } catch {
    return fallback;
  }
}

async function readCurrentBlob() {
  const result = await get(CONTENT_PATH, { access: "private", useCache: false });
  if (!result) return null;

  // Use Blob metadata as the authoritative revision for conditional writes.
  // The downloaded response can be served through a different cache path than
  // the write endpoint, so its ETag is not used as the write guard.
  const metadata = await head(CONTENT_PATH);
  return { ...result, revision: metadata.etag || result.blob.etag };
}

function isLegacyCopySummary(value: unknown): value is LegacyCopySummary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string" && candidate.id.trim().length > 0 && isTimestamp(candidate.updatedAt);
}

async function readJson(path: string) {
  const result = await get(path, { access: "private", useCache: false });
  if (!result || !result.stream) return null;
  const text = await streamToText(result.stream);
  return JSON.parse(text) as unknown;
}

function normalizeLoadedValue(value: unknown): LoadedBoard | null {
  if (isBoardContent(value)) return { content: normalizeLoadedBoard(value), migrationRequired: getSchemaVersionStatus(value) === "supportedLegacy" };
  if (isLegacyBoardContent(value)) return { content: migrateLegacyBoard(value), migrationRequired: true };
  return null;
}

async function readLatestLegacyBoard() {
  try {
    const index = await readJson(LEGACY_COPIES_INDEX_PATH);
    if (!index || typeof index !== "object") return null;
    const summaries = (index as { copies?: unknown }).copies;
    if (!Array.isArray(summaries)) return null;

    const sortedSummaries = summaries
      .filter(isLegacyCopySummary)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    for (const summary of sortedSummaries) {
      const stored = await readJson(`${LEGACY_COPIES_PREFIX}/${summary.id}.json`);
      if (!stored || typeof stored !== "object") continue;
      const normalized = normalizeLoadedValue((stored as { content?: unknown }).content);
      if (normalized) return normalized;
    }
  } catch {
    return null;
  }

  return null;
}

export async function GET() {
  if (getWardrobeMode() === "demo") {
    return jsonResponse({ error: "Demo mode stores its fictional board in the visitor's browser." }, { status: 404 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonResponse({
      content: emptyBoard,
      source: "default",
      storageConfigured: false,
      legacyContentPreserved: false,
      migrationRequired: false,
      revision: null,
    });
  }

  const result = await get(CONTENT_PATH, {
    access: "private",
    useCache: false,
  });

  if (!result) {
    const legacyCopy = await readLatestLegacyBoard();
    return jsonResponse({
      content: legacyCopy?.content ?? emptyBoard,
      source: legacyCopy ? (legacyCopy.migrationRequired ? "migration" : "blob") : "default",
      storageConfigured: true,
      legacyContentPreserved: false,
      migrationRequired: legacyCopy?.migrationRequired ?? false,
      revision: null,
    });
  }

  if (result.statusCode !== 200) {
    return jsonResponse({ error: "Unable to read the current board." }, { status: 503 });
  }

  const text = await streamToText(result.stream);
  const revision = await getAuthoritativeRevision(result.blob.etag);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return jsonResponse({ error: "Stored content is not valid JSON." }, { status: 500 });
  }

  if (isLegacyPageContent(parsed)) {
    const legacyCopy = await readLatestLegacyBoard();
    return jsonResponse(
      {
        content: legacyCopy?.content ?? emptyBoard,
        source: legacyCopy ? (legacyCopy.migrationRequired ? "migration" : "blob") : "legacy",
        storageConfigured: true,
        legacyContentPreserved: !legacyCopy,
        migrationRequired: legacyCopy?.migrationRequired ?? false,
        etag: revision,
        revision,
      },
      {
        headers: {
          ETag: revision,
          "Cache-Control": "private, no-cache",
        },
      },
    );
  }

  const normalized = normalizeLoadedValue(parsed);
  if (!normalized) {
    const schemaVersionStatus = getSchemaVersionStatus(parsed);
    if (schemaVersionStatus === "unsupported") {
      return jsonResponse(
        { error: "Stored content uses a newer board schema. Update the app before saving.", code: "UNSUPPORTED_SCHEMA" },
        { status: 409, headers: { ETag: revision, "Cache-Control": "private, no-cache" } },
      );
    }
    return jsonResponse(
      { error: "Stored content is not in the expected clothing-board format." },
      { status: 500 },
    );
  }

  return jsonResponse(
    {
      content: normalized.content,
      source: normalized.migrationRequired ? "migration" : "blob",
      storageConfigured: true,
      legacyContentPreserved: false,
      migrationRequired: normalized.migrationRequired,
      etag: revision,
      revision,
    },
    {
      headers: {
        ETag: revision,
        "Cache-Control": "private, no-cache",
      },
    },
  );
}

export async function POST(request: Request) {
  if (getWardrobeMode() === "demo") {
    return jsonResponse({ error: "Demo mode stores its fictional board in the visitor's browser." }, { status: 404 });
  }

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return jsonResponse(
      {
        error: "Blob storage is unavailable. Add BLOB_READ_WRITE_TOKEN before saving.",
        storageConfigured: false,
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const schemaVersionStatus = getSchemaVersionStatus(body);
  if (schemaVersionStatus !== "supported") {
    return jsonResponse(
      {
        error: schemaVersionStatus === "unsupported"
          ? "This board was saved by a newer app version. Update before saving."
          : "This board needs to be reloaded before saving.",
        code: schemaVersionStatus === "unsupported" ? "UNSUPPORTED_SCHEMA" : "INCOMPATIBLE_CLIENT",
      },
      { status: 409 },
    );
  }

  if (!isBoardContent(body)) {
    return jsonResponse({ error: "Invalid clothing-board payload." }, { status: 400 });
  }

  const requestedRevision = getRequestRevision(body);
  if ((body as Record<string, unknown>).revision !== undefined && requestedRevision === undefined) {
    return jsonResponse({ error: "Invalid board revision.", code: "INCOMPATIBLE_CLIENT" }, { status: 409 });
  }

  const content = normalizeBoard(body);
  let currentBlob;
  let currentText: string | null = null;

  try {
    currentBlob = await readCurrentBlob();
    if (currentBlob) {
      if (currentBlob.statusCode === 304) {
        return jsonResponse({ error: "Unable to read the current board revision.", code: "STORAGE_READ_FAILED" }, { status: 503 });
      }

      if (requestedRevision !== currentBlob.revision) {
        return jsonResponse(
          { error: "The saved board changed before this save. Your draft is still here. Save again to apply it to the latest board.", code: "CONFLICT", revision: currentBlob.revision },
          { status: 409 },
        );
      }

      currentText = await streamToText(currentBlob.stream);
      let currentParsed: unknown;
      try {
        currentParsed = JSON.parse(currentText) as unknown;
      } catch {
        return jsonResponse({ error: "The existing board is not valid JSON, so it was left unchanged.", code: "STORAGE_READ_FAILED" }, { status: 500 });
      }

      const currentSchemaStatus = getSchemaVersionStatus(currentParsed);
      if (currentSchemaStatus === "unsupported") {
        return jsonResponse({ error: "The existing board uses a newer schema, so it was left unchanged.", code: "UNSUPPORTED_SCHEMA" }, { status: 409 });
      }
      if (currentSchemaStatus === "invalid" || (!isBoardContent(currentParsed) && !isLegacyBoardContent(currentParsed) && !isLegacyPageContent(currentParsed))) {
        return jsonResponse({ error: "The existing board format is not recognized, so it was left unchanged.", code: "STORAGE_READ_FAILED" }, { status: 500 });
      }
    } else if (requestedRevision !== null && requestedRevision !== undefined) {
      return jsonResponse(
        { error: "The board was reset or removed elsewhere. Reload before saving again.", code: "CONFLICT", revision: null },
        { status: 409 },
      );
    }
  } catch {
    return jsonResponse({ error: "Unable to read the current board, so it was left unchanged.", code: "STORAGE_READ_FAILED" }, { status: 503 });
  }

  if (currentBlob && currentText !== null) {
    try {
      await put(makeBackupPath(currentBlob.revision), currentText, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: false,
        cacheControlMaxAge: 31536000,
        contentType: "application/json; charset=utf-8",
      });
    } catch {
      return jsonResponse(
        { error: "A private backup could not be created, so the board was not changed. Try saving again.", code: "BACKUP_FAILED" },
        { status: 503 },
      );
    }
  }

  let blob;
  try {
    blob = await put(CONTENT_PATH, JSON.stringify(content, null, 2), {
      access: "private",
      allowOverwrite: Boolean(currentBlob),
      cacheControlMaxAge: 60,
      contentType: "application/json; charset=utf-8",
      ...(currentBlob ? { ifMatch: currentBlob.revision } : {}),
    });
  } catch (error) {
    if (isConflictError(error)) {
      return jsonResponse(
        {
          error: "The saved board changed before this save. Your draft is still here. Save again to apply it to the latest board.",
          code: "CONFLICT",
          revision: currentBlob?.revision ?? null,
        },
        { status: 409 },
      );
    }
    return jsonResponse({ error: "Unable to save the board. Your draft is still here; try again.", code: "STORAGE_WRITE_FAILED" }, { status: 503 });
  }

  return jsonResponse({
    content,
    storageConfigured: true,
    revision: blob.etag,
    blob: {
      pathname: blob.pathname,
      etag: blob.etag,
    },
  });
}
