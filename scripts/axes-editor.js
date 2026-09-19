/**
 * Axis editor.
 *
 * Built to be opened mid-session: adding an axis should cost three clicks, not
 * a JSON editing session. The raw JSON stays available behind a disclosure, for
 * awkward cases and for copying a configuration from one world to another.
 *
 * The working state lives in `#draft` and only reaches the settings on save, so
 * everything can be reshuffled and then abandoned without consequence.
 */

import { MODULE_ID, SETTINGS, DEFAULT_AXES, KIND, validateAxes, getAxes, localizeLabel } from "./config.js";
// Nothing from net.js is needed here: saving the setting propagates the change.

import { TBApplication } from "./base-app.js";
import { esc } from "./utils.js";

/** Suggestions offered by the picker. Rendered by the system's own font. */
const EMOJI_SUGGESTIONS = [
  "😐", "🙂", "🤩", "😍", "😃", "🥱", "😴", "😬", "😡", "😭", "🤔", "🫤",
  "🐢", "🐌", "🚶", "🏃", "🐇", "🚀", "⏳", "⚡", "🔥", "❄️", "🌡️", "📉",
  "⚔️", "🛡️", "🎭", "📜", "💬", "🎲", "🗺️", "🍺", "💀", "❤️", "⭐", "🌙",
  "👎", "👌", "👍", "❓", "❗", "🧠", "🎯", "🧩",
  "😮", "🥳", "📈", "⚖️"
];

export class AxesEditor extends TBApplication {
  static DEFAULT_OPTIONS = {
    id: "tb-axes-editor",
    classes: ["table-barometer", "tb-axes-editor"],
    tag: "div",
    window: {
      title: "TB.Settings.Axes.Title",
      icon: "fa-solid fa-sliders",
      resizable: true,
      contentClasses: ["tb-editor-content"]
    },
    position: { width: 560, height: 620 },
    actions: {
      addAxis: AxesEditor.#onAddAxis,
      removeAxis: AxesEditor.#onRemoveAxis,
      moveAxis: AxesEditor.#onMoveAxis,
      openPicker: AxesEditor.#onOpenPicker,
      chooseEmoji: AxesEditor.#onChooseEmoji,
      closePicker: AxesEditor.#onClosePicker,
      resetAxes: AxesEditor.#onResetAxes,
      save: AxesEditor.#onSave
    }
  };

  /** Working copy of the axes. */
  #draft = null;

  /** The option whose emoji picker is open, or null. */
  #picker = null;

  /**
   * Current error, or null: `{ message, axis? }`. When `axis` is given, that
   * axis is flagged and focused — the message alone is not enough, since the
   * one that matters is usually the axis just added at the bottom of a list the
   * window has to scroll.
   */
  #error = null;

