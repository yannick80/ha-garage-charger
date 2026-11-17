"""Serve the dashboard card and register it with Lovelace.

Rules (see AGENTS.md): register in ``async_setup`` (not per entry), serve with
cache headers and a content hash in the URL, add it as a Lovelace resource in
storage mode (like HACS does) so the frontend loads it *before* building
cards, fall back to extra JS URLs (both builds) for YAML-managed resources,
and never let a card problem break the integration.
"""

from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from typing import Any

from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import CARD_FILENAME, CARD_URL, DATA_CARD_REGISTERED, LEGACY_CARD_URL

_LOGGER = logging.getLogger(__name__)

CARD_PATH = Path(__file__).parent / "www" / CARD_FILENAME


def _file_hash(path: Path) -> str:
    return hashlib.md5(path.read_bytes(), usedforsecurity=False).hexdigest()[:10]


def _path_of(url: str) -> str:
    return url.split("?", 1)[0]


async def async_register_card(hass: HomeAssistant) -> None:
    """Serve the card and make sure every dashboard loads it. Never raises."""
    if hass.data.get(DATA_CARD_REGISTERED):
        return
    hass.data[DATA_CARD_REGISTERED] = True
    try:
        if not CARD_PATH.is_file():
            _LOGGER.warning(
                "Dashboard card not found at %s – the card will not be available",
                CARD_PATH,
            )
            return
        digest = await hass.async_add_executor_job(_file_hash, CARD_PATH)
        url = f"{CARD_URL}?v={digest}"
        await hass.http.async_register_static_paths(
            [StaticPathConfig(CARD_URL, str(CARD_PATH), cache_headers=True)]
        )
        if not await _async_register_resource(hass, url):
            _add_extra_js(hass, url)
    except Exception:  # noqa: BLE001 – the card must never break the integration
        _LOGGER.exception("Could not register the Garage Charger dashboard card")


def _add_extra_js(hass: HomeAssistant, url: str) -> None:
    """YAML-managed resources: load the card via extra script URLs."""
    if "frontend" not in hass.config.components:
        return
    from homeassistant.components.frontend import add_extra_js_url

    add_extra_js_url(hass, url)
    add_extra_js_url(hass, url, es5=True)  # legacy build for old WebViews


def _resources(hass: HomeAssistant) -> Any | None:
    data = hass.data.get("lovelace")
    if data is None:
        return None
    resources = getattr(data, "resources", None)  # HA >= 2025.2: LovelaceData
    if resources is None and isinstance(data, dict):  # older: plain dict
        resources = data.get("resources")
    return resources


async def _async_register_resource(hass: HomeAssistant, url: str) -> bool:
    """Create/update our Lovelace resource. False when not in storage mode."""
    resources = _resources(hass)
    if resources is None or not hasattr(resources, "async_create_item"):
        return False  # YAML mode (or Lovelace not loaded)

    if not getattr(resources, "loaded", True):
        await resources.async_load()
        resources.loaded = True

    ours = [
        item
        for item in resources.async_items()
        if _path_of(item.get("url", "")) == CARD_URL
    ]
    if ours:
        first, *duplicates = ours
        if first.get("url") != url or first.get("type") != "module":
            await resources.async_update_item(
                first["id"], {"res_type": "module", "url": url}
            )
        for item in duplicates:
            await resources.async_delete_item(item["id"])
    else:
        await resources.async_create_item({"res_type": "module", "url": url})

    if any(
        _path_of(item.get("url", "")) == LEGACY_CARD_URL
        for item in resources.async_items()
    ):
        _LOGGER.warning(
            "An old manual dashboard resource %s exists. The card is now loaded "
            "by the integration – please remove that resource under Settings → "
            "Dashboards → Resources",
            LEGACY_CARD_URL,
        )
    return True
