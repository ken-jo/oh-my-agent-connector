/**
 * Boulder State Constants
 *
 * Ported from oh-my-opencode's boulder-state.
 */

import { OmacPaths } from '../../lib/worktree-paths.js';

/** OMAC state directory */
export const BOULDER_DIR = OmacPaths.ROOT;

/** Boulder state file name */
export const BOULDER_FILE = 'boulder.json';

/** Full path pattern for boulder state */
export const BOULDER_STATE_PATH = `${BOULDER_DIR}/${BOULDER_FILE}`;

/** Notepad directory for learnings */
export const NOTEPAD_DIR = 'notepads';

/** Full path for notepads */
export const NOTEPAD_BASE_PATH = `${BOULDER_DIR}/${NOTEPAD_DIR}`;

/** Planner plan directory */
export const PLANNER_PLANS_DIR = OmacPaths.PLANS;

/** Plan file extension */
export const PLAN_EXTENSION = '.md';
