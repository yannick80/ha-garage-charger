"""Card registration, websocket API and card source rules."""

from __future__ import annotations

from pathlib import Path
import re
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component

from custom_components.garage_charger import frontend, websocket
from custom_components.garage_charger.const import (
    CARD_URL,
    DATA_CARD_REGISTERED,
    DOMAIN,
    LEGACY_CARD_URL,
)

CARD_JS = (
    Path(__file__).parent.parent
    / "custom_components" / DOMAIN / "www" / "garage-charger-card.js"
)


@pytest.fixture(autouse=True)
def auto_enable(enable_custom_integrations):
    yield


class FakeResources:
    """Minimal ResourceStorageCollection."""

    def __init__(self, items=None, loaded=True):
        self.items = [dict(i) for i in (items or [])]
        self.loaded = loaded
        self.load_calls = 0
        self._next = 100

    async def async_load(self):
        self.load_calls += 1

    def async_items(self):
        return list(self.items)

    async def async_create_item(self, data):
        self._next += 1
        item = {"id": str(self._next), "type": data["res_type"], "url": data["url"]}
        self.items.append(item)
        return item

    async def async_update_item(self, item_id, data):
        for item in self.items:
            if item["id"] == item_id:
                item.update({"type": data["res_type"], "url": data["url"]})

    async def async_delete_item(self, item_id):
        self.items = [i for i in self.items if i["id"] != item_id]


async def _register(hass, resources=None, as_dict=False):
    hass.data.pop(DATA_CARD_REGISTERED, None)
    if resources is not None:
        hass.data["lovelace"] = (
            {"resources": resources} if as_dict else SimpleNamespace(resources=resources)
        )
    with patch.object(hass.http, "async_register_static_paths", AsyncMock()) as static:
        await frontend.async_register_card(hass)
    return static


@pytest.fixture
async def http(hass: HomeAssistant):
    assert await async_setup_component(hass, "http", {})


# ------------------------------------------------------------ static path --
async def test_static_path_with_cache_headers(hass: HomeAssistant, http) -> None:
    static = await _register(hass, FakeResources())
    (configs,), _ = static.call_args
    assert configs[0].url_path == CARD_URL
    assert configs[0].cache_headers is True
    assert Path(configs[0].path) == CARD_JS


# ---------------------------------------------------------- storage mode --
async def test_resource_created_with_content_hash(hass: HomeAssistant, http) -> None:
    res = FakeResources(loaded=False)
    await _register(hass, res)
    assert res.load_calls == 1 and res.loaded is True
    assert len(res.items) == 1
    item = res.items[0]
    assert item["type"] == "module"
    assert re.fullmatch(re.escape(CARD_URL) + r"\?v=[0-9a-f]{10}", item["url"])


async def test_resource_updated_and_deduplicated(hass: HomeAssistant, http) -> None:
    foreign = {"id": "1", "type": "module", "url": "/hacsfiles/other/card.js?v=3"}
    res = FakeResources(
        [
            {"id": "2", "type": "js", "url": f"{CARD_URL}?v=old"},
            {"id": "3", "type": "module", "url": f"{CARD_URL}?v=older"},
            foreign,
        ]
    )
    await _register(hass, res)
    ours = [i for i in res.items if i["url"].startswith(CARD_URL)]
    assert len(ours) == 1
    assert ours[0]["id"] == "2" and ours[0]["type"] == "module"
    assert "v=old" not in ours[0]["url"]
    assert foreign in res.items  # never touch foreign entries


async def test_resource_older_ha_dict_layout(hass: HomeAssistant, http) -> None:
    res = FakeResources()
    await _register(hass, res, as_dict=True)
    assert len(res.items) == 1


async def test_legacy_manual_resource_kept_and_warned(hass: HomeAssistant, http, caplog) -> None:
    legacy = {"id": "9", "type": "module", "url": f"{LEGACY_CARD_URL}?v=1"}
    res = FakeResources([legacy])
    await _register(hass, res)
    assert legacy in res.items
    assert "old manual dashboard resource" in caplog.text


async def test_idempotent(hass: HomeAssistant, http) -> None:
    res = FakeResources()
    await _register(hass, res)
    with patch.object(hass.http, "async_register_static_paths", AsyncMock()) as static:
        await frontend.async_register_card(hass)  # second call: flag set
    static.assert_not_called()
    assert len(res.items) == 1


# ------------------------------------------------------------- YAML mode --
async def test_yaml_mode_uses_extra_js_for_both_builds(hass: HomeAssistant, http) -> None:
    hass.config.components.add("frontend")
    yaml_resources = SimpleNamespace(async_items=lambda: [])  # no async_create_item
    with patch("homeassistant.components.frontend.add_extra_js_url") as add:
        await _register(hass, yaml_resources)
    urls = [(c.args[1], c.kwargs.get("es5", False)) for c in add.call_args_list]
    assert len(urls) == 2
    assert {es5 for _, es5 in urls} == {False, True}
    assert all(u.startswith(f"{CARD_URL}?v=") for u, _ in urls)


