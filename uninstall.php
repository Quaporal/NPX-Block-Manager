<?php
/**
 * Uninstall handler — removes all plugin data from the database.
 *
 * WordPress calls this file automatically when the plugin is deleted
 * from the Plugins screen. It removes all four wp_options rows created
 * by the plugin so no orphan data is left behind.
 *
 * Options removed:
 *   - npx_bm_disabled_blocks    (globally disabled blocks)
 *   - npx_bm_categories         (block category overrides)
 *   - npx_bm_disabled_patterns  (disabled block patterns)
 *   - npx_bm_post_type_blocks   (per-post-type disabled blocks)
 *
 * @since   1.0
 * @package npx-block-manager
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'npx_bm_disabled_blocks' );
delete_option( 'npx_bm_categories' );
delete_option( 'npx_bm_disabled_patterns' );
delete_option( 'npx_bm_post_type_blocks' );
