<?php
/**
 * REST API: Toggle a single pattern on/off.
 *
 * Endpoint: POST /wp-json/npx_bm/pattern
 *
 * Adds or removes a single pattern name from the `npx_bm_disabled_patterns`
 * option. Used by the Patterns tab when the user clicks a pattern’s toggle.
 *
 * Request body (JSON):
 *   - pattern {string} Pattern name, e.g. 'core/query-standard-posts'.
 *   - title   {string} Human-readable pattern title.
 *   - type    {string} 'enable' or 'disable'.
 *
 * Response (JSON):
 *   - success           {bool}
 *   - msg               {string}
 *   - disabled_patterns {string[]} Updated list of all disabled pattern names.
 *
 * @since   1.0
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/pattern', [
		'methods'             => 'POST',
		'callback'            => 'npx_bm_pattern_toggle',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Enable or disable a single block pattern.
 *
 * @since 1.0
 * @param WP_REST_Request $request
 */
function npx_bm_pattern_toggle( WP_REST_Request $request ) {
	$body = json_decode( $request->get_body(), true );

	if ( empty( $body ) ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Error accessing API data.', 'disabled_patterns' => [] ] );
	}

	$pattern  = isset( $body['pattern'] ) ? sanitize_text_field( $body['pattern'] ) : '';
	$title    = isset( $body['title'] )   ? sanitize_text_field( $body['title'] )   : '';
	$type     = isset( $body['type'] )    ? sanitize_text_field( $body['type'] )    : 'enable';

	if ( ! $pattern ) {
		wp_send_json( [ 'success' => false, 'msg' => 'Unable to update pattern.' ] );
	}

	$disabled = NPX_BM_Patterns::get_disabled();

	if ( 'disable' === $type ) {
		if ( ! in_array( $pattern, $disabled, true ) ) {
			$disabled[] = $pattern;
		}
		$disabled = array_values( $disabled );
		update_option( NPX_BM_PATTERNS, $disabled );
		wp_send_json( [
			'success'           => true,
			'msg'               => sprintf( '%s pattern disabled', '<strong>' . $title . '</strong>' ),
			'disabled_patterns' => $disabled,
		] );
	}

	if ( 'enable' === $type ) {
		$patterns = array_values( array_filter( $disabled, fn( $p ) => $p !== $pattern ) );
		update_option( NPX_BM_PATTERNS, $patterns );
		wp_send_json( [
			'success'           => true,
			'msg'               => sprintf( '%s pattern enabled', '<strong>' . $title . '</strong>' ),
			'disabled_patterns' => $patterns,
		] );
	}
}
