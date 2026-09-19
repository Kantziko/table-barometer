/**
 * Shared base for both of the module's windows.
 *
 * Foundry puts "Detach / Attach" in the header menu by default, which makes no
 * sense for a palette meant to stay on screen. That menu is emptied — Foundry
 * then hides the button by itself — and a minimise button takes its place, to
 * the left of the close control.
 *
 * The menu is emptied through `_getHeaderControls()` rather than through
 * `window.controls`: Foundry CONCATENATES array options along the inheritance
 * chain, so an empty array would replace nothing at all.
 */

const { ApplicationV2 } = foundry.applications.api;

export class TBApplication extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    window: { minimizable: true },
    actions: {
      toggleMinimize: TBApplication.#onToggleMinimize
    }
  };

  /** No detaching, no re-attaching: the menu button disappears. */
  _getHeaderControls() {
    return [];
  }

  /** A minimise button, inserted just before the close control. */
  _getFrameButtons() {
    return [
      {
        icon: "fa-solid fa-window-minimize",
        label: "TB.Window.Minimize",
        action: "toggleMinimize"
      }
    ];
  }

  /*
   * The two methods below are overridden rather than wiring up the button's
   * action alone: Foundry also folds the window away on a double-click in the
   * title bar, and the icon must stay truthful whichever route was taken.
   */

  async minimize() {
    await super.minimize();
    this.#syncMinimizeButton();
  }

  async maximize() {
    await super.maximize();
    this.#syncMinimizeButton();
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    this.#syncMinimizeButton();
  }

  /** Swaps the button's icon and label to match the window's state. */
  #syncMinimizeButton() {
    const button = this.element?.querySelector('[data-action="toggleMinimize"]');
    if (!button) return;
    const minimized = this.minimized === true;
    button.classList.toggle("fa-window-minimize", !minimized);
    button.classList.toggle("fa-window-maximize", minimized);
    button.setAttribute(
      "aria-label",
      game.i18n.localize(minimized ? "TB.Window.Maximize" : "TB.Window.Minimize")
    );
  }

  static #onToggleMinimize() {
    return this.minimized ? this.maximize() : this.minimize();
  }
}
