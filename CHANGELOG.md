# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed
- Repository: CI jobs renamed (*HACS validation*, *Hassfest*, *Lint and tests*, *Card tests*), ruff lint, syntax check of the card file, current GitHub Actions versions, Dependabot, issue templates, README badges.

## [1.1.0] - 2026-11-17

### Added
- ESPHome display: **board temperature** sensor
  (`sensor.garage_display_board_temperature`, diagnostic, every 60 s,
  moving average). It helps you watch summer and winter extremes in the
  garage and trigger a warning automation.

## [1.0.0] - 2026-11-17

First release.

### Added
- **Integration "Garage Charger"**, set up in the UI. You pick the status
  sensor, the start and stop buttons, the charging power sensor and the
  energy meter.
- **Session sensors** `Ladedauer` (charging time) and `Geladen` (energy
  charged):
  - Background pauses (for example not enough PV) keep the session; the
    time only counts while actually charging.
  - Pressing **Stop** from anywhere resets both values.
  - Unplugging without Stop keeps the values until the next session starts.
  - The values survive Home Assistant restarts.
- **Dashboard card** `custom:garage-charger-card`:
  - **Loading:** the integration registers it as a Lovelace resource
    (storage mode), or uses extra script URLs for both frontend builds
    (YAML mode). There is no file to copy and no resource to add.
  - **Content:** status, power, clock, charging time, energy and one
    Start/Stop button.
  - **Look:** theme colours, or the dark garage-display look with
    `display_style: true`.
  - **Editor:** a visual editor, German/English text, and grid/sections
    sizes.
  - **Old devices:** it works on old WebViews (own scope, ES2019 syntax, no
    flex `gap`).
  - **Errors:** a missing configuration or a failed call is shown in the
    card, and the button is then disabled.
- **ESPHome firmware** for the Guition ESP32-4848S040C touch display, with
  the same Start/Stop logic.
- **Tests and CI:** session logic, card registration, websocket, card source
  rules, `node --test` card tests, HACS and hassfest checks.

[Unreleased]: https://github.com/yannick80/ha-garage-charger/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/yannick80/ha-garage-charger/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/yannick80/ha-garage-charger/releases/tag/v1.0.0
