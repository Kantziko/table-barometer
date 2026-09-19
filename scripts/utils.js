/** Shared helpers. */

const HTML_ENTITIES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

/**
 * HTML escaping. `foundry.utils.escapeHTML` alone is not relied upon, so that
 * this stays correct if the API shifts: axis labels are typed by hand in the
 * settings and end up in HTML built by concatenation.
 */
export function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, (c) => HTML_ENTITIES[c]);
}
