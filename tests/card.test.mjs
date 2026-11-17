// Card tests – run with `node --test tests/*.mjs` (no npm dependencies).
// The card is evaluated as a *classic script* in a vm context with a
// minimal DOM stub, like the legacy frontend build does.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SRC = readFileSync(
  new URL("../custom_components/garage_charger/www/garage-charger-card.js", import.meta.url),
  "utf8"
);

// ------------------------------------------------------------ DOM stub --
class El {
  constructor(id) {
    this.id = id;
    this.textContent = "";
    this.innerHTML = "";
    this.className = "";
    this.disabled = false;
    this.style = {};
    this._cls = new Set();
    this.classList = {
      toggle: (c, on) => (on ? this._cls.add(c) : this._cls.delete(c)),
      contains: (c) => this._cls.has(c),
    };
    this.listeners = {};
  }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  click() { this.listeners.click && this.listeners.click(); }
}

class Root {
  constructor() { this.els = {}; this.innerHTML = ""; }
  getElementById(id) { return (this.els[id] = this.els[id] || new El(id)); }
}

function makeContext() {
  const registry = new Map();
  const ctx = {
    console,
    setTimeout,
    clearTimeout,
    setInterval: () => 0,
    clearInterval: () => {},
    Promise,
    Date,
    CustomEvent: class { constructor(t, i) { this.type = t; Object.assign(this, i); } },
    HTMLElement: class {
      attachShadow() { this.shadowRoot = new Root(); return this.shadowRoot; }
      dispatchEvent() {}
      appendChild() {}
    },
    customElements: {
      get: (t) => registry.get(t),
      define: (t, c) => {
        if (registry.has(t)) throw new Error(`already defined: ${t}`);
        registry.set(t, c);
      },
      whenDefined: () => Promise.resolve(),
    },
    document: { createElement: () => ({}) },
  };
  ctx.window = ctx;
  return vm.createContext(ctx);
}

function loadInto(ctx) {
  vm.runInContext(SRC, ctx, { filename: "garage-charger-card.js" });
}

// module.exports hook for the pure helpers
function helpers() {
  const ctx = makeContext();
  ctx.module = { exports: {} };
  loadInto(ctx);
  return { ctx, h: ctx.module.exports };
}

function hassWith(states, extra = {}) {
  const calls = [];
  return {
    calls,
    locale: { language: "de" },
    states,
    callService: (domain, service, data) => { calls.push([domain, service, data]); return Promise.resolve(); },
    callWS: () => Promise.resolve([]),
    ...extra,
  };
}

const ENTITIES = {
  status_entity: "sensor.st",
  power_entity: "sensor.p",
  start_button: "button.start",
  stop_button: "button.stop",
  duration_entity: "sensor.d",
  energy_entity: "sensor.e",
};

function states(status, power = "0") {
  return {
    "sensor.st": { state: status, attributes: {} },
    "sensor.p": { state: power, attributes: { unit_of_measurement: "W" } },
    "sensor.d": { state: "102", attributes: {} },
    "sensor.e": { state: "12.34", attributes: {} },
  };
}

function card(h, config) {
  const c = new h.GarageChargerCard();
  c.setConfig(config);
  return c;
}

// ------------------------------------------------------------------ tests --
test("evaluates twice as classic script in one shared context", () => {
  const ctx = makeContext();
  loadInto(ctx);
  loadInto(ctx); // second evaluation: no redefinition error, no duplicate picker entry
  assert.equal(ctx.window.customCards.filter((c) => c.type === "garage-charger-card").length, 1);
  assert.ok(ctx.customElements.get("garage-charger-card"));
});

test("button follows the charger status", () => {
  const { h } = helpers();
  assert.equal(h.buttonAction("preparing", false), "start");
  for (const s of ["charging", "suspended_evse", "suspended_ev"]) assert.equal(h.buttonAction(s, false), "stop");
  for (const s of ["available", "finishing", "faulted", "unavailable", "unknown"]) assert.equal(h.buttonAction(s, false), "off");
  assert.equal(h.buttonAction("preparing", true), "wait");
});

test("formatting", () => {
  const { h } = helpers();
  assert.equal(h.formatDuration("102"), "1:42 h");
  assert.equal(h.formatDuration("unknown"), "--");
  assert.equal(h.formatEnergy("12.34", "de"), "12,3 kWh");
  assert.equal(h.formatEnergy("12.34", "en"), "12.3 kWh");
  assert.equal(h.formatPower({ state: "7360", attributes: { unit_of_measurement: "W" } }, "de"), "7,4");
  assert.equal(h.formatPower({ state: "7.36", attributes: { unit_of_measurement: "kW" } }, "en"), "7.4");
  assert.equal(h.formatPower({ state: "-5", attributes: {} }, "en"), "0.0");
});

