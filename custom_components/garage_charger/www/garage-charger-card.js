/*
 * Garage Charger Card – dashboard card in the style of the garage display.
 *
 * Loaded automatically by the "Garage Charger" integration (no resource to
 * add). Add card → "Garage Charger Card", or in YAML:
 *
 *   type: custom:garage-charger-card
 *   entry_id: <Garage Charger config entry>   # the editor fills this in
 *   title: Garage                              # optional
 *   show_clock: true                           # optional
 *   display_style: false                       # optional: dark display look
 *
 * Every entity can be overridden explicitly (status_entity, power_entity,
 * start_button, stop_button, duration_entity, energy_entity).
 *
 * Legacy-safe on purpose (old WebViews, see AGENTS.md): own scope, ES2019
 * syntax only, no flex/grid `gap`, no color-mix().
 */
(function () {
  "use strict";

  var TAG = "garage-charger-card";
  var EDITOR_TAG = "garage-charger-card-editor";
  var WS_ENTRIES = "garage_charger/entries";
  var PENDING_MS = 120000; // cloud chargers report the new status after ~1 min
  var ERROR_MS = 10000;
  var STOPPABLE = ["charging", "suspended_evse", "suspended_ev"];
  var IDLE = ["available", "unknown", "unavailable"];
  var ENTITY_KEYS = [
    "status_entity", "power_entity", "start_button", "stop_button",
    "duration_entity", "energy_entity",
  ];
  var REQUIRED_KEYS = ["status_entity", "power_entity", "start_button", "stop_button"];

  var ICONS = {
    car: "M18.92 2C18.72 1.42 18.16 1 17.5 1H6.5C5.84 1 5.29 1.42 5.08 2L3 8V16C3 16.55 3.45 17 4 17H5C5.55 17 6 16.55 6 16V15H18V16C18 16.55 18.45 17 19 17H20C20.55 17 21 16.55 21 16V8L18.92 2M6.5 12C5.67 12 5 11.33 5 10.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12M17.5 12C16.67 12 16 11.33 16 10.5S16.67 9 17.5 9 19 9.67 19 10.5 18.33 12 17.5 12M5 7L6.5 2.5H17.5L19 7H5M7 20H11V18L17 21H13V23L7 20Z",
    station: "M19.77,7.23L19.78,7.22L16.06,3.5L15,4.56L17.11,6.67C16.17,7.03 15.5,7.93 15.5,9A2.5,2.5 0 0,0 18,11.5C18.36,11.5 18.69,11.42 19,11.29V18.5A1,1 0 0,1 18,19.5A1,1 0 0,1 17,18.5V14A2,2 0 0,0 15,12H14V5A2,2 0 0,0 12,3H6A2,2 0 0,0 4,5V21H14V13.5H15.5V18.5A2.5,2.5 0 0,0 18,21A2.5,2.5 0 0,0 20.5,18.5V9C20.5,8.31 20.22,7.68 19.77,7.23M18,10A1,1 0 0,1 17,9A1,1 0 0,1 18,8A1,1 0 0,1 19,9A1,1 0 0,1 18,10M8,18V13.5H6L10,6V11H12L8,18Z",
    bolt: "M11 15H6L13 1V9H18L11 23V15Z",
    alert: "M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
    play: "M8,5.14V19.14L19,12.14L8,5.14Z",
    stop: "M18,18H6V6H18V18Z",
    wait: "M6,2H18V8H18V8L14,12L18,16V16H18V22H6V16H6V16L10,12L6,8V8H6V2M16,16.5L12,12.5L8,16.5V20H16V16.5M12,11.5L16,7.5V4H8V7.5L12,11.5M10,6H14V6.75L12,8.75L10,6.75V6Z",
  };

  var STRINGS = {
    de: {
      available: "Kein Fahrzeug verbunden",
      preparing: "Angesteckt – bereit",
      charging: "Lädt",
      suspended_evse: "Pausiert – zu wenig PV",
      suspended_ev: "Vom Fahrzeug pausiert",
      finishing: "Ladevorgang beendet",
      faulted: "Fehler am Lader",
      offline: "Lader offline",
      start: "Laden starten",
      stop: "Laden stoppen",
      wait: "Bitte warten…",
      duration: "Ladedauer",
      energy: "Geladen",
      error: "Fehler: ",
      hint_setup: "Bitte die Integration „Garage Charger“ einrichten und die Karte im Editor auswählen.",
      hint_entry: "Der gewählte Lader ist nicht (mehr) eingerichtet. Bitte im Karten-Editor neu auswählen.",
      hint_missing: "Es fehlen Entitäten: {keys}. Bitte die Integration unter „Konfigurieren“ ergänzen.",
      ed_entry: "Lader",
      ed_title: "Titel",
      ed_clock: "Uhrzeit anzeigen",
      ed_display: "Dunkle Optik wie das Garagen-Display (statt Theme-Farben)",
    },
    en: {
      available: "No vehicle connected",
      preparing: "Plugged in – ready",
      charging: "Charging",
      suspended_evse: "Paused – not enough PV",
      suspended_ev: "Paused by vehicle",
      finishing: "Charging finished",
      faulted: "Charger fault",
      offline: "Charger offline",
      start: "Start charging",
      stop: "Stop charging",
      wait: "Please wait…",
      duration: "Charging time",
      energy: "Charged",
      error: "Error: ",
      hint_setup: "Please set up the “Garage Charger” integration and pick it in the card editor.",
      hint_entry: "The selected charger is not configured (any more). Please pick it again in the card editor.",
      hint_missing: "Missing entities: {keys}. Please add them under “Configure” in the integration.",
      ed_entry: "Charger",
      ed_title: "Title",
      ed_clock: "Show clock",
      ed_display: "Dark look of the garage display (instead of theme colours)",
    },
  };

  // ------------------------------------------------------------ helpers --
  function lang(hass) {
    var l = hass && hass.locale && hass.locale.language ? hass.locale.language : "";
    if (!l && hass && hass.language) l = hass.language;
    return String(l).indexOf("de") === 0 ? "de" : "en";
  }

  function tr(hass, key) {
    return STRINGS[lang(hass)][key];
  }

  function svg(d) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  function number(value, digits, language) {
    var s = value.toFixed(digits);
    return language === "de" ? s.replace(".", ",") : s;
  }

  /** "1:42 h" from minutes; "--" when unknown. */
  function formatDuration(state) {
    var m = parseInt(state, 10);
    if (isNaN(m) || m < 0) return "--";
    var mm = String(m % 60);
    if (mm.length < 2) mm = "0" + mm;
    return Math.floor(m / 60) + ":" + mm + " h";
  }

  function formatEnergy(state, language) {
    var k = parseFloat(state);
    return isNaN(k) ? "--" : number(k, 1, language) + " kWh";
  }

  /** kW number as text from a power state in W or kW. */
  function formatPower(stateObj, language) {
    if (!stateObj) return "--";
    var v = parseFloat(stateObj.state);
    if (isNaN(v)) return "--";
    var unit = (stateObj.attributes && stateObj.attributes.unit_of_measurement) || "W";
    if (unit === "W") v = v / 1000;
    return number(Math.max(v, 0), 1, language);
  }

  /** What the button can do right now. */
  function buttonAction(status, pending) {
    if (pending) return "wait";
    if (status === "preparing") return "start";
    if (STOPPABLE.indexOf(status) !== -1) return "stop";
    return "off";
  }

  /**
   * Final entity config: entities from the integration entry, overridden by
   * explicit card options. Returns {cfg, problem} – problem is a hint key.
   */
  function resolveConfig(config, entries) {
    var cfg = {};
    var problem = null;
    var i;
    if (config.entry_id) {
      var entry = null;
      for (i = 0; i < (entries || []).length; i++) {
        if (entries[i].entry_id === config.entry_id) entry = entries[i];
      }
      if (entry) {
        for (i = 0; i < ENTITY_KEYS.length; i++) cfg[ENTITY_KEYS[i]] = entry[ENTITY_KEYS[i]] || null;
      } else if (entries) {
        problem = "hint_entry";
      } else {
        problem = "loading"; // entries not fetched yet – no verdict, no actions
      }
    }
    for (i = 0; i < ENTITY_KEYS.length; i++) {
      if (config[ENTITY_KEYS[i]]) cfg[ENTITY_KEYS[i]] = config[ENTITY_KEYS[i]];
    }
    var missing = REQUIRED_KEYS.filter(function (k) { return !cfg[k]; });
    if (!problem && !config.entry_id && missing.length === REQUIRED_KEYS.length) problem = "hint_setup";
    else if (!problem && missing.length) problem = "hint_missing";
    return { cfg: cfg, problem: problem, missing: missing };
  }

  // --------------------------------------------------------------- card --
  // Colours: HA theme variables by default; `display_style: true` switches to
  // the dark look of the garage display. Plain fallbacks for every variable.
  var STYLE =
    ":host{display:block;height:100%;" +
    "--gc-bg:var(--ha-card-background,var(--card-background-color,#fff));" +
    "--gc-tile:var(--secondary-background-color,#f2f3f5);" +
    "--gc-text:var(--primary-text-color,#212121);" +
    "--gc-dim:var(--secondary-text-color,#727272);" +
    "--gc-green:var(--success-color,#43a047);" +
    "--gc-on-green:var(--text-primary-color,#fff);" +
    "--gc-red:var(--error-color,#db4437);" +
    "--gc-on-red:var(--text-primary-color,#fff);" +
    "--gc-off-bg:var(--secondary-background-color,#e8e8e8);" +
    "--gc-off-text:var(--disabled-text-color,#9e9e9e);" +
    "--gc-err-bg:rgba(219,68,55,.12);" +
    "--gc-font:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,system-ui)),sans-serif}" +
    ".card.display{--gc-bg:#0B0E14;--gc-tile:#171C27;--gc-text:#ECEFF4;--gc-dim:#8B93A5;" +
    "--gc-green:#0FDE41;--gc-on-green:#0B0E14;--gc-red:#E5484D;--gc-on-red:#fff;" +
    "--gc-off-bg:#252C3B;--gc-off-text:#5C6578;--gc-err-bg:#3A1D22;--gc-font:Montserrat,system-ui,sans-serif}" +
    ".card{box-sizing:border-box;height:100%;background:var(--gc-bg);color:var(--gc-text);" +
    "border-radius:var(--ha-card-border-radius,12px);padding:16px;overflow:hidden;" +
    "font-family:var(--gc-font);display:flex;flex-direction:column}" +
    ".head{display:flex;justify-content:space-between;align-items:center;font-size:22px;font-weight:600;padding:0 4px;margin-bottom:12px}" +
    ".tile{background:var(--gc-tile);border-radius:18px}" +
    ".main{padding:14px 16px 22px;margin-bottom:12px;flex:1 1 auto}" +
    ".status{display:flex;align-items:center;font-size:19px}" +
    ".status svg{width:44px;height:44px;fill:currentColor;flex:none;margin-right:14px}" +
    ".ico-charging{color:var(--gc-green)}.ico-faulted{color:var(--gc-red)}.ico-idle{color:var(--gc-dim)}.ico-ready{color:var(--gc-text)}" +
    ".power{display:flex;justify-content:center;align-items:flex-end;margin-top:6px}" +
    ".power .num{font-size:76px;font-weight:700;line-height:1;letter-spacing:-1px;margin:0 8px}" +
    ".power .num.on{color:var(--gc-green)}" +
    ".power .unit{font-size:20px;color:var(--gc-dim);padding-bottom:8px}" +
    ".power svg{width:42px;height:42px;fill:var(--gc-green);padding-bottom:12px}" +
    ".vals{display:flex;margin-bottom:12px}" +
    ".val{flex:1 1 0;text-align:center;padding:10px 6px 8px}" +
    ".val+.val{margin-left:12px}" +
    ".val .v{font-size:26px;font-weight:600}" +
    ".val .l{font-size:14px;color:var(--gc-dim);margin-top:2px}" +
    "button{all:unset;box-sizing:border-box;width:100%;min-height:76px;border-radius:18px;" +
    "display:flex;justify-content:center;align-items:center;font-size:22px;font-weight:600;cursor:pointer;font-family:var(--gc-font)}" +
    "button svg{width:26px;height:26px;fill:currentColor;margin-right:12px}" +
    "button:active{opacity:.8}" +
    "button.start{background:var(--gc-green);color:var(--gc-on-green)}" +
    "button.stop{background:var(--gc-red);color:var(--gc-on-red)}" +
    "button.off,button.wait{background:var(--gc-off-bg);color:var(--gc-off-text);cursor:default}" +
    ".msg{display:none;margin-top:10px;padding:10px 12px;border-radius:12px;background:var(--gc-err-bg);color:var(--gc-red);font-size:14px}" +
    ".msg.show{display:block}" +
    ".hidden{display:none!important}";

  var LAYOUT =
    '<ha-card class="card" id="card">' +
    '<div class="head"><span id="title"></span><span id="clock"></span></div>' +
    '<div class="tile main">' +
    '<div class="status"><span id="ico"></span><span id="status"></span></div>' +
    '<div class="power"><span id="bolt">' + svg(ICONS.bolt) + "</span>" +
    '<span class="num" id="power">--</span><span class="unit">kW</span></div>' +
    "</div>" +
    '<div class="vals" id="vals">' +
    '<div class="tile val"><div class="v" id="dur">--</div><div class="l" id="dur_l"></div></div>' +
    '<div class="tile val"><div class="v" id="kwh">--</div><div class="l" id="kwh_l"></div></div>' +
    "</div>" +
    '<button id="btn" class="off" type="button"><span id="btn_i"></span><span id="btn_t"></span></button>' +
    '<div class="msg" id="msg"></div>' +
    "</ha-card>";

  class GarageChargerCard extends HTMLElement {
    setConfig(config) {
      // No exception for missing options: the card shows a hint instead.
      this._config = Object.assign({ title: "Garage", show_clock: true }, config || {});
      this._pending = null; // {status, until}
      this._error = null; // {text, until}
      this._entries = null;
      this._entriesLoading = false;
      if (!this.shadowRoot) this._build();
      this._render();
    }

    static getConfigElement() {
      return document.createElement(EDITOR_TAG);
    }

    /** Explicit config for the card picker: the first configured charger. */
    static async getStubConfig(hass) {
      try {
        var entries = await withTimeout(hass.callWS({ type: WS_ENTRIES }), 3000);
        if (entries && entries.length) {
          return { entry_id: entries[0].entry_id, title: entries[0].title, show_clock: true };
        }
      } catch (err) {
        console.error("garage-charger-card: stub config", err);
      }
      return { title: "Garage", show_clock: true };
    }

    getCardSize() { return 8; }

    getGridOptions() {
      return { columns: 6, rows: 8, min_columns: 6, min_rows: 7 };
    }

    getLayoutOptions() {
      return { grid_columns: 2, grid_rows: 8 };
    }

    connectedCallback() {
      var self = this;
      this._timer = setInterval(function () { self._render(); }, 15000);
    }

    disconnectedCallback() {
      clearInterval(this._timer);
    }

    set hass(hass) {
      this._hass = hass;
      this._loadEntries();
      this._render();
    }

    _build() {
      var root = this.attachShadow({ mode: "open" });
      root.innerHTML = "<style>" + STYLE + "</style>" + LAYOUT;
      var self = this;
      root.getElementById("btn").addEventListener("click", function () { self._press(); });
    }

    _loadEntries() {
      var self = this;
      if (!this._config || !this._config.entry_id || this._entries || this._entriesLoading) return;
      if (!this._hass || !this._hass.callWS) return;
      this._entriesLoading = true;
      this._hass.callWS({ type: WS_ENTRIES }).then(
        function (entries) {
          self._entries = entries || [];
          self._entriesLoading = false;
          self._render();
        },
        function (err) {
          self._entriesLoading = false;
          self._entries = [];
          self._showError(err);
        }
      );
    }

    _resolved() {
      // entries not loaded yet → no verdict about the entry
      var entries = this._config.entry_id ? this._entries : [];
      return resolveConfig(this._config, entries);
    }

    _stateObj(id) {
      return id && this._hass ? this._hass.states[id] : undefined;
    }

    _press() {
      var r = this._resolved();
      if (r.problem || this._pending) return; // refuse, never queue
      var s = this._stateObj(r.cfg.status_entity);
      var status = s ? s.state : "unavailable";
      var action = buttonAction(status, false);
      var entity = action === "start" ? r.cfg.start_button : action === "stop" ? r.cfg.stop_button : null;
      if (!entity) return;
      var self = this;
      this._pending = { status: status, until: Date.now() + PENDING_MS };
      this._error = null;
      this._render();
      Promise.resolve(this._hass.callService("button", "press", { entity_id: entity })).then(
        null,
        function (err) {
          self._pending = null;
          self._showError(err);
        }
      );
    }

    _showError(err) {
      var text = err && err.message ? err.message : String(err);
      console.error("garage-charger-card:", err);
      this._error = { text: text, until: Date.now() + ERROR_MS };
      this._render();
    }

    _render() {
      if (!this.shadowRoot || !this._config) return;
      try {
        this._renderInner();
      } catch (err) {
        console.error("garage-charger-card: render failed", err);
        var msg = this.shadowRoot.getElementById("msg");
        if (msg) {
          msg.textContent = "Render error: " + (err && err.message ? err.message : String(err));
          msg.className = "msg show";
        }
      }
    }

    _renderInner() {
      var root = this.shadowRoot;
      var $ = function (id) { return root.getElementById(id); };
      var hass = this._hass;
      var language = lang(hass);
      var t = STRINGS[language];
      var c = this._config;
      var r = this._resolved();
      var s = this._stateObj(r.cfg.status_entity);
      var status = s ? s.state : "unavailable";

      // pending ends when the status changes (also in the background) or times out
      if (this._pending && (status !== this._pending.status || Date.now() > this._pending.until)) {
        this._pending = null;
      }
      if (this._error && Date.now() > this._error.until) this._error = null;

      $("card").className = c.display_style ? "card display" : "card";
      $("title").textContent = c.title || "";
      $("clock").textContent = c.show_clock === false ? "" :
        new Date().toLocaleTimeString(language === "de" ? "de-DE" : undefined, { hour: "2-digit", minute: "2-digit" });

      var charging = status === "charging";
      var idle = IDLE.indexOf(status) !== -1;
      $("status").textContent = t[status] || t.offline;
      var ico = $("ico");
      ico.innerHTML = svg(status === "faulted" ? ICONS.alert : idle ? ICONS.station : ICONS.car);
      ico.className = charging ? "ico-charging" : status === "faulted" ? "ico-faulted" : idle ? "ico-idle" : "ico-ready";

      $("power").textContent = formatPower(this._stateObj(r.cfg.power_entity), language);
      $("power").className = charging ? "num on" : "num";
      $("bolt").classList.toggle("hidden", !charging);

      var showVals = !!(r.cfg.duration_entity || r.cfg.energy_entity);
      $("vals").classList.toggle("hidden", !showVals);
      var d = this._stateObj(r.cfg.duration_entity);
      var e = this._stateObj(r.cfg.energy_entity);
      $("dur").textContent = formatDuration(d ? d.state : NaN);
      $("kwh").textContent = formatEnergy(e ? e.state : NaN, language);
      $("dur_l").textContent = t.duration;
      $("kwh_l").textContent = t.energy;

      // button: disabled whenever the config is incomplete
      var action = r.problem ? "off" : buttonAction(status, !!this._pending);
      var btn = $("btn");
      btn.className = action;
      btn.disabled = action === "off" || action === "wait";
      $("btn_i").innerHTML = svg(action === "wait" ? ICONS.wait : action === "stop" ? ICONS.stop : ICONS.play);
      $("btn_t").textContent = action === "wait" ? t.wait : action === "stop" ? t.stop : t.start;

      var msg = $("msg");
      var text = "";
      if (r.problem && r.problem !== "loading") {
        text = t[r.problem].replace("{keys}", r.missing.join(", "));
      } else if (this._error) {
        text = t.error + this._error.text;
      }
      msg.textContent = text;
      msg.className = text ? "msg show" : "msg";
    }
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("timeout")); }, ms);
      promise.then(
        function (v) { clearTimeout(timer); resolve(v); },
        function (err) { clearTimeout(timer); reject(err); }
      );
    });
  }

  // ------------------------------------------------------------- editor --
  async function ensureHaForm() {
    if (customElements.get("ha-form")) return;
    if (!window.loadCardHelpers) return;
    var helpers = await window.loadCardHelpers();
    var el = await helpers.createCardElement({ type: "button", entity: "sun.sun" });
    if (el && el.constructor && el.constructor.getConfigElement) {
      await el.constructor.getConfigElement();
    }
    await customElements.whenDefined("ha-form");
  }

  class GarageChargerCardEditor extends HTMLElement {
    setConfig(config) {
      this._config = Object.assign({}, config || {});
      this._render();
    }

    set hass(hass) {
      this._hass = hass;
      this._loadEntries();
      if (this._form) this._form.hass = hass;
    }

    _loadEntries() {
      var self = this;
      if (this._entries || this._loading || !this._hass) return;
      this._loading = true;
      this._hass.callWS({ type: WS_ENTRIES }).then(
        function (entries) {
          self._entries = entries || [];
          // required field: write it into the config as soon as we know it
          if (!self._config.entry_id && self._entries.length) {
            self._emit(Object.assign({}, self._config, {
              entry_id: self._entries[0].entry_id,
              title: self._config.title || self._entries[0].title,
            }));
          }
          self._render();
        },
        function (err) { console.error("garage-charger-card editor:", err); }
      );
    }

    _emit(config) {
      this._config = config;
      this.dispatchEvent(new CustomEvent("config-changed", {
        detail: { config: config }, bubbles: true, composed: true,
      }));
    }

    _schema() {
      var options = (this._entries || []).map(function (e) {
        return { value: e.entry_id, label: e.title };
      });
      return [
        { name: "entry_id", required: true, selector: { select: { options: options, mode: "dropdown" } } },
        { name: "title", selector: { text: {} } },
        { name: "show_clock", selector: { boolean: {} } },
        { name: "display_style", selector: { boolean: {} } },
      ];
    }

    _render() {
      var self = this;
      if (!this._config) return;
      if (!this._form) {
        ensureHaForm().then(function () {
          if (self._form) return;
          var form = document.createElement("ha-form");
          var labels = { entry_id: "ed_entry", title: "ed_title", show_clock: "ed_clock", display_style: "ed_display" };
          form.computeLabel = function (s) { return tr(self._hass, labels[s.name]); };
          form.addEventListener("value-changed", function (ev) {
            self._emit(Object.assign({}, self._config, ev.detail.value));
          });
          self._form = form;
          self.appendChild(form);
          self._render();
        }, function (err) { console.error("garage-charger-card editor:", err); });
        return;
      }
      this._form.hass = this._hass;
      this._form.schema = this._schema();
      this._form.data = Object.assign({ show_clock: true }, this._config);
    }
  }

  // ------------------------------------------------------- registration --
  if (!customElements.get(TAG)) customElements.define(TAG, GarageChargerCard);
  if (!customElements.get(EDITOR_TAG)) customElements.define(EDITOR_TAG, GarageChargerCardEditor);
  window.customCards = window.customCards || [];
  if (!window.customCards.some(function (c) { return c.type === TAG; })) {
    window.customCards.push({
      type: TAG,
      name: "Garage Charger Card",
      description: "Charging status, power, charging time/energy and Start/Stop – like the garage display",
      preview: true,
    });
  }

  // test hook (node --test); not reachable in the browser
  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      buttonAction: buttonAction,
      formatDuration: formatDuration,
      formatEnergy: formatEnergy,
      formatPower: formatPower,
      resolveConfig: resolveConfig,
      lang: lang,
      STRINGS: STRINGS,
      GarageChargerCard: GarageChargerCard,
    };
  }
})();
