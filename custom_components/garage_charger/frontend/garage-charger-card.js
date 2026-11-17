/*
 * Garage Charger Card – Lovelace-Karte im Stil des Garagen-Displays
 *
 * Wird von der Integration "Garage Charger" automatisch geladen
 * (keine Ressource nötig). Karte hinzufügen → "Garage Charger Card", oder:
 *
 *   type: custom:garage-charger-card
 *   title: Garage
 *   status_entity: sensor.<serial>_ev_charger_status
 *   power_entity: sensor.<shelly>_total_active_power
 *   start_button: button.<serial>_start_charging
 *   stop_button: button.<serial>_stop_charging
 *   duration_entity: sensor.garage_ladedauer
 *   energy_entity: sensor.garage_geladen
 *   show_clock: true          # optional
 */

const ICONS = {
  car: "M18.92 2C18.72 1.42 18.16 1 17.5 1H6.5C5.84 1 5.29 1.42 5.08 2L3 8V16C3 16.55 3.45 17 4 17H5C5.55 17 6 16.55 6 16V15H18V16C18 16.55 18.45 17 19 17H20C20.55 17 21 16.55 21 16V8L18.92 2M6.5 12C5.67 12 5 11.33 5 10.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12M17.5 12C16.67 12 16 11.33 16 10.5S16.67 9 17.5 9 19 9.67 19 10.5 18.33 12 17.5 12M5 7L6.5 2.5H17.5L19 7H5M7 20H11V18L17 21H13V23L7 20Z",
  station: "M19.77,7.23L19.78,7.22L16.06,3.5L15,4.56L17.11,6.67C16.17,7.03 15.5,7.93 15.5,9A2.5,2.5 0 0,0 18,11.5C18.36,11.5 18.69,11.42 19,11.29V18.5A1,1 0 0,1 18,19.5A1,1 0 0,1 17,18.5V14A2,2 0 0,0 15,12H14V5A2,2 0 0,0 12,3H6A2,2 0 0,0 4,5V21H14V13.5H15.5V18.5A2.5,2.5 0 0,0 18,21A2.5,2.5 0 0,0 20.5,18.5V9C20.5,8.31 20.22,7.68 19.77,7.23M18,10A1,1 0 0,1 17,9A1,1 0 0,1 18,8A1,1 0 0,1 19,9A1,1 0 0,1 18,10M8,18V13.5H6L10,6V11H12L8,18Z",
  bolt: "M11 15H6L13 1V9H18L11 23V15Z",
  alert: "M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",
  play: "M8,5.14V19.14L19,12.14L8,5.14Z",
  stop: "M18,18H6V6H18V18Z",
  wait: "M6,2H18V8H18V8L14,12L18,16V16H18V22H6V16H6V16L10,12L6,8V8H6V2M16,16.5L12,12.5L8,16.5V20H16V16.5M12,11.5L16,7.5V4H8V7.5L12,11.5M10,6H14V6.75L12,8.75L10,6.75V6Z",
};

const STATUS_TEXT = {
  available: "Kein Fahrzeug verbunden",
  preparing: "Angesteckt – bereit",
  charging: "Lädt",
  suspended_evse: "Pausiert – zu wenig PV",
  suspended_ev: "Vom Fahrzeug pausiert",
  finishing: "Ladevorgang beendet",
  faulted: "Fehler am Lader",
};
const STOPPABLE = ["charging", "suspended_evse", "suspended_ev"];
const PENDING_MS = 120000; // Cloud meldet den neuen Status erst nach ~1 min

const svg = (d) => `<svg viewBox="0 0 24 24"><path d="${d}"/></svg>`;

class GarageChargerCard extends HTMLElement {
  setConfig(config) {
    for (const k of ["status_entity", "power_entity", "start_button", "stop_button"]) {
      if (!config[k]) throw new Error(`garage-charger-card: '${k}' fehlt`);
    }
    this._config = { title: "Garage", show_clock: true, ...config };
    this._pending = null; // { status, until }
    if (!this.shadowRoot) this._build();
  }

  getCardSize() { return 7; }

  // Vorbelegung im Karten-Dialog: passende Entitäten automatisch suchen
  static getStubConfig(hass) {
    const ids = Object.keys((hass && hass.states) || {});
    const find = (re, fallback) => ids.find((id) => re.test(id)) || fallback;
    return {
      title: "Garage",
      status_entity: find(/^sensor\..*_ev_charger_status$/, "sensor.al_serial_ev_charger_status"),
      power_entity: find(/^sensor\..*_total_active_power$/, "sensor.wallbox_meter_total_active_power"),
      start_button: find(/^button\..*_start_charging$/, "button.al_serial_start_charging"),
      stop_button: find(/^button\..*_stop_charging$/, "button.al_serial_stop_charging"),
      duration_entity: find(/^sensor\..*_ladedauer$/, "sensor.garage_ladedauer"),
      energy_entity: find(/^sensor\..*_geladen$/, "sensor.garage_geladen"),
    };
  }

