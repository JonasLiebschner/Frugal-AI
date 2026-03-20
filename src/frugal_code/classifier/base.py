"""Base classes for complexity classifiers."""

from abc import ABC, abstractmethod
from dataclasses import dataclass

from ..config import ComplexityTier
from ..models import ChatCompletionRequest


@dataclass
class ClassificationResult:
    """Result of complexity classification."""

    tier: ComplexityTier
    score: float  # 0.0 (simple) to 1.0 (complex)
    reason: str  # Human-readable explanation
    classifier_type: str  # Which classifier was used


class ClassifierBase(ABC):
    """Base class for complexity classifiers."""

    @abstractmethod
    async def classify(self, request: ChatCompletionRequest) -> ClassificationResult:
        """
        Classify a chat completion request.

        Args:
            request: The chat completion request to classify

        Returns:
            ClassificationResult with tier, score, and reason
        """
        pass
