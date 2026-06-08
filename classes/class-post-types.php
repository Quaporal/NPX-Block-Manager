<?php
/**
 * Per-post-type block management.
 *
 * Stores a map of post-type slugs to arrays of disabled block names.
 * Unlike global block disabling (which affects every editor), post-type
 * restrictions only hide blocks for editors of that specific type.
 *
 * Data structure in the `npx_bm_post_type_blocks` option:
 *
 *     [
 *         'post' => [ 'core/verse', 'core/code' ],
 *         'page' => [ 'core/latest-posts' ],
 *     ]
 *
 * At editor load time, these are merged with the global disabled list
 * in `NPX_Block_Manager::enqueue_block_editor_assets()`.
 *
 * @since   1.1
 * @package npx-block-manager
 */

class NPX_BM_Post_Types {

	/**
	 * Get the full post-type → disabled-blocks map from the WP option.
	 *
	 * @since 1.1
	 * @return array Associative array keyed by post-type slug.
	 *               Each value is a flat array of disabled block names.
	 *               Example: [ 'post' => ['core/image'], 'page' => [] ]
	 */
	public static function get_all() {
		$data = get_option( NPX_BM_POST_TYPES, [] );
		return is_array( $data ) ? $data : [];
	}

	/**
	 * Get the disabled blocks for a single post type.
	 *
	 * @since 1.1
	 * @param  string $post_type The post type slug (e.g. 'post', 'page').
	 * @return string[] Array of disabled block names for that post type.
	 */
	public static function get_for_post_type( $post_type ) {
		$all = self::get_all();
		return isset( $all[ $post_type ] ) && is_array( $all[ $post_type ] ) ? $all[ $post_type ] : [];
	}

	/**
	 * Save the disabled blocks for a single post type.
	 *
	 * Sanitizes, deduplicates, and re-indexes the block list before saving.
	 * Merges into the existing map so other post types are unaffected.
	 *
	 * @since 1.1
	 * @param  string   $post_type The post type slug.
	 * @param  string[] $blocks    Array of block names to disable.
	 * @return string[] The saved (sanitized, deduplicated) block list.
	 */
	public static function save( $post_type, array $blocks ) {
		$all               = self::get_all();
		$all[ $post_type ] = array_values( array_unique( array_map( 'sanitize_text_field', $blocks ) ) );
		update_option( NPX_BM_POST_TYPES, $all );
		return $all[ $post_type ];
	}

	/**
	 * Reset (clear) disabled blocks for a specific post type, or all post types.
	 *
	 * @since 1.1
	 * @param string|null $post_type The post type slug to reset, or null to reset all.
	 */
	public static function reset( $post_type = null ) {
		if ( null === $post_type ) {
			delete_option( NPX_BM_POST_TYPES );
		} else {
			$all = self::get_all();
			unset( $all[ $post_type ] );
			update_option( NPX_BM_POST_TYPES, $all );
		}
	}
}