test("no config: hint shown, button disabled, nothing pressed", () => {
  const { h } = helpers();
  const c = card(h, { title: "Garage" });
  const hass = hassWith(states("preparing"));
  c.hass = hass;
  const root = c.shadowRoot;
  assert.equal(root.getElementById("btn").disabled, true);
  assert.match(root.getElementById("msg").textContent, /Garage Charger/);
  root.getElementById("btn").click();
  assert.equal(hass.calls.length, 0);
});

test("unknown entry: hint, no action", async () => {
  const { h } = helpers();
  const c = card(h, { entry_id: "gone" });
  const hass = hassWith(states("preparing"), { callWS: () => Promise.resolve([]) });
  c.hass = hass;
  await new Promise((r) => setTimeout(r, 0));
  assert.match(c.shadowRoot.getElementById("msg").textContent, /nicht \(mehr\) eingerichtet/);
  c.shadowRoot.getElementById("btn").click();
  assert.equal(hass.calls.length, 0);
});

test("start sends exactly the configured button and then waits", () => {
  const { h } = helpers();
  const c = card(h, ENTITIES);
  const hass = hassWith(states("preparing"));
  c.hass = hass;
  c.shadowRoot.getElementById("btn").click();
  assert.deepEqual(hass.calls, [["button", "press", { entity_id: "button.start" }]]);
  assert.equal(c.shadowRoot.getElementById("btn").className, "wait");
  c.shadowRoot.getElementById("btn").click(); // refuse, never queue
  assert.equal(hass.calls.length, 1);
});

test("background status change ends waiting and shows stop", () => {
  const { h } = helpers();
  const c = card(h, ENTITIES);
  c.hass = hassWith(states("preparing"));
  c.shadowRoot.getElementById("btn").click();
  c.hass = hassWith(states("suspended_evse"));
  assert.equal(c.shadowRoot.getElementById("btn").className, "stop");
  assert.equal(c.shadowRoot.getElementById("status").textContent, "Pausiert – zu wenig PV");
});

test("entities come from the integration entry", async () => {
  const { h } = helpers();
  const c = card(h, { entry_id: "abc" });
  const entry = Object.assign({ entry_id: "abc", title: "Garage" }, ENTITIES);
  const hass = hassWith(states("charging", "7360"), { callWS: () => Promise.resolve([entry]) });
  c.hass = hass;
  await new Promise((r) => setTimeout(r, 0));
  const root = c.shadowRoot;
  assert.equal(root.getElementById("power").textContent, "7,4");
  assert.equal(root.getElementById("dur").textContent, "1:42 h");
  root.getElementById("btn").click();
  assert.deepEqual(hass.calls, [["button", "press", { entity_id: "button.stop" }]]);
});

test("entry missing new entities (pre-release) shows which ones", async () => {
  const { h } = helpers();
  const c = card(h, { entry_id: "abc" });
  const entry = { entry_id: "abc", title: "Garage", status_entity: "sensor.st", stop_button: "button.stop" };
  c.hass = hassWith(states("charging"), { callWS: () => Promise.resolve([entry]) });
  await new Promise((r) => setTimeout(r, 0));
  assert.match(c.shadowRoot.getElementById("msg").textContent, /power_entity, start_button/);
  assert.equal(c.shadowRoot.getElementById("btn").disabled, true);
});

test("english UI for non-German users", () => {
  const { h } = helpers();
  const c = card(h, ENTITIES);
  c.hass = hassWith(states("preparing"), { locale: { language: "en" } });
  assert.equal(c.shadowRoot.getElementById("btn_t").textContent, "Start charging");
});

test("failed service call clears waiting and shows the error", async () => {
  const { h } = helpers();
  const c = card(h, ENTITIES);
  c.hass = hassWith(states("preparing"), {
    callService: () => Promise.reject(new Error("Cloud nicht erreichbar")),
  });
  c.shadowRoot.getElementById("btn").click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(c.shadowRoot.getElementById("btn").className, "start");
  assert.match(c.shadowRoot.getElementById("msg").textContent, /Cloud nicht erreichbar/);
});

test("stub config is explicit (first entry) and never hangs", async () => {
  const { h } = helpers();
  const stub = await h.GarageChargerCard.getStubConfig({
    callWS: () => Promise.resolve([{ entry_id: "abc", title: "Garage" }]),
  });
  assert.equal(stub.entry_id, "abc");
  const none = await h.GarageChargerCard.getStubConfig({ callWS: () => Promise.reject(new Error("x")) });
  assert.equal(none.entry_id, undefined);
});

test("theme colours by default, dark display look on request", () => {
  const { h } = helpers();
  const themed = card(h, ENTITIES);
  themed.hass = hassWith(states("charging", "7360"));
  assert.equal(themed.shadowRoot.getElementById("card").className, "card");
  assert.equal(themed.shadowRoot.getElementById("power").className, "num on");
  assert.equal(themed.shadowRoot.getElementById("ico").className, "ico-charging");
  const display = card(h, Object.assign({ display_style: true }, ENTITIES));
  display.hass = hassWith(states("available"));
  assert.equal(display.shadowRoot.getElementById("card").className, "card display");
  assert.equal(display.shadowRoot.getElementById("ico").className, "ico-idle");
});
