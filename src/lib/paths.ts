/**
 * Canonical OMAC path conventions — single source of truth.
 * These strings also appear in scripts/lib/hud-wrapper-template.txt and
 * scripts/plugin-setup.mjs; keep them in sync (enforced by paths-consistency.test.ts).
 */
export const OMAC_PLUGIN_MARKETPLACE_SLUG = "omac";
export const OMAC_PLUGIN_PACKAGE_NAME = "oh-my-agent-connector";
export const OMAC_PLUGIN_CACHE_REL = `plugins/cache/${OMAC_PLUGIN_MARKETPLACE_SLUG}/${OMAC_PLUGIN_PACKAGE_NAME}`;
export const OMAC_PLUGIN_MARKETPLACE_REL = `plugins/marketplaces/${OMAC_PLUGIN_MARKETPLACE_SLUG}`;
export const OMAC_HUD_DIST_REL = "dist/hud/index.js";
export const OMAC_HUD_WRAPPER_REL = "hud/omac-hud.mjs";
export const OMAC_HUD_WRAPPER_LIB_REL = "hud/lib/config-dir.mjs";
export const OMAC_CONFIG_FILE_REL = ".omac-config.json";
