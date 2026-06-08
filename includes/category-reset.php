<?php
/**
 * REST API: Reset all block category overrides.
 *
 * Endpoint: POST /wp-json/npx_bm/category_reset
 *
 * Deletes the `npx_bm_categories` option, reverting every block to its
 * original default category. Overrides applied via the
 * `npx_bm_block_categories` filter are unaffected.
 *
 * @since   1.0
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/category_reset', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_category_reset',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Delete the block categories option.
 *
 * @since 1.0
 */
function npx_bm_category_reset() {
	delete_option( NPX_BM_CATEGORIES );
	wp_send_json( [ 'success' => true, 'msg' => 'Categories reset successfully.' ] );
}
