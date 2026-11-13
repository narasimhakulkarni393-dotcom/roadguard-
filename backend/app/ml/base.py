"""Base interface definition for all RoadGuard AI ML modules.

Every model component must implement this contract:
- load()
- predict()
- health()
- metadata()
- version()
- is_ready()
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from PIL import Image


class BaseModelInterface(ABC):
    """Abstract base class that all production ML models must implement."""

    @abstractmethod
    def load(self) -> None:
        """Load model weights and initialize computational graph."""
        pass

    @abstractmethod
    def predict(self, image: Image.Image, **kwargs: Any) -> Dict[str, Any]:
        """Execute inference independently on the provided PIL image.
        
        Must never mutate global state or reuse buffers between requests.
        """
        pass

    @abstractmethod
    def health(self) -> Dict[str, Any]:
        """Report component health, execution device, and operational status."""
        pass

    @abstractmethod
    def metadata(self) -> Dict[str, Any]:
        """Return model metadata: architecture, classes, license, checksum, weights path."""
        pass

    @abstractmethod
    def version(self) -> str:
        """Return semantic or hash version of the model artifact."""
        pass

    @abstractmethod
    def is_ready(self) -> bool:
        """Return True if model is loaded into memory and ready for inference."""
        pass
