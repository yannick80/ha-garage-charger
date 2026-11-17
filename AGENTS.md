# AGENTS.md – Garage Charger

Rules for agents working on this repository. They come from bugs in other
Home Assistant integrations with dashboard cards, and every rule here
prevents one of those bugs.

## Working agreement

- **Commit locally, never push.** Pushes, remote tags and GitHub releases
  only happen on explicit request.
- Commit with the attribution trailers the session provides.
- **Release = two commits:**
  1. the feature or fix;
  2. `vX.Y.Z -- <summary>`, which bumps the version in **all** places in
     lockstep (`custom_components/garage_charger/manifest.json`, `VERSION` in
     `const.py`) and moves the CHANGELOG `[Unreleased]` entries under the
     version.

  Then create an annotated tag `vX.Y.Z` locally.
- Semver: a feature is a minor bump, a fix is a patch bump. Ask before using
  a version that skips or breaks semver.
- **Testing:** every bug gets a regression test that fails on the old code.
  Check this by stashing the fix and running the test.
- Never claim "tested in Home Assistant" when only unit tests or a mocked
  browser ran. Say what was verified and what was not.

## Project structure

```
custom_components/garage_charger/
  __init__.py      async_setup: websocket + card registration; entry setup: session + sensors
  session.py       charging-session state machine (pause/resume, Stop reset, persistence)
  sensor.py        Ladedauer (min) and Geladen (kWh)
  config_flow.py   setup + options: status, start, stop, power, energy entities
  frontend.py      serve card, Lovelace resource (storage) / extra JS (YAML), idempotent, non-fatal
  websocket.py     garage_charger/entries → entities per entry for card + editor
  www/garage-charger-card.js   card + editor (legacy-safe, see below)
  brand/           integration icons
esphome/garage-display.yaml    firmware for the Guition ESP32-4848S040C
tests/
  test_session.py  session logic, restart, config/options flow
  test_frontend.py static path + cache headers, resource create/update/de-dupe,
                   legacy resource warning, YAML fallback (both builds),
                   idempotency, failure isolation, async_setup vs entry setup,
                   websocket payload, card source rules (ES2019, own scope,
                   no gap, color-mix fallback, guarded registration,
                   colours only from theme variables)
  card.test.mjs    node --test: double evaluation in one context, button
                   logic, formatting, hints without config, exact service
                   call, refuse-don't-queue, background status change,
                   entities from entry, i18n, failed call, stub config,
                   theme vs. display_style
```

Tests:

```bash
pytest
node --test tests/*.mjs
```

## Dashboard card

Users never copy files or add resources by hand.

- **Location:** the card lives in `custom_components/garage_charger/www/`,
  because HACS installs only the integration folder.
- **When to register:** register in `async_setup`, never in
  `async_setup_entry`.
- **Serving:** serve with `cache_headers=True` and a content-hash `?v=`.
- **Storage mode:** add the card as a Lovelace resource.
  - Match existing entries **by path**: update the first one, delete
    duplicates, and never touch foreign entries.
  - If an old `/local/` resource exists, log a warning and do not delete it.
- **YAML mode:** call `add_extra_js_url` for the normal **and** the es5
  build.
- **Robustness:** registration is idempotent (`hass.data` flag), wrapped in
  `try/except`, and never fails the setup. A missing card file is logged as
  a warning.

### Card JavaScript (old WebViews)

- **Own scope:** the whole file is wrapped in `(function () { … })();`.
- **Syntax:** ES2019 at most, so no `?.`, `??`, logical assignment, `.at()`,
  `replaceAll` or `#private` fields.
- **CSS:** no flex/grid `gap` (use margins). Every `color-mix()` needs a
  plain fallback line before it.
- **Colours:** use HA theme variables (`--primary-text-color`,
  `--ha-card-background`, `--success-color`, …) through the card's `--gc-*`
  variables, each with a literal fallback. Hard-coded colours are allowed
  only in those fallbacks and in the opt-in `display_style` palette; a
  test enforces this.
- **Registration:** guard both `customElements.define` and
  `window.customCards`.
- **Errors:** catch render errors and show them in the card. Put
  server/user strings only into `textContent`.
- **No silent defaults:** a missing option shows a hint and disables the
  button.
- **Stub config:** `getStubConfig` returns an explicit `entry_id`, is fast,
  and catches errors.
- **Entities:** they come from the integration (websocket), not from
  guessing entity IDs.
- **Same logic everywhere:** the button logic (`preparing` → start;
  `charging`/`suspended_evse`/`suspended_ev` → stop) must be identical in
  the card (`buttonAction`) and in `esphome/garage-display.yaml`
  (`refresh_button`).

## Docs to update with every card change

- **README:** the install steps, the options with a YAML example, and
  upgrade notes.
- **CHANGELOG:** entries under `[Unreleased]`, each describing what the
  user sees.
- **This file:** the project structure and the test list.
