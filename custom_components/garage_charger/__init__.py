"""Garage Charger – charging session sensors + dashboard card for wallboxes."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from . import websocket
from .const import CONF_ENERGY_ENTITY, CONF_STATUS_ENTITY, CONF_STOP_BUTTON, DOMAIN
from .frontend import async_register_card
from .session import ChargingSession

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type GarageChargerConfigEntry = ConfigEntry[ChargingSession]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Register the dashboard card and websocket API once, before any entry.

    Entry setup can be slow; dashboards served meanwhile must already find
    the card.
    """
    websocket.async_register(hass)
    await async_register_card(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: GarageChargerConfigEntry) -> bool:
    """Set up one wallbox."""
    cfg = {**entry.data, **entry.options}
    session = ChargingSession(
        hass,
        entry.entry_id,
        cfg[CONF_STATUS_ENTITY],
        cfg[CONF_STOP_BUTTON],
        cfg[CONF_ENERGY_ENTITY],
    )
    await session.async_start()
    entry.runtime_data = session
    entry.async_on_unload(session.async_stop)
    entry.async_on_unload(entry.add_update_listener(_async_reload))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def _async_reload(hass: HomeAssistant, entry: GarageChargerConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: GarageChargerConfigEntry) -> bool:
    """Unload a config entry."""
    return await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
