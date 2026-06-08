/**
 * NPX Block Manager — admin UI (vanilla JS, no build step required).
 *
 * This IIFE powers the entire Block Manager settings page. It renders four tabs:
 *
 *   - Blocks     → renderBlocksTab()        — toggle blocks on/off globally.
 *   - Categories → renderCategoriesTab()    — reassign blocks to different categories.
 *   - Patterns   → renderPatternsTab()      — toggle block patterns on/off.
 *   - Post Types → renderPostTypesTab()     — restrict blocks per post type.
 *
 * Architecture:
 *   - No build step: this is a plain IIFE loaded via wp_enqueue_script.
 *   - All DOM is constructed programmatically via the `el()` helper.
 *   - REST API calls are made via `apiFetch()` (shared helper for all tabs).
 *   - Shared utilities (renderIcon, expandVariations, groupByCategory, etc.)
 *     are defined once and reused across all four tabs.
 *
 * Globals consumed (provided by WordPress before this script loads):
 *   wp.blocks            — Block type registry (wp-blocks).
 *   wp.blockLibrary      — Core block registration (wp-block-library).
 *   wp.element           — React element utilities, used for renderToString().
 *   npx_bm_localize      — Main data object injected by class-admin.php via wp_localize_script().
 *
 * @package npx-block-manager
 */
