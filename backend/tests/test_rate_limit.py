import unittest

from fastapi import HTTPException
from starlette.requests import Request

from app.core.rate_limit import enforce_rate_limit, reset_rate_limits_for_tests


class RateLimitTest(unittest.TestCase):
    def setUp(self) -> None:
        reset_rate_limits_for_tests()

    @staticmethod
    def _request(host: str = "127.0.0.1") -> Request:
        return Request(
            {
                "type": "http",
                "method": "POST",
                "path": "/",
                "headers": [],
                "client": (host, 12345),
                "server": ("testserver", 80),
                "scheme": "http",
            }
        )

    def test_rejects_requests_over_limit_with_retry_after(self) -> None:
        request = self._request()
        enforce_rate_limit(
            request,
            scope="test",
            max_requests=2,
            window_seconds=60,
        )
        enforce_rate_limit(
            request,
            scope="test",
            max_requests=2,
            window_seconds=60,
        )

        with self.assertRaises(HTTPException) as context:
            enforce_rate_limit(
                request,
                scope="test",
                max_requests=2,
                window_seconds=60,
            )

        self.assertEqual(context.exception.status_code, 429)
        self.assertIn("Retry-After", context.exception.headers)

    def test_separates_authenticated_actors(self) -> None:
        request = self._request()
        enforce_rate_limit(
            request,
            scope="ai",
            max_requests=1,
            window_seconds=60,
            actor_id="elder-1",
        )

        enforce_rate_limit(
            request,
            scope="ai",
            max_requests=1,
            window_seconds=60,
            actor_id="elder-2",
        )


if __name__ == "__main__":
    unittest.main()
