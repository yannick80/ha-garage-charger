"""Websocket API for the dashboard card and its editor."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.config_entries import ConfigEntryState
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er

from .const import (
    CONF_POWER_ENTITY,
    CONF_START_BUTTON,
    CONF_STATUS_ENTITY,
    CONF_STOP_BUTTON,
    DOMAIN,
    WS_TYPE_ENTRIES,
)


@callback
def async_register(hass: HomeAssistant) -> None:
    """Register the websocket commands."""
    websocket_api.async_register_command(hass, ws_entries)


@callback
def entries_payload(hass: HomeAssistant) -> list[dict[str, Any]]:
    """All configured chargers with the entities a card needs."""
    registry = er.async_get(hass)
    out: list[dict[str, Any]] = []
    for entry in hass.config_entries.async_entries(DOMAIN):
        cfg = {**entry.data, **entry.options}
        out.append(
            {
                "entry_id": entry.entry_id,
                "title": entry.title,
                "loaded": entry.state is ConfigEntryState.LOADED,
                "status_entity": cfg.get(CONF_STATUS_ENTITY),
                "power_entity": cfg.get(CONF_POWER_ENTITY),
                "start_button": cfg.get(CONF_START_BUTTON),
                "stop_button": cfg.get(CONF_STOP_BUTTON),
                # resolved through the registry: ids drift after renames
                "duration_entity": registry.async_get_entity_id(
                    "sensor", DOMAIN, f"{entry.entry_id}_duration"
                ),
                "energy_entity": registry.async_get_entity_id(
                    "sensor", DOMAIN, f"{entry.entry_id}_energy"
                ),
            }
        )
    return out


@websocket_api.websocket_command({vol.Required("type"): WS_TYPE_ENTRIES})
@callback
def ws_entries(
    hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict
) -> None:
    """Return the configured chargers."""
    connection.send_result(msg["id"], entries_payload(hass))
