# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two people sharing a household who need a quick, shared view of which clothing lives at each place. The board is public to anyone with the URL and does not require an account.

## Product Purpose

Provide a deployable two-location men’s wardrobe board where source code lives in GitHub, Vercel hosts the app and API route, and Vercel Blob stores the saved board at `content/home.json`.

## Positioning

The men’s clothing inventory is runtime data in Blob, not deployed source files. Save actions update Blob through a Vercel Function, so both people see the latest board without Git commits or redeploys.

## Operating Context

The project supports a public demo deployment with fictional data and a separate private deployment with private Blob storage. Deployment-specific labels and data stay in environment variables and Blob rather than in the repository.

## Capabilities and Constraints

The board supports exactly two locations, clothing item add/edit/delete, one optional photo per item with drag-and-drop or Browse upload, compact photo thumbnails with larger previews, quantity steppers with duplicate-type aggregation, brand storage and filtering, searchable colour selection and filtering, an occasion → Tops/Bottoms/Accessories/Other → garment-type hierarchy, Formal + Smart casual multi-occasion classification, accessory types for towels and belts, the merged Home & activewear T-shirts / workout tops type, the merged Jackets / Hoodies type, editable occasions and garment types, editable keyword rules that pre-fill classification, brand, and colour fields from item names, default mappings for UNIQLO, Army, Padini, Army shorts, Army tee, and Hashira shirt naming patterns, manual overrides with reset-on-keyword-removal behavior, local draft recovery across refreshes, reorder, pointer/touch/keyboard drag between locations, one saved board record in Blob, private pre-save recovery snapshots, v1-to-v2, v2-to-v3, v3-to-v4, v4-to-v5, v5-to-v6, and v6-to-v7 migrations with classification flags, schema compatibility checks, stale-save protection, no-cache API responses, and explicit reload confirmation when a draft is dirty. It does not include accounts, photo galleries, sharing permissions, user-facing version browsing, or third locations.

## Evidence on Hand

The user supplied the desired two-location board, Blob migration behavior, existing production URL, and release workflow. No brand assets or clothing images are required.

## Product Principles

Keep source code and saved board data separate.
Make local changes obvious and saving explicit.
Keep both locations equally useful and easy to scan.
Make the default browse path occasion → garment group → clothing items, with a full list view available for editing and reordering.
Keep deployment simple enough for a small household tool.
Keep secrets on the server.