# ----------------------------------------------------- failure isolation --
async def test_card_failure_does_not_break_setup(hass: HomeAssistant, caplog) -> None:
    with patch.object(frontend, "_async_register_resource", side_effect=RuntimeError("boom")):
        assert await async_setup_component(hass, DOMAIN, {})
    assert "Could not register the Garage Charger dashboard card" in caplog.text


async def test_missing_card_file_warns(hass: HomeAssistant, http, caplog) -> None:
    with patch.object(frontend, "CARD_PATH", Path("/nonexistent/card.js")):
        static = await _register(hass, FakeResources())
    static.assert_not_called()
    assert "Dashboard card not found" in caplog.text


# --------------------------------------------- setup vs. entry setup --
async def test_async_setup_registers_entry_setup_does_not(hass: HomeAssistant) -> None:
    with patch(
        "custom_components.garage_charger.async_register_card", AsyncMock()
    ) as reg:
        assert await async_setup_component(hass, DOMAIN, {})
        await hass.async_block_till_done()
        assert reg.await_count == 1
        hass.states.async_set("sensor.st", "available")
        entry = MockConfigEntry(
            domain=DOMAIN,
            title="Garage",
            data={
                "status_entity": "sensor.st",
                "stop_button": "button.stop",
                "energy_entity": "sensor.e",
            },
        )
        entry.add_to_hass(hass)
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
        assert reg.await_count == 1


# ------------------------------------------------------------- websocket --
async def test_websocket_entries(hass: HomeAssistant) -> None:
    hass.states.async_set("sensor.st", "available")
    entry = MockConfigEntry(
        domain=DOMAIN,
        title="Garage",
        data={
            "status_entity": "sensor.st",
            "start_button": "button.start",
            "stop_button": "button.stop",
            "power_entity": "sensor.p",
            "energy_entity": "sensor.e",
        },
    )
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()

    handlers = hass.data["websocket_api"]
    assert "garage_charger/entries" in handlers

    connection = MagicMock()
    websocket.ws_entries(hass, connection, {"id": 7, "type": "garage_charger/entries"})
    (msg_id, result), _ = connection.send_result.call_args
    assert msg_id == 7
    assert result == [
        {
            "entry_id": entry.entry_id,
            "title": "Garage",
            "loaded": True,
            "status_entity": "sensor.st",
            "power_entity": "sensor.p",
            "start_button": "button.start",
            "stop_button": "button.stop",
            "duration_entity": "sensor.garage_ladedauer",
            "energy_entity": "sensor.garage_geladen",
        }
    ]


# ------------------------------------------------------ card source rules --
def _code_only(src: str) -> str:
    """Strip comments and string literals so the scan only sees code."""
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.S)
    src = re.sub(r"(?m)^\s*//.*$", "", src)
    src = re.sub(r'"(?:\\.|[^"\\])*"', '""', src)
    src = re.sub(r"'(?:\\.|[^'\\])*'", "''", src)
    src = re.sub(r"`(?:\\.|[^`\\])*`", "``", src)
    return src


def test_card_has_no_post_es2019_syntax() -> None:
    code = _code_only(CARD_JS.read_text())
    for token in ("?.", "??", "||=", "&&=", ".replaceAll(", ".at("):
        assert token not in code, f"forbidden syntax {token!r} in card"
    assert not re.search(r"#[A-Za-z_$]", code), "private class fields (#x) in card"


def test_card_is_wrapped_in_own_scope() -> None:
    src = CARD_JS.read_text()
    body = re.sub(r"^/\*.*?\*/\s*", "", src, flags=re.S).strip()
    assert body.startswith("(function () {") and body.endswith("})();")


def test_card_css_is_legacy_safe() -> None:
    src = re.sub(r"/\*.*?\*/", "", CARD_JS.read_text(), flags=re.S)  # comments first
    assert not re.search(r"(?<![-\w])gap\s*:", src), "flex/grid gap needs Chrome 84"
    for match in re.finditer(r"color-mix\(", src):
        before = src[: match.start()].rsplit(";", 2)[-2]
        prop = src[: match.start()].rsplit(";", 1)[-1].split(":")[0].strip()
        assert prop and prop in before, "color-mix() needs a plain fallback before it"


def test_card_guards_registration() -> None:
    src = CARD_JS.read_text()
    assert "if (!customElements.get(TAG))" in src
    assert "window.customCards.some" in src
