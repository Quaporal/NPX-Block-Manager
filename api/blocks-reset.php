<?php
/**
 * REST API: Reset all disabled blocks.
 *
 * Endpoint: POST /wp-json/npx_bm/blocks_reset
 *
 * Deletes the `npx_bm_disabled_blocks` option entirely, re-enabling every
 * block that was disabled through the admin UI. Blocks disabled via the
 * `npx_bm_disabled_blocks` filter are unaffected.
 *
 * @since   1.0
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/blocks_reset', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_blocks_reset',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Reset the disabled blocks option.
 *
 * @since 1.0
 */
function npx_bm_blocks_reset() {
	delete_option( NPX_BM_OPTION );
	wp_send_json( [ 'success' => true, 'msg' => 'All blocks reset successfully.' ] );
}
