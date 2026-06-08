/**
 * NewPixel Block Manager — block editor integration.
 *
 * Runs inside every block editor screen (post, page, site editor, widgets).
 * Reads the disabled blocks, category overrides, and disabled patterns
 * injected by PHP via wp_localize_script, then applies them:
 *
 *   1. **Category overrides** — Moves blocks to different categories in the
 *      inserter by hooking into `blocks.registerBlockType`.
 *   2. **Block disabling** — Unregisters disabled blocks and block variations
 *      after DOM ready via `wp.blocks.unregisterBlockType/Variation`.
 *   3. **Pattern disabling** — Hides disabled patterns from the inserter by
 *      setting `supports.inserter = false` via `blocks.registerBlockType` filter.
 *
 * Data format for variations: 'variation;<parentBlockName>;<variationName>'
 * (e.g. 'variation;core/embed;youtube'). These are split and passed to
 * `wp.blocks.unregisterBlockVariation()`.
 *
 * Note: core/paragraph is never unregistered as it is required by the editor.
 *
 * Globals provided by WordPress before this script runs:
 *   wp.blocks      (wp-blocks)      — Block type registry.
 *   wp.domReady    (wp-dom-ready)   — DOM-ready callback.
 *   wp.hooks       (wp-hooks)       — Hook/filter system.
 *   gutenberg_block_manager         — Localized data from PHP.
 */
( function () {
	'use strict';

	var data       = gutenberg_block_manager;
	var blocks     = data.blocks     || [];
	var categories = data.categories || [];
	var patterns   = data.patterns   || [];

	/* ------------------------------------------------------------------ */
	/*  Category overrides                                                  */
	/*  Each entry: { "block/name": "new-category-slug" }                  */
	/* ------------------------------------------------------------------ */

	if ( categories && categories.length ) {
		var categoryMap = {};

		categories.forEach( function ( entry ) {
			var values = Object.values( entry );
			categoryMap[ values[ 0 ] ] = values[ 1 ];
		} );

		wp.hooks.addFilter(
			'blocks.registerBlockType',
			'npx_bm/filter-blocks',
			function ( settings, name ) {
				if ( categoryMap[ name ] ) {
					settings.category = categoryMap[ name ];
					settings.npx_bm   = true;
				}
				return settings;
			}
		);
	}

	/* ------------------------------------------------------------------ */
	/*  Disable blocks and block variations                                 */
	/* ------------------------------------------------------------------ */

	wp.domReady( function () {
		if ( ! blocks || ! blocks.length ) {
			return;
		}

		blocks.forEach( function ( blockName ) {
			// Variation entries use the format "variation;<blockName>;<variationName>"
			if ( blockName.indexOf( 'variation' ) !== -1 ) {
				var parts = blockName.split( ';' );
				if ( parts.length === 3 ) {
					wp.blocks.unregisterBlockVariation( parts[ 1 ], parts[ 2 ] );
				}
				return;
			}

			// Never unregister core/paragraph — it is required by the editor.
			if ( blockName === 'core/paragraph' ) {
				return;
			}

			if ( wp.blocks.getBlockType( blockName ) !== undefined ) {
				wp.blocks.unregisterBlockType( blockName );
			}
		} );
	} );

	/* ------------------------------------------------------------------ */
	/*  Disable patterns                                                    */
	/* ------------------------------------------------------------------ */

	if ( patterns && patterns.length ) {
		wp.hooks.addFilter(
			'blocks.registerBlockType',
			'npx_bm/filter-patterns',
			function ( settings, name ) {
				if ( patterns.indexOf( name ) !== -1 ) {
					settings.supports        = settings.supports || {};
					settings.supports.inserter = false;
				}
				return settings;
			}
		);
	}

} )();
