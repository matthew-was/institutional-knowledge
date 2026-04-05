"""Shared dataclasses for the C2 pipeline (ADR-042)."""

from dataclasses import dataclass


@dataclass
class DocumentFlag:
    type: str
    reason: str
