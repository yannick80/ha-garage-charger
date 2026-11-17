"""Constants for Garage Charger."""

DOMAIN = "garage_charger"
VERSION = "1.0.0"

CONF_STATUS_ENTITY = "status_entity"
CONF_STOP_BUTTON = "stop_button"
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

SIGNAL_UPDATE = f"{DOMAIN}_update_{{}}"
