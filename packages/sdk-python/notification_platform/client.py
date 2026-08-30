"""Backend SDK for NotifyKIT, authenticated with a tenant's secret API key.

This client is for server-side use only. To let a browser read or manage an end user's
in-app inbox, mint a short-lived token with ``users.mint_token`` on your backend and hand
it to ``InboxClient`` in the browser-facing part of your stack — never ship this client's
``api_key`` anywhere a browser can read it.
"""

from __future__ import annotations

import datetime as _datetime
from typing import Any, Dict, List, Optional, Union

from ._http import HttpClient

DateLike = Union[str, _datetime.datetime, _datetime.date]


def _to_iso(value: Optional[DateLike]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, (_datetime.datetime, _datetime.date)):
        return value.isoformat()
    return value


class _Events:
    def __init__(self, client: "NotificationClient") -> None:
        self._client = client

    def create(
        self,
        event: str,
        user: Dict[str, Any],
        data: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
        external_event_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """POST /v1/events -- requires the ``events:write`` permission."""
        body: Dict[str, Any] = {"event": event, "user": user, "data": data or {}}
        if idempotency_key:
            body["idempotency_key"] = idempotency_key
        if external_event_id:
            body["external_event_id"] = external_event_id
        return self._client._http.request("POST", "/v1/events", body=body, idempotency_key=idempotency_key)


class _Notifications:
    def __init__(self, client: "NotificationClient") -> None:
        self._client = client

    def create(
        self,
        user_id: str,
        notification: Dict[str, Any],
        channels: List[str],
        scheduled_at: Optional[str] = None,
        expires_at: Optional[str] = None,
    ) -> Dict[str, Any]:
        """POST /v1/notifications -- requires ``notifications:write``."""
        body: Dict[str, Any] = {"user_id": user_id, "notification": notification, "channels": channels}
        if scheduled_at:
            body["scheduled_at"] = scheduled_at
        if expires_at:
            body["expires_at"] = expires_at
        return self._client._http.request("POST", "/v1/notifications", body=body)

    def list(
        self,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """GET /v1/notifications -- requires ``notifications:read``."""
        query = {"status": status, "limit": limit, "cursor": cursor}
        return self._client._http.request("GET", "/v1/notifications", query=query)

    def get(self, notification_id: str) -> Dict[str, Any]:
        """GET /v1/notifications/:id -- requires ``notifications:read``. Returns the raw row."""
        return self._client._http.request("GET", f"/v1/notifications/{notification_id}")

    def cancel(self, notification_id: str) -> None:
        """POST /v1/notifications/:id/cancel -- requires ``notifications:write``."""
        self._client._http.request("POST", f"/v1/notifications/{notification_id}/cancel")


class _Templates:
    def __init__(self, client: "NotificationClient") -> None:
        self._client = client

    def list(self) -> List[Dict[str, Any]]:
        """GET /v1/templates -- requires ``templates:read``."""
        return self._client._http.request("GET", "/v1/templates")

    def create(
        self,
        name: str,
        event_type: str,
        channel: str,
        body: str,
        subject: Optional[str] = None,
        language: Optional[str] = None,
        version: Optional[int] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        """POST /v1/templates -- requires ``templates:write``."""
        payload: Dict[str, Any] = {"name": name, "event_type": event_type, "channel": channel, "body": body}
        if subject is not None:
            payload["subject"] = subject
        if language is not None:
            payload["language"] = language
        if version is not None:
            payload["version"] = version
        if status is not None:
            payload["status"] = status
        return self._client._http.request("POST", "/v1/templates", body=payload)

    def update(self, template_id: str, **fields: Any) -> Dict[str, Any]:
        """PATCH /v1/templates/:id -- requires ``templates:write``.

        Accepts any of ``name``, ``subject``, ``body``, ``status`` as keyword arguments.
        """
        return self._client._http.request("PATCH", f"/v1/templates/{template_id}", body=fields)


class _Preferences:
    def __init__(self, client: "NotificationClient") -> None:
        self._client = client

    def get(self, external_user_id: str) -> List[Dict[str, Any]]:
        """GET /v1/users/:externalUserId/preferences -- requires ``users:manage``."""
        return self._client._http.request("GET", f"/v1/users/{external_user_id}/preferences")

    def put(self, external_user_id: str, category: str, channel: str, enabled: bool) -> Dict[str, Any]:
        """PUT /v1/users/:externalUserId/preferences -- requires ``users:manage``."""
        body = {"category": category, "channel": channel, "enabled": enabled}
        return self._client._http.request("PUT", f"/v1/users/{external_user_id}/preferences", body=body)


class _Users:
    def __init__(self, client: "NotificationClient") -> None:
        self._client = client
        self.preferences = _Preferences(client)

    def list(self) -> List[Dict[str, Any]]:
        """GET /v1/users -- requires ``users:manage``."""
        return self._client._http.request("GET", "/v1/users")

    def register_device(self, external_user_id: str, device_token: str, platform: str, app_version: Optional[str] = None) -> Dict[str, Any]:
        """POST /v1/users/:externalUserId/devices -- requires ``devices:manage``."""
        body: Dict[str, Any] = {"device_token": device_token, "platform": platform}
        if app_version is not None:
            body["app_version"] = app_version
        return self._client._http.request("POST", f"/v1/users/{external_user_id}/devices", body=body)

    def mint_token(self, external_user_id: str) -> Dict[str, Any]:
        """POST /v1/users/:externalUserId/token -- requires ``users:manage``.

        Call this from your BACKEND to mint a short-lived end-user token
        (``{"token": ..., "expires_at": ...}``), then hand it to ``InboxClient`` in the browser.
        """
        return self._client._http.request("POST", f"/v1/users/{external_user_id}/token")


class _Webhooks:
    def __init__(self, client: "NotificationClient") -> None:
        self._client = client

    def list(self) -> List[Dict[str, Any]]:
        """GET /v1/webhooks -- requires ``webhooks:manage``."""
        return self._client._http.request("GET", "/v1/webhooks")

    def create(self, url: str, events: List[str], secret: Optional[str] = None) -> Dict[str, Any]:
        """POST /v1/webhooks -- requires ``webhooks:manage``. Response includes the plaintext secret once."""
        body: Dict[str, Any] = {"url": url, "events": events}
        if secret is not None:
            body["secret"] = secret
        return self._client._http.request("POST", "/v1/webhooks", body=body)

    def update(self, webhook_id: str, status: Optional[str] = None, events: Optional[List[str]] = None) -> Dict[str, Any]:
        """PATCH /v1/webhooks/:id -- requires ``webhooks:manage``."""
        body: Dict[str, Any] = {}
        if status is not None:
            body["status"] = status
        if events is not None:
            body["events"] = events
        return self._client._http.request("PATCH", f"/v1/webhooks/{webhook_id}", body=body)


class _Workflows:
    def __init__(self, client: "NotificationClient") -> None:
        self._client = client

    def list(self) -> List[Dict[str, Any]]:
        """GET /v1/workflows -- requires ``workflows:manage``."""
        return self._client._http.request("GET", "/v1/workflows")

    def create(self, name: str, event_type: str, definition: Dict[str, Any], status: Optional[str] = None) -> Dict[str, Any]:
        """POST /v1/workflows -- requires ``workflows:manage``."""
        body: Dict[str, Any] = {"name": name, "event_type": event_type, "definition": definition}
        if status is not None:
            body["status"] = status
        return self._client._http.request("POST", "/v1/workflows", body=body)

    def update(self, workflow_id: str, **fields: Any) -> Dict[str, Any]:
        """PATCH /v1/workflows/:id -- requires ``workflows:manage``.

        Accepts any of ``name``, ``definition``, ``status`` as keyword arguments.
        """
        return self._client._http.request("PATCH", f"/v1/workflows/{workflow_id}", body=fields)


class _Analytics:
    def __init__(self, client: "NotificationClient") -> None:
        self._client = client

    def overview(self, date_from: Optional[DateLike] = None, date_to: Optional[DateLike] = None) -> Dict[str, Any]:
        """GET /v1/analytics -- requires ``analytics:read``. Defaults to today (server-side)."""
        query = {"from": _to_iso(date_from), "to": _to_iso(date_to)}
        return self._client._http.request("GET", "/v1/analytics", query=query)


class NotificationClient:
    """Secret-key client covering the full tenant-scoped API surface."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "http://localhost:3000",
        timeout_seconds: float = 15.0,
        max_retries: int = 2,
    ) -> None:
        if not api_key:
            raise ValueError("api_key is required.")
        self._http = HttpClient(
            base_url=base_url,
            authorization_header=f"Bearer {api_key}",
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )
        self.events = _Events(self)
        self.notifications = _Notifications(self)
        self.templates = _Templates(self)
        self.users = _Users(self)
        self.webhooks = _Webhooks(self)
        self.workflows = _Workflows(self)
        self.analytics = _Analytics(self)
