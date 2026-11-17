"""Sensors: Ladedauer (charging time) and Geladen (energy charged)."""

from __future__ import annotations

from datetime import timedelta

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfEnergy, UnitOfTime
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval

from .const import DOMAIN, SIGNAL_UPDATE, VERSION
from .session import ChargingSession

TICK = timedelta(seconds=30)


async def async_setup_entry(
    hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback
) -> None:
    """Set up the two session sensors."""
    session: ChargingSession = entry.runtime_data
    async_add_entities(
        [DurationSensor(entry, session), EnergySensor(entry, session)]
    )


class _Base(SensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, entry: ConfigEntry, session: ChargingSession) -> None:
        self._session = session
        self._entry_id = entry.entry_id
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry.entry_id)},
            name=entry.title,
            manufacturer="Garage Charger",
            model="Charging session",
            sw_version=VERSION,
        )

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass, SIGNAL_UPDATE.format(self._entry_id), self._refresh
            )
        )

    @callback
    def _refresh(self) -> None:
        self.async_write_ha_state()


class DurationSensor(_Base):
    """Minutes actually charged in the current session."""

    _attr_name = "Ladedauer"
    _attr_icon = "mdi:timer-outline"
    _attr_device_class = SensorDeviceClass.DURATION
    _attr_native_unit_of_measurement = UnitOfTime.MINUTES
    _attr_suggested_display_precision = 0

    def __init__(self, entry: ConfigEntry, session: ChargingSession) -> None:
        super().__init__(entry, session)
        self._attr_unique_id = f"{entry.entry_id}_duration"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()

        @callback
        def _tick(_now) -> None:
            if self._session.is_charging:
                self.async_write_ha_state()

        self.async_on_remove(async_track_time_interval(self.hass, _tick, TICK))

    @property
    def native_value(self) -> int:
        return self._session.duration_minutes

    @property
    def extra_state_attributes(self) -> dict:
        return {"phase": self._session.data.phase, "charging": self._session.is_charging}


class EnergySensor(_Base):
    """kWh charged in the current session."""

    _attr_name = "Geladen"
    _attr_icon = "mdi:lightning-bolt"
    _attr_device_class = SensorDeviceClass.ENERGY
    _attr_native_unit_of_measurement = UnitOfEnergy.KILO_WATT_HOUR
    _attr_suggested_display_precision = 1

    def __init__(self, entry: ConfigEntry, session: ChargingSession) -> None:
        super().__init__(entry, session)
        self._attr_unique_id = f"{entry.entry_id}_energy"

    @property
    def native_value(self) -> float:
        return round(self._session.energy_kwh, 3)
