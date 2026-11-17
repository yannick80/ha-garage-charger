"""Charging session tracker.

Rules
-----
* A session starts with the first change to ``charging`` while no session is
  active (i.e. after Start).
* Background pauses (wallbox stops for lack of PV, car pauses) keep the
  session; the duration only counts time actually spent charging.
* Pressing the Stop button (from anywhere) resets everything to zero.
* Unplugging without Stop freezes the values until the next session starts.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import asdict, dataclass
import logging
from typing import Any

from homeassistant.const import UnitOfEnergy
from homeassistant.core import Event, EventStateChangedData, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.event import async_track_state_change_event
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    IGNORED_STATES,
    PHASE_ACTIVE,
    PHASE_ENDED,
    PHASE_IDLE,
    SIGNAL_UPDATE,
    STATUS_AVAILABLE,
    STATUS_CHARGING,
)

_LOGGER = logging.getLogger(__name__)
STORAGE_VERSION = 1


@dataclass
class SessionData:
    """Persisted session state."""

    phase: str = PHASE_IDLE
    energy_start: float = 0.0
    energy_end: float = 0.0
    seconds: float = 0.0
    charging_since: float | None = None  # UTC timestamp


class ChargingSession:
    """Tracks one wallbox's charging session."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry_id: str,
        status_entity: str,
        stop_button: str,
        energy_entity: str,
    ) -> None:
        self.hass = hass
        self.entry_id = entry_id
        self.status_entity = status_entity
        self.stop_button = stop_button
        self.energy_entity = energy_entity
        self.data = SessionData()
        self._store: Store[dict[str, Any]] = Store(
            hass, STORAGE_VERSION, f"{DOMAIN}.{entry_id}"
        )
        self._unsubs: list[Callable[[], None]] = []

    # ------------------------------------------------------------ lifecycle --
    async def async_start(self) -> None:
        """Restore state and start listening."""
        if stored := await self._store.async_load():
            try:
                self.data = SessionData(**stored)
            except TypeError:
                _LOGGER.warning("Ignoring incompatible stored session data")

        # HA was down: we cannot know how long it kept charging, so an open
        # interval is only kept when the charger is still charging now.
        if self.data.charging_since is not None and not self._is_charging():
            self.data.charging_since = None
            self._save()

        self._unsubs.append(
            async_track_state_change_event(
                self.hass, [self.status_entity], self._on_status
            )
        )
        self._unsubs.append(
            async_track_state_change_event(self.hass, [self.stop_button], self._on_stop)
        )
        self._unsubs.append(
            async_track_state_change_event(
                self.hass, [self.energy_entity], self._on_energy
            )
        )

    @callback
    def async_stop(self) -> None:
        """Stop listening."""
        while self._unsubs:
            self._unsubs.pop()()

    # -------------------------------------------------------------- values --
    @property
    def energy_kwh(self) -> float:
        """Energy charged in the current/last session."""
        if self.data.phase == PHASE_ACTIVE:
            now = self._energy_now()
            if now is None:
                return 0.0
            return max(now - self.data.energy_start, 0.0)
        if self.data.phase == PHASE_ENDED:
            return max(self.data.energy_end - self.data.energy_start, 0.0)
        return 0.0

    @property
    def duration_minutes(self) -> int:
        """Minutes spent actually charging in the current/last session."""
        seconds = self.data.seconds
        if self.data.charging_since is not None:
            seconds += dt_util.utcnow().timestamp() - self.data.charging_since
        return int(max(seconds, 0) // 60)

    @property
    def is_charging(self) -> bool:
        """True while the open charging interval runs."""
        return self.data.charging_since is not None

    # ------------------------------------------------------------- helpers --
    def _is_charging(self) -> bool:
        state = self.hass.states.get(self.status_entity)
        return state is not None and state.state == STATUS_CHARGING

    def _energy_now(self) -> float | None:
        state = self.hass.states.get(self.energy_entity)
        if state is None:
            return None
        try:
            value = float(state.state)
        except ValueError:
            return None
        unit = state.attributes.get("unit_of_measurement")
        if unit == UnitOfEnergy.WATT_HOUR:
            value /= 1000
        elif unit == UnitOfEnergy.MEGA_WATT_HOUR:
            value *= 1000
        return value

    def _save(self) -> None:
        self._store.async_delay_save(lambda: asdict(self.data), 1)

    def _notify(self) -> None:
        self._save()
        async_dispatcher_send(self.hass, SIGNAL_UPDATE.format(self.entry_id))

    def _close_interval(self) -> None:
        if self.data.charging_since is not None:
            self.data.seconds += max(
                dt_util.utcnow().timestamp() - self.data.charging_since, 0
            )
            self.data.charging_since = None

    # ------------------------------------------------------------ handlers --
    @callback
    def _on_stop(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        if new is None or new.state == "unavailable":
            return
        if old is None or old.state == "unavailable":
            return  # entity added / came back online (e.g. at startup), not a press
        _LOGGER.debug("Stop pressed – resetting session")
        self.data = SessionData()
        self._notify()

    @callback
    def _on_status(self, event: Event[EventStateChangedData]) -> None:
        old, new = event.data["old_state"], event.data["new_state"]
        if new is None or new.state in IGNORED_STATES:
            return
        if old is not None and old.state in IGNORED_STATES:
            # Cloud dropout: only resume an interval if it is charging now
            old_state = None
        else:
            old_state = old.state if old else None
        to = new.state

        if to == STATUS_CHARGING:
            if self.data.phase != PHASE_ACTIVE:
                energy = self._energy_now() or 0.0
                self.data = SessionData(phase=PHASE_ACTIVE, energy_start=energy)
            if self.data.charging_since is None:
                self.data.charging_since = dt_util.utcnow().timestamp()
        else:
            if old_state == STATUS_CHARGING or self.data.charging_since is not None:
                self._close_interval()
            if to == STATUS_AVAILABLE and self.data.phase == PHASE_ACTIVE:
                self.data.phase = PHASE_ENDED
                self.data.energy_end = self._energy_now() or self.data.energy_start
        self._notify()

    @callback
    def _on_energy(self, event: Event[EventStateChangedData]) -> None:
        if self.data.phase == PHASE_ACTIVE:
            async_dispatcher_send(self.hass, SIGNAL_UPDATE.format(self.entry_id))
