<?php
/**
 * Pattern data helpers and front-end unregistration.
 *
 * Handles block pattern management — both the admin-side data retrieval and
 * the front-end/editor-side unregistration of disabled patterns.
 *
 * Patterns can be disabled in two ways:
 *
 *   1. Via the `npx_bm_disabled_patterns` WP option (admin UI toggles).
 *   2. Via the `npx_bm_disabled_patterns` filter (theme/code-level overrides).
 *
 * Additionally, two "virtual" pattern names control bulk behaviour:
 *   - `npx_bm/remote-patterns`  – disables loading of remote block patterns.
 *   - `npx_bm/core-patterns`    – removes core block patterns theme support.
 *
 * The constructor hooks into `init` and `after_setup_theme` to unregister
 * disabled patterns before the editor loads.
 *
 * @since   1.0
 * @package npx-block-manager
 */

class NPX_BM_Patterns {

	/**
	 * Set up hooks for front-end/editor pattern unregistration.
	 *
	 * Caches the full disabled list once to avoid redundant DB queries,
	 * then conditionally disables remote patterns and registers the
	 * unregistration hooks.
	 *
	 * @since 1.0
	 */
	public function __construct() {
		$all_disabled = self::get_all_disabled();

		add_action( 'init',             [ $this, 'unregister_patterns' ] );
		add_action( 'after_setup_theme',[ $this, 'remove_core_patterns' ] );

		// Disable remote block pattern loading if the virtual pattern is disabled.
		if ( in_array( 'npx_bm/remote-patterns', $all_disabled, true ) ) {
			add_filter( 'should_load_remote_block_patterns', '__return_false' );
		}
	}

	/**
	 * Remove core block patterns theme support.
	 *
	 * Fires on `after_setup_theme`. Only acts if the virtual
	 * `npx_bm/core-patterns` name is in the disabled list.
	 *
	 * @since 1.0
	 */
	public function remove_core_patterns() {
		if ( in_array( 'npx_bm/core-patterns', self::get_all_disabled(), true ) ) {
			remove_theme_support( 'core-block-patterns' );
		}
	}

	/**
	 * Unregister individually disabled patterns on init.
	 *
	 * Skips unregistration when viewing the Block Manager admin page itself
	 * (so the Patterns tab can still list all registered patterns).
	 *
	 * @since 1.0
	 */
	public function unregister_patterns() {
		if (
		! class_exists( 'WP_Block_Patterns_Registry' ) ||
		! function_exists( 'unregister_block_pattern' ) ||
		( isset( $_GET['page'] ) && 'block-manager' === sanitize_key( $_GET['page'] ) ) // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		) {
			return;
		}

		$patterns          = WP_Block_Patterns_Registry::get_instance()->get_all_registered();
		$disabled_patterns = self::get_all_disabled();

		if ( ! empty( $patterns ) && $disabled_patterns ) {
			$pattern_names = wp_list_pluck( $patterns, 'name' );
			foreach ( $disabled_patterns as $pattern ) {
				if ( in_array( $pattern, $pattern_names, true ) ) {
					unregister_block_pattern( $pattern ); // phpcs:ignore
				}
			}
		}
	}

	/**
	 * Get all registered patterns grouped by category, with disabled state.
	 *
	 * Builds a structured array suitable for the admin UI Patterns tab.
	 * Each category entry contains its label, name, and an array of pattern
	 * objects. Uncategorized patterns are grouped under 'uncategorized'.
	 * Empty categories are removed.
	 *
	 * @since 1.0
	 * @return array Associative array keyed by category slug, each containing
	 *               'label', 'name', 'description', and 'patterns' keys.
	 */
	public static function get_all_patterns() {
		if ( ! class_exists( 'WP_Block_Patterns_Registry' ) ) {
			return [];
		}

		$patterns          = WP_Block_Patterns_Registry::get_instance()->get_all_registered();
		$categories        = WP_Block_Pattern_Categories_Registry::get_instance()->get_all_registered();
		$disabled_patterns = self::get_all_disabled();

		$formatted = [];
		foreach ( $categories as $category ) {
			$formatted[ $category['name'] ] = [
				'label'       => $category['label'] ?? '',
				'name'        => $category['name']  ?? '',
				'description' => $category['description'] ?? '',
				'patterns'    => [],
			];
		}

		foreach ( $patterns as $pattern ) {
			if ( empty( $pattern['title'] ) ) {
				continue;
			}

			if ( ! empty( $pattern['categories'] ) ) {
				$category = $pattern['categories'][0];
				$formatted[ $category ]['patterns'][] = $pattern;
			} else {
				if ( ! in_array( 'npx_bm/uncategorized-patterns', $disabled_patterns, true ) ) {
					$formatted['uncategorized']['patterns'][] = $pattern;
				}
			}
		}

		foreach ( $formatted as $key => $value ) {
			if ( empty( $value['patterns'] ) ) {
				unset( $formatted[ $key ] );
			}
		}

		if ( isset( $formatted['uncategorized'] ) ) {
			$formatted['uncategorized']['label'] = 'Uncategorized';
			$formatted['uncategorized']['name']  = 'Uncategorized';
		}

		return $formatted;
	}

	/**
	 * Get patterns disabled via the WP option (admin UI toggles only).
	 *
	 * @since 1.0
	 * @return string[] Flat array of disabled pattern names.
	 */
	public static function get_disabled() {
		$patterns = get_option( NPX_BM_PATTERNS, [] );
		return ! empty( $patterns ) ? array_values( $patterns ) : [];
	}

	/**
	 * Get patterns disabled via the `npx_bm_disabled_patterns` filter.
	 *
	 * These patterns are always disabled regardless of the admin UI state.
	 * They appear as "filtered" (greyed-out, non-toggleable) in the Patterns tab.
	 *
	 * @since 1.0
	 * @return string[] Flat array of pattern names from the filter hook.
	 */
	public static function get_filtered() {
		$patterns = apply_filters( 'npx_bm_disabled_patterns', [] );
		return ! empty( $patterns ) ? array_values( $patterns ) : [];
	}

	/**
	 * Get the combined list of all disabled patterns (option + filter).
	 *
	 * Used by the block editor to unregister patterns and by the admin UI
	 * to show the full disabled state.
	 *
	 * @since 1.0
	 * @return string[] Merged array of all disabled pattern names.
	 */
	public static function get_all_disabled() {
		$disabled = self::get_disabled();
		$filtered = self::get_filtered();
		$patterns = array_merge( $disabled, $filtered );
		return ! empty( $patterns ) ? $patterns : [];
	}
}

new NPX_BM_Patterns();
