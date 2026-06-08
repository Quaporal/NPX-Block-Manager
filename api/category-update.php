<?php
/**
 * REST API: Add or remove a block category override.
 *
 * Endpoint: POST /wp-json/npx_bm/category_update
 *
 * Moves a single block to a different inserter category, or resets it to
 * its original category. Used by the Categories tab when the user changes
 * a block’s category dropdown.
 *
 * Request body (JSON):
 *   - type     {string} 'add' (set override) or 'remove' (revert to default).
 *   - block    {string} Block name, e.g. 'core/image'.
 *   - title    {string} Human-readable block title (used in the response message).
 *   - category {string} New category slug (ignored when type is 'remove').
 *
 * Response (JSON):
 *   - success    {bool}
 *   - msg        {string}
 *   - categories {array[]} Updated array of all stored overrides.
 *
 * @since   1.0
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/category_update', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_category_update',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Add or remove a category override for a block.
 *
 * @since 1.0
 * @param WP_REST_Request $request
 */
function npx_bm_category_update( WP_REST_Request $request ) {
	$body = json_decode( $request->get_body(), true );

	if ( empty( $body ) ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Error accessing API data.', 'categories' => false ] );
	}

	$type     = isset( $body['type'] )     ? sanitize_text_field( $body['type'] )     : 'add';
	$block    = isset( $body['block'] )    ? sanitize_text_field( $body['block'] )    : '';
	$title    = isset( $body['title'] )    ? sanitize_text_field( $body['title'] )    : '';
	$category = isset( $body['category'] ) ? sanitize_text_field( $body['category'] ) : '';

	$options = NPX_BM_Categories::get_categories();

	if ( 'remove' === $type ) {
		foreach ( $options as $index => $item ) {
			if ( $block === $item['block'] ) {
				unset( $options[ $index ] );
				$options = array_values( $options );
				break;
			}
		}
	} else {
		$duplicate = false;
		if ( $options ) {
			foreach ( $options as $index => $item ) {
				if ( $block === $item['block'] ) {
					$duplicate                = true;
					$options[ $index ]['cat'] = $category;
				}
			}
		}
		if ( ! $duplicate ) {
			$options[] = [ 'block' => $block, 'cat' => $category ];
		}
	}

	$options = array_values( $options );
	update_option( NPX_BM_CATEGORIES, $options );

	wp_send_json( [
		'success'    => true,
		'msg'        => sprintf( '%s category updated', '<strong>' . $title . '</strong>' ),
		'categories' => $options,
	] );
}
