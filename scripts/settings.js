/**
 * Declaration of the module's settings.
 */

import { MODULE_ID, SETTINGS, DEFAULT_AXES } from "./config.js";
import { applyFlush, applyAxesChange } from "./net.js";
import { AxesEditor } from "./axes-editor.js";

export function registerSettings() {
  game.settings.registerMenu(MODULE_ID, "axesMenu", {
    name: "TB.Settings.Axes.Name",
    hint: "TB.Settings.Axes.Hint",
    label: "TB.Settings.Axes.Label",
    icon: "fa-solid fa-sliders",
    type: AxesEditor,
    restricted: true
  });

  game.settings.register(MODULE_ID, SETTINGS.AXES, {
    scope: "world",
    config: false,
    type: String,
    default: JSON.stringify(DEFAULT_AXES),
    onChange: () => applyAxesChange()
  });

  /*
   * Resetting the table travels as a world setting rather than a socket
   * message: the server only lets a GM write it, whereas a socket message
   * carries no proof of its sender and any player could have wiped the table.
   * The value is a meaningless counter — no answer is ever stored here.
   */
  game.settings.register(MODULE_ID, SETTINGS.FLUSH_TOKEN, {
    scope: "world",
    config: false,
    type: Number,
    default: 0,
    onChange: () => applyFlush()
  });

  game.settings.register(MODULE_ID, SETTINGS.GM_VOTES, {
    name: "TB.Settings.GmVotes.Name",
    hint: "TB.Settings.GmVotes.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.PLAYERS_SEE_SUMMARY, {
    name: "TB.Settings.PlayersSeeSummary.Name",
    hint: "TB.Settings.PlayersSeeSummary.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  game.settings.register(MODULE_ID, SETTINGS.MIN_RESPONDENTS, {
    name: "TB.Settings.MinRespondents.Name",
    hint: "TB.Settings.MinRespondents.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 1, max: 6, step: 1 },
    default: 2
  });

  game.settings.register(MODULE_ID, SETTINGS.REVEAL_DELAY, {
    name: "TB.Settings.RevealDelay.Name",
    hint: "TB.Settings.RevealDelay.Hint",
    scope: "world",
    config: true,
    type: Number,
    range: { min: 0, max: 300, step: 10 },
    default: 0
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_OPEN, {
    name: "TB.Settings.AutoOpen.Name",
    hint: "TB.Settings.AutoOpen.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(MODULE_ID, SETTINGS.PANEL_POSITION, {
    scope: "client",
    config: false,
    type: Object,
    default: {}
  });
}
