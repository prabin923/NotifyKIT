"""Small dependency-free Python SDK for the Universal Notification Platform."""
from __future__ import annotations
import json
from typing import Any, Dict, Optional
from urllib.error import HTTPError
from urllib.request import Request, urlopen

class NotificationApiError(Exception):
    def __init__(self, code: str, message: str, status: int, details: Optional[Dict[str, Any]] = None) -> None:
        super().__init__(message); self.code = code; self.status = status; self.details = details

class _Events:
    def __init__(self, client: "NotificationClient") -> None: self._client = client
    def create(self, event: str, user: Dict[str, Any], data: Optional[Dict[str, Any]] = None, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        return self._client._request("POST", "/v1/events", {"event": event, "user": user, "data": data or {}, **({"idempotency_key": idempotency_key} if idempotency_key else {})}, idempotency_key)

class NotificationClient:
    def __init__(self, api_key: str, base_url: str = "http://localhost:3000") -> None:
        self.api_key = api_key; self.base_url = base_url.rstrip("/"); self.events = _Events(self)
    def _request(self, method: str, path: str, body: Optional[Dict[str, Any]] = None, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        if idempotency_key: headers["Idempotency-Key"] = idempotency_key
        request = Request(f"{self.base_url}{path}", data=json.dumps(body).encode() if body else None, headers=headers, method=method)
        try:
            with urlopen(request, timeout=15) as response: payload = json.loads(response.read()); status = response.status
        except HTTPError as error:
            payload = json.loads(error.read() or b'{}'); details = payload.get("error", {}); raise NotificationApiError(details.get("code", "REQUEST_FAILED"), details.get("message", "Request failed"), error.code, details.get("details")) from error
        if not payload.get("success"): details = payload.get("error", {}); raise NotificationApiError(details.get("code", "REQUEST_FAILED"), details.get("message", "Request failed"), status, details.get("details"))
        return payload.get("data", payload)
