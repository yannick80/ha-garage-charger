"""Tests for the Garage Charger session logic, config flow and card serving."""

from datetime import timedelta

from freezegun.api import FrozenDateTimeFactory
import pytest
from pytest_homeassistant_custom_component.common import (
    MockConfigEntry,
    async_fire_time_changed,
)

from homeassistant.core import HomeAssistant
from homeassistant.data_entry_flow import FlowResultType

from custom_components.garage_charger.const import DOMAIN

STATUS = "sensor.al_ev_charger_status"
STOP = "button.al_stop_charging"
ENERGY = "sensor.wallbox_total_active_energy"
KWH = {"unit_of_measurement": "kWh"}
FULL = {
    "status_entity": STATUS,
    "start_button": "button.al_start_charging",
    "stop_button": STOP,
    "power_entity": "sensor.wallbox_total_active_power",
    "energy_entity": ENERGY,
}


@pytest.fixture(autouse=True)
def auto_enable(enable_custom_integrations):
    yield


async def _setup(hass: HomeAssistant) -> MockConfigEntry:
    hass.states.async_set(STATUS, "available")
    hass.states.async_set(STOP, "unknown")
    hass.states.async_set(ENERGY, "100.0", KWH)
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Garage",
        data={"status_entity": STATUS, "stop_button": STOP, "energy_entity": ENERGY},
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


def _vals(hass):
    return (
        hass.states.get("sensor.garage_ladedauer").state,
        hass.states.get("sensor.garage_geladen").state,
    )


async def _status(hass, s):
    hass.states.async_set(STATUS, s)
    await hass.async_block_till_done()


async def _energy(hass, v):
    hass.states.async_set(ENERGY, str(v), KWH)
    await hass.async_block_till_done()


async def _tick(hass, freezer, minutes):
    freezer.tick(timedelta(minutes=minutes))
    async_fire_time_changed(hass)
    await hass.async_block_till_done()


async def test_full_session_with_background_pause(
    hass: HomeAssistant, freezer: FrozenDateTimeFactory
) -> None:
    await _setup(hass)
    assert _vals(hass) == ("0", "0.0")

    await _status(hass, "preparing")
    await _status(hass, "charging")              # after Start
    await _tick(hass, freezer, 30)
    await _energy(hass, 103.5)
    assert _vals(hass) == ("30", "3.5")

    # wallbox pauses in the background (not enough PV): time stops
    await _status(hass, "suspended_evse")
    await _tick(hass, freezer, 20)
    assert _vals(hass) == ("30", "3.5")

    # sun is back: same session continues
    await _status(hass, "charging")
    await _tick(hass, freezer, 15)
    await _energy(hass, 105.0)
    assert _vals(hass) == ("45", "5.0")

    # cloud dropout does not break the session
    await _status(hass, "unavailable")
    await _status(hass, "charging")
    await _tick(hass, freezer, 5)
    assert _vals(hass)[0] == "50"


async def test_stop_resets(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    await _setup(hass)
    await _status(hass, "charging")
    await _tick(hass, freezer, 10)
    await _energy(hass, 102)
    assert _vals(hass) == ("10", "2.0")

    hass.states.async_set(STOP, "2026-11-17T19:00:00+00:00")  # button pressed
    await hass.async_block_till_done()
    assert _vals(hass) == ("0", "0.0")

    # next charging starts a fresh session
    await _status(hass, "suspended_ev")
    await _status(hass, "charging")
    await _tick(hass, freezer, 3)
    await _energy(hass, 102.5)
    assert _vals(hass) == ("3", "0.5")


async def test_unplug_freezes_values(hass: HomeAssistant, freezer: FrozenDateTimeFactory) -> None:
    await _setup(hass)
    await _status(hass, "charging")
    await _tick(hass, freezer, 60)
    await _energy(hass, 110)
    await _status(hass, "available")          # unplugged without Stop
    await _energy(hass, 111)                  # meter moves on (other load) – ignored
    await _tick(hass, freezer, 30)
    assert _vals(hass) == ("60", "10.0")

    # new car, new session
    await _status(hass, "preparing")
    await _status(hass, "charging")
    await _tick(hass, freezer, 1)
    assert _vals(hass) == ("1", "0.0")


async def test_button_coming_online_is_not_a_press(hass: HomeAssistant, freezer) -> None:
    await _setup(hass)
    await _status(hass, "charging")
    await _tick(hass, freezer, 10)
    hass.states.async_set(STOP, "unavailable")
    await hass.async_block_till_done()
    hass.states.async_set(STOP, "2026-11-17T18:00:00+00:00")
    await hass.async_block_till_done()
    assert _vals(hass)[0] == "10"


async def test_wh_energy_unit(hass: HomeAssistant, freezer) -> None:
    await _setup(hass)
    hass.states.async_set(ENERGY, "100000", {"unit_of_measurement": "Wh"})
    await _status(hass, "charging")
    hass.states.async_set(ENERGY, "102500", {"unit_of_measurement": "Wh"})
    await hass.async_block_till_done()
    assert _vals(hass)[1] == "2.5"


async def test_session_survives_restart(hass: HomeAssistant, freezer) -> None:
    entry = await _setup(hass)
    await _status(hass, "charging")
    await _tick(hass, freezer, 20)
    await _energy(hass, 104)
    assert await hass.config_entries.async_reload(entry.entry_id)
    await hass.async_block_till_done()
    await _tick(hass, freezer, 10)
    assert _vals(hass) == ("30", "4.0")


async def test_config_flow(hass: HomeAssistant) -> None:
    result = await hass.config_entries.flow.async_init(DOMAIN, context={"source": "user"})
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.flow.async_configure(
        result["flow_id"],
        {"name": "Garage", **FULL},
    )
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert result["title"] == "Garage"
    assert result["data"] == FULL


async def test_options_flow_adds_missing_entities(hass: HomeAssistant) -> None:
    """Entries from 1.0.0 lack start button and power sensor."""
    entry = await _setup(hass)
    result = await hass.config_entries.options.async_init(entry.entry_id)
    assert result["type"] is FlowResultType.FORM
    result = await hass.config_entries.options.async_configure(result["flow_id"], FULL)
    assert result["type"] is FlowResultType.CREATE_ENTRY
    await hass.async_block_till_done()
    assert entry.options == FULL


