/**
 * The summary: distribution first, average second, names never.
 */

import { MODULE_ID, SETTINGS, localizeLabel } from "./config.js";
import { GMStore } from "./state.js";
import { sendPoll, clearDirty } from "./net.js";
import { toneOf } from "./player-panel.js";
import { esc } from "./utils.js";
import { AxesEditor } from "./axes-editor.js";

import { TBApplication } from "./base-app.js";

const { DialogV2 } = foundry.applications.api;


export class GMSummary extends TBApplication {
  /** Timestamp of the last re-poll, used to space them out. */
  #lastPoll = 0;

  static DEFAULT_OPTIONS = {
    id: "tb-gm-summary",
    classes: ["table-barometer", "tb-summary"],
    tag: "div",
    window: {
      title: "TB.Summary.Title",
      icon: "fa-solid fa-chart-simple",
      minimizable: true,
      resizable: true,
      contentClasses: ["tb-summary-content"]
    },
    position: { width: 380, height: "auto" },
    actions: {
      flush: GMSummary.#onFlush,
      editAxes: GMSummary.#onEditAxes
    }
  };

  async _renderHTML() {
    const { axes, connected, min } = GMStore.snapshot();

    const body = axes.map((axis) => this.#renderAxis(axis, connected, min)).join("");

    const footer = game.user.isGM
      ? `<footer class="tb-actions">
           <button type="button" data-action="editAxes" data-tooltip="${esc(
             game.i18n.localize("TB.Settings.Axes.Hint")
           )}">
             <i class="fa-solid fa-sliders"></i> ${esc(game.i18n.localize("TB.Summary.EditAxes"))}
           </button>
           <button type="button" class="tb-danger" data-action="flush" data-tooltip="${esc(
             game.i18n.localize("TB.Summary.FlushHint")
           )}">
             <i class="fa-solid fa-broom"></i> ${esc(game.i18n.localize("TB.Summary.Flush"))}
           </button>
         </footer>`
      : "";

    return body + footer;
  }

  #renderAxis(axis, connected, min) {
    const header = `
      <header class="tb-axis-header">
        <span class="tb-axis-label">${esc(localizeLabel(axis.label))}</span>
        <span class="tb-count">${esc(
          game.i18n.format("TB.Summary.Respondents", { n: axis.answers, total: connected })
        )}</span>
      </header>`;

    if (axis.hidden) {
      const reason = axis.answers === 0
        ? game.i18n.localize("TB.Summary.NoData")
        : game.i18n.format("TB.Summary.Hidden", { min });
      return `<section class="tb-axis tb-axis-hidden">${header}
                <p class="tb-veil"><i class="fa-solid fa-eye-slash"></i> ${esc(reason)}</p>
              </section>`;
    }

    // The distribution is the primary information: three columns readable down
    // to the unit, which matters more than a percentage at a small table.
    const max = Math.max(...axis.options.map((o) => o.count), 1);
    const columns = axis.options
      .map((opt) => {
        const tone = toneOf(axis.kind, opt.value);
        const height = Math.round((opt.count / max) * 100);
        return `
          <div class="tb-col${opt.count === 0 ? " tb-empty" : ""}" data-tooltip="${esc(localizeLabel(opt.label))}">
            <div class="tb-bar-track">
              <div class="tb-bar tb-tone-${tone}" style="height:${height}%"></div>
            </div>
            <div class="tb-col-count">${opt.count}</div>
            <div class="tb-col-icon">${esc(opt.icon ?? "")}</div>
          </div>`;
      })
      .join("");

    const cursor = ((axis.average + 1) / 2) * 100;
    const averageText = axis.bipolar && Math.abs(axis.average) < 0.01
      ? game.i18n.localize("TB.Summary.Centered")
      : `${axis.average > 0 ? "+" : ""}${axis.average.toFixed(2)}`;

    const average = `
      <div class="tb-average">
        <span class="tb-average-label">${esc(game.i18n.localize("TB.Summary.Average"))}</span>
        <div class="tb-gauge${axis.polarized ? " tb-gauge-muted" : ""}">
          <div class="tb-gauge-center"></div>
          <div class="tb-gauge-cursor" style="left:${cursor}%"></div>
        </div>
        <span class="tb-average-value">${esc(averageText)}</span>
      </div>`;

    const polarized = axis.polarized
      ? `<p class="tb-polarized" data-tooltip="${esc(game.i18n.localize("TB.Summary.PolarizedHint"))}">
           <i class="fa-solid fa-arrows-left-right"></i> ${esc(game.i18n.localize("TB.Summary.Polarized"))}
         </p>`
      : "";

    const unanswered = axis.unanswered
      ? `<p class="tb-unanswered">${axis.unanswered} ${esc(game.i18n.localize("TB.Summary.Unanswered"))}</p>`
      : "";

    return `<section class="tb-axis">
              ${header}
              <div class="tb-distribution">${columns}</div>
              ${average}
              ${polarized}
              ${unanswered}
            </section>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  _onRender(context, options) {
    super._onRender?.(context, options);

    // Looking is acknowledging: the alert dot goes out.
    if (game.user.isGM) clearDirty();

    // Safety net: on opening, ask the clients for their state again in case a
    // message went missing. Capped at once every five seconds so that a vote's
    // redraw does not trigger a fresh poll each time.
    const now = Date.now();
    if (now - this.#lastPoll > 5000) {
      this.#lastPoll = now;
      sendPoll();
    }
  }

  static #onEditAxes() {
    new AxesEditor().render({ force: true });
  }

  static async #onFlush() {
    const ok = await DialogV2.confirm({
      window: { title: game.i18n.localize("TB.Summary.Flush") },
      content: `<p>${esc(game.i18n.localize("TB.Summary.FlushConfirm"))}</p>`,
      modal: true
    });
    if (!ok) return;

    // Bumping the world setting is the whole reset: its change hook fires on
    // every client, this one included, and does the clearing. Only a GM can
    // write it, which is exactly the guarantee a socket message could not give.
    await game.settings.set(MODULE_ID, SETTINGS.FLUSH_TOKEN, Date.now());
  }
}
