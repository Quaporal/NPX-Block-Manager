<?php
/**
 * Block data helpers.
 *
 * Provides static methods for reading, filtering, and deduplicating the list
 * of disabled blocks. Blocks can be disabled in two ways:
 *
 *   1. Via the `npx_bm_disabled_blocks` WP option (admin UI toggles).
 *   2. Via the `npx_bm_disabled_blocks` filter (theme/code-level overrides).
 *
 * The "filtered" blocks (from the hook) always take precedence and cannot be
 * toggled from the admin UI. `remove_duplicates()` ensures the option never
 * stores names that are already handled by the filter.
 *
 * @since   1.0
 * @package npx-block-manager
 */

class NPX_BM_Blocks {

	/**
	 * Get blocks disabled via the WP option (admin UI toggles only).
	 *
	 * @since 1.0
	 * @return string[] Flat array of block names, e.g. ['core/verse', 'core/code'].
	 */
	public static function get_disabled() {
		$blocks = get_option( NPX_BM_OPTION, [] );
		return ! empty( $blocks ) ? array_values( $blocks ) : [];
	}

	/**
	 * Get blocks disabled via the `npx_bm_disabled_blocks` filter.
	 *
	 * These blocks are always disabled regardless of the admin UI state.
	 * They appear as "filtered" (greyed-out, non-toggleable) in the UI.
	 *
	 * @since 1.0
	 * @return string[] Flat array of block names added by theme/code filters.
	 */
	public static function get_filtered() {
		$blocks = apply_filters( 'npx_bm_disabled_blocks', [] );
		return ! empty( $blocks ) ? array_values( $blocks ) : [];
	}

	/**
	 * Get the combined list of all disabled blocks (option + filter).
	 *
	 * Used by the block editor script to know which blocks to unregister,
	 * and by the admin UI to show the full disabled state.
	 *
	 * @since 1.0
	 * @return string[] Merged array of all disabled block names.
	 */
	public static function get_all_disabled() {
		return array_values( array_merge( self::get_disabled(), self::get_filtered() ) );
	}

	/**
	 * Remove blocks from the WP option that are already handled by a filter.
	 *
	 * Called during admin enqueue to keep the stored option clean. If any
	 * block name appears in both `$options` (the DB value) and `$filtered`
	 * (the hook value), it is removed from the DB copy and the option is
	 * updated. This prevents double-counting and stale entries.
	 *
	 * @since 1.0
	 * @param  string[] $options  Block names from the WP option.
	 * @param  string[] $filtered Block names from the filter hook.
	 * @return string[] The cleaned option array (duplicates removed).
	 */
	public static function remove_duplicates( array $options, array $filtered ) {
		if ( $options && $filtered ) {
			$updated = false;
			foreach ( $filtered as $filter ) {
				$key = array_search( $filter, $options, true );
				if ( $key !== false ) {
					unset( $options[ $key ] );
					$options = array_values( $options );
					$updated = true;
				}
			}
			if ( $updated ) {
				update_option( NPX_BM_OPTION, $options );
			}
		}
		return $options;
	}
}