( function () {
	'use strict';

	/* ------------------------------------------------------------------ */
	/*  Constants                                                           */
	/* ------------------------------------------------------------------ */

	/**
	 * Blocks to always exclude from the admin UI lists.
	 * These are internal/deprecated blocks that should never appear.
	 * @type {string[]}
	 */
	var EXCLUDED_BLOCKS = [
		'core/missing',
		'core/text-columns',
		'core/navigation-submenu',
	];

	/**
	 * Block types whose variations should be expanded as individual toggleable
	 * items in the block list (e.g. core/embed → YouTube, Twitter, etc.).
	 * @type {string[]}
	 */
	var VARIATION_BLOCKS = [ 'core/embed', 'core/paragraph', 'core/heading' ];

	/* ------------------------------------------------------------------ */
	/*  Utilities                                                           */
	/* ------------------------------------------------------------------ */

	/** @type {Object} Localized data from wp_localize_script ('npx_bm_localize'). */
	var loc = window.npx_bm_localize || {};

	/**
	 * Escape HTML special characters to prevent XSS in innerHTML assignments.
	 *
	 * @param {string} str - Raw string to escape.
	 * @returns {string} HTML-safe string.
	 */
	function escHtml( str ) {
		return String( str )
			.replace( /&/g, '&amp;' ).replace( /</g, '&lt;' )
			.replace( />/g, '&gt;' ).replace( /"/g, '&quot;' );
	}

	/**
	 * Create a DOM element with attributes and children.
	 *
	 * A lightweight alternative to React.createElement for vanilla JS DOM building.
	 * Supports 'className', 'htmlFor', and 'on*' event listener attributes.
	 * Children can be a string (set as innerHTML), a single node, or an array of nodes.
	 *
	 * @param {string}                          tag      - HTML tag name.
	 * @param {Object|null}                      attrs    - Attribute map (className, onClick, etc.).
	 * @param {string|HTMLElement|HTMLElement[]}  children - Content to append.
	 * @returns {HTMLElement} The created DOM element.
	 */
	function el( tag, attrs, children ) {
		var node = document.createElement( tag );
		if ( attrs ) {
			Object.keys( attrs ).forEach( function ( k ) {
				if ( k === 'className' ) {
					node.className = attrs[ k ];
				} else if ( k === 'htmlFor' ) {
					node.htmlFor = attrs[ k ];
				} else if ( k.startsWith( 'on' ) ) {
					node.addEventListener( k.slice( 2 ).toLowerCase(), attrs[ k ] );
				} else {
					node.setAttribute( k, attrs[ k ] );
				}
			} );
		}
		if ( children ) {
			if ( typeof children === 'string' ) {
				node.innerHTML = children;
			} else if ( Array.isArray( children ) ) {
				children.forEach( function ( c ) { if ( c ) node.appendChild( c ); } );
			} else {
				node.appendChild( children );
			}
		}
		return node;
	}

	/**
	 * POST to the plugin's REST API and return parsed JSON.
	 *
	 * Uses the root URL and nonce from `npx_bm_localize`. All four tab
	 * renderers use this helper for REST API calls.
	 *
	 * @param {string} path - Relative REST path, e.g. 'npx_bm/toggle/'.
	 * @param {Object} data - JSON-serializable request body.
	 * @returns {Promise<Object>} Parsed JSON response.
	 */
	function apiFetch( path, data ) {
		return fetch( loc.root + path, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': loc.nonce },
			body: JSON.stringify( data ),
		} ).then( function ( r ) { return r.json(); } );
	}

	/**
	 * Append a toast notification to the floating notification list.
	 *
	 * Creates a styled div that auto-dismisses after 3 seconds with a fade-out.
	 *
	 * @param {string}  msg     - Notification text to display.
	 * @param {boolean} success - True for success (green), false for error (red).
	 */
	function notify( msg, success ) {
		var list = document.getElementById( 'npx-bm-notification-list' );
		if ( ! list ) { return; }
		var item = el( 'div', {
			className: 'npx-bm-notification npx-bm-notification--' + ( success ? 'success' : 'error' ),
			role: 'alert',
		} );

		var icon = el( 'span', {
			className: 'dashicons dashicons-' + ( success ? 'yes-alt' : 'no' ),
			'aria-hidden': 'true',
		} );
		var text = el( 'span' );
		text.textContent = msg;
		item.appendChild( icon );
		item.appendChild( text );

		list.appendChild( item );

		window.requestAnimationFrame( function () {
			item.classList.add( 'active' );
		} );

		setTimeout( function () {
			item.classList.add( 'out' );
			setTimeout( function () {
				if ( item.parentNode ) { item.parentNode.removeChild( item ); }
			}, 1000 );
		}, 3000 );
	}

	/**
	 * Render a block's icon as an HTML string.
	 *
	 * Handles all icon formats WordPress uses:
	 *   - `{ src: 'dashicons-xxx', foreground: '#hex' }` → dashicon span.
	 *   - `{ src: ReactElement }` → rendered via wp.element.renderToString().
	 *   - `'dashicons-xxx'`       → dashicon span.
	 *   - `ReactElement`          → rendered via wp.element.renderToString().
	 *   - `null/undefined`        → generic placeholder SVG.
	 *
	 * @param {Object} block - Block type object with an `icon` property.
	 * @returns {string} HTML string for the icon.
	 */
	function renderIcon( block ) {
		var icon = block.icon;
		if ( ! icon ) { return genericIconSvg(); }

		// Icon can be:
		//   { src: ReactElement|string, foreground: '#hex' }  — plain block icons
		//   ReactElement                                       — embed variation icons
		//   string                                             — dashicons slug
		var src, fg;
		if ( typeof icon === 'object' && icon !== null && 'src' in icon ) {
			src = icon.src;
			fg  = icon.foreground || '';
		} else {
			src = icon;
			fg  = '';
		}

		var fgStyle = fg ? ' style="color:' + escHtml( fg ) + '"' : '';

		if ( typeof src === 'string' ) {
			var cls = src.indexOf( 'dashicons-' ) === 0 ? src : ( 'dashicons-' + src );
			return '<span class="dashicons ' + escHtml( cls ) + '"' + fgStyle + '></span>';
		}
		if ( src && window.wp && wp.element && wp.element.renderToString ) {
			try {
				var html = wp.element.renderToString( src );
				if ( html ) { return '<span' + fgStyle + '>' + html + '</span>'; }
			} catch ( e ) { /* fall through */ }
		}
		return genericIconSvg();
	}

	/**
	 * Return a generic placeholder SVG icon for blocks with no icon defined.
	 *
	 * @returns {string} SVG markup string.
	 */
	function genericIconSvg() {
		return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect x="4" y="4" width="16" height="16" rx="2" fill="currentColor" opacity=".25"/></svg>';
	}

	/**
	 * Sort an array of block objects alphabetically by title (case-insensitive).
	 *
	 * @param {Object[]} blocks - Array of block type objects.
	 * @returns {Object[]} New sorted array (original is not mutated).
	 */
	function sortBlocksAlpha( blocks ) {
		return blocks.slice().sort( function ( a, b ) {
			var ta = ( a.title || a.name ).toUpperCase();
			var tb = ( b.title || b.name ).toUpperCase();
			return ta < tb ? -1 : ta > tb ? 1 : 0;
		} );
	}

	/**
	 * Get all visible (non-internal) block types from the registry.
	 *
	 * Filters out hidden blocks (inserter: false), internal blocks
	 * (EXCLUDED_BLOCKS), and optionally any additional names in `alsoExclude`.
	 * Returns the result sorted alphabetically.
	 *
	 * @param {string[]|null} alsoExclude - Additional block names to exclude.
	 * @returns {Object[]} Sorted array of block type objects.
	 */
	function getVisibleBlocks( alsoExclude ) {
		var all = wp.blocks.getBlockTypes();
		return sortBlocksAlpha(
			all.filter( function ( b ) {
				if ( b.supports && b.supports.inserter === false ) { return false; }
				if ( EXCLUDED_BLOCKS.indexOf( b.name ) !== -1 ) { return false; }
				if ( alsoExclude && alsoExclude.indexOf( b.name ) !== -1 ) { return false; }
				return true;
			} )
		);
	}

	/**
	 * Expand variation blocks into individual toggleable items.
	 *
	 * For blocks in VARIATION_BLOCKS (core/embed, core/paragraph, core/heading),
	 * inserts each variation as a separate pseudo-block after the parent, with a
	 * compound name format: 'variation;<parentName>;<variationName>'.
	 *
	 * This allows users to disable individual embed variations (e.g. YouTube,
	 * Twitter) independently.
	 *
	 * @param {Object[]} blocks - Flat array of block type objects.
	 * @returns {Object[]} Expanded array with variations as top-level entries.
	 */
	function expandVariations( blocks ) {
		var result = [];
		blocks.forEach( function ( block ) {
			result.push( block );
			if ( VARIATION_BLOCKS.indexOf( block.name ) !== -1 && block.variations && block.variations.length ) {
				block.variations.forEach( function ( v ) {
					if ( v.title === block.title ) { return; } // skip same-title
					result.push( Object.assign( {}, v, {
						name: 'variation;' + block.name + ';' + v.name,
						variation: block.name,
						prefix: block.title,
						category: block.category,
					} ) );
				} );
			}
		} );
		return result;
	}

	/**
	 * Get WordPress block categories sorted alphabetically, excluding 'reusable'.
	 *
	 * @returns {Object[]} Sorted array of category objects ({slug, title}).
	 */
	function getSortedCategories() {
		var cats = wp.blocks.getCategories().filter( function ( c ) {
			return c.slug !== 'reusable';
		} );
		return cats.slice().sort( function ( a, b ) {
			var ta = ( a.title || a.slug ).toUpperCase();
			var tb = ( b.title || b.slug ).toUpperCase();
			return ta < tb ? -1 : ta > tb ? 1 : 0;
		} );
	}

	/**
	 * Group a flat array of blocks into a category map.
	 *
	 * Blocks without a category are placed in 'uncategorized'. Any category
	 * that appears in the blocks but not in `catOrder` is appended to the end.
	 *
	 * @param {Object[]} blocks   - Flat array of block objects.
	 * @param {string[]} catOrder - Ordered array of category slugs.
	 * @returns {Object} Map of category slug → array of block objects.
	 */
	function groupByCategory( blocks, catOrder ) {
		var map = {};
		blocks.forEach( function ( b ) {
			var cat = b.category || 'uncategorized';
			if ( ! map[ cat ] ) { map[ cat ] = []; }
			map[ cat ].push( b );
		} );
		// Ensure any extra categories appear at the end.
		blocks.forEach( function ( b ) {
			var cat = b.category || 'uncategorized';
			if ( catOrder.indexOf( cat ) === -1 ) { catOrder.push( cat ); }
		} );
		return map;
	}

	/**
	 * Update the [active/total] counter displayed in a category heading.
	 *
	 * Also syncs the heading's toggle switch and the corresponding TOC sidebar
	 * switch to reflect whether all blocks in the category are disabled.
	 *
	 * @param {HTMLElement} groupEl - The `.npx-bm-block-group` container element.
	 */
	function updateCategoryHeading( groupEl ) {
		var items    = groupEl.querySelectorAll( '.npx-bm-block-list .item' );
		var total    = items.length;
		var offCount = groupEl.querySelectorAll( '.npx-bm-block-list .item.disabled' ).length;
		var allOff   = offCount === total;
		var span     = groupEl.querySelector( '.npx-bm-block-list-heading h3 span' );
		var sw       = groupEl.querySelector( '.npx-bm-block-list-heading .npx-bm-block-switch' );
		if ( span ) { span.textContent = '[' + ( total - offCount ) + '/' + total + ']'; }
		if ( sw ) {
			sw.classList.toggle( 'disabled', allOff );
			sw.dataset.state = allOff ? 'inactive' : 'active';
		}
		var catSlug = groupEl.id.replace( /^block-/, '' );
		var tocSw   = document.querySelector( '.npx-bm-toc-switch[data-cat="' + catSlug + '"]' );
		if ( tocSw ) {
			tocSw.classList.toggle( 'disabled', allOff );
			tocSw.dataset.state = allOff ? 'inactive' : 'active';
		}
	}

	/**
	 * Apply filtered category remappings from `npx_bm_localize.filteredCategoriesAll`.
	 *
	 * When a theme/code filter overrides a block's category, this function
	 * applies those overrides to the block objects before rendering. It also
	 * stores the original category so the Categories tab can display a "reset"
	 * state.
	 *
	 * @param {Object[]} blocks - Array of block type objects.
	 * @returns {Object[]} Blocks with category overrides applied.
	 */
	function applyFilteredCategories( blocks ) {
		var filtered = loc.filteredCategoriesAll || [];
		if ( ! filtered.length ) { return blocks; }
		return blocks.map( function ( b ) {
			var match = filtered.find( function ( f ) { return f.block === b.name; } );
			if ( match ) {
				return Object.assign( {}, b, {
					originalCategory: b.category,
					category: match.cat,
				} );
			}
			return b;
		} );
	}

	/* ------------------------------------------------------------------ */
	/*  Sidebar builder                                                     */
	/* ------------------------------------------------------------------ */

	/**
	 * Build the `.npx-bm-sidebar` element with legend, search, and TOC.
	 *
	 * This is a reusable sidebar factory used by the Blocks, Categories, and
	 * Patterns tabs. It creates three sections:
	 *
	 *   1. **Legend** — Active/Disabled/Filtered counters with slide animations.
	 *   2. **Search** — Filter input that calls `opts.onSearch` on input.
	 *   3. **TOC**    — Scrollable table-of-contents with optional per-category
	 *                   toggle switches (when `opts.onBulkCat` is provided).
	 *
	 * @param {Object}   opts
	 * @param {number}   opts.activeCount   - Initial active item count.
	 * @param {number}   opts.disabledCount - Initial disabled item count.
	 * @param {number}   opts.filteredCount - Initial filtered item count.
	 * @param {string[]} opts.catOrder      - Ordered category slugs for the TOC.
	 * @param {Object}   opts.catTitles     - Map of slug → display title.
	 * @param {Function} opts.onSearch      - Callback receiving the search term string.
	 * @param {string}   opts.id            - Suffix for element IDs (e.g. 'blocks').
	 * @param {Function} [opts.onBulkCat]   - Callback(slug, switchEl) for bulk toggle.
	 * @param {Function} [opts.getCatState] - Returns boolean: true if all blocks in slug are off.
	 * @returns {{ sidebar: HTMLElement, updateCounts: Function, refreshToc: Function }}
	 */
	function buildSidebar( opts ) {
		var activeEl, disabledEl, filteredEl;

		/* Legend (counts) */
		function makeLegend( cls, label, count ) {
			var strong = el( 'strong', { 'data-prev': count } );
			strong.textContent = count;
			var spanWrap = el( 'span', null, strong );
			var div      = el( 'div', null, spanWrap );
			var legend   = el( 'div', { className: 'npx-bm-legend ' + cls, title: count + ' ' + label } );
			legend.appendChild( div );
			legend.appendChild( el( 'span', null, label ) );
			return { legend, strong };
		}

		var activeL   = makeLegend( 'npx-bm-legend--total',    'Active',   opts.activeCount );
		var disabledL = makeLegend( 'npx-bm-legend--disabled', 'Disabled', opts.disabledCount );
		var filteredL = makeLegend( 'npx-bm-legend--filtered', 'Filtered', opts.filteredCount );
		activeEl   = activeL.strong;
		disabledEl = disabledL.strong;
		filteredEl = filteredL.strong;

		var legendWrap = el( 'div', { className: 'npx-bm-cta-wrap' }, [
			activeL.legend, disabledL.legend, filteredL.legend,
		] );
		var legendCta = el( 'div', {
			className: 'npx-bm-cta npx-bm-cta-block-legend',
			'aria-label': 'Current Block Status',
		}, legendWrap );

		/* Search */
		var searchInput = el( 'input', {
			type: 'text', id: 'npx-bm-search',
			placeholder: 'Search\u2026',
			'aria-label': 'Search blocks',
		} );
		searchInput.addEventListener( 'input', function () {
			opts.onSearch( searchInput.value );
		} );
		var searchWrap = el( 'div', { className: 'npx-bm-search' }, searchInput );

		/* TOC */
		var tocWrap = el( 'div', { className: 'npx-bm-cta-wrap', id: 'npx-bm-toc-' + opts.id } );
		function buildToc() {
			tocWrap.innerHTML = '';
			opts.catOrder.forEach( function ( slug ) {
				var btn = el( 'button', { type: 'button', className: 'npx-bm-toc' } );
				btn.textContent = opts.catTitles[ slug ] || slug;
				btn.addEventListener( 'click', function () {
					var target = document.getElementById( 'block-' + slug );
					if ( target ) {
						target.scrollIntoView( { behavior: 'smooth', block: 'start' } );
					}
				} );
				if ( opts.onBulkCat ) {
					var allOff = opts.getCatState ? opts.getCatState( slug ) : false;
					var sw = el( 'button', {
						type: 'button',
						className: 'npx-bm-toc-switch npx-bm-block-switch' + ( allOff ? ' disabled' : '' ),
						'data-state': allOff ? 'inactive' : 'active',
						'data-cat': slug,
						title: 'Toggle all blocks in this category',
					}, '<div class="npx-bm-block-switch--inner"><span></span></div>' );
					( function ( s ) {
						s.addEventListener( 'click', function () { opts.onBulkCat( slug, s ); } );
					} )( sw );
					var row = el( 'div', { className: 'npx-bm-toc-row' }, [ btn, sw ] );
					tocWrap.appendChild( row );
				} else {
					tocWrap.appendChild( btn );
				}
			} );
		}
		buildToc();

		var searchCta = el( 'div', { className: 'npx-bm-cta' }, searchWrap );
		var tocCta    = el( 'div', { className: 'npx-bm-cta' }, tocWrap );
		var sidebarChildren = [ legendCta, searchCta, tocCta ];

		if ( opts.help && opts.help.title && opts.help.paragraphs && opts.help.paragraphs.length ) {
			var helpInner = el( 'div', { className: 'npx-bm-cta-wrap npx-bm-cta-wrap--help' } );
			opts.help.paragraphs.forEach( function ( paragraph ) {
				helpInner.appendChild( el( 'p', null, paragraph ) );
			} );
			sidebarChildren.splice( 2, 0, el( 'div', { className: 'npx-bm-cta npx-bm-cta--help' }, [
				el( 'h3', null, opts.help.title ),
				helpInner,
			] ) );
		}

		var sidebar = el( 'div', { className: 'npx-bm-sidebar' }, sidebarChildren );

		function animateCount( strongEl, newVal ) {
			var prev = parseInt( strongEl.dataset.prev ) || 0;
			var dir  = prev > newVal ? 'up' : 'down';
			strongEl.classList.add( 'slide-' + dir );
			setTimeout( function () {
				strongEl.textContent     = newVal;
				strongEl.dataset.prev    = newVal;
				strongEl.classList.add( 'slide-' + dir + '-done' );
				strongEl.classList.remove( 'slide-' + dir );
				setTimeout( function () {
					strongEl.classList.remove( 'slide-' + dir + '-done' );
				}, 75 );
			}, 200 );
		}

		return {
			sidebar: sidebar,
			updateCounts: function ( active, disabled, filtered ) {
				animateCount( activeEl,   active );
				animateCount( disabledEl, disabled );
				animateCount( filteredEl, filtered );
			},
			refreshToc: function () { buildToc(); },
		};
	}

	/* ------------------------------------------------------------------ */
	/*  Block group renderer (shared by Blocks and Post Types)             */
	/* ------------------------------------------------------------------ */

	/**
	 * Render one `.npx-bm-block-group` element (a category section with heading and block list).
	 *
	 * Creates the category heading (with [active/total] counter and optional bulk
	 * toggle switch), and renders each block as a clickable button with icon,
	 * title, name, and individual toggle switch.
	 *
	 * Used by the Blocks, Patterns, and Post Types tabs.
	 *
	 * @param {string}   catSlug       - Category slug (used as group element ID).
	 * @param {string}   catTitle      - Category display title.
	 * @param {Object[]} blocks        - Block objects in this category.
	 * @param {string[]|Set} disabledNames - Disabled block names (Array or Set).
	 * @param {string[]} filteredNames - Block names that are filter-locked (non-toggleable).
	 * @param {Function} onToggle      - Callback(blockName, btnEl, groupEl) for single toggle.
	 * @param {Function|null} onBulk   - Callback(groupEl, direction, switchEl) for bulk toggle.
	 * @returns {HTMLElement} The `.npx-bm-block-group` container element.
	 */
	function renderBlockGroup( catSlug, catTitle, blocks, disabledNames, filteredNames, onToggle, onBulk ) {
		var isDisabled = typeof disabledNames.has === 'function'
			? function ( name ) { return disabledNames.has( name ); }
			: function ( name ) { return disabledNames.indexOf( name ) !== -1; };
		var isFiltered = function ( name ) { return filteredNames && filteredNames.indexOf( name ) !== -1; };

		var offCount = blocks.filter( function ( b ) { return isDisabled( b.name ); } ).length;
		var total    = blocks.length;
		var allOff   = offCount === total;

		var countSpan = el( 'span' );
		countSpan.textContent = '[' + ( total - offCount ) + '/' + total + ']';

		var h3 = el( 'h3' );
		h3.textContent = catTitle;
		h3.appendChild( countSpan );

		var heading = el( 'div', { className: 'npx-bm-block-list-heading' }, h3 );

		if ( onBulk ) {
			var sw = el( 'button', {
				type: 'button',
				className: 'npx-bm-block-switch' + ( allOff ? ' disabled' : '' ),
				'data-state': allOff ? 'inactive' : 'active',
				'aria-label': 'Toggle all blocks in this category',
				title: 'Toggle all blocks in this category',
			}, '<div class="npx-bm-block-switch--inner"><span></span></div>' );
			sw.addEventListener( 'click', function () {
				var direction = sw.dataset.state === 'active' ? 'disable' : 'enable';
				onBulk( group, direction, sw );
			} );
			heading.appendChild( sw );
		}

		var list = el( 'div', { className: 'npx-bm-block-list' } );

		blocks.forEach( function ( block ) {
			var off      = isDisabled( block.name );
			var filtered = isFiltered( block.name );
			var isVar    = !! block.variation;

			var btn = el( 'button', {
				type: 'button',
				className: 'item block-button' +
					( off ? ' disabled' : '' ) +
					( filtered ? ' filtered' : '' ) +
					( isVar ? ' is-variation' : '' ),
				'data-id':       block.name,
				'data-title':    block.title || block.name,
				'data-category': catSlug,
				'aria-label':    'Toggle block',
			} );

			var prefixHtml = isVar
				? '<span class="block-title--prefix">' + escHtml( block.prefix ) + ' Variation: </span>'
				: '';

			// For variations show "core/embed » twitter" instead of the raw compound key.
			var nameLabel = isVar
				? escHtml( block.variation ) + ' \u00bb ' + escHtml( block.name.split( ';' ).pop() )
				: escHtml( block.name );

			btn.innerHTML =
				'<div>' +
					'<div class="icon">' + renderIcon( block ) + '</div>' +
					'<p>' + prefixHtml + escHtml( block.title || block.name ) +
						'<span>' + nameLabel + '</span>' +
					'</p>' +
					'<div class="npx-bm-block-switch' + ( off ? ' disabled' : '' ) + '">' +
						'<div class="npx-bm-block-switch--inner"><span></span></div>' +
					'</div>' +
				'</div>';

			btn.addEventListener( 'click', function () {
				if ( btn.classList.contains( 'loading' ) ) { return; }
				if ( filtered ) {
					alert( 'This block has been disabled via a hook and cannot be modified.' );
					return;
				}
				onToggle( block.name, btn, group );
			} );

			list.appendChild( btn );
		} );

		var group = el( 'div', {
			className: 'npx-bm-block-group',
			id: 'block-' + catSlug,
		}, [ heading, list ] );

		return group;
	}

	/* ------------------------------------------------------------------ */
	/*  Shared search handler                                               */
	/* ------------------------------------------------------------------ */

	/**
	 * Filter visible blocks in the grid by a search term.
	 *
	 * Hides items whose `data-title` doesn't contain the search term, and
	 * hides entire category groups if none of their items match. Passing an
	 * empty string resets all items to visible.
	 *
	 * @param {string}      term     - Search term (case-insensitive substring match).
	 * @param {HTMLElement}  blocksEl - The `.npx-bm-blocks` container to search within.
	 */
	function handleSearch( term, blocksEl ) {
		var groups = blocksEl.querySelectorAll( '.npx-bm-block-group' );
		if ( ! groups.length ) { return; }

		if ( term !== '' ) {
			Array.from( groups ).forEach( function ( group ) {
				var items = group.querySelectorAll( '.item' );
				var visible = 0;
				items.forEach( function ( item ) {
					var found = item.dataset.title.toLowerCase().indexOf( term.toLowerCase() ) !== -1;
					item.style.display = found ? '' : 'none';
					if ( found ) { visible++; }
				} );
				group.style.display = visible === 0 ? 'none' : '';
			} );
		} else {
			groups.forEach( function ( group ) {
				group.style.display = '';
				group.querySelectorAll( '.item' ).forEach( function ( item ) {
					item.style.display = '';
				} );
			} );
		}
	}

	/* ------------------------------------------------------------------ */
	/*  Notification list container                                         */
	/* ------------------------------------------------------------------ */

	/**
	 * Create and append the floating notification list container to the body.
	 *
	 * @returns {HTMLElement} The notification list element.
	 */
	function createNotificationList() {
		var list = el( 'div', { id: 'npx-bm-notification-list', className: 'npx-bm-notification-list' } );
		list.setAttribute( 'aria-live', 'assertive' );
		document.body.appendChild( list );
		return list;
	}

	/**
	 * Render an animated loader while a tab initializes.
	 *
	 * @param {HTMLElement} appEl    - The #app element.
	 * @param {string}      message  - Loader message.
	 */
	function showPageLoader( appEl, message ) {
		var loader = el( 'div', { className: 'npx-bm-loader' },
			el( 'div', null, [
				el( 'div', { className: 'npx-bm-loader-pulse-wrap' },
					el( 'div', { className: 'npx-bm-loader-pulse' } )
				),
				el( 'div', null, message || 'Loading...' ),
			] )
		);
		appEl.innerHTML = '';
		appEl.appendChild( loader );
	}

	/**
	 * Keep a persistent loader sample on screen for easier styling.
	 */
	function mountLoaderPreview() {
		if ( document.getElementById( 'npx-bm-loader-preview' ) ) {
			return;
		}

		var preview = el( 'div', {
			id: 'npx-bm-loader-preview',
			className: 'npx-bm-loader npx-bm-loader--preview',
			'aria-hidden': 'true',
		},
			el( 'div', null, [
				el( 'div', { className: 'npx-bm-loader-pulse-wrap' },
					el( 'div', { className: 'npx-bm-loader-pulse' } )
				),
				el( 'div', null, 'Loader preview' ),
			] )
		);

		document.body.appendChild( preview );
	}

	/**
	 * Keep a persistent notification stack on screen for easier styling.
	 */
	function mountToastPreview() {
		if ( document.getElementById( 'npx-bm-notification-preview' ) ) {
			return;
		}

		function makePreviewToast( message, success ) {
			var item = el( 'div', {
				className: 'npx-bm-notification npx-bm-notification--' + ( success ? 'success' : 'error' ) + ' active',
				role: 'presentation',
			}, [
				el( 'span', {
					className: 'dashicons dashicons-' + ( success ? 'yes-alt' : 'no' ),
					'aria-hidden': 'true',
				} ),
				el( 'span', null, message ),
			] );

			return item;
		}

		var preview = el( 'div', {
			id: 'npx-bm-notification-preview',
			className: 'npx-bm-notification-list npx-bm-notification-list--preview',
			'aria-hidden': 'true',
		}, [
			el( 'div', { className: 'npx-bm-preview-title' }, 'Toast preview stack' ),
			makePreviewToast( 'Block activated successfully.', true ),
			makePreviewToast( 'Pattern disabled successfully.', true ),
			makePreviewToast( 'Network error. Please try again.', false ),
			makePreviewToast( 'Permission denied while saving changes.', false ),
		] );

		document.body.appendChild( preview );
	}

	/* ------------------------------------------------------------------ */
	/*  BLOCKS TAB                                                          */
	/* ------------------------------------------------------------------ */

	/**
	 * Render the Blocks tab UI.
	 *
	 * Builds the header (Reset + Export buttons), sidebar (legend, search, TOC
	 * with per-category toggle switches), and block grid grouped by category.
	 * Each block gets a toggle button that calls the `npx_bm/toggle` API.
	 * Category headings have bulk toggle switches that call `npx_bm/bulk_process`.
	 *
	 * @param {HTMLElement} container - The `#app` element to render into.
	 */
	function renderBlocksTab( container ) {
		var disabledBlocks  = ( loc.disabledBlocks  || [] ).slice();
		var filteredBlocks  = ( loc.filteredBlocks  || [] ).slice();
		var filteredCatsAll = loc.filteredCategoriesAll || [];

		// Register core blocks only if they haven't been registered yet.
		if ( wp.blockLibrary && ! wp.blocks.getBlockType( 'core/paragraph' ) ) { wp.blockLibrary.registerCoreBlocks(); }

		var rawBlocks = getVisibleBlocks( null );
		// Apply custom category assignments.
		var allBlocks = applyFilteredCategories( rawBlocks );
		// Expand to include variations as top-level items.
		allBlocks = expandVariations( allBlocks );

		var wpCats      = getSortedCategories();
		var catTitleMap = {};
		var catOrder    = [];
		wpCats.forEach( function ( c ) { catTitleMap[ c.slug ] = c.title; catOrder.push( c.slug ); } );

		var grouped = groupByCategory( allBlocks, catOrder );

		// ---- Count totals ----
		function countTotals() {
			var total = allBlocks.length;
			var dis   = allBlocks.filter( function ( b ) { return disabledBlocks.indexOf( b.name ) !== -1; } ).length;
			var fil   = allBlocks.filter( function ( b ) { return filteredBlocks.indexOf( b.name ) !== -1; } ).length;
			return { active: total - dis - fil, disabled: dis, filtered: fil };
		}

		// ---- Header ----
		var resetBtn = el( 'button', {
			type: 'button',
			className: 'npx-bm-btn wpg-btn npx-bm-btn--reset button',
			title: 'Clear all disabled blocks',
			disabled: disabledBlocks.length ? null : 'disabled',
		} );
		resetBtn.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M21 8C21 10.7614 18.7614 13 16 13C13.2386 13 11 10.7614 11 8C11 5.23858 13.2386 3 16 3C18.7614 3 21 5.23858 21 8Z" stroke="#999999" stroke-width="2"/>
				<path d="M10 15.5C10 17.433 8.433 19 6.5 19C4.567 19 3 17.433 3 15.5C3 13.567 4.567 12 6.5 12C8.433 12 10 13.567 10 15.5Z" stroke="#999999" stroke-width="2"/>
				<path d="M19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5Z" stroke="#999999" stroke-width="2"/>
				<path opacity="0.33" fill-rule="evenodd" clip-rule="evenodd" d="M11 8C11 5.23858 13.2386 3 16 3C18.7614 3 21 5.23858 21 8C21 10.7614 18.7614 13 16 13C13.2386 13 11 10.7614 11 8Z" fill="#999999"/>
				<path opacity="0.33" fill-rule="evenodd" clip-rule="evenodd" d="M14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5Z" fill="#999999"/>
			</svg>
			<span>Reset</span>`;
		resetBtn.addEventListener( 'click', function () {
			if ( ! disabledBlocks.length ) { return; }
			if ( ! confirm( 'Are you sure you want to reset and activate all currently disabled blocks?' ) ) { return; }
			resetBtn.classList.add( 'spin' );
			apiFetch( 'npx_bm/blocks_reset/' ).then( function ( data ) {
				disabledBlocks.length = 0;
				blocksEl.querySelectorAll( '.item.disabled:not(.filtered)' ).forEach( function ( i ) {
					i.classList.remove( 'disabled' );
					i.querySelector( '.npx-bm-block-switch' ).classList.remove( 'disabled' );
				} );
				blocksEl.querySelectorAll( '.npx-bm-block-group' ).forEach( function ( g ) { updateCategoryHeading( g ); } );
				var t = countTotals();
				sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
				resetBtn.setAttribute( 'disabled', 'disabled' );
				notify( data.msg || 'Blocks reset.', true );
			} ).catch( function () {
				notify( 'Error resetting blocks.', false );
			} ).finally( function () {
				resetBtn.classList.remove( 'spin' );
			} );
		} );

		var exportBtn = el( 'button', {
			type: 'button',
			className: 'npx-bm-btn wpg-btn npx-bm-btn--export button',
			title: 'Export disabled blocks as a WordPress hook',
			disabled: disabledBlocks.length ? null : 'disabled',
		} );
		exportBtn.innerHTML = `
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path opacity="0.33" d="M17.8284 6.82843C18.4065 7.40649 18.6955 7.69552 18.8478 8.06306C19 8.4306 19 8.83935 19 9.65685L19 17C19 18.8856 19 19.8284 18.4142 20.4142C17.8284 21 16.8856 21 15 21H9C7.11438 21 6.17157 21 5.58579 20.4142C5 19.8284 5 18.8856 5 17L5 7C5 5.11438 5 4.17157 5.58579 3.58579C6.17157 3 7.11438 3 9 3H12.3431C13.1606 3 13.5694 3 13.9369 3.15224C14.3045 3.30448 14.5935 3.59351 15.1716 4.17157L17.8284 6.82843Z" fill="#999999"/>
			<path d="M17.8284 6.82843C18.4065 7.40649 18.6955 7.69552 18.8478 8.06306C19 8.4306 19 8.83935 19 9.65685L19 17C19 18.8856 19 19.8284 18.4142 20.4142C17.8284 21 16.8856 21 15 21H9C7.11438 21 6.17157 21 5.58579 20.4142C5 19.8284 5 18.8856 5 17L5 7C5 5.11438 5 4.17157 5.58579 3.58579C6.17157 3 7.11438 3 9 3H12.3431C13.1606 3 13.5694 3 13.9369 3.15224C14.3045 3.30448 14.5935 3.59351 15.1716 4.17157L17.8284 6.82843Z" stroke="#999999" stroke-width="2" stroke-linejoin="round"/>
			<path d="M12 16L12 11" stroke="#999999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M9.5 14L11.5 16V16C11.7761 16.2761 12.2239 16.2761 12.5 16V16L14.5 14" stroke="#999999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		<span>Export</span>`;
		exportBtn.addEventListener( 'click', function () {
			showExportModal( 'blocks' );
		} );

		var header = el( 'header', { className: 'npx-bm-block-header' },
			el( 'div', { className: 'npx-bm-container' }, [
				el( 'div', { className: 'npx-bm-block-header--title' }, [
					el( 'h2', null, '<span>Blocks</span>' ),
					el( 'p', null, 'Remove unwanted blocks from the block inserter.' ),
				] ),
				el( 'div', { className: 'npx-bm-options' },
					el( 'div', null, [ resetBtn, exportBtn ] )
				),
			] )
		);

		// ---- Sidebar ----
		var totals  = countTotals();
		var sidebarCtrl = buildSidebar( {
			activeCount:   totals.active,
			disabledCount: totals.disabled,
			filteredCount: totals.filtered,
			catOrder:      catOrder,
			catTitles:     catTitleMap,
			onSearch:      function ( t ) { handleSearch( t, blocksEl ); },
			id:            'blocks',
			help: {
				title: 'What\'s This?',
				paragraphs: [
					'Toggle blocks on or off to control what appears in the block inserter.',
					'Use category switches for bulk updates and Export to keep your rules in theme code.',
				],
			},
			onBulkCat: function ( slug, sw ) {
				var groupEl = document.getElementById( 'block-' + slug );
				if ( ! groupEl ) { return; }
				onBulk( groupEl, sw.dataset.state === 'active' ? 'disable' : 'enable', sw );
			},
			getCatState: function ( slug ) {
				var blocks = grouped[ slug ] || [];
				return blocks.length > 0 && blocks.every( function ( b ) {
					return disabledBlocks.indexOf( b.name ) !== -1;
				} );
			},
		} );

		// ---- Block grid ----
		var blocksEl = el( 'div', { className: 'npx-bm-blocks' } );

		function onToggle( blockName, btn, groupEl ) {
			btn.classList.add( 'loading' );
			var type = disabledBlocks.indexOf( blockName ) !== -1 ? 'enable' : 'disable';

			apiFetch( 'npx_bm/toggle/', { block: blockName, title: blockName, type: type } )
				.then( function ( data ) {
					btn.classList.remove( 'loading' );
					if ( data && data.disabled_blocks !== undefined ) {
						disabledBlocks.length = 0;
						data.disabled_blocks.forEach( function ( n ) { disabledBlocks.push( n ); } );
						var isNowDisabled = disabledBlocks.indexOf( blockName ) !== -1;
						btn.classList.toggle( 'disabled', isNowDisabled );
						btn.querySelector( '.npx-bm-block-switch' ).classList.toggle( 'disabled', isNowDisabled );
						updateCategoryHeading( groupEl );
						var t = countTotals();
						sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
						resetBtn.removeAttribute( 'disabled' );
						exportBtn.removeAttribute( 'disabled' );
						notify( data.msg || 'Block updated.', !! data.success );
					}
				} )
				.catch( function () {
					btn.classList.remove( 'loading' );
					notify( 'Network error.', false );
				} );
		}

		function onBulk( groupEl, direction, sw ) {
			var listEl = groupEl.querySelector( '.npx-bm-block-list' );
			var items  = listEl.querySelectorAll( '.item:not(.filtered)' );
			if ( ! items.length ) { return; }
			var names = Array.from( items ).map( function ( i ) { return i.dataset.id; } );
			listEl.classList.add( 'loading' );
			sw.dataset.state = direction === 'enable' ? 'active' : 'inactive';

			apiFetch( 'npx_bm/bulk_process/', { blocks: names, type: 'blocks', direction: direction } )
				.then( function ( data ) {
					listEl.classList.remove( 'loading' );
					if ( data && data.success ) {
						disabledBlocks.length = 0;
						( data.disabled || [] ).forEach( function ( n ) { disabledBlocks.push( n ); } );
						items.forEach( function ( i ) {
							var off = disabledBlocks.indexOf( i.dataset.id ) !== -1;
							i.classList.toggle( 'disabled', off );
							i.querySelector( '.npx-bm-block-switch' ).classList.toggle( 'disabled', off );
						} );
						updateCategoryHeading( groupEl );
						var t = countTotals();
						sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
						resetBtn.removeAttribute( 'disabled' );
						exportBtn.removeAttribute( 'disabled' );
						notify( data.msg || 'Category updated.', true );
					}
				} )
				.catch( function () {
					listEl.classList.remove( 'loading' );
					notify( 'Network error.', false );
				} );
		}

		catOrder.forEach( function ( cat ) {
			var blocks = grouped[ cat ];
			if ( ! blocks || ! blocks.length ) { return; }
			blocksEl.appendChild(
				renderBlockGroup( cat, catTitleMap[ cat ] || cat, blocks, disabledBlocks, filteredBlocks, onToggle, onBulk )
			);
		} );

		var wrapper = el( 'div', { className: 'npx-bm-block-list-wrapper' },
			el( 'div', { className: 'npx-bm-container' }, [
				sidebarCtrl.sidebar, blocksEl,
			] )
		);

		container.appendChild( header );
		container.appendChild( wrapper );
	}

	/* ------------------------------------------------------------------ */
	/*  CATEGORIES TAB                                                      */
	/* ------------------------------------------------------------------ */

	/**
	 * Render the Categories tab UI.
	 *
	 * Shows each non-disabled block with a category dropdown selector.
	 * Changing the dropdown calls the `npx_bm/category_update` API to add or
	 * remove a category override. The sidebar legend shows Default/Updated/Filtered
	 * counts instead of the usual Active/Disabled/Filtered.
	 *
	 * @param {HTMLElement} container - The `#app` element to render into.
	 */
	function renderCategoriesTab( container ) {
		var blockCategories  = ( loc.blockCategories  || [] ).slice();
		var filteredCats     = ( loc.filteredCategories || [] ).slice();
		var disabledBlocksAll = loc.disabledBlocksAll || [];

		if ( wp.blockLibrary && ! wp.blocks.getBlockType( 'core/paragraph' ) ) { wp.blockLibrary.registerCoreBlocks(); }

		var rawBlocks  = getVisibleBlocks( null );
		var allBlocks  = applyFilteredCategories( rawBlocks );

		var wpCats = getSortedCategories();

		// Blocks that are NOT globally disabled (main list).
		var visibleBlocks = allBlocks.filter( function ( b ) {
			return disabledBlocksAll.indexOf( b.name ) === -1;
		} );

		function isUpdated( blockName ) {
			return blockCategories.some( function ( c ) { return c.block === blockName; } );
		}
		function isFiltered( blockName ) {
			return filteredCats.some( function ( c ) { return c.block === blockName; } );
		}

		var updatedCount  = visibleBlocks.filter( function ( b ) { return isUpdated( b.name ); } ).length;

		// ---- Header ----
		var resetBtn = el( 'button', {
			type: 'button',
			className: 'npx-bm-btn wpg-btn npx-bm-btn--reset button',
			title: 'Reset all block categories',
			disabled: blockCategories.length ? null : 'disabled',
		} );
		resetBtn.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M21 8C21 10.7614 18.7614 13 16 13C13.2386 13 11 10.7614 11 8C11 5.23858 13.2386 3 16 3C18.7614 3 21 5.23858 21 8Z" stroke="#999999" stroke-width="2"/>
				<path d="M10 15.5C10 17.433 8.433 19 6.5 19C4.567 19 3 17.433 3 15.5C3 13.567 4.567 12 6.5 12C8.433 12 10 13.567 10 15.5Z" stroke="#999999" stroke-width="2"/>
				<path d="M19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5Z" stroke="#999999" stroke-width="2"/>
				<path opacity="0.33" fill-rule="evenodd" clip-rule="evenodd" d="M11 8C11 5.23858 13.2386 3 16 3C18.7614 3 21 5.23858 21 8C21 10.7614 18.7614 13 16 13C13.2386 13 11 10.7614 11 8Z" fill="#999999"/>
				<path opacity="0.33" fill-rule="evenodd" clip-rule="evenodd" d="M14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5Z" fill="#999999"/>
			</svg>
			<span>Reset</span>`;
		resetBtn.addEventListener( 'click', function () {
			if ( ! confirm( 'Reset all block categories to their defaults?' ) ) { return; }
			resetBtn.classList.add( 'spin' );
			apiFetch( 'npx_bm/category_reset/' ).then( function () {
				window.location.reload();
			} ).catch( function () {
				resetBtn.classList.remove( 'spin' );
				notify( 'Error resetting categories.', false );
			} );
		} );

		var exportBtn = el( 'button', {
			type: 'button',
			className: 'npx-bm-btn wpg-btn npx-bm-btn--export button',
			title: 'Export category changes as a WordPress hook',
			disabled: blockCategories.length ? null : 'disabled',
		} );
		exportBtn.innerHTML = `
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path opacity="0.33" d="M17.8284 6.82843C18.4065 7.40649 18.6955 7.69552 18.8478 8.06306C19 8.4306 19 8.83935 19 9.65685L19 17C19 18.8856 19 19.8284 18.4142 20.4142C17.8284 21 16.8856 21 15 21H9C7.11438 21 6.17157 21 5.58579 20.4142C5 19.8284 5 18.8856 5 17L5 7C5 5.11438 5 4.17157 5.58579 3.58579C6.17157 3 7.11438 3 9 3H12.3431C13.1606 3 13.5694 3 13.9369 3.15224C14.3045 3.30448 14.5935 3.59351 15.1716 4.17157L17.8284 6.82843Z" fill="#999999"/>
			<path d="M17.8284 6.82843C18.4065 7.40649 18.6955 7.69552 18.8478 8.06306C19 8.4306 19 8.83935 19 9.65685L19 17C19 18.8856 19 19.8284 18.4142 20.4142C17.8284 21 16.8856 21 15 21H9C7.11438 21 6.17157 21 5.58579 20.4142C5 19.8284 5 18.8856 5 17L5 7C5 5.11438 5 4.17157 5.58579 3.58579C6.17157 3 7.11438 3 9 3H12.3431C13.1606 3 13.5694 3 13.9369 3.15224C14.3045 3.30448 14.5935 3.59351 15.1716 4.17157L17.8284 6.82843Z" stroke="#999999" stroke-width="2" stroke-linejoin="round"/>
			<path d="M12 16L12 11" stroke="#999999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M9.5 14L11.5 16V16C11.7761 16.2761 12.2239 16.2761 12.5 16V16L14.5 14" stroke="#999999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		<span>Export</span>`;
		exportBtn.addEventListener( 'click', function () { showExportModal( 'categories' ); } );

		var header = el( 'header', { className: 'npx-bm-block-header' },
			el( 'div', { className: 'npx-bm-container' }, [
				el( 'div', { className: 'npx-bm-block-header--title' }, [
					el( 'h2', null, '<span>Block Categories</span>' ),
					el( 'p', null, 'Organize the block inserter by modifying the category of each block.' ),
				] ),
				el( 'div', { className: 'npx-bm-options' },
					el( 'div', null, [ resetBtn, exportBtn ] )
				),
			] )
		);

		// ---- Sidebar ----
		var filteredCount = visibleBlocks.filter( function ( b ) { return isFiltered( b.name ); } ).length;
		var sidebarCtrl = buildSidebar( {
			activeCount:   visibleBlocks.length - updatedCount - filteredCount,
			disabledCount: updatedCount,
			filteredCount: filteredCount,
			catOrder:      wpCats.map( function ( c ) { return c.slug; } ),
			catTitles:     wpCats.reduce( function ( m, c ) { m[ c.slug ] = c.title; return m; }, {} ),
			onSearch:      function ( t ) { handleSearch( t, blocksEl ); },
			id:            'categories',
			help: {
				title: 'What\'s This?',
				paragraphs: [
					'The Block Categories tab lets you move blocks into categories that better match your editorial workflow.',
					'Changes apply in the inserter UI and can be exported as code when you are done.',
				],
			},
		} );
		// Relabel the legend entries for categories context.
		var legendItems = sidebarCtrl.sidebar.querySelectorAll( '.npx-bm-legend' );
		if ( legendItems[0] ) { legendItems[0].lastChild.textContent = 'Default'; }
		if ( legendItems[1] ) { legendItems[1].lastChild.textContent = 'Updated'; }
		if ( legendItems[2] ) { legendItems[2].lastChild.textContent = 'Filtered'; }

		// ---- Block list (category tab uses flat list with select dropdowns) ----
		var blocksEl = el( 'div', { className: 'npx-bm-blocks categories' } );

		// All blocks get a flat list inside a single `.npx-bm-block-list.categories` div.
		var list = el( 'div', { className: 'npx-bm-block-list categories' } );

		visibleBlocks.forEach( function ( block ) {
			var updated  = isUpdated( block.name );
			var filtered = isFiltered( block.name );

			var item = el( 'div', {
				className: 'item npx-bm-category' +
					( updated ? ' updated' : '' ) +
					( filtered ? ' filtered' : '' ),
				'data-id':    block.name,
				'data-title': block.title || block.name,
			} );

			// Current category for this block.
			var current = block.category || 'uncategorized';
			var match   = blockCategories.find( function ( c ) { return c.block === block.name; } );
			if ( match ) { current = match.cat; }
			var original = block.category || 'uncategorized';

			var iconWrap = el( 'div', { className: 'icon' } );
			iconWrap.innerHTML = renderIcon( block );

			var nameSpan = el( 'span' );
			nameSpan.textContent = block.name;
			var p = el( 'p', { title: block.title } );
			p.textContent = block.title || block.name;
			p.appendChild( nameSpan );

			var catWrap = el( 'div', { className: 'npx-bm-category-wrap' }, [ iconWrap, p ] );

			// Select dropdown.
			var select = el( 'select', {
				id: 'select-' + block.name,
				'data-original': original,
				disabled: filtered ? 'disabled' : null,
			} );
			wpCats.forEach( function ( cat ) {
				var opt = el( 'option', { value: cat.slug } );
				opt.textContent = cat.title;
				if ( cat.slug === current ) { opt.selected = true; }
				select.appendChild( opt );
			} );

			select.addEventListener( 'change', function () {
				var newCat  = select.value;
				var type    = newCat === original ? 'remove' : 'add';
				apiFetch( 'npx_bm/category_update/', {
					type: type, block: block.name,
					title: block.title, category: newCat,
				} ).then( function ( data ) {
					if ( data && data.categories ) {
						blockCategories.length = 0;
						data.categories.forEach( function ( c ) { blockCategories.push( c ); } );
						var upd = isUpdated( block.name );
						item.classList.toggle( 'updated', upd );
						var t = visibleBlocks.filter( function ( b ) { return isUpdated( b.name ); } ).length;
						sidebarCtrl.updateCounts(
							visibleBlocks.length - t - filteredCount,
							t, filteredCount
						);
						notify( data.msg || 'Category updated.', true );
						if ( blockCategories.length ) {
							resetBtn.removeAttribute( 'disabled' );
							exportBtn.removeAttribute( 'disabled' );
						}
					}
				} ).catch( function () { notify( 'Network error.', false ); } );
			} );

			var label = el( 'label', { htmlFor: 'select-' + block.name, className: 'offscreen' } );
			label.textContent = 'Update block category';

			var switchWrap = el( 'div', { className: 'npx-bm-category-wrap category-switch' }, [ label, select ] );
			item.appendChild( catWrap );
			item.appendChild( switchWrap );
			list.appendChild( item );
		} );

		blocksEl.appendChild( list );

		var wrapper = el( 'div', { className: 'npx-bm-block-list-wrapper categories' },
			el( 'div', { className: 'npx-bm-container' }, [ sidebarCtrl.sidebar, blocksEl ] )
		);

		container.appendChild( header );
		container.appendChild( wrapper );
	}

	/* ------------------------------------------------------------------ */
	/*  PATTERNS TAB                                                        */
	/* ------------------------------------------------------------------ */

	/**
	 * Render the Patterns tab UI.
	 *
	 * Similar to the Blocks tab but operates on block patterns instead of blocks.
	 * Patterns are pre-grouped by category from the server data. Each pattern
	 * gets a toggle that calls `npx_bm/pattern`. Category bulk toggles call
	 * `npx_bm/bulk_process` with type 'patterns'.
	 *
	 * @param {HTMLElement} container - The `#app` element to render into.
	 */
	function renderPatternsTab( container ) {
		var disabledPatterns  = ( loc.disabledPatterns  || [] ).slice();
		var filteredPatterns  = ( loc.filteredPatterns  || [] ).slice();
		var patternCategories = loc.patterns || {};

		// Flatten all patterns.
		var allPatterns = [];
		Object.values( patternCategories ).forEach( function ( cat ) {
			if ( cat.patterns ) { allPatterns.push.apply( allPatterns, cat.patterns ); }
		} );

		function countTotals() {
			var dis = allPatterns.filter( function ( p ) { return disabledPatterns.indexOf( p.name ) !== -1; } ).length;
			var fil = allPatterns.filter( function ( p ) { return filteredPatterns.indexOf( p.name ) !== -1; } ).length;
			return { active: allPatterns.length - dis - fil, disabled: dis, filtered: fil };
		}

		// ---- Header ----
		var resetBtn = el( 'button', {
			type: 'button',
			className: 'npx-bm-btn wpg-btn npx-bm-btn--reset button',
			title: 'Clear all disabled patterns',
			disabled: disabledPatterns.length ? null : 'disabled',
		} );
		resetBtn.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M21 8C21 10.7614 18.7614 13 16 13C13.2386 13 11 10.7614 11 8C11 5.23858 13.2386 3 16 3C18.7614 3 21 5.23858 21 8Z" stroke="#999999" stroke-width="2"/>
				<path d="M10 15.5C10 17.433 8.433 19 6.5 19C4.567 19 3 17.433 3 15.5C3 13.567 4.567 12 6.5 12C8.433 12 10 13.567 10 15.5Z" stroke="#999999" stroke-width="2"/>
				<path d="M19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5Z" stroke="#999999" stroke-width="2"/>
				<path opacity="0.33" fill-rule="evenodd" clip-rule="evenodd" d="M11 8C11 5.23858 13.2386 3 16 3C18.7614 3 21 5.23858 21 8C21 10.7614 18.7614 13 16 13C13.2386 13 11 10.7614 11 8Z" fill="#999999"/>
				<path opacity="0.33" fill-rule="evenodd" clip-rule="evenodd" d="M14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5Z" fill="#999999"/>
			</svg>
			<span>Reset</span>`;
		resetBtn.addEventListener( 'click', function () {
			if ( ! confirm( 'Are you sure you want to reset the modified Block Patterns?' ) ) { return; }
			resetBtn.classList.add( 'spin' );
			apiFetch( 'npx_bm/patterns_reset/' ).then( function ( data ) {
				disabledPatterns.length = 0;
				blocksEl.querySelectorAll( '.item.disabled:not(.filtered)' ).forEach( function ( i ) {
					i.classList.remove( 'disabled' );
					i.querySelector( '.npx-bm-block-switch' ) && i.querySelector( '.npx-bm-block-switch' ).classList.remove( 'disabled' );
				} );
				blocksEl.querySelectorAll( '.npx-bm-block-group' ).forEach( function ( g ) { updateCategoryHeading( g ); } );
				var t = countTotals();
				sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
				resetBtn.setAttribute( 'disabled', 'disabled' );
				exportBtn.setAttribute( 'disabled', 'disabled' );
				notify( data.msg || 'Patterns reset.', true );
			} ).catch( function () {
				resetBtn.classList.remove( 'spin' );
				notify( 'Error resetting patterns.', false );
			} );
		} );

		var exportBtn = el( 'button', {
			type: 'button',
			className: 'npx-bm-btn wpg-btn npx-bm-btn--export button',
			title: 'Export disabled patterns as a WordPress hook',
			disabled: disabledPatterns.length ? null : 'disabled',
		} );
		exportBtn.innerHTML = `
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path opacity="0.33" d="M17.8284 6.82843C18.4065 7.40649 18.6955 7.69552 18.8478 8.06306C19 8.4306 19 8.83935 19 9.65685L19 17C19 18.8856 19 19.8284 18.4142 20.4142C17.8284 21 16.8856 21 15 21H9C7.11438 21 6.17157 21 5.58579 20.4142C5 19.8284 5 18.8856 5 17L5 7C5 5.11438 5 4.17157 5.58579 3.58579C6.17157 3 7.11438 3 9 3H12.3431C13.1606 3 13.5694 3 13.9369 3.15224C14.3045 3.30448 14.5935 3.59351 15.1716 4.17157L17.8284 6.82843Z" fill="#999999"/>
			<path d="M17.8284 6.82843C18.4065 7.40649 18.6955 7.69552 18.8478 8.06306C19 8.4306 19 8.83935 19 9.65685L19 17C19 18.8856 19 19.8284 18.4142 20.4142C17.8284 21 16.8856 21 15 21H9C7.11438 21 6.17157 21 5.58579 20.4142C5 19.8284 5 18.8856 5 17L5 7C5 5.11438 5 4.17157 5.58579 3.58579C6.17157 3 7.11438 3 9 3H12.3431C13.1606 3 13.5694 3 13.9369 3.15224C14.3045 3.30448 14.5935 3.59351 15.1716 4.17157L17.8284 6.82843Z" stroke="#999999" stroke-width="2" stroke-linejoin="round"/>
			<path d="M12 16L12 11" stroke="#999999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M9.5 14L11.5 16V16C11.7761 16.2761 12.2239 16.2761 12.5 16V16L14.5 14" stroke="#999999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		<span>Export</span>`;
		exportBtn.addEventListener( 'click', function () { showExportModal( 'patterns' ); } );

		var header = el( 'header', { className: 'npx-bm-block-header' },
			el( 'div', { className: 'npx-bm-container' }, [
				el( 'div', { className: 'npx-bm-block-header--title' }, [
					el( 'h2', null, '<span>Block Patterns</span>' ),
					el( 'p', null, 'Select patterns to be removed from the pattern selector.' ),
				] ),
				el( 'div', { className: 'npx-bm-options' },
					el( 'div', null, [ resetBtn, exportBtn ] )
				),
			] )
		);

		// Build catOrder / catTitleMap from pattern data keys.
		var catOrder    = Object.keys( patternCategories );
		var catTitleMap = {};
		catOrder.forEach( function ( slug ) {
			catTitleMap[ slug ] = patternCategories[ slug ].label || slug;
		} );

		// ---- Sidebar ----
		var totals = countTotals();
		var sidebarCtrl = buildSidebar( {
			activeCount:   totals.active,
			disabledCount: totals.disabled,
			filteredCount: totals.filtered,
			catOrder:      catOrder,
			catTitles:     catTitleMap,
			onSearch:      function ( t ) { handleSearch( t, blocksEl ); },
			id:            'patterns',
			help: {
				title: 'What\'s This?',
				paragraphs: [
					'Control which synced and local patterns are available in the pattern picker.',
					'Use category-level toggles to disable or re-enable pattern sets quickly.',
				],
			},
		} );

		// ---- Pattern groups ----
		var blocksEl = el( 'div', { className: 'npx-bm-blocks' } );

		function onToggle( patternName, btn, groupEl ) {
			btn.classList.add( 'loading' );
			var type = disabledPatterns.indexOf( patternName ) !== -1 ? 'enable' : 'disable';
			apiFetch( 'npx_bm/pattern/', { pattern: patternName, title: patternName, type: type } )
				.then( function ( data ) {
					btn.classList.remove( 'loading' );
					if ( data && data.disabled_patterns !== undefined ) {
						disabledPatterns.length = 0;
						data.disabled_patterns.forEach( function ( n ) { disabledPatterns.push( n ); } );
						var isNowOff = disabledPatterns.indexOf( patternName ) !== -1;
						btn.classList.toggle( 'disabled', isNowOff );
						btn.querySelector( '.npx-bm-block-switch' ).classList.toggle( 'disabled', isNowOff );
						updateCategoryHeading( groupEl );
						var t = countTotals();
						sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
						if ( disabledPatterns.length ) {
							resetBtn.removeAttribute( 'disabled' );
							exportBtn.removeAttribute( 'disabled' );
						}
						notify( data.msg || 'Pattern updated.', !! data.success );
					}
				} )
				.catch( function () {
					btn.classList.remove( 'loading' );
					notify( 'Network error.', false );
				} );
		}

		function onBulk( groupEl, direction ) {
			var listEl = groupEl.querySelector( '.npx-bm-block-list' );
			var items  = listEl.querySelectorAll( '.item:not(.filtered)' );
			if ( ! items.length ) { return; }
			var names = Array.from( items ).map( function ( i ) { return i.dataset.id; } );
			listEl.classList.add( 'loading' );

			apiFetch( 'npx_bm/bulk_process/', { blocks: names, type: 'patterns', direction: direction } )
				.then( function ( data ) {
					listEl.classList.remove( 'loading' );
					if ( data && data.success ) {
						disabledPatterns.length = 0;
						( data.disabled || [] ).forEach( function ( n ) { disabledPatterns.push( n ); } );
						items.forEach( function ( i ) {
							var off = disabledPatterns.indexOf( i.dataset.id ) !== -1;
							i.classList.toggle( 'disabled', off );
							i.querySelector( '.npx-bm-block-switch' ) && i.querySelector( '.npx-bm-block-switch' ).classList.toggle( 'disabled', off );
						} );
						updateCategoryHeading( groupEl );
						var t = countTotals();
						sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
						notify( data.msg || 'Category updated.', true );
					}
				} )
				.catch( function () {
					listEl.classList.remove( 'loading' );
					notify( 'Network error.', false );
				} );
		}

		// Patterns are already categorised in the data — render each category.
		catOrder.forEach( function ( slug ) {
			var catData = patternCategories[ slug ];
			var patterns = catData.patterns || [];
			if ( ! patterns.length ) { return; }

			// Represent each pattern as a pseudo-block object.
			var items = patterns.map( function ( p ) {
				return {
					name:     p.name,
					title:    p.title,
					category: slug,
					icon:     null,
				};
			} );

			blocksEl.appendChild(
				renderBlockGroup( slug, catTitleMap[ slug ], items, disabledPatterns, filteredPatterns, onToggle, onBulk )
			);
		} );

		var wrapper = el( 'div', { className: 'npx-bm-block-list-wrapper' },
			el( 'div', { className: 'npx-bm-container' }, [ sidebarCtrl.sidebar, blocksEl ] )
		);

		container.appendChild( header );
		container.appendChild( wrapper );
	}

	/* ------------------------------------------------------------------ */
	/*  POST TYPES TAB                                                      */
	/* ------------------------------------------------------------------ */

	/**
	 * Render the Post Types tab UI.
	 *
	 * Shows per-post-type block restrictions. Sub-tabs let the user switch
	 * between post types (e.g. Posts, Pages, custom types); the block grid is
	 * rebuilt on each switch. Blocks already globally disabled are excluded.
	 * Toggles use optimistic UI: the DOM updates immediately and the API call
	 * fires in the background via `npx_bm/post_type_save`. On failure the
	 * change is reverted. Category bulk toggles call the same endpoint.
	 *
	 * @param {HTMLElement} container - The `#app` element to render into.
	 */
	function renderPostTypesTab( container ) {
		var postTypes      = ( loc.postTypes      || [] ).slice();
		var ptBlocks       = loc.postTypeBlocks   || {};
		var globalDisabled = loc.disabledBlocksAll || [];

		var currentPt  = null;
		var ptDisabled = {};

		// Initialize a disabled-blocks Set for each post type.
		postTypes.forEach( function ( pt ) {
			ptDisabled[ pt.name ] = new Set( ptBlocks[ pt.name ] || [] );
		} );

		// Register core blocks if not yet registered.
		if ( wp.blockLibrary && ! wp.blocks.getBlockType( 'core/paragraph' ) ) {
			wp.blockLibrary.registerCoreBlocks();
		}

		// Get visible blocks, excluding globally disabled ones (they are irrelevant here).
		var allBlocks = expandVariations( getVisibleBlocks( globalDisabled ) );

		var wpCats     = getSortedCategories();
		var catTitleMap = {};
		var catOrder   = [];
		wpCats.forEach( function ( c ) { catTitleMap[ c.slug ] = c.title; catOrder.push( c.slug ); } );

		var grouped        = groupByCategory( allBlocks, catOrder );
		var activeCatOrder = catOrder.filter( function ( c ) { return grouped[ c ] && grouped[ c ].length; } );

		// ---- Count helpers ----

		function countTotals() {
			if ( ! currentPt ) { return { active: 0, disabled: 0, filtered: globalDisabled.length }; }
			var dis = allBlocks.filter( function ( b ) { return ptDisabled[ currentPt ].has( b.name ); } ).length;
			return { active: allBlocks.length - dis, disabled: dis, filtered: globalDisabled.length };
		}

		function updateResetBtn() {
			if ( currentPt && ptDisabled[ currentPt ] && ptDisabled[ currentPt ].size > 0 ) {
				resetBtn.removeAttribute( 'disabled' );
			} else {
				resetBtn.setAttribute( 'disabled', 'disabled' );
			}
			// Export covers all post types — enable if any PT has disabled blocks.
			var anyDisabled = postTypes.some( function ( pt ) {
				return ptDisabled[ pt.name ] && ptDisabled[ pt.name ].size > 0;
			} );
			if ( anyDisabled ) {
				exportBtn.removeAttribute( 'disabled' );
			} else {
				exportBtn.setAttribute( 'disabled', 'disabled' );
			}
		}

		// ---- Header ----

		var ptTabsNav = el( 'nav', { id: 'npx-bm-pt-tabs', 'aria-label': 'Post types' } );

		var resetBtn = el( 'button', {
			type: 'button',
			className: 'npx-bm-btn wpg-btn npx-bm-btn--reset button',
			title: 'Reset all disabled blocks for the selected post type',
			disabled: 'disabled',
		} );
		resetBtn.innerHTML = `
			<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
				<path d="M21 8C21 10.7614 18.7614 13 16 13C13.2386 13 11 10.7614 11 8C11 5.23858 13.2386 3 16 3C18.7614 3 21 5.23858 21 8Z" stroke="#999999" stroke-width="2"/>
				<path d="M10 15.5C10 17.433 8.433 19 6.5 19C4.567 19 3 17.433 3 15.5C3 13.567 4.567 12 6.5 12C8.433 12 10 13.567 10 15.5Z" stroke="#999999" stroke-width="2"/>
				<path d="M19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5Z" stroke="#999999" stroke-width="2"/>
				<path opacity="0.33" fill-rule="evenodd" clip-rule="evenodd" d="M11 8C11 5.23858 13.2386 3 16 3C18.7614 3 21 5.23858 21 8C21 10.7614 18.7614 13 16 13C13.2386 13 11 10.7614 11 8Z" fill="#999999"/>
				<path opacity="0.33" fill-rule="evenodd" clip-rule="evenodd" d="M14 18.5C14 17.1193 15.1193 16 16.5 16C17.8807 16 19 17.1193 19 18.5C19 19.8807 17.8807 21 16.5 21C15.1193 21 14 19.8807 14 18.5Z" fill="#999999"/>
			</svg>
			<span>Reset</span>`;
		resetBtn.addEventListener( 'click', function () {
			if ( ! currentPt ) { return; }
			if ( ! confirm( 'Reset all disabled blocks for \u201c' + currentPt + '\u201d?' ) ) { return; }
			resetBtn.classList.add( 'spin' );
			apiFetch( 'npx_bm/post_type_reset', { post_type: currentPt } )
				.then( function ( data ) {
					resetBtn.classList.remove( 'spin' );
					if ( data && data.success ) {
						ptDisabled[ currentPt ] = new Set();
						renderBlocks();
						resetBtn.setAttribute( 'disabled', 'disabled' );
						notify( 'Post type reset.', true );
					} else {
						notify( ( data && data.msg ) || 'Error resetting.', false );
					}
				} )
				.catch( function () {
					resetBtn.classList.remove( 'spin' );
					notify( 'Network error.', false );
				} );
		} );

		var exportBtn = el( 'button', {
			type: 'button',
			className: 'npx-bm-btn wpg-btn npx-bm-btn--export button',
			title: 'Export all post-type restrictions as a WordPress hook',
			disabled: 'disabled',
		} );
		exportBtn.innerHTML = `
		<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path opacity="0.33" d="M17.8284 6.82843C18.4065 7.40649 18.6955 7.69552 18.8478 8.06306C19 8.4306 19 8.83935 19 9.65685L19 17C19 18.8856 19 19.8284 18.4142 20.4142C17.8284 21 16.8856 21 15 21H9C7.11438 21 6.17157 21 5.58579 20.4142C5 19.8284 5 18.8856 5 17L5 7C5 5.11438 5 4.17157 5.58579 3.58579C6.17157 3 7.11438 3 9 3H12.3431C13.1606 3 13.5694 3 13.9369 3.15224C14.3045 3.30448 14.5935 3.59351 15.1716 4.17157L17.8284 6.82843Z" fill="#999999"/>
			<path d="M17.8284 6.82843C18.4065 7.40649 18.6955 7.69552 18.8478 8.06306C19 8.4306 19 8.83935 19 9.65685L19 17C19 18.8856 19 19.8284 18.4142 20.4142C17.8284 21 16.8856 21 15 21H9C7.11438 21 6.17157 21 5.58579 20.4142C5 19.8284 5 18.8856 5 17L5 7C5 5.11438 5 4.17157 5.58579 3.58579C6.17157 3 7.11438 3 9 3H12.3431C13.1606 3 13.5694 3 13.9369 3.15224C14.3045 3.30448 14.5935 3.59351 15.1716 4.17157L17.8284 6.82843Z" stroke="#999999" stroke-width="2" stroke-linejoin="round"/>
			<path d="M12 16L12 11" stroke="#999999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
			<path d="M9.5 14L11.5 16V16C11.7761 16.2761 12.2239 16.2761 12.5 16V16L14.5 14" stroke="#999999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
		<span>Export</span>`;
		exportBtn.addEventListener( 'click', function () { showExportModal( 'post_types' ); } );

		var header = el( 'header', { className: 'npx-bm-block-header' },
			el( 'div', { className: 'npx-bm-container' }, [
				el( 'div', { className: 'npx-bm-block-header--title' }, [
					el( 'h2', null, '<span>Post Types</span>' ),
					el( 'p', null, 'Restrict blocks per post type. Disabled blocks are hidden from editors of that post type only.' ),
				] ),
				el( 'div', { className: 'npx-bm-options' },
					el( 'div', null, [ resetBtn, exportBtn ] )
				),
				ptTabsNav,
			] )
		);

		// ---- Block grid container ----
		var blocksEl = el( 'div', { className: 'npx-bm-blocks' } );

		// ---- Sidebar ----
		var totals      = countTotals();
		var sidebarCtrl = buildSidebar( {
			activeCount:   totals.active,
			disabledCount: totals.disabled,
			filteredCount: totals.filtered,
			catOrder:      activeCatOrder,
			catTitles:     catTitleMap,
			onSearch:      function ( t ) { handleSearch( t, blocksEl ); },
			id:            'post-types',
			help: {
				title: 'What\'s This?',
				paragraphs: [
					'Post Type rules apply only to editors of the selected content type.',
					'Use this when different teams need different block sets for posts, pages, or custom types.',
				],
			},
			onBulkCat:     function ( slug, sw ) {
				var groupEl = document.getElementById( 'block-' + slug );
				if ( ! groupEl ) { return; }
				onBulk( groupEl, sw.dataset.state === 'active' ? 'disable' : 'enable', sw );
			},
			getCatState:   function ( slug ) {
				if ( ! currentPt ) { return false; }
				var blocks = grouped[ slug ] || [];
				return blocks.length > 0 && blocks.every( function ( b ) {
					return ptDisabled[ currentPt ].has( b.name );
				} );
			},
		} );

		// ---- Toggle single block (optimistic UI) ----

		function onToggle( blockName, btn, groupEl ) {
			if ( btn.classList.contains( 'loading' ) ) { return; }
			btn.classList.add( 'loading' );

			var wasOff = ptDisabled[ currentPt ].has( blockName );

			// Optimistic update.
			if ( wasOff ) { ptDisabled[ currentPt ].delete( blockName ); }
			else          { ptDisabled[ currentPt ].add( blockName ); }

			var nowOff = ptDisabled[ currentPt ].has( blockName );
			btn.classList.toggle( 'disabled', nowOff );
			btn.querySelector( '.npx-bm-block-switch' ).classList.toggle( 'disabled', nowOff );
			updateCategoryHeading( groupEl );
			var t = countTotals();
			sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
			updateResetBtn();

			apiFetch( 'npx_bm/post_type_save', { post_type: currentPt, blocks: Array.from( ptDisabled[ currentPt ] ) } )
				.then( function ( data ) {
					btn.classList.remove( 'loading' );
					if ( ! data.success ) {
						// Revert on server error.
						if ( wasOff ) { ptDisabled[ currentPt ].add( blockName ); }
						else          { ptDisabled[ currentPt ].delete( blockName ); }
						btn.classList.toggle( 'disabled', wasOff );
						btn.querySelector( '.npx-bm-block-switch' ).classList.toggle( 'disabled', wasOff );
						updateCategoryHeading( groupEl );
						var r = countTotals();
						sidebarCtrl.updateCounts( r.active, r.disabled, r.filtered );
						updateResetBtn();
						notify( data.msg || 'Error saving.', false );
					} else {
						notify( data.msg || 'Post type block updated.', true );
					}
				} )
				.catch( function () {
					btn.classList.remove( 'loading' );
					// Revert on network error.
					if ( wasOff ) { ptDisabled[ currentPt ].add( blockName ); }
					else          { ptDisabled[ currentPt ].delete( blockName ); }
					btn.classList.toggle( 'disabled', wasOff );
					btn.querySelector( '.npx-bm-block-switch' ).classList.toggle( 'disabled', wasOff );
					updateCategoryHeading( groupEl );
					var r = countTotals();
					sidebarCtrl.updateCounts( r.active, r.disabled, r.filtered );
					updateResetBtn();
					notify( 'Network error.', false );
				} );
		}

		// ---- Bulk toggle category ----

		function onBulk( groupEl, direction ) {
			if ( ! currentPt ) { return; }
			var listEl = groupEl.querySelector( '.npx-bm-block-list' );
			var items  = listEl.querySelectorAll( '.item' );
			if ( ! items.length ) { return; }

			listEl.classList.add( 'loading' );

			items.forEach( function ( item ) {
				var name = item.dataset.id;
				if ( direction === 'disable' ) { ptDisabled[ currentPt ].add( name ); }
				else                           { ptDisabled[ currentPt ].delete( name ); }
				var off    = ptDisabled[ currentPt ].has( name );
				var itemSw = item.querySelector( '.npx-bm-block-switch' );
				item.classList.toggle( 'disabled', off );
				if ( itemSw ) { itemSw.classList.toggle( 'disabled', off ); }
			} );

			updateCategoryHeading( groupEl );
			var t = countTotals();
			sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
			updateResetBtn();

			apiFetch( 'npx_bm/post_type_save', { post_type: currentPt, blocks: Array.from( ptDisabled[ currentPt ] ) } )
				.then( function ( data ) {
					listEl.classList.remove( 'loading' );
					notify( ( data && data.success ) ? 'Category updated.' : ( ( data && data.msg ) || 'Error saving.' ), !! ( data && data.success ) );
				} )
				.catch( function () {
					listEl.classList.remove( 'loading' );
					notify( 'Network error.', false );
				} );
		}

		// ---- Render block grid for current post type ----

		function renderBlocks() {
			blocksEl.innerHTML = '';
			if ( ! currentPt || ! allBlocks.length ) {
				blocksEl.innerHTML = '<div style="padding:24px 20px;color:#888;font-size:13px;">No blocks available.</div>';
				return;
			}

			var disabled = ptDisabled[ currentPt ];

			activeCatOrder.forEach( function ( cat ) {
				var blocks = grouped[ cat ];
				if ( ! blocks || ! blocks.length ) { return; }
				blocksEl.appendChild(
					renderBlockGroup( cat, catTitleMap[ cat ] || cat, blocks, disabled, [], onToggle, onBulk )
				);
			} );

			var t = countTotals();
			sidebarCtrl.updateCounts( t.active, t.disabled, t.filtered );
			sidebarCtrl.refreshToc();
		}

		// ---- Switch post type ----

		function switchPt( ptName ) {
			currentPt = ptName;
			Array.from( ptTabsNav.children ).forEach( function ( btn ) {
				btn.classList.toggle( 'active', btn.dataset.pt === ptName );
			} );
			updateResetBtn();
			renderBlocks();
		}

		// ---- Build post type sub-tabs ----

		postTypes.forEach( function ( pt ) {
			var btn = el( 'button', {
				type: 'button',
				className: 'npx-bm-pt-tab',
				'data-pt': pt.name,
			} );
			btn.textContent = pt.label;
			btn.addEventListener( 'click', function () { switchPt( pt.name ); } );
			ptTabsNav.appendChild( btn );
		} );

		// ---- Assemble layout ----

		var wrapper = el( 'div', { className: 'npx-bm-block-list-wrapper' },
			el( 'div', { className: 'npx-bm-container' }, [
				sidebarCtrl.sidebar, blocksEl,
			] )
		);

		container.appendChild( header );
		container.appendChild( wrapper );

		// Activate first post type, or show empty state.
		if ( postTypes.length ) {
			switchPt( postTypes[ 0 ].name );
		} else {
			blocksEl.innerHTML = '<div style="padding:24px 20px;color:#888;font-size:13px;">No public post types found.</div>';
		}
	}

	/* ------------------------------------------------------------------ */
	/*  EXPORT MODAL                                                        */
	/* ------------------------------------------------------------------ */

	/**
	 * Show a modal overlay with exportable PHP hook code.
	 *
	 * Fetches the export code from `GET /wp-json/npx_bm/export?type=...` and
	 * displays it in a read-only textarea with a Copy button. The modal is
	 * appended to `.npx-bm-page-wrap` (or body as fallback) and can be closed
	 * by clicking the X, clicking the backdrop, or pressing Escape.
	 *
	 * @param {string} type - Export type: 'blocks', 'categories', 'patterns', or 'post_types'.
	 */
	function showExportModal( type ) {
		var existing = document.getElementById( 'npx-bm-export-modal' );
		if ( existing ) { existing.parentNode.removeChild( existing ); }

		var code = el( 'textarea', { readonly: 'readonly', className: 'npx-bm-export-code' } );
		code.textContent = 'Loading\u2026';

		var copyBtn = el( 'button', { type: 'button', className: 'npx-bm-export-copy button button-secondary' } );
		copyBtn.textContent = 'Copy';
		copyBtn.addEventListener( 'click', function () {
			navigator.clipboard.writeText( code.value ).then( function () {
				copyBtn.textContent = 'Copied!';
				setTimeout( function () { copyBtn.textContent = 'Copy'; }, 2000 );
			} );
		} );

		var closeBtn = el( 'button', { type: 'button', className: 'npx-bm-export-close button' } );
		closeBtn.innerHTML = '<span class="dashicons dashicons-no-alt"></span>';

		var typeLabel = { blocks: 'Blocks', categories: 'Categories', patterns: 'Patterns', post_types: 'Post Types' }[ type ] || type;

		var instructions = el( 'p' );
		instructions.innerHTML =
			'Paste this into your <code>functions.php</code> (or a must-use plugin) to apply these ' +
			'restrictions at the theme/code level — useful when you want to remove this plugin but keep the rules.';

		var modal = el( 'div', {
			id: 'npx-bm-export-modal',
			className: 'npx-bm-export-modal',
		}, [
			el( 'div', { className: 'npx-bm-export-modal--inner' }, [
				el( 'header', { className: 'npx-bm-export-modal--header' }, [
					el( 'h3', null, 'Export ' + typeLabel ),
					el( 'div', { className: 'npx-bm-export-modal--actions' }, [ copyBtn, closeBtn ] ),
				] ),
				instructions,
				code,
			] ),
		] );

		function close() {
			modal.classList.remove( 'active' );
			setTimeout( function () { if ( modal.parentNode ) modal.parentNode.removeChild( modal ); }, 350 );
		}

		closeBtn.addEventListener( 'click', close );
		modal.addEventListener( 'click', function ( e ) { if ( e.target === modal ) close(); } );
		document.addEventListener( 'keyup', function esc( e ) {
			if ( e.key === 'Escape' ) { close(); document.removeEventListener( 'keyup', esc ); }
		} );

		var pageWrap = document.querySelector( '.npx-bm-page-wrap' ) || document.body;
		pageWrap.appendChild( modal );
		// Force reflow then show.
		modal.getBoundingClientRect();
		modal.classList.add( 'active' );

		fetch( loc.root + 'npx_bm/export?type=' + type, {
			headers: { 'X-WP-Nonce': loc.nonce },
		} ).then( function ( r ) { return r.json(); } )
		.then( function ( data ) {
			code.textContent = data.code || '// No data.';
		} ).catch( function () {
			code.textContent = '// Error fetching export data.';
		} );
	}

	/* ------------------------------------------------------------------ */
	/*  ENTRY POINT                                                         */
	/* ------------------------------------------------------------------ */

	/**
	 * Entry point — detect the active tab from the URL and render it.
	 *
	 * Creates the notification container, then routes to the appropriate
	 * tab renderer based on URL query parameters.
	 */
	function init() {
		createNotificationList();
		mountLoaderPreview();
		mountToastPreview();

		var appEl = document.getElementById( 'app' );
		if ( ! appEl ) { return; }

		appEl.className = 'npx-bm';

		var url  = window.location.href;
		var view = 'blocks';
		if ( url.indexOf( 'categories' ) !== -1 ) { view = 'categories'; }
		if ( url.indexOf( 'patterns' )   !== -1 ) { view = 'patterns'; }
		if ( url.indexOf( 'post-types' ) !== -1 ) { view = 'post-types'; }

		var renderers = {
			blocks: renderBlocksTab,
			categories: renderCategoriesTab,
			patterns: renderPatternsTab,
			'post-types': renderPostTypesTab,
		};

		showPageLoader( appEl, 'Loading ' + view.replace( '-', ' ' ) + '...' );
		setTimeout( function () {
			appEl.innerHTML = '';
			renderers[ view ]( appEl );
		}, 250 );
	}

	// Run after DOM is ready.
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}

} )();
