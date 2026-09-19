/**
 * Table Barometer — entry point.
 *
 * Three axes, three positions, nothing persisted. The GM sees the distribution,
 * never who answered what.
 */

import { MODULE_ID, SETTINGS, setting } from "./config.js";
import { GMStore } from "./state.js";
import { registerSettings } from "./settings.js";
import {
  registerSocket,
  sendPoll,
  sendReport,
  refreshSummary,
  paintBadge,
  cancelPending
} from "./net.js";
import { PlayerPanel } from "./player-panel.js";
import { GMSummary } from "./gm-summary.js";

const TOOL_PANEL = "tableBarometer";
const TOOL_SUMMARY = "tableBarometerSummary";

function api() {
  return game.modules.get(MODULE_ID)?.api;
}

function canVote() {
  return !game.user.isGM || setting(SETTINGS.GM_VOTES);
}

function canSeeSummary() {
  return game.user.isGM || setting(SETTINGS.PLAYERS_SEE_SUMMARY);
}

/* -------------------------------------------- */
/*  Lifecycle                                    */
/* -------------------------------------------- */

Hooks.once("init", () => {
  registerSettings();
  registerSocket();

  const module = game.modules.get(MODULE_ID);
  module.api = {
    panel: null,
    summary: null,
    store: GMStore,
    openPanel: () => api().panel?.render({ force: true }),
    openSummary: () => api().summary?.render({ force: true })
  };
});

Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);

  if (canVote()) {
    const saved = setting(SETTINGS.PANEL_POSITION) ?? {};
    module.api.panel = new PlayerPanel({
      position: Number.isFinite(saved.top) && Number.isFinite(saved.left)
        ? { top: saved.top, left: saved.left }
        : {}
    });
    if (setting(SETTINGS.AUTO_OPEN)) module.api.panel.render({ force: true });
  }

  if (canSeeSummary()) module.api.summary = new GMSummary();

  // The GM may have just reloaded the page: they rebuild their aggregate by
  // polling the clients, without digging anything out of storage.
  if (game.user.isGM) sendPoll();

  // Everyone re-announces themselves, the GM included: that is what puts their
  // own answers back into their aggregate after a page reload.
  sendReport({ solicited: true });
});

/* -------------------------------------------- */
/*  Scene controls                                */
/* -------------------------------------------- */

Hooks.on("getSceneControlButtons", (controls) => {
  const group = findTokenGroup(controls);
  if (!group) return;

  const tools = [];

  if (canVote()) {
    tools.push({
      name: TOOL_PANEL,
      order: 90,
      title: "TB.Panel.Title",
      icon: "fa-solid fa-gauge-simple-high",
      button: true,
      visible: true,
      onClick: () => togglePanel(),
      onChange: () => togglePanel()
    });
  }

  if (canSeeSummary()) {
    tools.push({
      name: TOOL_SUMMARY,
      order: 91,
      title: "TB.Summary.Title",
      icon: "fa-solid fa-chart-simple",
      button: true,
      visible: true,
      onClick: () => toggleSummary(),
      onChange: () => toggleSummary()
    });
  }

  for (const tool of tools) {
    if (Array.isArray(group.tools)) group.tools.push(tool);
    else group.tools[tool.name] = tool;
  }
});

/**
 * Both the control group's name and the collection's shape changed between
 * major Foundry versions; tolerate either.
 */
function findTokenGroup(controls) {
  const names = ["tokens", "token"];
  if (Array.isArray(controls)) {
    return controls.find((c) => names.includes(c.name)) ?? controls[0] ?? null;
  }
  if (controls && typeof controls === "object") {
    for (const name of names) if (controls[name]) return controls[name];
    return Object.values(controls)[0] ?? null;
  }
  return null;
}

Hooks.on("renderSceneControls", () => paintBadge());

function togglePanel() {
  const app = api()?.panel;
  if (!app) return;
  if (app.rendered) app.close();
  else app.render({ force: true });
}

function toggleSummary() {
  const app = api()?.summary;
  if (!app) return;
  if (app.rendered) app.close();
  else app.render({ force: true });
}

/* -------------------------------------------- */
/*  Arrivals and departures                      */
/* -------------------------------------------- */

Hooks.on("userConnected", (user, connected) => {
  // A GM arriving mid-session needs everyone's current values. Reacting to this
  // hook — which the server raises — means the state rebuilds itself without
  // anyone having to ask over the socket.
  if (connected && user.isGM && !game.user.isGM) {
    sendReport({ solicited: true });
    return;
  }

  if (game.user.isGM && !connected) {
    // Someone who has disconnected no longer holds an opinion: they leave the
    // summary.
    cancelPending(user.id);
    GMStore.forget(user.id);
    refreshSummary();
  }
});
