<?php
/**
 * Category data helpers.
 *
 * Manages block-to-category reassignment data. Users can move any block to a
 * different category in the inserter (e.g. move "core/image" from "Media" to
 * "Design"). Each override is stored as:
 *
 *     { 'block' => 'core/image', 'cat' => 'design' }
 *
 * Overrides can come from two sources:
 *
 *   1. The `npx_bm_categories` WP option (admin UI drag-and-drop).
 *   2. The `npx_bm_block_categories` filter (theme/code-level overrides).
 *
 * @since   1.0
 * @package npx-block-manager
 */

class NPX_BM_Categories {

	/**
	 * Get category overrides stored in the WP option (admin UI changes).
	 *
	 * @since 1.0
	 * @return array[] Array of associative arrays, each with 'block' and 'cat' keys.
	 */
	public static function get_categories() {
		$categories = get_option( NPX_BM_CATEGORIES, [] );
		return $categories ? array_values( $categories ) : [];
	}

	/**
	 * Get category overrides applied via the `npx_bm_block_categories` filter.
	 *
	 * These overrides are always applied regardless of the admin UI state.
	 * They appear as "filtered" (non-editable) in the Categories tab.
	 *
	 * @since 1.0
	 * @return array[] Array of override entries from the filter hook.
	 */
	public static function get_filtered() {
		$blocks = apply_filters( 'npx_bm_block_categories', [] );
		return ! empty( $blocks ) ? array_values( $blocks ) : [];
	}

	/**
	 * Get the combined list of all category overrides (option + filter).
	 *
	 * Used by the block editor script to apply all category reassignments.
	 *
	 * @since 1.0
	 * @return array[] Merged array of all category override entries.
	 */
	public static function get_all() {
		$updated  = self::get_categories();
		$filtered = self::get_filtered();
		$blocks   = array_merge( $updated, $filtered );
		return ! empty( $blocks ) ? $blocks : [];
	}

	/**
	 * Remove overrides from the WP option that are already handled by a filter.
	 *
	 * Compares the 'block' key of each entry. If a block appears in both the
	 * DB option and the filter hook, it is removed from the DB copy to prevent
	 * double-counting. The option is re-saved only when duplicates are found.
	 *
	 * @since 1.0
	 * @param  array[] $options  Category overrides from the WP option.
	 * @param  array[] $filtered Category overrides from the filter hook.
	 * @return array[] The cleaned option array (duplicates removed).
	 */
	public static function remove_duplicates( array $options, array $filtered ) {
		if ( $options && $filtered ) {
			$updated = false;
			foreach ( $filtered as $filter ) {
				$key = array_search( $filter['block'], array_column( $options, 'block' ), true );
				if ( $key !== false ) {
					unset( $options[ $key ] );
					$options = array_values( $options );
					$updated = true;
				}
			}
			if ( $updated ) {
				update_option( NPX_BM_CATEGORIES, $options );
			}
		}
		return array_values( $options );
	}
}
