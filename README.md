# Wardrobe Inventory

[Open the live demo](https://wardrobe-inventory-demo.vercel.app)

The demo uses fictional starter data, generic location labels, bundled sample illustrations, and browser-only saving. It does not access the personal wardrobe or share edits between visitors.

This project provides a shared men’s wardrobe inventory across two locations:

- GitHub stores the website source code.
- Vercel hosts the Next.js app.
- `/api/content` runs as a Vercel server function.
- Vercel Blob stores the clothing board at `content/home.json` and private item photos under `content/photos/`.
- The board has two fixed locations. The stored IDs remain `girlfriend` and `home` so existing entries keep their locations; private deployments can provide their own labels through environment variables.
- The wardrobe taxonomy is organized as occasion → garment group (`Tops`, `Bottoms`, `Accessories`, or `Other`) → garment type, with defaults for Formal, Smart casual, Casual, Home & activewear, and Other. An item may be tagged as both Formal and Smart casual.
- Manage occasions and garment types from the board. Create, rename, or delete them; deleting a definition reassigns affected items to the nearest `Other` fallback.
- Add, edit, disable, or delete keyword autofill rules from Manage wardrobe structure. While adding or editing a piece, matching whole words or phrases in its name pre-fill the selected occasion, group, garment type, brand, and/or colour; manual choices stay protected and automatic fields reset when their matching words are removed.
- The default name mappings include `UNIQLO` → brand `UNIQLO` plus Casual/Tops/T-shirts, `Army shorts` → brand `Army` plus Home & activewear/Bottoms/Shorts, `Army tee` → brand `Army` plus Home & activewear/Tops/T-shirts / workout tops, and `Padini` → brand `Padini`. Standard colour words and Light/Dark colour variants—including the separate Navy Blue family—are recognized automatically; a specific Light/Dark variant takes precedence over its base colour, while multiple distinct colours become `Multicolour`.
- Item names are normalized to consistent title-style capitalization when saved while preserving known brand casing such as `UNIQLO` and `NTUBS`.
- Attach one JPEG, PNG, or WebP photo up to 10 MB to each item by dropping it into the item form or browsing from the device. Photos use separate private Blob objects and are served through the app without putting image data into the board JSON.

## Public demo mode

The [public demo](https://wardrobe-inventory-demo.vercel.app) uses the same codebase with a separate Vercel project and `WARDROBE_MODE=demo`. It loads only fictional starter items and generic bundled illustrations. Board edits are saved in the visitor’s browser under demo-only localStorage keys; they are not sent to Vercel Blob, do not sync between visitors or devices, and can be removed with Reset demo. Demo mode blocks `/api/content`, `/api/uploads`, and `/api/photos` before any Blob operation.

Keep `WARDROBE_MODE` unset or set it to `personal` for a private deployment. Set the four `WARDROBE_LOCATION_*` variables and `WARDROBE_BRAND_LABEL` in that deployment’s environment; keep their values out of source control. The demo project must not be connected to the personal Blob store and does not need `BLOB_READ_WRITE_TOKEN`.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

For production saves, set `BLOB_READ_WRITE_TOKEN`. In Vercel, keep the existing Blob store connected to the project so Vercel adds the token automatically. Without the token, the board remains usable for local UI testing and Save reports that storage is unavailable. The optional `CONTENT_BACKUPS_PREFIX` variable changes the private backup prefix; it defaults to `content/backups`.

## Deploy

1. Push this folder to the GitHub repository.
2. Keep the private Blob store connected only to the private deployment.
3. Deploy the demo from its separate project with `WARDROBE_MODE=demo`.

The first page load uses an empty board if no Blob object exists yet. If the existing Blob object is the old page-shaped document, the API returns an empty unsaved board and preserves the legacy object until the first explicit Save. That Save intentionally replaces `content/home.json` with the board schema. No Git commit or redeploy is needed for later item edits.

Saved wardrobe data is kept separate from the repository and is never written by a build or deploy. Before every replacement of an existing `content/home.json`, the API writes the exact previous JSON to a unique private Blob object under `content/backups/`. If that backup fails, the main board is not changed. Saves use the latest Blob metadata ETag for conditional writes; if a revision changes, the browser keeps the draft, refreshes the revision, and a deliberate second Save can apply it. Unsaved drafts are also restored from browser storage after a refresh and cleared after a confirmed save. Backups are private recovery copies and are not listed or exposed by the public API.

## Saved document

```json
{
  "schemaVersion": 7,
  "keywordRules": [
    {
      "id": "default-t-shirts",
      "keywords": ["t-shirt", "tee"],
      "enabled": true,
      "priority": 50,
      "target": { "garmentGroup": "Tops", "garmentType": "T-shirts" }
    }
  ],
  "taxonomy": {
    "occasions": ["Formal", "Smart casual", "Casual", "Home & activewear", "Other"],
    "garmentTypes": {
      "Casual": {
        "Tops": ["T-shirts", "Other"],
        "Bottoms": ["Jeans", "Other"],
        "Accessories": ["Towels", "Belts", "Accessories", "Other"],
        "Other": ["Sneakers", "Other"]
      }
    }
  },
  "items": [
    {
      "id": "item-id",
      "name": "Black overshirt",
      "occasions": ["Smart casual"],
      "garmentGroup": "Tops",
      "garmentType": "Overshirts",
      "colour": "Black",
      "brand": "UNIQLO",
      "needsClassification": false,
      "photo": {
        "pathname": "content/photos/photo-example.webp",
        "filename": "black-overshirt.webp",
        "contentType": "image/webp",
        "size": 48231
      },
      "notes": "",
      "quantity": 1,
      "location": "girlfriend",
      "createdAt": "2026-07-28T00:00:00.000Z",
      "updatedAt": "2026-07-28T00:00:00.000Z"
    }
  ],
  "updatedAt": "2026-07-28T00:00:00.000Z"
}
```

The API accepts previous board formats without rewriting them automatically. On load, legacy category/subcategory entries are copied into the current draft as `Other` → `Other` → `Other`, marked with `needsClassification: true`, and their previous classification is appended to their notes. Existing v2 and v3 boards receive default colour values of `Unspecified`, v4 boards receive an empty brand, v5 boards receive the new Accessories taxonomy and normalized garment types, and v6 boards receive normalized `occasions` arrays in memory; older boards are upgraded to the current schema only on an explicit Save. Existing `Other` → `Accessories`, `Other` → `Belts`, and `Other` → `Towels` items move to the Accessories group, while Home & activewear `T-shirts` and `Workout tops` become `T-shirts / workout tops`. The original Blob remains untouched until then, and that replacement first creates an exact private backup. Documents with a newer schema are rejected without overwriting the current record.

Items with the same name, occasion, garment group, garment type, colour, brand, and location are combined when added again and when the board loads; `quantity` is the total number of pieces in that group. Items awaiting classification are kept distinct by ID so migration never merges records accidentally. Colours use a searchable autocomplete against the standard colour list, and both colour and brand can filter the board on desktop and mobile.

The API recognizes the old page-shaped Blob document as legacy content, returns an empty unsaved board, and does not migrate or overwrite it automatically. The first explicit Save replaces it with the clothing schema.

Photo uploads are limited to one image per item and 10 MB per image. Replacing or removing a photo updates the item reference; existing Blob photo objects remain available for recovery snapshots.
