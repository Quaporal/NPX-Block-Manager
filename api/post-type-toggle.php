<?php
/**
 * REST API: Save or reset per-post-type block settings.
 *
 * Two endpoints:
 *
 *   POST /wp-json/npx_bm/post_type_save
 *     Saves the complete list of disabled blocks for a single post type.
 *     The client sends the full array on every toggle (not a diff).
 *
 *     Request body (JSON):
 *       - post_type {string}   The post type slug (e.g. 'post', 'page').
 *       - blocks    {string[]} Array of block names to disable.
 *
 *     Response (JSON):
 *       - success {bool}
 *       - blocks  {string[]} The sanitized saved block list.
 *
 *   POST /wp-json/npx_bm/post_type_reset
 *     Clears all disabled blocks for a single post type.
 *
 *     Request body (JSON):
 *       - post_type {string} The post type slug to reset.
 *
 *     Response (JSON):
 *       - success {bool}
 *
 * @since   1.1
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/post_type_save', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_post_type_save',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );

	register_rest_route( 'npx_bm', '/post_type_reset', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_post_type_reset',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Save the disabled blocks for a specific post type.
 *
 * @since 1.1
 * @param WP_REST_Request $request
 */
function npx_bm_post_type_save( WP_REST_Request $request ) {
	$body = json_decode( $request->get_body(), true );

	if ( empty( $body ) || empty( $body['post_type'] ) ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Missing post_type.' ] );
	}

	$post_type = sanitize_key( $body['post_type'] );
	$blocks    = isset( $body['blocks'] ) && is_array( $body['blocks'] ) ? $body['blocks'] : [];

	if ( ! post_type_exists( $post_type ) ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Invalid post type.' ] );
	}

	$saved = NPX_BM_Post_Types::save( $post_type, $blocks );
	wp_send_json( [ 'success' => true, 'blocks' => $saved ] );
}

/**
 * Reset disabled blocks for a single post type.
 *
 * @since 1.1
 * @param WP_REST_Request $request
 */
function npx_bm_post_type_reset( WP_REST_Request $request ) {
	$body = json_decode( $request->get_body(), true );

	if ( empty( $body ) || empty( $body['post_type'] ) ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Missing post_type.' ] );
	}

	$post_type = sanitize_key( $body['post_type'] );
	NPX_BM_Post_Types::reset( $post_type );
	wp_send_json( [ 'success' => true ] );
}
