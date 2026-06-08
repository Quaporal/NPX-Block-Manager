<?php
/**
 * REST API: Bulk enable/disable blocks or patterns within a category.
 *
 * Endpoint: POST /wp-json/npx_bm/bulk_process
 *
 * Enables or disables all blocks (or patterns) in a given category at once.
 * Used by both the Blocks and Patterns tabs when the user clicks a category
 * heading’s toggle switch.
 *
 * Request body (JSON):
 *   - blocks    {string[]} Array of block/pattern names to process.
 *   - type      {string}   'blocks' or 'patterns'.
 *   - direction {string}   'enable' or 'disable'.
 *
 * Response (JSON):
 *   - success  {bool}
 *   - msg      {string}
 *   - disabled {string[]} Updated list of all disabled names for that type.
 *
 * @since   1.0
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/bulk_process', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_bulk_process',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Bulk enable or disable all blocks/patterns in a category.
 *
 * @since 1.0
 * @param WP_REST_Request $request
 */
function npx_bm_bulk_process( WP_REST_Request $request ) {
	$body = json_decode( $request->get_body(), true );

	if ( empty( $body ) ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Error accessing API data.', 'disabled' => [] ] );
	}

	$blocks_array = isset( $body['blocks'] ) && is_array( $body['blocks'] )
		? array_map( 'sanitize_text_field', $body['blocks'] )
		: [];
	$type         = isset( $body['type'] )      ? sanitize_text_field( $body['type'] )      : 'blocks';
	$direction    = isset( $body['direction'] ) ? sanitize_text_field( $body['direction'] ) : 'enable';

	switch ( $type ) {
		case 'blocks':
		$disabled     = NPX_BM_Blocks::get_disabled();
		$filtered     = NPX_BM_Blocks::get_filtered();
		$option       = NPX_BM_OPTION;
		$disabled_msg = 'All blocks in category disabled';
		$enabled_msg  = 'All blocks in category enabled';
		break;

		case 'patterns':
		$disabled     = NPX_BM_Patterns::get_disabled();
		$filtered     = NPX_BM_Patterns::get_filtered();
		$option       = NPX_BM_PATTERNS;
		$disabled_msg = 'All patterns in category disabled';
		$enabled_msg  = 'All patterns in category enabled';
		break;

		default:
		wp_send_json( [ 'success' => false, 'msg' => 'Unknown type.', 'disabled' => [] ] );
	}

	if ( ! empty( $blocks_array ) && 'disable' === $direction ) {
		foreach ( $blocks_array as $block ) {
			if ( ! in_array( $block, $disabled, true ) && ! in_array( $block, $filtered, true ) ) {
				$disabled[] = $block;
			}
		}
		$disabled = array_values( $disabled );
		update_option( $option, $disabled );
		wp_send_json( [ 'success' => true, 'msg' => $disabled_msg, 'disabled' => $disabled ] );
	}

	if ( ! empty( $blocks_array ) && 'enable' === $direction ) {
		$blocks = [];
		foreach ( $disabled as $block ) {
			if ( ! in_array( $block, $blocks_array, true ) && ! in_array( $block, $filtered, true ) ) {
				$blocks[] = $block;
			}
		}
		$blocks = array_values( $blocks );
		update_option( $option, $blocks );
		wp_send_json( [ 'success' => true, 'msg' => $enabled_msg, 'disabled' => $blocks ] );
	}

	wp_send_json( [ 'success' => false, 'msg' => 'Nothing to process.', 'disabled' => [] ] );
}
