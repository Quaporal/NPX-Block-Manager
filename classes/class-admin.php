<?php
/**
 * Admin UI for NewPixel Block Manager.
 *
 * Registers the Settings → Block Manager admin page, enqueues scripts/styles,
 * and renders the page shell. The page has four tabs:
 *
 *   - **Blocks**      – Toggle individual blocks on/off globally.
 *   - **Categories**  – Reassign blocks to different inserter categories.
 *   - **Patterns**    – Toggle individual block patterns on/off.
 *   - **Post Types**  – Restrict blocks per post type.
 *
 * All four tabs are rendered entirely by the admin JS
 * (`block-manager-admin.js`). PHP provides only the page header with
 * navigation and an empty `#app` container.
 *
 * @since   1.0
 * @package npx-block-manager
 */

class NPX_BM_Admin {

	/**
	 * Register WordPress hooks for the admin page.
	 *
	 * @since 1.0
	 */
	public function __construct() {
		add_action( 'admin_menu', [ $this, 'register_menu' ] );
		add_action( 'admin_enqueue_scripts', [ $this, 'enqueue' ] );
		add_filter( 'plugin_action_links_' . NPX_BM_BASENAME, [ $this, 'action_links' ] );
	}

	/**
	 * Enqueue admin styles and scripts on the Block Manager settings page.
	 *
	 * Bootstraps the WordPress block editor environment (categories, server-side
	 * block definitions, and editor scripts) so that `wp.blocks.getBlockTypes()`
	 * returns correct data even though we're on a settings page, not a real editor.
	 *
	 * Also prepares `npx_bm_localize` — the main data object consumed by the
	 * admin JS — containing disabled blocks, category overrides, patterns,
	 * post types, and REST API credentials.
	 *
	 * @since 1.0
	 * @param string $page Current admin page hook suffix.
	 */
	public function enqueue( $page ) {
		if ( 'settings_page_block-manager' !== $page ) {
			return;
		}

		// Bootstrap block categories so wp.blocks is fully populated.
		$block_categories = [];
		if ( function_exists( 'get_block_categories' ) ) {
			$block_categories = get_block_categories( get_post() );
		}
		wp_add_inline_script(
			'wp-blocks',
			sprintf( 'wp.blocks.setCategories( %s );', wp_json_encode( $block_categories ) ),
			'after'
		);

		do_action( 'enqueue_block_editor_assets' );
		do_action( 'enqueue_block_assets' );
		wp_dequeue_script( 'block-manager' );

		// Bootstrap server-side block definitions.
		wp_add_inline_script(
			'wp-blocks',
			'wp.blocks.unstable__bootstrapServerSideBlockDefinitions(' . wp_json_encode( get_block_editor_server_block_settings() ) . ');'
		);

		$block_registry = WP_Block_Type_Registry::get_instance();
		foreach ( $block_registry->get_all_registered() as $block_type ) {
			if ( ! empty( $block_type->editor_script ) ) {
				wp_enqueue_script( $block_type->editor_script );
			}
		}

		wp_enqueue_style(
			'block-manager-styles',
			NPX_BM_URL . '/assets/css/block-manager-admin.css',
			[],
			file_exists( NPX_BM_DIR_PATH . 'assets/css/block-manager-admin.css' )
				? filemtime( NPX_BM_DIR_PATH . 'assets/css/block-manager-admin.css' )
				: NPX_BM_VERSION
		);

		wp_enqueue_script(
			'block-manager-admin',
			NPX_BM_URL . '/assets/js/block-manager-admin.js',
			[ 'wp-blocks', 'wp-element', 'wp-data', 'wp-components', 'wp-block-library' ],
			file_exists( NPX_BM_DIR_PATH . 'assets/js/block-manager-admin.js' )
				? filemtime( NPX_BM_DIR_PATH . 'assets/js/block-manager-admin.js' )
				: NPX_BM_VERSION,
			true
		);

		$filtered_blocks     = NPX_BM_Blocks::get_filtered();
		$filtered_categories = NPX_BM_Categories::get_filtered();
		$filtered_patterns   = NPX_BM_Patterns::get_filtered();

		// Build post types list (excluding WP internals).
		$pt_exclude = [
			'attachment', 'revision', 'nav_menu_item', 'custom_css',
			'customize_changeset', 'oembed_cache', 'user_request',
			'wp_block', 'wp_template', 'wp_template_part', 'wp_navigation',
			'wp_global_styles', 'wp_font_family', 'wp_font_face',
		];
		$raw_post_types = get_post_types( [ 'public' => true, 'show_ui' => true ], 'objects' );
		$post_types     = [];
		foreach ( $raw_post_types as $pt ) {
			if ( in_array( $pt->name, $pt_exclude, true ) ) {
				continue;
			}
			$post_types[] = [
				'name'  => $pt->name,
				'label' => $pt->label,
			];
		}

		// NOTE: 'npx_bm_localize' must match what the compiled build/block-manager-admin.js expects.
		wp_localize_script(
			'block-manager-admin',
			'npx_bm_localize',
			[
				'root'                  => esc_url_raw( rest_url() ),
				'nonce'                 => wp_create_nonce( 'wp_rest' ),
				'wpVersion'             => get_bloginfo( 'version' ),
				'disabledBlocks'        => NPX_BM_Blocks::remove_duplicates( NPX_BM_Blocks::get_disabled(), $filtered_blocks ),
				'filteredBlocks'        => $filtered_blocks,
				'disabledBlocksAll'     => NPX_BM_Blocks::get_all_disabled(),
				'blockCategories'       => NPX_BM_Categories::remove_duplicates( NPX_BM_Categories::get_categories(), $filtered_categories ),
				'filteredCategories'    => $filtered_categories,
				'filteredCategoriesAll' => NPX_BM_Categories::get_all(),
				'patterns'              => NPX_BM_Patterns::get_all_patterns(),
				'disabledPatterns'      => NPX_BM_Blocks::remove_duplicates( NPX_BM_Patterns::get_disabled(), $filtered_patterns ),
				'filteredPatterns'      => $filtered_patterns,
				'disabledPatternsAll'   => NPX_BM_Patterns::get_all_disabled(),
				'postTypes'             => $post_types,
				'postTypeBlocks'        => NPX_BM_Post_Types::get_all(),
			]
		);
	}

