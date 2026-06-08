<?php
/**
 * REST API: Reset all disabled patterns.
 *
 * Endpoint: POST /wp-json/npx_bm/patterns_reset
 *
 * Deletes the `npx_bm_disabled_patterns` option, re-enabling every pattern
 * that was disabled through the admin UI. Patterns disabled via the
 * `npx_bm_disabled_patterns` filter are unaffected.
 *
 * @since   1.0
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/patterns_reset', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_patterns_reset',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Delete the disabled patterns option.
 *
 * @since 1.0
 */
function npx_bm_patterns_reset() {
	delete_option( NPX_BM_PATTERNS );
	wp_send_json( [ 'success' => true, 'msg' => 'All patterns reset successfully.' ] );
}
