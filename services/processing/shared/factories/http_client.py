"""Factory for creating the HttpClient adapter (ADR-044)."""

import structlog

from shared.adapters.http_client import HttpClient
from shared.config import AuthConfig, ServiceConfig
from shared.interfaces.http_client import HttpClientBase


def create_http_client(
    auth_config: AuthConfig, service_config: ServiceConfig, log: structlog.BoundLogger
) -> HttpClientBase:
    return HttpClient(auth_config=auth_config, service_config=service_config, log=log)
