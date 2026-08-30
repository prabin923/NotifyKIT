"""Exception types raised by this SDK."""

from __future__ import annotations

from typing import Any, Dict, Optional


class NotificationApiError(Exception):
    """Raised whenever the API returns an error, or a request fails outright.

    Part of the public contract: callers are expected to catch this and read
    ``code`` / ``status`` / ``details`` off it, mirroring the JS SDK's
    ``NotificationApiError``.
    """

    def __init__(
        self,
        code: str,
        message: str,
        status: int,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status = status
        self.details = details
