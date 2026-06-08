<?php
/**
 * REST API: Export current settings as ready-to-paste PHP code.
 *
 * Endpoint: GET /wp-json/npx_bm/export?type={blocks|patterns|categories|post_types}
 *
 * Generates PHP hook code that reproduces the current plugin settings at the
 * theme/code level. Users can paste the output into their functions.php or a
 * must-use plugin to make the restrictions permanent — even after removing
 * this plugin.
 *
 * Each export type produces a different hook:
 *   - blocks      → `allowed_block_types_all` filter
 *   - patterns    → `init` action + `unregister_block_pattern()`
 *   - categories  → `enqueue_block_editor_assets` + inline JS filter
 *   - post_types  → `allowed_block_types_all` with post-type check
 *
 * Response (JSON):
 *   - code {string} The PHP code snippet.
 *
 * @since   1.0
 * @package npx-block-manager
 */

add_action( 'rest_api_init', function () {
	register_rest_route( 'npx_bm', '/export', [
		'methods'             => 'GET',
		'callback'            => 'npx_bm_export',
		'permission_callback' => [ 'NPX_Block_Manager', 'has_access' ],
	] );
} );

/**
 * Build a PHP array literal string from a flat list of strings.
 *
 * @param array $items
 * @return string  e.g. "[\n\t\t'core/image',\n\t]"
 */
function npx_bm_php_array( array $items ) {
	if ( empty( $items ) ) {
		return '[]';
	}
	$lines = array_map( function ( $v ) {
		return "\t\t'" . addslashes( $v ) . "',";
	}, $items );
	return "[\n" . implode( "\n", $lines ) . "\n\t]";
}

/**
 * Return the current settings as copy-pasteable PHP hook code.
 * GET /wp-json/npx_bm/export?type=blocks|patterns|categories|post_types
 *
 * @since 1.0
 * @param WP_REST_Request $request
 * @return WP_REST_Response
 */
function npx_bm_export( WP_REST_Request $request ) {
	$type = sanitize_key( $request->get_param( 'type' ) );

	switch ( $type ) {

		case 'blocks':
			$disabled = array_merge( NPX_BM_Blocks::get_disabled(), NPX_BM_Blocks::get_filtered() );
			if ( empty( $disabled ) ) {
				return new WP_REST_Response( [ 'code' => '// No disabled blocks to export.' ] );
			}
			$list = npx_bm_php_array( $disabled );
			$code  = "add_filter( 'allowed_block_types_all', function ( \$allowed_blocks, \$editor_ctx ) {\n";
			$code .= "\t\$disabled = {$list};\n";
			$code .= "\tif ( ! is_array( \$allowed_blocks ) ) {\n";
			$code .= "\t\t\$allowed_blocks = array_keys( WP_Block_Type_Registry::get_instance()->get_all_registered() );\n";
			$code .= "\t}\n";
			$code .= "\treturn array_values( array_diff( \$allowed_blocks, \$disabled ) );\n";
			$code .= "}, 10, 2 );";
			return new WP_REST_Response( [ 'code' => $code ] );

		case 'patterns':
			$disabled = array_merge( NPX_BM_Patterns::get_disabled(), NPX_BM_Patterns::get_filtered() );
			if ( empty( $disabled ) ) {
				return new WP_REST_Response( [ 'code' => '// No disabled patterns to export.' ] );
			}
			$list = npx_bm_php_array( $disabled );
			$code  = "add_action( 'init', function () {\n";
			$code .= "\t\$patterns = {$list};\n";
			$code .= "\tforeach ( \$patterns as \$pattern ) {\n";
			$code .= "\t\tif ( WP_Block_Patterns_Registry::get_instance()->is_registered( \$pattern ) ) {\n";
			$code .= "\t\t\tunregister_block_pattern( \$pattern );\n";
			$code .= "\t\t}\n";
			$code .= "\t}\n";
			$code .= "} );";
			return new WP_REST_Response( [ 'code' => $code ] );

		case 'categories':
			$overrides = array_merge( NPX_BM_Categories::get_categories(), NPX_BM_Categories::get_filtered() );
			if ( empty( $overrides ) ) {
				return new WP_REST_Response( [ 'code' => '// No category overrides to export.' ] );
			}
			$map_lines = [];
			foreach ( $overrides as $entry ) {
				if ( ! empty( $entry['block'] ) && ! empty( $entry['cat'] ) ) {
					$map_lines[] = "\t\t'" . addslashes( $entry['block'] ) . "' => '" . addslashes( $entry['cat'] ) . "',";
				}
			}
			$map_php = "[\n" . implode( "\n", $map_lines ) . "\n\t]";
			$code  = "// Category overrides — applied in the block editor via a filter.\n";
			$code .= "add_action( 'enqueue_block_editor_assets', function () {\n";
			$code .= "\t\$overrides = {$map_php};\n";
			$code .= "\t\$js  = 'wp.hooks.addFilter(\"blocks.registerBlockType\",\"theme/npx-cats\",';\n";
			$code .= "\t\$js .= 'function(s,n){var m=' . wp_json_encode( \$overrides ) . ';';\n";
			$code .= "\t\$js .= 'if(m[n]){s.category=m[n];}return s;});';\n";
			$code .= "\twp_add_inline_script( 'wp-hooks', \$js );\n";
			$code .= "} );";
			return new WP_REST_Response( [ 'code' => $code ] );

		case 'post_types':
			$all = NPX_BM_Post_Types::get_all();
			$all = array_filter( $all, function ( $blocks ) {
				return ! empty( $blocks );
			} );
			if ( empty( $all ) ) {
				return new WP_REST_Response( [ 'code' => '// No per-post-type restrictions to export.' ] );
			}
			$rules_lines = [];
			foreach ( $all as $pt => $blocks ) {
				$rules_lines[] = "\t\t'" . addslashes( $pt ) . "' => " . npx_bm_php_array( $blocks ) . ',';
			}
			$rules_php = "[\n" . implode( "\n", $rules_lines ) . "\n\t]";
			$code  = "add_filter( 'allowed_block_types_all', function ( \$allowed_blocks, \$editor_ctx ) {\n";
			$code .= "\tif ( ! isset( \$editor_ctx->post->post_type ) ) { return \$allowed_blocks; }\n";
			$code .= "\t\$rules = {$rules_php};\n";
			$code .= "\t\$pt    = \$editor_ctx->post->post_type;\n";
			$code .= "\tif ( ! isset( \$rules[ \$pt ] ) ) { return \$allowed_blocks; }\n";
			$code .= "\tif ( ! is_array( \$allowed_blocks ) ) {\n";
			$code .= "\t\t\$allowed_blocks = array_keys( WP_Block_Type_Registry::get_instance()->get_all_registered() );\n";
			$code .= "\t}\n";
			$code .= "\treturn array_values( array_diff( \$allowed_blocks, \$rules[ \$pt ] ) );\n";
			$code .= "}, 10, 2 );";
			return new WP_REST_Response( [ 'code' => $code ] );

		default:
			return new WP_REST_Response( [ 'code' => '// Please specify a type: blocks, patterns, categories, or post_types.' ] );
	}
}
