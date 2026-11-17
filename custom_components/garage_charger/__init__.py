"""Garage Charger – charging session sensors + dashboard card for wallboxes."""

from __future__ import annotations

from pathlib import Path

from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    CARD_FILENAME,
    CARD_URL,
    CONF_ENERGY_ENTITY,
    CONF_STATUS_ENTITY,
    CONF_STOP_BUTTON,
    DOMAIN,
    VERSION,
)
from .session import ChargingSession

PLATFORMS = [Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type GarageChargerConfigEntry = ConfigEntry[ChargingSession]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Serve the dashboard card and load it on every dashboard."""
    card = Path(__file__).parent / "frontend" / CARD_FILENAME
    await hass.http.async_register_static_paths(
        [StaticPathConfig(CARD_URL, str(card), cache_headers=False)]
    )
    # Load the card on every dashboard. The version in the URL makes browsers
    # pick up a new card after an update.
    if "frontend" in hass.config.components:
        from homeassistant.components.frontend import add_extra_js_url

        add_extra_js_url(hass, f"{CARD_URL}?v={VERSION}")
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