	/**
	 * Register the Block Manager submenu under Settings.
	 *
	 * @since 1.0
	 */
	public function register_menu() {
		add_submenu_page(
			'options-general.php',
			'Block Manager',
			'Block Manager',
			apply_filters( 'npx_bm_user_role', 'activate_plugins' ),
			'block-manager',
			[ $this, 'page_callback' ]
		);
	}

	/**
	 * Render the main Block Manager admin page.
	 *
	 * Determines the active tab from the URL query string and outputs the
	 * page header with navigation tabs. The `#app` container is always empty
	 * — the JS populates it based on the active tab.
	 *
	 * @since 1.0
	 */
	public function page_callback() {
		$active = 'blocks';
		if ( isset( $_GET['categories'] ) && '' === $_GET['categories'] ) {
			$active = 'categories';
		} elseif ( isset( $_GET['patterns'] ) && '' === $_GET['patterns'] ) {
			$active = 'patterns';
		} elseif ( isset( $_GET['post-types'] ) && '' === $_GET['post-types'] ) {
			$active = 'post-types';
		}
		?>
		<h1 class="npx-bm-h1">NewPixel Block Manager</h1>
		<div class="npx-bm-page-wrap">
			<header class="npx-bm-page-wrap--header">
				<div class="npx-bm-container">
					<div class="npx-bm-page-wrap--header-title">
						<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 512 512" height="32" width="32">
							<rect x="16" y="80" width="96" height="96" fill="rgba(255, 255, 255, 0.61)"/>
							<rect x="144" y="80" width="96" height="96" fill="rgba(255, 255, 255, 0.52)"/>
							<rect x="400" y="80" width="96" height="96" fill="rgba(255, 255, 255, 0.41)"/>
							<rect x="272" y="80" width="96" height="96" fill="rgba(255, 255, 255, 1)"/>
							<rect x="144" y="208" width="96" height="96" fill="rgba(255, 255, 255, 0.39)"/>
							<rect x="400" y="208" width="96" height="96" fill="rgba(255, 255, 255, 1)"/>
							<rect x="272" y="208" width="96" height="96" fill="rgba(255, 255, 255, 0.61)"/>
							<rect x="400" y="336" width="96" height="96" fill="rgba(255, 255, 255, 0.5)"/>
							<rect x="272" y="336" width="96" height="96" fill="rgba(255, 255, 255, 1)"/>
						</svg>
						<h2>NPX Block Manager</h2>
					</div>
					<nav>
						<a class="npx-bm-tab<?php echo 'blocks' === $active ? ' npx-bm-tab-active' : ''; ?>" href="options-general.php?page=block-manager">
							<svg width="512" height="512" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M4 15.8294V15.75V8C4 7.69114 4.16659 7.40629 4.43579 7.25487L4.45131 7.24614L11.6182 3.21475L11.6727 3.18411C11.8759 3.06979 12.1241 3.06979 12.3273 3.18411L19.6105 7.28092C19.8511 7.41625 20 7.67083 20 7.94687V8V15.75V15.8294C20 16.1119 19.8506 16.3733 19.6073 16.5167L12.379 20.7766C12.1451 20.9144 11.8549 20.9144 11.621 20.7766L4.39267 16.5167C4.14935 16.3733 4 16.1119 4 15.8294Z" stroke="#ffffff" stroke-width="2"/>
								<path d="M12 21V12" stroke="#ffffff" stroke-width="2"/>
								<path d="M12 12L4 7.5" stroke="#ffffff" stroke-width="2"/>
								<path d="M20 7.5L12 12" stroke="#ffffff" stroke-width="2"/>
								<path opacity="0.33" d="M4 15.8295C4 16.1119 4.14935 16.3733 4.39267 16.5167L11.621 20.7767C11.8549 20.9145 12.1451 20.9145 12.379 20.7767L19.6073 16.5167C19.8506 16.3733 20 16.1119 20 15.8295V7.94693C20 7.89551 19.9948 7.84483 19.9849 7.79553L12.1226 12.2181H11.8774L4.02364 7.80031C4.00811 7.86494 4 7.93192 4 8.00006V15.8295Z" fill="#ffffff"/>
							</svg>
							<span>Blocks</span>
						</a>
						<a class="npx-bm-tab<?php echo 'categories' === $active ? ' npx-bm-tab-active' : ''; ?>" href="options-general.php?page=block-manager&categories">
							<svg width="512" height="512" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path opacity="0.33" d="M21 12H12V3H15.024C19.9452 3 21 4.05476 21 8.976V12Z" fill="#ffffff"/>
								<path opacity="0.33" d="M3 15.024V12H12V21H8.976C4.05476 21 3 19.9452 3 15.024Z" fill="#ffffff"/>
								<path d="M3 8.976C3 4.05476 4.05476 3 8.976 3H15.024C19.9452 3 21 4.05476 21 8.976V15.024C21 19.9452 19.9452 21 15.024 21H8.976C4.05476 21 3 19.9452 3 15.024V8.976Z" stroke="#ffffff" stroke-width="2"/>
								<path d="M12 3V21" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
								<path d="M21 12L3 12" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							<span>Categories</span>
						</a>
						<a class="npx-bm-tab<?php echo 'patterns' === $active ? ' npx-bm-tab-active' : ''; ?>" href="options-general.php?page=block-manager&patterns">
							<svg width="512" height="512" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path opacity="0.33" d="M3 7C3 5.11438 3 4.17157 3.58579 3.58579C4.17157 3 5.11438 3 7 3V3V3C8.88562 3 9.82843 3 10.4142 3.58579C11 4.17157 11 5.11438 11 7V12V17C11 18.8856 11 19.8284 10.4142 20.4142C9.82843 21 8.88562 21 7 21V21V21C5.11438 21 4.17157 21 3.58579 20.4142C3 19.8284 3 18.8856 3 17V12V7Z" fill="#ffffff"/>
								<path opacity="0.33" d="M18.7671 13.0317L10.7988 21L16.9998 21C18.8854 21 19.8282 21 20.414 20.4142C20.9998 19.8284 20.9998 18.8856 20.9998 17C20.9998 15.1144 20.9998 14.1716 20.414 13.5858C20.0499 13.2217 19.5478 13.0839 18.7671 13.0317Z" fill="#ffffff"/>
								<path d="M3 7C3 5.11438 3 4.17157 3.58579 3.58579C4.17157 3 5.11438 3 7 3V3V3C8.88562 3 9.82843 3 10.4142 3.58579C11 4.17157 11 5.11438 11 7V12V17C11 18.8856 11 19.8284 10.4142 20.4142C9.82843 21 8.88562 21 7 21V21V21C5.11438 21 4.17157 21 3.58579 20.4142C3 19.8284 3 18.8856 3 17V12V7Z" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
								<path d="M11 7.5L12.6716 5.82843C14.0049 4.49509 14.6716 3.82843 15.5 3.82843C16.3284 3.82843 16.9951 4.49509 18.3284 5.82843L19.1716 6.67157C20.5049 8.00491 21.1716 8.67157 21.1716 9.5C21.1716 10.3284 20.5049 10.9951 19.1716 12.3284L11 20.5" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
								<path d="M7 21L17 21C18.8856 21 19.8284 21 20.4142 20.4142C21 19.8284 21 18.8856 21 17L21 15.5C21 15.0353 21 14.803 20.9616 14.6098C20.8038 13.8164 20.1836 13.1962 19.3902 13.0384C19.197 13 18.9647 13 18.5 13V13" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
								<path d="M7 17.01L7 17" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
							</svg>
							<span>Patterns</span>
						</a>
						<a class="npx-bm-tab<?php echo 'post-types' === $active ? ' npx-bm-tab-active' : ''; ?>" href="options-general.php?page=block-manager&post-types">
							<svg width="512" height="512" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path opacity="0.33" d="M19.688 5.69833C20.3342 6.28473 20.6573 6.57793 20.8287 6.96478C21 7.35163 21 7.78795 21 8.66058V13C21 14.8856 21 15.8284 20.4142 16.4142C19.8284 17 18.8856 17 17 17H13C11.1144 17 10.1716 17 9.58579 16.4142C9 15.8284 9 14.8856 9 13L9 7C9 5.11438 9 4.17157 9.58579 3.58579C10.1716 3 11.1144 3 13 3H15.17C15.9332 3 16.3148 3 16.6625 3.13422C17.0101 3.26845 17.2927 3.52488 17.8579 4.03776L19.688 5.69833Z" fill="#ffffff"/>
								<path d="M19.688 5.69833C20.3342 6.28473 20.6573 6.57793 20.8287 6.96478C21 7.35163 21 7.78795 21 8.66058L21 13C21 14.8856 21 15.8284 20.4142 16.4142C19.8284 17 18.8856 17 17 17H13C11.1144 17 10.1716 17 9.58579 16.4142C9 15.8284 9 14.8856 9 13L9 7C9 5.11438 9 4.17157 9.58579 3.58579C10.1716 3 11.1144 3 13 3H15.17C15.9332 3 16.3148 3 16.6625 3.13422C17.0101 3.26845 17.2927 3.52488 17.8579 4.03776L19.688 5.69833Z" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
								<path d="M9 7L7 7C5.11438 7 4.17157 7 3.58579 7.58579C3 8.17157 3 9.11438 3 11L3 17C3 18.8856 3 19.8284 3.58579 20.4142C4.17157 21 5.11438 21 7 21H11C12.8856 21 13.8284 21 14.4142 20.4142C15 19.8284 15 18.8856 15 17V17" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/>
							</svg>
							<span>Post Types</span>
						</a>
					</nav>
					<span class="npx-bm-version" title="NPX Block Manager <?php echo esc_attr( NPX_BM_VERSION ); ?>"><?php echo esc_attr( NPX_BM_VERSION ); ?></span>
				</div>
			</header>
			<hr class="wp-header-end">
			<div id="npx-bm-container">
				<div id="app" class="npx-bm"></div>
			</div>
		</div>
		<?php
	}

	/**
	 * Add quick-access links to the Plugins list table row.
	 *
	 * @since 1.0
	 * @param array $links Existing action links.
	 * @return array
	 */
	public function action_links( $links ) {
		return array_merge(
			[
				'<a href="' . admin_url( 'options-general.php?page=block-manager' )            . '">Blocks</a>',
				'<a href="' . admin_url( 'options-general.php?page=block-manager&categories' ) . '">Categories</a>',
				'<a href="' . admin_url( 'options-general.php?page=block-manager&post-types' ) . '">Post Types</a>',
				'<a href="' . esc_url( rest_url( 'npx_bm/export' ) ) . '" target="_blank">Export All</a>',
			],
			$links
		);
	}
}

new NPX_BM_Admin();
