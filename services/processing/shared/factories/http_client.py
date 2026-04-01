"""Factory for creating the HttpClient adapter (ADR-044)."""

import structlog

from shared.adapters.http_client import HttpClient
from shared.config import AppConfig
from shared.interfaces.http_client import HttpClientBase


def create_http_client(config: AppConfig, log: structlog.BoundLogger) -> HttpClientBase:
    return HttpClient(config=config, log=log)
