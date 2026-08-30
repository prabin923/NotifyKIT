"""Client for a single end user's in-app inbox (``/v1/inbox/*``).

This is intentionally a separate class from ``NotificationClient``: it only ever holds a
short-lived end-user token, never the tenant's secret API key, so it is structurally
impossible to reach for the wrong credential when this is the part of your stack that
talks directly to whatever surface an end user controls.

Two-step flow:
    1. Backend (holds the secret key): ``notification_client.users.mint_token(external_user_id)``.
    2. Wherever the end user is (holds only the minted token): ``InboxClient(token=...)``.
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from ._http import HttpClient


class InboxClient:
    def __init__(
        self,
        token: str,
        base_url: str = "http://localhost:3000",
        timeout_seconds: float = 15.0,
        max_retries: int = 2,
    ) -> None:
        if not token:
            raise ValueError("token is required.")
        self._http = HttpClient(
            base_url=base_url,
            authorization_header=f"Bearer {token}",
            timeout_seconds=timeout_seconds,
            max_retries=max_retries,
        )

    def list(
        self,
        status: Optional[str] = None,
        limit: Optional[int] = None,
        cursor: Optional[str] = None,
        archived: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """GET /v1/inbox"""
        query: Dict[str, Any] = {"status": status, "limit": limit, "cursor": cursor}
        if archived is not None:
            query["archived"] = "true" if archived else "false"
        return self._http.request("GET", "/v1/inbox", query=query)

    def count(self) -> Dict[str, int]:
        """GET /v1/inbox/count"""
        return self._http.request("GET", "/v1/inbox/count")

    def read_all(self) -> Dict[str, int]:
        """POST /v1/inbox/read-all -- marks every unread, unarchived item read. Safe to retry."""
        return self._http.request("POST", "/v1/inbox/read-all", idempotent=True)

    def read(self, item_id: str) -> Dict[str, Any]:
        """POST /v1/inbox/:id/read -- safe to retry: setting read_at twice is a no-op."""
        return self._http.request("POST", f"/v1/inbox/{item_id}/read", idempotent=True)

    def unread(self, item_id: str) -> Dict[str, Any]:
        """POST /v1/inbox/:id/unread -- safe to retry."""
        return self._http.request("POST", f"/v1/inbox/{item_id}/unread", idempotent=True)

    def seen(self, item_id: str) -> Dict[str, Any]:
        """POST /v1/inbox/:id/seen -- safe to retry."""
        return self._http.request("POST", f"/v1/inbox/{item_id}/seen", idempotent=True)

    def archive(self, item_id: str) -> Dict[str, Any]:
        """POST /v1/inbox/:id/archive -- safe to retry."""
        return self._http.request("POST", f"/v1/inbox/{item_id}/archive", idempotent=True)
