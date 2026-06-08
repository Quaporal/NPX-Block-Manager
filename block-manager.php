<?php
/**
 * Plugin Name: NPX Block Manager
 * Description: Manage WordPress blocks, categories, patterns, and per-post-type block restrictions.
 * Version: 1.0.0
 * License: GPL
 *
 * @package npx-block-manager
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'NPX_BM_VERSION',   '1.0.0' );
define( 'NPX_BM_BASENAME',  plugin_basename( __FILE__ ) );
define( 'NPX_BM_DIR_PATH',  plugin_dir_path( __FILE__ ) );
define( 'NPX_BM_URL',       plugins_url( '', __FILE__ ) );
define( 'NPX_BM_OPTION',      'npx_bm_disabled_blocks' );
define( 'NPX_BM_CATEGORIES',  'npx_bm_categories' );
define( 'NPX_BM_PATTERNS',    'npx_bm_disabled_patterns' );
define( 'NPX_BM_POST_TYPES',  'npx_bm_post_type_blocks' );

class NPX_Block_Manager {

	/** @var self|null Singleton instance. */
	private static $instance = null;

	/**
	 * Return the singleton instance, creating it on first call.
	 *
	 * @since 1.0
	 * @return self
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new NPX_Block_Manager();
		}
		return self::$instance;
	}

	/**
	 * Load all class and include files, and hook into the block editor.
	 *
	 * @since 1.0
	 */
	private function __construct() {
		add_action( 'enqueue_block_editor_assets', [ $this, 'enqueue_block_editor_assets' ] );

		require_once 'classes/class-blocks.php';
		require_once 'classes/class-categories.php';
		require_once 'classes/class-patterns.php';
		require_once 'classes/class-post-types.php';
		require_once 'classes/class-admin.php';
		require_once 'includes/blocks-toggle.php';
		require_once 'includes/blocks-reset.php';
		require_once 'includes/category-reset.php';
		require_once 'includes/category-update.php';
		require_once 'includes/patterns-toggle.php';
		require_once 'includes/patterns-reset.php';
		require_once 'includes/bulk-process.php';
		require_once 'includes/export.php';
		require_once 'includes/post-type-toggle.php';
	}

	/**
	 * Enqueue the block editor script and pass disabled block/category/pattern data.
	 *
	 * @since 1.0
	 */
	public function enqueue_block_editor_assets() {
		$screen       = get_current_screen();
		$dependencies = [ 'wp-blocks', 'wp-dom-ready', 'wp-hooks' ];

		if ( is_object( $screen ) ) {
			if ( $screen->id === 'site-editor' ) {
				$dependencies[] = 'wp-edit-site';
			} elseif ( $screen->id === 'widgets' ) {
				$dependencies[] = 'wp-edit-widgets';
			} else {
				$dependencies[] = 'wp-edit-post';
			}
		} else {
			$dependencies[] = 'wp-edit-post';
		}

		wp_enqueue_script(
			'block-manager',
			plugins_url( 'assets/js/block-manager.js', __FILE__ ),
			$dependencies,
			NPX_BM_VERSION,
			false
		);

		// Merge globally disabled blocks with per-post-type disabled blocks.
		$post_type     = is_object( $screen ) && $screen->post_type ? $screen->post_type : '';
		$global_blocks = NPX_BM_Blocks::get_all_disabled();
		$pt_blocks     = $post_type ? NPX_BM_Post_Types::get_for_post_type( $post_type ) : [];
		$all_blocks    = array_values( array_unique( array_merge( $global_blocks, $pt_blocks ) ) );

		// NOTE: 'gutenberg_block_manager' must match what the compiled build/block-manager.js expects.
		wp_localize_script(
			'block-manager',
			'gutenberg_block_manager',
			[
				'blocks'     => $all_blocks,
				'categories' => NPX_BM_Categories::get_all(),
				'patterns'   => NPX_BM_Patterns::get_all_disabled(),
			]
		);
	}

	/**
	 * Check whether the current user has access to Block Manager.
	 *
	 * @since 1.0
	 * @return bool
	 */
	public static function has_access() {
		return is_user_logged_in() && current_user_can( apply_filters( 'npx_bm_user_role', 'activate_plugins' ) );
	}
}

/**
 * Boot the plugin after all plugins are loaded.
 *
 * @since 1.0
 */
function npx_bm_init() {
	include_once ABSPATH . 'wp-admin/includes/plugin.php';
	if ( is_plugin_active( 'gutenberg/gutenberg.php' ) || version_compare( get_bloginfo( 'version' ), '4.9.9', '>' ) ) {
		NPX_Block_Manager::instance();
	}
}
add_action( 'plugins_loaded', 'npx_bm_init', 100 );
