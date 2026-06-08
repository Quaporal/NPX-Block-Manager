# NewPixel Block Manager — Documentation

A WordPress plugin that gives administrators full control over the block editor: globally disable blocks, reassign block categories, manage block patterns, and restrict blocks per post type.

---

## Table of Contents

1. [Overview](#overview)
2. [Installation](#installation)
3. [Features](#features)
   - [Blocks Tab](#blocks-tab)
   - [Categories Tab](#categories-tab)
   - [Patterns Tab](#patterns-tab)
   - [Post Types Tab](#post-types-tab)
   - [Export](#export)
4. [Architecture](#architecture)
   - [File Structure](#file-structure)
   - [Data Flow](#data-flow)
   - [No Build Step](#no-build-step)
5. [Database Options](#database-options)
6. [REST API Endpoints](#rest-api-endpoints)
7. [Filters & Hooks](#filters--hooks)
8. [JavaScript Architecture](#javascript-architecture)
   - [Admin UI (block-manager-admin.js)](#admin-ui-block-manager-adminjs)
   - [Block Editor (block-manager.js)](#block-editor-block-managerjs)
9. [PHP Classes](#php-classes)
10. [Security](#security)
11. [Extending the Plugin](#extending-the-plugin)

---

## Overview

**NewPixel Block Manager** registers a settings page under **Settings → Block Manager** with four tabs. Each tab manages a different aspect of the WordPress block editor:

| Tab | Purpose | Storage |
|---|---|---|
| Blocks | Toggle blocks on/off globally | `npx_bm_disabled_blocks` |
| Categories | Move blocks between inserter categories | `npx_bm_categories` |
| Patterns | Toggle block patterns on/off | `npx_bm_disabled_patterns` |
| Post Types | Restrict blocks per post type | `npx_bm_post_type_blocks` |

The plugin supports two layers of control:
- **Admin UI** — settings stored in `wp_options` and managed from the settings page.
- **Code/Theme filters** — programmatic overrides via PHP filters that take precedence over the UI.

---

## Installation

1. Upload the `npx-block-manager` folder to `wp-content/plugins/`.
2. Activate the plugin from the **Plugins** screen.
3. Navigate to **Settings → Block Manager**.

**Requirements:**
- WordPress 5.0+ (block editor required).
- PHP 7.4+.
- No build step needed — the plugin uses vanilla JavaScript.

---

## Features

### Blocks Tab

Displays all registered blocks grouped by category, sorted alphabetically. Each block has a toggle switch to enable/disable it globally.

- **Per-block toggle** — Click any block to disable it across all editors.
- **Bulk category toggle** — Click the switch in a category heading (or sidebar TOC) to toggle all blocks in that category at once.
- **Search** — Filter the visible blocks by name.
- **Block variations** — Blocks like `core/embed` are expanded to show each variation (YouTube, Twitter, etc.) as a separate toggleable item.
- **Reset** — Clear all disabled blocks, reverting everything to enabled.
- **Export** — Generate PHP code to apply the same restrictions at the theme level.
- **Filtered blocks** — Blocks disabled via the `npx_bm_disabled_blocks` filter appear greyed out and cannot be toggled from the UI.

### Categories Tab

Shows every non-disabled block with a dropdown to change its inserter category.

- **Category dropdown** — Select a new category for any block.
- **"Updated" indicator** — Blocks with changed categories are highlighted.
- **Reset** — Revert all category changes (page reloads).
- **Export** — Generate PHP code with inline JS to apply category overrides.

### Patterns Tab

Lists all registered block patterns grouped by their pattern category.

- **Per-pattern toggle** — Disable individual patterns from the inserter.
- **Bulk category toggle** — Toggle all patterns in a category.
- **Virtual patterns** — Two special entries control bulk behavior:
  - `npx_bm/remote-patterns` — Disables loading of remote block patterns.
  - `npx_bm/core-patterns` — Removes core block patterns theme support.
- **Reset / Export** — Same as Blocks tab.

### Post Types Tab

Per-post-type block restrictions. Each post type gets its own sub-tab.

- **Post type tabs** — Switch between post types (e.g. Posts, Pages, custom types).
- **Per-block toggle** — Disable blocks for a specific post type only.
- **Bulk category toggle** — Toggle all blocks in a category for the current post type.
- **Reset** — Clear disabled blocks for the current post type.
- **Export** — Generate PHP code using `allowed_block_types_all` with post-type checks.
- **Global exclusions** — Blocks that are globally disabled (Blocks tab) are hidden from the Post Types tab since they are already unavailable.

### Export

Every tab has an Export button that generates ready-to-paste PHP code. This code can be added to `functions.php` or a must-use plugin to make the restrictions permanent — even after removing this plugin.

Export types and their generated hooks:

| Type | Generated Hook |
|---|---|
| Blocks | `allowed_block_types_all` filter |
| Patterns | `init` action + `unregister_block_pattern()` |
| Categories | `enqueue_block_editor_assets` + inline JS filter |
| Post Types | `allowed_block_types_all` with `$editor_ctx->post->post_type` check |

---

## Architecture

### File Structure

```
npx-block-manager/
├── block-manager.php              Main plugin file (singleton, entry point)
├── uninstall.php                  Cleanup on plugin deletion
├── DOCUMENTATION.md               This file
│
├── classes/
│   ├── class-admin.php            Admin page: menu, enqueue, page render
│   ├── class-blocks.php           Block data helpers (read/filter/deduplicate)
│   ├── class-categories.php       Category override helpers
│   ├── class-patterns.php         Pattern helpers + front-end unregistration
│   └── class-post-types.php       Per-post-type block management
│
├── includes/
│   ├── blocks-toggle.php          POST /npx_bm/toggle
│   ├── blocks-reset.php           POST /npx_bm/blocks_reset
│   ├── bulk-process.php           POST /npx_bm/bulk_process
│   ├── category-update.php        POST /npx_bm/category_update
│   ├── category-reset.php         POST /npx_bm/category_reset
│   ├── patterns-toggle.php        POST /npx_bm/pattern
│   ├── patterns-reset.php         POST /npx_bm/patterns_reset
│   ├── post-type-toggle.php       POST /npx_bm/post_type_save & post_type_reset
│   └── export.php                 GET  /npx_bm/export?type=...
│
└── assets/
    ├── js/
    │   ├── block-manager-admin.js Admin settings page UI (~1,600 lines)
    │   └── block-manager.js       Block editor integration (~100 lines)
    └── css/
        └── block-manager-admin.css Admin page styles
```

### Data Flow

```
┌─────────────────────┐
│   Admin Settings    │
│   (Settings Page)   │
│                     │
│  block-manager-     │    REST API     ┌────────────────┐
│  admin.js           │ ──────────────► │ includes/*.php │
│                     │                 │                │
│  Reads:             │ ◄────────────── │ Reads/writes   │
│  npx_bm_localize    │    JSON         │ wp_options     │
└─────────────────────┘                 └────────────────┘
                                              │
                                              ▼
┌─────────────────────┐              ┌───────────────────┐
│   Block Editor      │              │   wp_options      │
│   (Post/Page/etc)   │              │                   │
│                     │              │ npx_bm_disabled_  │
│  block-manager.js   │ ◄─────────   │  blocks           │
│                     │  localized   │ npx_bm_categories │
│  Unregisters blocks │  data via    │ npx_bm_disabled_  │
│  Remaps categories  │  PHP         │  patterns         │
│  Hides patterns     │              │ npx_bm_post_type_ │
└─────────────────────┘              │  blocks           │
                                     └───────────────────┘
```

### No Build Step

This plugin uses **vanilla JavaScript** (ES5-compatible IIFE pattern). There is no webpack, Babel, or npm dependency. The JS files are loaded directly by `wp_enqueue_script()`.

---

## Database Options

All plugin data is stored in the `wp_options` table using four keys:

### `npx_bm_disabled_blocks`

**Type:** `string[]` — Flat array of block names.

```php
['core/verse', 'core/code', 'variation;core/embed;youtube']
```

Variation entries use the format `variation;<parentBlock>;<variationName>`.

### `npx_bm_categories`

**Type:** `array[]` — Array of associative arrays.

```php
[
    ['block' => 'core/image', 'cat' => 'design'],
    ['block' => 'core/heading', 'cat' => 'text'],
]
```

### `npx_bm_disabled_patterns`

**Type:** `string[]` — Flat array of pattern names.

```php
['core/query-standard-posts', 'npx_bm/remote-patterns']
```

### `npx_bm_post_type_blocks`

**Type:** `array` — Associative array keyed by post type slug.

```php
[
    'post' => ['core/verse', 'core/code'],
    'page' => ['core/latest-posts'],
]
```

---

## REST API Endpoints

All endpoints are under the `npx_bm` namespace. Permission: `activate_plugins` capability (filterable via `npx_bm_user_role`).

| Method | Endpoint | Description |
|---|---|---|
| POST | `/npx_bm/toggle` | Toggle a single block on/off |
| POST | `/npx_bm/blocks_reset` | Reset all disabled blocks |
| POST | `/npx_bm/bulk_process` | Bulk enable/disable blocks or patterns in a category |
| POST | `/npx_bm/category_update` | Add or remove a block category override |
| POST | `/npx_bm/category_reset` | Reset all category overrides |
| POST | `/npx_bm/pattern` | Toggle a single pattern on/off |
| POST | `/npx_bm/patterns_reset` | Reset all disabled patterns |
| POST | `/npx_bm/post_type_save` | Save disabled blocks for a post type |
| POST | `/npx_bm/post_type_reset` | Reset disabled blocks for a post type |
| GET  | `/npx_bm/export` | Export settings as PHP code (`?type=blocks\|patterns\|categories\|post_types`) |

### Request/Response Examples

**Toggle a block:**
```json
// POST /wp-json/npx_bm/toggle
// Request:
{ "block": "core/verse", "title": "Verse", "type": "disable" }

// Response:
{ "success": true, "msg": "<strong>Verse</strong> block disabled", "disabled_blocks": ["core/verse"] }
```

**Bulk process:**
```json
// POST /wp-json/npx_bm/bulk_process
// Request:
{ "blocks": ["core/verse", "core/code"], "type": "blocks", "direction": "disable" }

// Response:
{ "success": true, "msg": "All blocks in category disabled", "disabled": ["core/verse", "core/code"] }
```

**Export:**
```json
// GET /wp-json/npx_bm/export?type=blocks
// Response:
{ "code": "add_filter( 'allowed_block_types_all', function ( $allowed_blocks, $editor_ctx ) { ... } );" }
```

---

## Filters & Hooks

### `npx_bm_user_role`

**Type:** Filter  
**Default:** `'activate_plugins'`  
**Description:** Control which capability is required to access Block Manager (both the admin page and REST endpoints).

```php
// Allow editors to access Block Manager.
add_filter( 'npx_bm_user_role', function () {
    return 'edit_others_posts';
} );
```

### `npx_bm_disabled_blocks`

**Type:** Filter  
**Default:** `[]`  
**Description:** Programmatically disable blocks at the code level. These blocks appear as "filtered" in the Blocks tab and cannot be re-enabled from the UI.

```php
add_filter( 'npx_bm_disabled_blocks', function ( $blocks ) {
    $blocks[] = 'core/verse';
    $blocks[] = 'core/freeform';
    return $blocks;
} );
```

### `npx_bm_block_categories`

**Type:** Filter  
**Default:** `[]`  
**Description:** Programmatically override block categories at the code level. These overrides appear as "filtered" in the Categories tab.

```php
add_filter( 'npx_bm_block_categories', function ( $overrides ) {
    $overrides[] = [ 'block' => 'core/image', 'cat' => 'design' ];
    return $overrides;
} );
```

### `npx_bm_disabled_patterns`

**Type:** Filter  
**Default:** `[]`  
**Description:** Programmatically disable block patterns at the code level.

```php
add_filter( 'npx_bm_disabled_patterns', function ( $patterns ) {
    $patterns[] = 'core/query-standard-posts';
    return $patterns;
} );
```

---

## JavaScript Architecture

### Admin UI (`block-manager-admin.js`)

A single IIFE (~1,600 lines) that renders the entire settings page. Key sections:

| Section | Purpose |
|---|---|
| **Constants** | `EXCLUDED_BLOCKS`, `VARIATION_BLOCKS` |
| **Utilities** | `escHtml()`, `el()`, `apiFetch()`, `notify()`, `renderIcon()`, `genericIconSvg()` |
| **Block helpers** | `getVisibleBlocks()`, `expandVariations()`, `getSortedCategories()`, `groupByCategory()`, `sortBlocksAlpha()` |
| **UI state** | `updateCategoryHeading()`, `applyFilteredCategories()`, `handleSearch()` |
| **Sidebar builder** | `buildSidebar()` — reusable legend/search/TOC factory |
| **Block group renderer** | `renderBlockGroup()` — reusable category section renderer |
| **Tab renderers** | `renderBlocksTab()`, `renderCategoriesTab()`, `renderPatternsTab()`, `renderPostTypesTab()` |
| **Export modal** | `showExportModal()` — fetch + display PHP export code |
| **Entry point** | `init()` — detect active tab, route to renderer |

### Localized Data Objects

**`npx_bm_localize`** (injected by `wp_localize_script` in `class-admin.php`):

| Key | Type | Description |
|---|---|---|
| `root` | string | REST API root URL |
| `nonce` | string | WP REST nonce |
| `wpVersion` | string | WordPress version |
| `disabledBlocks` | string[] | Blocks disabled via option (cleaned) |
| `filteredBlocks` | string[] | Blocks disabled via filter |
| `disabledBlocksAll` | string[] | All disabled blocks (merged) |
| `blockCategories` | array[] | Category overrides from option (cleaned) |
| `filteredCategories` | array[] | Category overrides from filter |
| `filteredCategoriesAll` | array[] | All category overrides (merged) |
| `patterns` | object | Patterns grouped by category |
| `disabledPatterns` | string[] | Patterns disabled via option (cleaned) |
| `filteredPatterns` | string[] | Patterns disabled via filter |
| `disabledPatternsAll` | string[] | All disabled patterns (merged) |
| `postTypes` | array[] | Available post types ({name, label}) |
| `postTypeBlocks` | object | Post-type → disabled blocks map |

### Block Editor (`block-manager.js`)

A small IIFE (~100 lines) that runs in every block editor screen. It:

1. Applies category overrides via `wp.hooks.addFilter('blocks.registerBlockType')`.
2. Unregisters disabled blocks/variations via `wp.domReady()` + `wp.blocks.unregisterBlockType()`.
3. Hides disabled patterns by setting `supports.inserter = false`.

---

## PHP Classes

### `NPX_Block_Manager` (block-manager.php)

The main plugin singleton. Loads all files, enqueues the block editor script, and provides the `has_access()` permission check used by all REST endpoints.

### `NPX_BM_Admin` (class-admin.php)

Manages the admin settings page: registers the submenu, enqueues styles/scripts, bootstraps the block editor environment on the settings page, and renders the page HTML.

### `NPX_BM_Blocks` (class-blocks.php)

Static helper methods for reading and managing disabled blocks:
- `get_disabled()` — From WP option.
- `get_filtered()` — From code filter.
- `get_all_disabled()` — Merged.
- `remove_duplicates()` — Clean option entries that overlap with filter entries.

### `NPX_BM_Categories` (class-categories.php)

Same pattern as Blocks, but for category overrides. Each entry is `{ block, cat }`.

### `NPX_BM_Patterns` (class-patterns.php)

Manages disabled patterns and handles front-end unregistration. The constructor hooks into `init` and `after_setup_theme` to unregister patterns before the editor loads.

### `NPX_BM_Post_Types` (class-post-types.php)

Static helpers for CRUD on the per-post-type disabled blocks map.

---

## Security

- All REST endpoints require the `activate_plugins` capability (filterable via `npx_bm_user_role`).
- All user inputs are sanitized with `sanitize_text_field()`, `sanitize_key()`, or `array_map('sanitize_text_field', ...)`.
- Nonces are verified via `X-WP-Nonce` header and WordPress REST API built-in nonce check.
- Output is escaped with `esc_url_raw()`, `esc_attr()`, `wp_json_encode()`, and HTML entity escaping in JS.

---

## Extending the Plugin

### Disable blocks programmatically

```php
add_filter( 'npx_bm_disabled_blocks', function ( $blocks ) {
    $blocks[] = 'core/verse';
    return $blocks;
} );
```

### Restrict access to editors

```php
add_filter( 'npx_bm_user_role', function () {
    return 'edit_others_posts';
} );
```

### Override categories programmatically

```php
add_filter( 'npx_bm_block_categories', function ( $overrides ) {
    $overrides[] = [ 'block' => 'core/image', 'cat' => 'design' ];
    return $overrides;
} );
```

### Disable patterns programmatically

```php
add_filter( 'npx_bm_disabled_patterns', function ( $patterns ) {
    $patterns[] = 'core/query-standard-posts';
    $patterns[] = 'npx_bm/remote-patterns'; // Disable remote patterns
    return $patterns;
} );
```

### Export settings and remove the plugin

1. Open each tab and click **Export**.
2. Copy the PHP code and paste it into your theme's `functions.php` or a must-use plugin.
3. Deactivate and delete the plugin — the restrictions remain active via your code.
