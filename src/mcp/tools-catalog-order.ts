/**
 * The pinned visible order of the catalog.
 *
 * `tools/list` shows `DEFAULT_TOOL_ORDER` first and falls back to catalog
 * order for the rest. Re-banding the catalog into strict domain segments
 * changed the segment layout, so the fallback order is pinned here: this list
 * is the exact catalog order the consolidated surface shipped with. Packed as
 * one token string because a 95-line name list reads as a wall; the composer
 * throws if a segment entry goes missing or is added twice.
 */
export const CATALOG_ORDER: string[] = 'navigate_to go_to_url click_element type_text press_key scroll_page take_screenshot get_page_markdown harvest_markdown jev_index read_section search_page evaluate_javascript get_page_info navigate_history get_console_logs get_fingerprint_profile new_tab switch_tab close_tab list_tabs browser_zoom browser_viewport recall_memory browsing_history browsing_history_clear add_bookmark list_bookmarks delete_bookmark dismiss_consent fill_form list_downloads media_preview read_download record_start record_stop list_recordings save_session restore_session list_sessions get_network_traffic get_api_payload clear_network_traffic query_json_data snapshot_rendered_page prerender_links take_annotated_screenshot take_economy_screenshot list_marks click_mark type_mark save_script run_script list_scripts delete_script list_realtime_streams get_stream_messages clear_stream_messages clear_capture set_window_visibility configure_system_tray request_human_intervention resolve_human_intervention get_human_intervention_status get_human_activity send_notification send_desktop_notification drive recipe decide wait_for observe extract page_state diff bridge_health export_har context_save context_open context_list context_delete llm_surface llm_fetch read_url search_web deep_crawl research_topic relocate_citation revalidate_citations collect_all frames find expect focus_walk act'.split(' ');