  get draft() {
    if (!this.#draft) this.#draft = foundry.utils.deepClone(getAxes());
    return this.#draft;
  }

  /* -------------------------------------------- */
  /*  Rendering                                    */
  /* -------------------------------------------- */

  async _renderHTML() {
    const axes = this.draft;

    // The error sits with the buttons rather than at the top of the window: it
    // has to be where the eye already is at the moment of clicking Save.
    const error = this.#error
      ? `<p class="tb-error"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(
          this.#error.message
        )}</p>`
      : "";

    return `
      <p class="notes">${esc(game.i18n.localize("TB.Settings.Axes.EditorIntro"))}</p>
      <div class="tb-axis-list">
        ${axes.map((axis, i) => this.#renderAxis(axis, i, axes.length)).join("")}
      </div>
      <button type="button" class="tb-add" data-action="addAxis">
        <i class="fa-solid fa-plus"></i> ${esc(game.i18n.localize("TB.Settings.Axes.Add"))}
      </button>
      <details class="tb-json">
        <summary>${esc(game.i18n.localize("TB.Settings.Axes.Advanced"))}</summary>
        <p class="notes">${esc(game.i18n.localize("TB.Settings.Axes.EditorHint"))}</p>
        <textarea name="json" spellcheck="false" rows="10">${esc(JSON.stringify(axes, null, 2))}</textarea>
        <p class="notes">${esc(game.i18n.localize("TB.Settings.Axes.AdvancedHint"))}</p>
      </details>
      <div class="tb-sticky-footer">
        ${error}
        <footer class="tb-actions">
          <button type="button" data-action="resetAxes">
            <i class="fa-solid fa-rotate-left"></i> ${esc(game.i18n.localize("TB.Settings.Axes.Reset"))}
          </button>
          <button type="button" class="tb-primary" data-action="save">
            <i class="fa-solid fa-floppy-disk"></i> ${esc(game.i18n.localize("TB.Settings.Axes.Save"))}
          </button>
        </footer>
      </div>`;
  }

  #renderAxis(axis, index, total) {
    const kindOptions = [
      [KIND.BIPOLAR, "TB.Settings.Axes.KindBipolar"],
      [KIND.ORDINAL, "TB.Settings.Axes.KindOrdinal"]
    ]
      .map(([value, key]) => {
        const selected = axis.kind === value ? " selected" : "";
        return `<option value="${value}"${selected}>${esc(game.i18n.localize(key))}</option>`;
      })
      .join("");

    const positions = [-1, 0, 1]
      .map((value) => {
        const optIndex = axis.options.findIndex((o) => o.value === value);
        const opt = axis.options[optIndex] ?? { icon: "", label: "" };
        const open = this.#picker?.axis === index && this.#picker?.option === optIndex;
        return `
          <div class="tb-position">
            <button type="button" class="tb-emoji-button" data-action="openPicker"
                    data-index="${index}" data-opt="${optIndex}"
                    aria-label="${esc(game.i18n.localize("TB.Settings.Axes.PickIcon"))}">
              <span class="tb-emoji">${esc(opt.icon || "·")}</span>
            </button>
            <input type="text" class="tb-position-label" data-field="optionLabel"
                   data-index="${index}" data-opt="${optIndex}"
                   value="${esc(localizeLabel(opt.label))}"
                   data-original="${esc(opt.label ?? "")}"
                   placeholder="${esc(game.i18n.localize("TB.Settings.Axes.LabelPlaceholder"))}">
            ${open ? this.#renderPicker() : ""}
          </div>`;
      })
      .join("");

    const flagged = this.#error?.axis === index;

    return `
      <section class="tb-axis-editor${flagged ? " tb-invalid" : ""}" data-index="${index}">
        <header>
          <input type="text" class="tb-axis-name" data-field="label" data-index="${index}"
                 value="${esc(localizeLabel(axis.label))}"
                 data-original="${esc(axis.label ?? "")}"
                 aria-invalid="${flagged}"
                 placeholder="${esc(game.i18n.localize("TB.Settings.Axes.NamePlaceholder"))}">
          <select data-field="kind" data-index="${index}"
                  data-tooltip="${esc(game.i18n.localize("TB.Settings.Axes.KindHint"))}">
            ${kindOptions}
          </select>
          <button type="button" data-action="moveAxis" data-index="${index}" data-dir="-1"
                  ${index === 0 ? "disabled" : ""} aria-label="&#8593;">
            <i class="fa-solid fa-chevron-up"></i>
          </button>
          <button type="button" data-action="moveAxis" data-index="${index}" data-dir="1"
                  ${index === total - 1 ? "disabled" : ""} aria-label="&#8595;">
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <button type="button" class="tb-danger" data-action="removeAxis" data-index="${index}"
                  aria-label="${esc(game.i18n.localize("TB.Settings.Axes.Remove"))}">
            <i class="fa-solid fa-trash"></i>
          </button>
        </header>
        <div class="tb-positions">${positions}</div>
      </section>`;
  }

  #renderPicker() {
    const grid = EMOJI_SUGGESTIONS.map(
      (emoji) => `<button type="button" data-action="chooseEmoji" data-emoji="${esc(emoji)}">${esc(emoji)}</button>`
    ).join("");