  connectedCallback() {
    this._timer = setInterval(() => this._render(), 15000);
  }
  disconnectedCallback() { clearInterval(this._timer); }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _build() {
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        :host { display: block; }
        .card { background: #0B0E14; color: #ECEFF4; border-radius: var(--ha-card-border-radius, 12px);
                padding: 16px; font-family: Montserrat, var(--paper-font-body1_-_font-family, system-ui), sans-serif;
                display: grid; gap: 12px; }
        .head { display: flex; justify-content: space-between; align-items: center;
                font-size: 22px; font-weight: 600; padding: 0 4px; }
        .tile { background: #171C27; border-radius: 18px; }
        .main { padding: 14px 16px 22px; }
        .status { display: flex; align-items: center; gap: 14px; font-size: 19px; }
        .status svg { width: 44px; height: 44px; fill: currentColor; flex: none; }
        .power { display: flex; justify-content: center; align-items: flex-end; gap: 8px; margin-top: 6px; }
        .power .num { font-size: 76px; font-weight: 700; line-height: 1; letter-spacing: -1px; }
        .power .unit { font-size: 20px; color: #8B93A5; padding-bottom: 8px; }
        .power svg { width: 42px; height: 42px; fill: #0FDE41; padding-bottom: 12px; }
        .vals { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .val { text-align: center; padding: 10px 6px 8px; }
        .val .v { font-size: 26px; font-weight: 600; }
        .val .l { font-size: 14px; color: #8B93A5; margin-top: 2px; }
        button { all: unset; box-sizing: border-box; width: 100%; min-height: 76px; border-radius: 18px;
                 display: flex; justify-content: center; align-items: center; gap: 12px;
                 font-size: 22px; font-weight: 600; cursor: pointer; transition: filter .15s; }
        button svg { width: 26px; height: 26px; fill: currentColor; }
        button:active { filter: brightness(.8); }
        button.start { background: #0FDE41; color: #0B0E14; }
        button.stop { background: #E5484D; color: #fff; }
        button.off { background: #252C3B; color: #5C6578; cursor: default; }
        .hidden { display: none !important; }
      </style>
      <ha-card class="card">
        <div class="head"><span id="title"></span><span id="clock"></span></div>
        <div class="tile main">
          <div class="status"><span id="ico"></span><span id="status"></span></div>
          <div class="power"><span id="bolt">${svg(ICONS.bolt)}</span>
            <span class="num" id="power">--</span><span class="unit">kW</span></div>
        </div>
        <div class="vals" id="vals">
          <div class="tile val"><div class="v" id="dur">--</div><div class="l">Ladedauer</div></div>
          <div class="tile val"><div class="v" id="kwh">--</div><div class="l">Geladen</div></div>
        </div>
        <button id="btn" class="off"></button>
      </ha-card>`;
    root.getElementById("btn").addEventListener("click", () => this._press());
  }

  _state(id) { return id && this._hass ? this._hass.states[id] : undefined; }

  _status() {
    const s = this._state(this._config.status_entity);
    return s ? s.state : "unavailable";
  }

  _press() {
    const st = this._status();
    let entity;
    if (this._pending) return;
    if (st === "preparing") entity = this._config.start_button;
    else if (STOPPABLE.includes(st)) entity = this._config.stop_button;
    else return;
    this._hass.callService("button", "press", { entity_id: entity });
    this._pending = { status: st, until: Date.now() + PENDING_MS };
    this._render();
  }

  _render() {
    if (!this._hass || !this.shadowRoot) return;
    const $ = (id) => this.shadowRoot.getElementById(id);
    const c = this._config;
    const st = this._status();

    // Pending endet, sobald sich der Status ändert (auch im Hintergrund) oder nach Timeout
    if (this._pending && (st !== this._pending.status || Date.now() > this._pending.until)) {
      this._pending = null;
    }

    $("title").textContent = c.title;
    $("clock").textContent = c.show_clock
      ? new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : "";

    // Status + Icon
    const charging = st === "charging";
    const idle = ["available", "unknown", "unavailable"].includes(st);
    $("status").textContent = STATUS_TEXT[st] || "Lader offline";
    const ico = $("ico");
    ico.innerHTML = svg(st === "faulted" ? ICONS.alert : idle ? ICONS.station : ICONS.car);
    ico.style.color = charging ? "#0FDE41" : st === "faulted" ? "#E5484D" : idle ? "#8B93A5" : "#ECEFF4";

    // Leistung (W oder kW)
    const p = this._state(c.power_entity);
    let kw = p ? parseFloat(p.state) : NaN;
    if (!isNaN(kw) && (p.attributes.unit_of_measurement || "W") === "W") kw /= 1000;
    $("power").textContent = isNaN(kw) ? "--" : Math.max(kw, 0).toFixed(1).replace(".", ",");
    $("power").style.color = charging ? "#0FDE41" : "#ECEFF4";
    $("bolt").classList.toggle("hidden", !charging);

    // Ladedauer / Geladen
    const showVals = c.duration_entity || c.energy_entity;
    $("vals").classList.toggle("hidden", !showVals);
    const d = this._state(c.duration_entity);
    const m = d ? parseInt(d.state, 10) : NaN;
    $("dur").textContent = isNaN(m) ? "--" : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
    const e = this._state(c.energy_entity);
    const k = e ? parseFloat(e.state) : NaN;
    $("kwh").textContent = isNaN(k) ? "--" : `${k.toFixed(1).replace(".", ",")} kWh`;

    // Button
    const btn = $("btn");
    if (this._pending) {
      btn.className = "off"; btn.innerHTML = `${svg(ICONS.wait)}Bitte warten…`;
    } else if (st === "preparing") {
      btn.className = "start"; btn.innerHTML = `${svg(ICONS.play)}Laden starten`;
    } else if (STOPPABLE.includes(st)) {
      btn.className = "stop"; btn.innerHTML = `${svg(ICONS.stop)}Laden stoppen`;
    } else {
      btn.className = "off"; btn.innerHTML = `${svg(ICONS.play)}Laden starten`;
    }
  }
}

if (!customElements.get("garage-charger-card")) {
  customElements.define("garage-charger-card", GarageChargerCard);
}
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "garage-charger-card")) window.customCards.push({
  type: "garage-charger-card",
  name: "Garage Charger Card",
  description: "Ladestatus, Leistung, Ladedauer/Energie und Start/Stop wie am Garagen-Display",
  preview: true,
});
