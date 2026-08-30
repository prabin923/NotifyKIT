"""Shared HTTP request handling: timeouts, retries with backoff and jitter, and response
envelope parsing. Used by both NotificationClient (secret API key) and InboxClient
(end-user token) so retry/timeout behavior stays identical between the two credential types.
"""

from __future__ import annotations

import json
import random
import time
from email.utils import parsedate_to_datetime
from typing import Any, Dict, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from .errors import NotificationApiError

# GET/PUT/DELETE/PATCH are treated as safe to retry: PATCH endpoints in this API only ever
# perform partial field updates, never creates. POST is the one verb that can create a
# duplicate side effect on retry, so it is only retried when the caller supplied an
# Idempotency-Key the server can use to de-duplicate.
ALWAYS_IDEMPOTENT_METHODS = frozenset({"GET", "HEAD", "PUT", "DELETE", "PATCH"})


def _is_retryable_status(status: int) -> bool:
    return status == 429 or status >= 500


def _is_idempotent(method: str, idempotency_key: Optional[str], force_idempotent: Optional[bool]) -> bool:
    if force_idempotent is not None:
        return force_idempotent
    if method.upper() in ALWAYS_IDEMPOTENT_METHODS:
        return True
    return bool(idempotency_key)


def _backoff_delay_seconds(retry_index: int, base_seconds: float = 0.3, cap_seconds: float = 4.0) -> float:
    """Full-jitter exponential backoff: uniform(0, min(cap, base * 2^retry_index))."""
    bound = min(cap_seconds, base_seconds * (2 ** retry_index))
    return random.uniform(0, bound)


def _retry_after_seconds(header_value: Optional[str]) -> Optional[float]:
    if not header_value:
        return None
    try:
        return float(header_value)
    except ValueError:
        pass
    try:
        parsed = parsedate_to_datetime(header_value)
    except (TypeError, ValueError):
        return None
    return max(0.0, parsed.timestamp() - time.time())


def _read_json(response: Any) -> Any:
    raw = response.read()
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except ValueError:
        return {}


def _extract_data(payload: Dict[str, Any]) -> Any:
    if payload.get("data") is not None:
        return payload["data"]
    # POST /v1/events replies with event_id/status/notification_ids spliced at the top level
    # instead of under `data`.
    return {key: value for key, value in payload.items() if key not in ("success", "request_id", "error")}


def _build_api_error(payload: Any, status: int) -> NotificationApiError:
    error = payload.get("error", {}) if isinstance(payload, dict) else {}
    code = error.get("code", "REQUEST_FAILED")
    message = error.get("message", f"Request failed with status {status}.")
    details = error.get("details")
    return NotificationApiError(code, message, status, details)


class HttpClient:
    """Minimal, dependency-free HTTP client built on urllib."""

    def __init__(
        self,
        base_url: str,
        authorization_header: str,
        timeout_seconds: float = 15.0,
        max_retries: int = 2,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.authorization_header = authorization_header
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries

    def request(
        self,
        method: str,
        path: str,
        body: Optional[Dict[str, Any]] = None,
        query: Optional[Dict[str, Any]] = None,
        idempotency_key: Optional[str] = None,
        idempotent: Optional[bool] = None,
    ) -> Any:
        url = self._build_url(path, query)
        retryable = _is_idempotent(method, idempotency_key, idempotent)
        max_attempts = 1 + (self.max_retries if retryable else 0)
        retry_after_override: Optional[float] = None
        last_network_error: Optional[Exception] = None

        for attempt in range(max_attempts):
            if attempt > 0:
                delay = retry_after_override if retry_after_override is not None else _backoff_delay_seconds(attempt - 1)
                time.sleep(delay)
                retry_after_override = None

            is_last_attempt = attempt == max_attempts - 1
            headers: Dict[str, str] = {"Authorization": self.authorization_header}
            data: Optional[bytes] = None
            if body is not None:
                headers["Content-Type"] = "application/json"
                data = json.dumps(body).encode("utf-8")
            if idempotency_key:
                headers["Idempotency-Key"] = idempotency_key

            request = Request(url, data=data, headers=headers, method=method)
            try:
                with urlopen(request, timeout=self.timeout_seconds) as response:
                    status = response.status
                    payload = _read_json(response)
            except HTTPError as error:
                status = error.code
                payload = _read_json(error)
                if not is_last_attempt and _is_retryable_status(status):
                    retry_after_override = _retry_after_seconds(error.headers.get("Retry-After"))
                    continue
                raise _build_api_error(payload, status) from error
            except (URLError, TimeoutError, OSError) as error:
                last_network_error = error
                if not is_last_attempt:
                    continue
                raise NotificationApiError("NETWORK_ERROR", str(error), 0) from error

            if status == 204 or not payload:
                return None
            if isinstance(payload, dict) and payload.get("success"):
                return _extract_data(payload)
            raise _build_api_error(payload, status)

        # Unreachable: the loop above always returns or raises before falling through.
        if last_network_error is not None:
            raise NotificationApiError("NETWORK_ERROR", str(last_network_error), 0)
        raise NotificationApiError("REQUEST_FAILED", "Request failed.", 0)

    def _build_url(self, path: str, query: Optional[Dict[str, Any]]) -> str:
        url = f"{self.base_url}{path}"
        if query:
            filtered = {key: value for key, value in query.items() if value is not None}
            if filtered:
                url = f"{url}?{urlencode(filtered)}"
        return url