    return `
      <div class="tb-picker">
        <div class="tb-picker-grid">${grid}</div>
        <div class="tb-picker-free">
          <input type="text" name="freeEmoji" maxlength="8"
                 placeholder="${esc(game.i18n.localize("TB.Settings.Axes.FreeIcon"))}">
          <button type="button" data-action="closePicker" aria-label="&#10005;">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
      </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
    this.#bindFields(content);
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    // Focusing the offending field scrolls it into view on its own, which is
    // what actually shows the reader where the problem is.
    if (this.#error?.axis === undefined) return;
    const field = this.element?.querySelector(
      `.tb-axis-editor[data-index="${this.#error.axis}"] .tb-axis-name`
    );
    field?.focus();
  }

  /**
   * Text fields and dropdowns write straight into the draft without triggering
   * a re-render: redrawing on every keystroke would lose the caret. Only
   * structural actions redraw.
   */
  #bindFields(root) {
    for (const field of root.querySelectorAll("[data-field]")) {
      const handler = () => this.#writeField(field);
      field.addEventListener("change", handler);
      if (field.tagName === "INPUT") field.addEventListener("input", handler);
    }

    const free = root.querySelector('input[name="freeEmoji"]');
    if (!free) return;
    free.focus();
    free.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.#applyEmoji(free.value.trim());
    });
  }

  #writeField(field) {
    const index = Number(field.dataset.index);
    const axis = this.draft[index];
    if (!axis) return;

    switch (field.dataset.field) {
      case "label":
        axis.label = AxesEditor.#readLabel(field);
        break;
      case "kind":
        axis.kind = field.value;
        break;
      case "optionLabel": {
        const option = axis.options[Number(field.dataset.opt)];
        if (option) option.label = AxesEditor.#readLabel(field);
        break;
      }
    }
  }

  /**
   * Reads a label field, keeping the translation key when nothing was changed.
   *
   * The field displays the TRANSLATED label, so writing its value back blindly
   * would replace `TB.Axes.Fun.Label` with "Fun" the first time any GM opened
   * the editor and saved — freezing every label in that GM's own language and
   * quietly stripping the module of its translations for everyone else.
   */
  static #readLabel(field) {
    const original = field.dataset.original ?? "";
    if (original && field.value === localizeLabel(original)) return original;
    return field.value;
  }

  /** Copies the fields back into the draft ahead of a structural re-render. */
  #harvest() {
    if (!this.element) return;
    for (const field of this.element.querySelectorAll("[data-field]")) this.#writeField(field);
  }

  /* -------------------------------------------- */
  /*  Actions                                      */
  /* -------------------------------------------- */

  static #onAddAxis() {
    this.#harvest();
    const used = new Set(this.draft.map((a) => a.id));
    let n = this.draft.length + 1;
    while (used.has(`axis${n}`)) n += 1;

    this.draft.push({
      id: `axis${n}`,
      label: "",
      kind: KIND.BIPOLAR,
      options: [
        { value: -1, icon: "👎", label: "" },
        { value: 0, icon: "👌", label: "" },
        { value: 1, icon: "👍", label: "" }
      ]
    });
    this.#error = null;
    this.render();
  }

  static #onRemoveAxis(event, target) {
    this.#harvest();
    this.draft.splice(Number(target.dataset.index), 1);
    this.#picker = null;
    this.render();
  }

  static #onMoveAxis(event, target) {
    this.#harvest();
    const from = Number(target.dataset.index);
    const to = from + Number(target.dataset.dir);
    if (to < 0 || to >= this.draft.length) return;
    const [axis] = this.draft.splice(from, 1);
    this.draft.splice(to, 0, axis);
    this.#picker = null;
    this.render();
  }

  static #onOpenPicker(event, target) {
    this.#harvest();
    const axis = Number(target.dataset.index);
    const option = Number(target.dataset.opt);
    const same = this.#picker?.axis === axis && this.#picker?.option === option;
    this.#picker = same ? null : { axis, option };
    this.render();
  }

  static #onChooseEmoji(event, target) {
    this.#applyEmoji(target.dataset.emoji);
  }

  static #onClosePicker() {
    this.#harvest();
    this.#picker = null;
    this.render();
  }

  static #onResetAxes() {
    this.#draft = foundry.utils.deepClone(DEFAULT_AXES);
    this.#picker = null;
    this.#error = null;
    this.render();
  }

  static async #onSave() {
    this.#harvest();

    // The "advanced" disclosure wins while it is open: it is the only place to
    // express what the fields cannot.
    const textarea = this.element?.querySelector('textarea[name="json"]');
    const advanced = textarea?.closest("details")?.open;
    let axes = this.draft;
    if (advanced && textarea) {
      try {
        axes = JSON.parse(textarea.value);
      } catch (err) {
        this.#error = { message: game.i18n.format("TB.Settings.Axes.Invalid", { error: err.message }) };
        return this.render();
      }
    }

    // A missing name is by far the most common mistake, and the only one that
    // points at a precise field: it gets its own check so the guilty axis can
    // be flagged and focused instead of leaving the reader to hunt for it.
    const nameless = axes.findIndex((axis) => !String(axis?.label ?? "").trim());
    if (nameless !== -1) {
      this.#error = {
        message: game.i18n.localize("TB.Settings.Axes.NeedsName"),
        axis: nameless
      };
      return this.render();
    }

    try {
      validateAxes(axes);
    } catch (err) {
      this.#error = { message: game.i18n.format("TB.Settings.Axes.Invalid", { error: err.message }) };
      return this.render();
    }

    // Writing the setting is enough: its change hook runs on every client, this
    // one included, and prunes only the answers whose axis disappeared — adding
    // an axis mid-session leaves the rest of the table untouched. Going through
    // the setting also means only a GM can trigger any of this.
    await game.settings.set(MODULE_ID, SETTINGS.AXES, JSON.stringify(axes));

    ui.notifications?.info(game.i18n.localize("TB.Settings.Axes.Saved"));
    this.#draft = null;
    this.close();
  }

  /* -------------------------------------------- */

  #applyEmoji(emoji) {
    if (!emoji || !this.#picker) return;
    const target = this.#picker;
    this.#harvest();
    const option = this.draft[target.axis]?.options?.[target.option];
    if (option) option.icon = emoji;
    this.#picker = null;
    this.render();
  }
}
