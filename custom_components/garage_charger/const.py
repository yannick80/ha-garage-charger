"""Constants for Garage Charger."""

DOMAIN = "garage_charger"
VERSION = "1.1.0"

CONF_STATUS_ENTITY = "status_entity"
CONF_STOP_BUTTON = "stop_button"
CONF_START_BUTTON = "start_button"
CONF_POWER_ENTITY = "power_entity"
CONF_ENERGY_ENTITY = "energy_entity"

DEFAULT_NAME = "Garage"

STATUS_CHARGING = "charging"
STATUS_AVAILABLE = "available"
IGNORED_STATES = ("unknown", "unavailable")

PHASE_IDLE = "idle"
PHASE_ACTIVE = "active"
PHASE_ENDED = "ended"

CARD_FILENAME = "garage-charger-card.js"
CARD_URL = f"/{DOMAIN}/{CARD_FILENAME}"
LEGACY_CARD_URL = f"/local/{CARD_FILENAME}"  # old manual install
DATA_CARD_REGISTERED = f"{DOMAIN}_card_registered"
WS_TYPE_ENTRIES = f"{DOMAIN}/entries"

SIGNAL_UPDATE = f"{DOMAIN}_update_{{}}"
