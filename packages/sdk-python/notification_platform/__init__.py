"""Dependency-free Python SDK for the NotifyKIT notification platform.

Two client classes are exported, corresponding to two different credentials:

* ``NotificationClient`` -- authenticated with a tenant's secret API key. Backend use only.
* ``InboxClient`` -- authenticated with a short-lived end-user token, minted via
  ``NotificationClient.users.mint_token``. Safe to hand to whatever surface the end user
  controls, since it can never carry the secret API key.
"""

from .client import NotificationClient
from .errors import NotificationApiError
from .inbox import InboxClient

__all__ = ["NotificationClient", "InboxClient", "NotificationApiError"]
