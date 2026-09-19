/**
 * Barometer state.
 *
 * Two deliberately volatile stores:
 *  - LocalVotes: the current user's answers, in their browser's sessionStorage.
 *    They survive a refresh and die with the tab.
 *  - GMStore: the aggregate, in memory, on the GM's client only.
 *
 * Nothing is written to the world database, nothing is timestamped, nothing is
 * stacked up: only the current value of each connected participant exists.
 */

import { MODULE_ID, SETTINGS, getAxes, KIND, setting } from "./config.js";

/* -------------------------------------------- */
/*  The current user's answers                   */
/* -------------------------------------------- */

const STORAGE_KEY = `${MODULE_ID}:votes`;

export const LocalVotes = {
  read() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return typeof parsed === "object" && parsed !== null ? parsed : {};
    } catch (err) {
      console.warn(`${MODULE_ID} | sessionStorage could not be read:`, err);
      return {};
    }
  },

  get(axisId) {
    const value = this.read()[axisId];
    return value === -1 || value === 0 || value === 1 ? value : null;
  },

  set(axisId, value) {
    const votes = this.read();
    if (value === null) delete votes[axisId];
    else votes[axisId] = value;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
    } catch (err) {
      console.warn(`${MODULE_ID} | sessionStorage could not be written:`, err);
    }
    return votes;
  },

  clear() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.warn(`${MODULE_ID} | sessionStorage could not be cleared:`, err);
    }
  },

  /**
   * Drops answers belonging to axes that no longer exist and keeps the rest:
   * changing the axis list mid-session must not cost the table everything it
   * has already expressed.
   */
  prune(validIds) {
    const votes = this.read();
    let changed = false;
    for (const id of Object.keys(votes)) {
      if (validIds.has(id)) continue;
      delete votes[id];
      changed = true;
    }
    if (!changed) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(votes));
    } catch (err) {
      console.warn(`${MODULE_ID} | sessionStorage could not be written:`, err);
    }
  }
};

/* -------------------------------------------- */
/*  The GM-side aggregate                        */
/* -------------------------------------------- */

/**
 * Indexed by user id — necessary so as not to count the same person twice and
 * to drop those who disconnect. That index never leaves memory and is never
 * rendered to the screen.
 */
class GMStoreClass {
  #byUser = new Map();

  /** Something changed since the summary was last looked at. */
  dirty = false;

  record(userId, votes) {
    if (!userId) return;
    const clean = {};
    for (const axis of getAxes()) {
      const v = votes?.[axis.id];
      if (v === -1 || v === 0 || v === 1) clean[axis.id] = v;
    }
    if (Object.keys(clean).length === 0) this.#byUser.delete(userId);
    else this.#byUser.set(userId, clean);
  }

  /** Whether anything is already known about this participant. */
  has(userId) {
    return this.#byUser.has(userId);
  }

  forget(userId) {
    this.#byUser.delete(userId);
  }

  clear() {
    this.#byUser.clear();
    this.dirty = false;
  }

  /**
   * Drops vanished axes from the aggregated answers, leaving the rest alone.
   * Counterpart to LocalVotes' `prune`, applied across every participant.
   */
  prune(validIds) {
    for (const [userId, votes] of this.#byUser) {
      const kept = {};
      for (const [axisId, value] of Object.entries(votes)) {
        if (validIds.has(axisId)) kept[axisId] = value;
      }
      if (Object.keys(kept).length) this.#byUser.set(userId, kept);
      else this.#byUser.delete(userId);
    }
  }

  /** Users entitled to vote who are currently connected. */
  static connectedVoters() {
    const gmVotes = setting(SETTINGS.GM_VOTES);
    return game.users.filter((u) => u.active && (gmVotes || !u.isGM));
  }

  /**
   * An aggregated snapshot, carrying no link to any name.
   * @returns {{axes: object[], connected: number}}
   */
  snapshot() {
    const voters = GMStoreClass.connectedVoters();
    const connectedIds = new Set(voters.map((u) => u.id));

    // A participant who has left no longer has a say.
    for (const id of [...this.#byUser.keys()]) {
      if (!connectedIds.has(id)) this.#byUser.delete(id);
    }

    const min = setting(SETTINGS.MIN_RESPONDENTS);
    const axes = getAxes().map((axis) => {
      const counts = { "-1": 0, "0": 0, "1": 0 };
      let answers = 0;
      let sum = 0;

      for (const id of connectedIds) {
        const v = this.#byUser.get(id)?.[axis.id];
        if (v === -1 || v === 0 || v === 1) {
          counts[String(v)] += 1;
          answers += 1;
          sum += v;
        }
      }

      const bipolar = axis.kind === KIND.BIPOLAR;
      return {
        id: axis.id,
        label: axis.label,
        kind: axis.kind,
        bipolar,
        options: axis.options.map((o) => ({ ...o, count: counts[String(o.value)] })),
        answers,
        unanswered: Math.max(0, connectedIds.size - answers),
        average: answers ? sum / answers : null,
        // On a bipolar axis, two ends occupied at once cancel the average out:
        // that is the case the GM must see, not the one to smooth away.
        polarized: bipolar && counts["-1"] > 0 && counts["1"] > 0,
        hidden: answers < min
      };
    });

    return { axes, connected: connectedIds.size, min };
  }
}

export const GMStore = new GMStoreClass();
