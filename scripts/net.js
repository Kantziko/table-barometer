/**
 * Transport.
 *
 * Only two messages travel over the socket, and both are harmless if forged:
 *
 *  report  client → GM    "here are my current values"
 *  poll    GM → clients   "send your values again"
 *
 * Resetting the table and changing the axes deliberately do NOT go through the
 * socket. `game.socket.emit` carries no proof of who sent a message, so any
 * player could have wiped everyone's answers from the browser console. Those
 * two actions ride on world settings instead, which the Foundry server refuses
 * to write for anyone but a GM; every client then reacts to the setting change.
 *
 * A limitation we still own up to: the socket broadcasts to everyone, so a
 * player listening on the channel can read other people's named reports, and
 * can forge a report in someone else's name. The anonymity this module offers
 * is one of interface, not one of transport, and the barometer is not a ballot.
 */

import { MODULE_ID, SOCKET, SETTINGS, setting, getAxes } from "./config.js";
import { LocalVotes, GMStore } from "./state.js";

export const MSG = {
  REPORT: "report",
  POLL: "poll"
};

/**
 * Reports received but not yet revealed to the GM, indexed by participant.
 * Each entry holds the latest values and the timer that will apply them.
 */
const pending = new Map();

function emit(payload) {
  game.socket.emit(SOCKET, payload);
}

/** Whether this client keeps an aggregate in memory. */
function aggregatesLocally() {
  return game.user.isGM || setting(SETTINGS.PLAYERS_SEE_SUMMARY);
}

/* -------------------------------------------- */
/*  Sending                                      */
/* -------------------------------------------- */

/** A player pushes their current values. */
export function sendReport({ solicited = false } = {}) {
  const votes = LocalVotes.read();
  emit({
    type: MSG.REPORT,
    userId: game.user.id,
    votes,
    solicited
  });

  // `game.socket.emit` reaches the OTHER clients and never oneself. So when we
  // are the one holding the aggregate, our own answer has to be written into it
  // by hand, or the GM's vote would never appear in the summary.
  if (aggregatesLocally()) {
    GMStore.record(game.user.id, votes);
    refreshSummary();
  }
}

/**
 * The GM asks everyone for their current state again. The sender identifies
 * itself so clients can ignore a poll that did not come from a GM — a curious
 * player could otherwise make the whole table re-broadcast its answers at will.
 */
export function sendPoll() {
  emit({ type: MSG.POLL, from: game.user.id });
}



/* -------------------------------------------- */
/*  Receiving                                    */
/* -------------------------------------------- */

export function registerSocket() {
  game.socket.on(SOCKET, (data) => {
    if (!data?.type) return;
    try {
      handle(data);
    } catch (err) {
      console.error(`${MODULE_ID} | failed to handle socket message`, data, err);
    }
  });
}

function handle(data) {
  switch (data.type) {
    case MSG.REPORT:
      if (!aggregatesLocally()) return;
      receiveReport(data);
      break;

    case MSG.POLL:
      // Only a GM gets to make the table speak up again.
      if (!game.users.get(data.from)?.isGM) return;
      if (Object.keys(LocalVotes.read()).length > 0) sendReport({ solicited: true });
      break;
  }
}

/* -------------------------------------------- */
/*  Reactions to world settings                  */
/* -------------------------------------------- */

/**
 * The GM reset the table. Reached through a world setting rather than the
 * socket, so only a GM can have triggered it.
 */
export function applyFlush() {
  cancelPending();
  GMStore.clear();
  LocalVotes.clear();
  clearDirty();
  if (!game.user.isGM) ui.notifications?.info(game.i18n.localize("TB.Panel.Flushed"));
  refreshPanel();
  refreshSummary();
}

/**
 * The axis definition changed. Running off the setting's own change hook means
 * the new value is already in place, so the surviving ids can simply be read
 * rather than carried along in a message.
 */
export function applyAxesChange() {
  const valid = new Set(getAxes().map((a) => a.id));
  LocalVotes.prune(valid);
  GMStore.prune(valid);
  refreshPanel();
  refreshSummary();
}

/* -------------------------------------------- */
/*  Reveal queue                                 */
/* -------------------------------------------- */

/**
 * Hands a report to the aggregate and lets the screen catch up.
 */
function applyReport(userId, votes, { solicited }) {
  GMStore.record(userId, votes);
  // A solicited resend is not news: leave the alert dot alone.
  if (!solicited) markDirty();
  refreshSummary();
}

/**
 * Applies an incoming report, possibly after a wait.
 *
 * The "reveal delay" setting has to bite HERE and not on the alert dot alone:
 * recording straight away would let an open summary update in real time, and
 * would also mean that opening the window during the wait showed the new value.
 * Holding the report back is the only way the delay actually hides anything.
 *
 * A first contact escapes the queue — hearing for the first time what someone
 * already thinks reveals no change, and making the GM wait for it after their
 * own reload would only look broken.
 */
function receiveReport(data) {
  const maxDelay = Number(setting(SETTINGS.REVEAL_DELAY)) || 0;
  const firstContact = data.solicited && !GMStore.has(data.userId);

  if (maxDelay <= 0 || firstContact) {
    applyReport(data.userId, data.votes, { solicited: data.solicited });
    return;
  }

  const waiting = pending.get(data.userId);
  if (waiting) {
    // A wait is already running for this person: only the latest values count,
    // and the deadline is NOT pushed back — otherwise someone who keeps
    // changing their mind would never surface at all.
    waiting.votes = data.votes;
    return;
  }

  const timer = setTimeout(() => {
    const entry = pending.get(data.userId);
    pending.delete(data.userId);
    if (entry) applyReport(data.userId, entry.votes, { solicited: false });
  }, Math.random() * maxDelay * 1000);

  pending.set(data.userId, { votes: data.votes, timer });
}

/**
 * Drops pending reports without revealing them — for one participant, or for
 * everyone when no id is given.
 */
export function cancelPending(userId) {
  const entries = userId === undefined ? [...pending.keys()] : [userId];
  for (const id of entries) {
    const entry = pending.get(id);
    if (!entry) continue;
    clearTimeout(entry.timer);
    pending.delete(id);
  }
}

/* -------------------------------------------- */
/*  The GM's alert dot                           */
/* -------------------------------------------- */

/**
 * Lights the dot on the summary button. The delay is applied upstream, in the
 * queue: by the time this runs, the GM is entitled to know.
 */
function markDirty() {
  const summary = getSummaryApp();
  if (summary?.rendered) return; // already in front of the GM
  GMStore.dirty = true;
  paintBadge();
}

export function clearDirty() {
  GMStore.dirty = false;
  paintBadge();
}

/**
 * The dot is injected into the scene controls. Foundry's UI API shifts from one
 * version to the next: if the button cannot be found, give up quietly rather
 * than break the module.
 */
export function paintBadge() {
  const button = document.querySelector(
    '[data-tool="tableBarometerSummary"], [data-control="tableBarometerSummary"]'
  );
  if (!button) return;
  button.classList.toggle("tb-has-news", GMStore.dirty === true);
}

/* -------------------------------------------- */
/*  Refreshes                                    */
/* -------------------------------------------- */

function getPanelApp() {
  return game.modules.get(MODULE_ID)?.api?.panel ?? null;
}

function getSummaryApp() {
  return game.modules.get(MODULE_ID)?.api?.summary ?? null;
}

export function refreshPanel() {
  const app = getPanelApp();
  if (app?.rendered) app.render();
}

export function refreshSummary() {
  const app = getSummaryApp();
  if (app?.rendered) app.render();
}
