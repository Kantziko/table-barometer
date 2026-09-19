/**
 * Constants, default axes and setting keys.
 */

export const MODULE_ID = "table-barometer";
export const SOCKET = `module.${MODULE_ID}`;

/** The values an axis can take. `null` means "not set". */
export const VALUES = [-1, 0, 1];

/**
 * Two kinds of axis, which are not read the same way:
 *  - "ordinal": the optimum sits on the right (fun);
 *  - "bipolar": the optimum sits in the middle and both ends are symmetrical
 *    warnings (pace, amount of roleplay). On a bipolar axis the average can
 *    lie — hence the split-table detection in the summary.
 */
export const KIND = { ORDINAL: "ordinal", BIPOLAR: "bipolar" };

/**
 * Labels are translation keys: the module ships in English and displays in each
 * client's own language. An axis typed by hand in the editor may just as well
 * carry plain text — see `localizeLabel`.
 */
export const DEFAULT_AXES = [
  {
    id: "fun",
    label: "TB.Axes.Fun.Label",
    kind: KIND.ORDINAL,
    options: [
      { value: -1, icon: "😐", label: "TB.Axes.Fun.Low" },
      { value: 0, icon: "🙂", label: "TB.Axes.Fun.Mid" },
      { value: 1, icon: "🤩", label: "TB.Axes.Fun.High" }
    ]
  },
  {
    id: "pace",
    label: "TB.Axes.Pace.Label",
    kind: KIND.BIPOLAR,
    options: [
      { value: -1, icon: "🐢", label: "TB.Axes.Pace.Low" },
      { value: 0, icon: "👌", label: "TB.Axes.Pace.Mid" },
      { value: 1, icon: "🐇", label: "TB.Axes.Pace.High" }
    ]
  },
  {
    id: "rp",
    label: "TB.Axes.Roleplay.Label",
    kind: KIND.BIPOLAR,
    options: [
      { value: -1, icon: "⚔️", label: "TB.Axes.Roleplay.Low" },
      { value: 0, icon: "⚖️", label: "TB.Axes.Roleplay.Mid" },
      { value: 1, icon: "🎭", label: "TB.Axes.Roleplay.High" }
    ]
  }
];

/**
 * Resolves an axis or option label: a known translation key is translated, any
 * other text is returned as-is. That is what lets a GM type "Tension" into the
 * editor without having to declare a translation for it.
 */
export function localizeLabel(value) {
  const text = String(value ?? "");
  return game.i18n?.has?.(text) ? game.i18n.localize(text) : text;
}

export const SETTINGS = {
  AXES: "axes",
  GM_VOTES: "gmVotes",
  PLAYERS_SEE_SUMMARY: "playersSeeSummary",
  MIN_RESPONDENTS: "minRespondents",
  REVEAL_DELAY: "revealDelay",
  AUTO_OPEN: "autoOpen",
  PANEL_POSITION: "panelPosition",
  FLUSH_TOKEN: "flushToken"
};

export function setting(key) {
  return game.settings.get(MODULE_ID, key);
}

export const LIMITS = {
  AXES: 12,
  ID: 40,
  LABEL: 100,
  ICON: 8
};

/**
 * Ids that would tamper with the objects built from them. Axis ids become keys
 * of plain objects holding each participant's answers, so an id of `__proto__`
 * would reassign that object's prototype rather than store a value.
 */
const FORBIDDEN_IDS = new Set(["__proto__", "constructor", "prototype"]);

const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

/**
 * Validates an axis definition coming from the setting. Rejecting outright
 * beats rendering a half-broken palette in the middle of a session. The limits
 * also keep a careless paste into the JSON box from burying every client.
 * @throws {Error} if the structure is invalid.
 */

export function validateAxes(axes) {
  if (!Array.isArray(axes) || axes.length === 0) fail("Root");
  if (axes.length > LIMITS.AXES) fail("TooMany", { max: LIMITS.AXES, count: axes.length });

  const seen = new Set();
  for (const axis of axes) {
    if (!axis?.id || typeof axis.id !== "string") fail("NoId");
    const id = axis.id;
    if (id.length > LIMITS.ID || !ID_PATTERN.test(id)) fail("BadId", { id, max: LIMITS.ID });
    if (FORBIDDEN_IDS.has(id)) fail("ForbiddenId", { id });
    if (seen.has(id)) fail("DuplicateId", { id });
    seen.add(id);

    if (!axis.label) fail("NoLabel", { id });
    if (typeof axis.label !== "string" || axis.label.length > LIMITS.LABEL) fail("BadLabel", { id, max: LIMITS.LABEL });
    if (![KIND.ORDINAL, KIND.BIPOLAR].includes(axis.kind)) fail("BadKind", { id });
    if (!Array.isArray(axis.options) || axis.options.length !== 3) fail("BadOptions", { id });

    const values = axis.options.map((o) => o.value);
    if (!VALUES.every((v) => values.includes(v))) fail("BadValues", { id });
    for (const option of axis.options) {
      if (option.label !== undefined && (typeof option.label !== "string" || option.label.length > LIMITS.LABEL)) {
        fail("OptionLabel", { id, max: LIMITS.LABEL });
      }
      if (option.icon !== undefined && (typeof option.icon !== "string" || [...option.icon].length > LIMITS.ICON)) {
        fail("OptionIcon", { id, max: LIMITS.ICON });
      }
    }
  }
  return axes;
}

/**
 * Throws a localized validation error. Falls back to the bare key if i18n is
 * not ready yet, which only matters for the console warning in `getAxes`.
 */
function fail(key, data = {}) {
  const fullKey = `TB.Validation.${key}`;
  throw new Error(game.i18n?.has?.(fullKey) ? game.i18n.format(fullKey, data) : fullKey);
}

/** The current axes, falling back to the defaults if the setting is broken. */
export function getAxes() {
  const raw = setting(SETTINGS.AXES);
  try {
    return validateAxes(JSON.parse(raw));
  } catch (err) {
    console.warn(`${MODULE_ID} | invalid "axes" setting, falling back to the defaults:`, err);
    return DEFAULT_AXES;
  }
}

export function getAxis(id) {
  return getAxes().find((a) => a.id === id) ?? null;
}
