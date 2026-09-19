/**
 * The player's palette: three axes, three positions each, always on screen.
 */

import { MODULE_ID, SETTINGS, getAxes, KIND, localizeLabel } from "./config.js";
import { LocalVotes } from "./state.js";
import { sendReport } from "./net.js";
import { esc } from "./utils.js";

import { TBApplication } from "./base-app.js";


/**
 * The colour coding cannot be the same for both kinds of axis: on a bipolar
 * one it is the middle that is the optimum, not the right-hand end.
 */
export function toneOf(kind, value) {
  if (kind === KIND.BIPOLAR) return value === 0 ? "good" : "warn";
  if (value === 1) return "good";
  if (value === 0) return "mid";
  return "warn";
}

export class PlayerPanel extends TBApplication {
  static DEFAULT_OPTIONS = {
    id: "tb-player-panel",
    classes: ["table-barometer", "tb-panel"],
    tag: "div",
    window: {
      title: "TB.Panel.Title",
      icon: "fa-solid fa-gauge-simple-high",
      minimizable: true,
      resizable: false,
      contentClasses: ["tb-panel-content"]
    },
    position: { width: 250, height: "auto" },
    actions: {
      pick: PlayerPanel.#onPick
    }
  };

  /** Position saving, debounced so as not to write on every pixel moved. */
  #savePosition = foundry.utils.debounce((position) => {
    game.settings.set(MODULE_ID, SETTINGS.PANEL_POSITION, {
      top: position.top,
      left: position.left
    });
  }, 500);

  async _renderHTML() {
    const votes = LocalVotes.read();

    const axes = getAxes()
      .map((axis) => {
        const current = votes[axis.id] ?? null;
        const buttons = axis.options
          .map((opt) => {
            const active = current === opt.value;
            const tone = toneOf(axis.kind, opt.value);
            return `
              <button type="button"
                      class="tb-choice tb-tone-${tone}${active ? " tb-active" : ""}"
                      data-action="pick"
                      data-axis="${esc(axis.id)}"
                      data-value="${opt.value}"
                      aria-pressed="${active}"
                      data-tooltip="${esc(localizeLabel(opt.label))}">
                <span class="tb-icon">${esc(opt.icon ?? "")}</span>
              </button>`;
          })
          .join("");

        const currentLabel =
          current === null
            ? game.i18n.localize("TB.Panel.Unset")
            : localizeLabel(axis.options.find((o) => o.value === current)?.label ?? "");

        return `
          <section class="tb-axis" data-axis="${esc(axis.id)}">
            <header class="tb-axis-header">
              <span class="tb-axis-label">${esc(localizeLabel(axis.label))}</span>
              <span class="tb-axis-current${current === null ? " tb-unset" : ""}">${esc(currentLabel)}</span>
            </header>
            <div class="tb-choices">${buttons}</div>
          </section>`;
      })
      .join("");

    return `${axes}<p class="tb-hint">${esc(game.i18n.localize("TB.Panel.Hint"))}</p>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onPosition(position) {
    super._onPosition?.(position);
    this.#savePosition(position);
  }

  /**
   * Clicking the position that is already active withdraws the answer: a player
   * must be able to fall silent after speaking, otherwise "not set" would only
   * work in one direction.
   */
  static #onPick(event, target) {
    const axisId = target.dataset.axis;
    const value = Number(target.dataset.value);
    const current = LocalVotes.get(axisId);
    const next = current === value ? null : value;

    LocalVotes.set(axisId, next);
    sendReport();

    if (!game.users.some((u) => u.isGM && u.active)) {
      ui.notifications?.info(game.i18n.localize("TB.Notify.NoGM"));
    }

    this.render();
  }
}
