<?php
/**
 * REST API: Toggle a single block on/off.
 *
 * Endpoint: POST /wp-json/npx_bm/toggle
 *
 * Adds or removes a single block name from the `npx_bm_disabled_blocks`
 * option. Used by the Blocks tab when the user clicks a block's toggle switch.
 *
 * Request body (JSON):
 *   - block  {string} Block name, e.g. 'core/verse'.
 *   - title  {string} Human-readable block title (used in the response message).
 *   - type   {string} 'enable' or 'disable'.
 *
 * Response (JSON):
 *   - success         {bool}
 *   - msg             {string}
 *   - disabled_blocks {string[]} Updated list of all disabled block names.
 *
 * @since   1.0
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/toggle', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_toggle',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Enable or disable a single block.
 *
 * @since 1.0
 * @param WP_REST_Request $request
 */
function npx_bm_toggle( WP_REST_Request $request ) {
	$body = json_decode( $request->get_body(), true );

	if ( empty( $body ) ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Error accessing API data.', 'disabled_blocks' => [] ] );
	}

	$block  = isset( $body['block'] ) ? sanitize_text_field( $body['block'] ) : '';
	$title  = isset( $body['title'] ) ? sanitize_text_field( $body['title'] ) : '';
	$type   = isset( $body['type'] )  ? sanitize_text_field( $body['type'] )  : 'enable';

	if ( ! $block ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Unable to update block.' ] );
	}

	$disabled = NPX_BM_Blocks::get_disabled();

	if ( 'disable' === $type ) {
		if ( ! in_array( $block, $disabled, true ) ) {
			$disabled[] = $block;
		}
		$disabled = array_values( $disabled );
		update_option( NPX_BM_OPTION, $disabled );
		wp_send_json( [
			'success'         => true,
			'msg'             => sprintf( '%s block disabled', '<strong>' . $title . '</strong>' ),
			'disabled_blocks' => $disabled,
		] );
	}

	if ( 'enable' === $type ) {
		$blocks = array_values( array_filter( $disabled, fn( $b ) => $b !== $block ) );
		update_option( NPX_BM_OPTION, $blocks );
		wp_send_json( [
			'success'         => true,
			'msg'             => sprintf( '%s block enabled', '<strong>' . $title . '</strong>' ),
			'disabled_blocks' => $blocks,
		] );
	}
}
