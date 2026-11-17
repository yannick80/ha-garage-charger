"""Config flow for Garage Charger."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.const import CONF_NAME
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_ENERGY_ENTITY,
    CONF_POWER_ENTITY,
    CONF_START_BUTTON,
    CONF_STATUS_ENTITY,
    CONF_STOP_BUTTON,
    DEFAULT_NAME,
    DOMAIN,
)


def _entity_schema(defaults: dict[str, Any]) -> dict:
    return {
        vol.Required(
            CONF_STATUS_ENTITY, default=defaults.get(CONF_STATUS_ENTITY, vol.UNDEFINED)
        ): selector.EntitySelector(selector.EntitySelectorConfig(domain="sensor")),
        vol.Required(
            CONF_START_BUTTON, default=defaults.get(CONF_START_BUTTON, vol.UNDEFINED)
        ): selector.EntitySelector(selector.EntitySelectorConfig(domain="button")),
        vol.Required(
            CONF_STOP_BUTTON, default=defaults.get(CONF_STOP_BUTTON, vol.UNDEFINED)
        ): selector.EntitySelector(selector.EntitySelectorConfig(domain="button")),
        vol.Required(
            CONF_POWER_ENTITY, default=defaults.get(CONF_POWER_ENTITY, vol.UNDEFINED)
        ): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor", device_class="power")
        ),
        vol.Required(
            CONF_ENERGY_ENTITY, default=defaults.get(CONF_ENERGY_ENTITY, vol.UNDEFINED)
        ): selector.EntitySelector(
            selector.EntitySelectorConfig(domain="sensor", device_class="energy")
        ),
    }


class GarageChargerConfigFlow(ConfigFlow, domain=DOMAIN):
    """Create a Garage Charger entry."""

    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            await self.async_set_unique_id(user_input[CONF_STATUS_ENTITY])
            self._abort_if_unique_id_configured()
            name = user_input.pop(CONF_NAME)
            return self.async_create_entry(title=name, data=user_input)

        schema = vol.Schema(
            {vol.Required(CONF_NAME, default=DEFAULT_NAME): str, **_entity_schema({})}
        )
        return self.async_show_form(step_id="user", data_schema=schema)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return GarageChargerOptionsFlow()


class GarageChargerOptionsFlow(OptionsFlow):
    """Change the source entities later."""

    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(data=user_input)
        current = {**self.config_entry.data, **self.config_entry.options}
        return self.async_show_form(
            step_id="init", data_schema=vol.Schema(_entity_schema(current))
        )
