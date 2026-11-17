# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- The dashboard card is registered as a **Lovelace resource** (storage
  mode), so wall displays and the companion app load it before building
  cards. They no longer show "Custom element doesn't exist" on the first
  load.
- For YAML-managed dashboards, the card is loaded through extra script URLs
  for the modern **and** the legacy (es5) frontend build.
- **Visual card editor:** pick the charger from a list, set the title and the
  clock.
- The card takes all entities from the integration (`entry_id`), using a
  new websocket command `garage_charger/entries`.
- The setup now also asks for the **start button** and the **charging
  power** sensor, so the card is fully defined by the integration.
- The card follows the HA language (German/English).
- The card supports the sections and grid layouts (`getGridOptions`,
  `getLayoutOptions`).
- Card tests (`node --test`) and tests for the card registration.

### Changed
- The card file moved to `custom_components/garage_charger/www/`.
- The card is served with cache headers; its URL carries a content hash, so
  browsers pick up updates on their own.
- The card is legacy-safe for old WebViews (Shelly Wall Display, old
  tablets): it runs in its own scope, uses only ES2019 syntax and avoids
  flex/grid `gap`.

### Fixed
- A missing card option no longer replaces the card with an HA error card.
  The card now shows a hint and disables the button.
- A failed Start/Stop call no longer leaves the button on "Bitte warten…".
  The error is shown in the card.
- Card registration problems no longer affect the integration setup.

### Upgrade notes
- For entries created with 1.0.0, open **Configure** and add the start
  button and the charging power sensor.
- Remove a hand-made `/local/garage-charger-card.js` resource if you have
  one.

## [1.0.0] - 2026-11-17

### Added
- Integration with the sensors `Ladedauer` (charging time) and `Geladen`
  (energy charged) per session. The session continues through background
  pauses, Stop resets it, and the values survive restarts.
- Dashboard card in the style of the garage display.
- ESPHome firmware for the Guition ESP32-4848S040C touch display.
