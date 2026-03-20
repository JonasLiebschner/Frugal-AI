"""Heuristic-based complexity classifier."""

import re

import tiktoken

from ..config import ComplexityTier
from ..models import ChatCompletionRequest
from .base import ClassificationResult, ClassifierBase


class HeuristicClassifier(ClassifierBase):
    """
    Heuristic-based complexity classifier.

    Analyzes prompt characteristics to determine complexity:
    - Token count
    - Conversation length
    - Code blocks
    - Complexity keywords
    - Structural patterns
    """

    # Complexity indicators
    COMPLEX_KEYWORDS = [
        "analyze",
        "explain in detail",
        "step by step",
        "comprehensive",
        "compare and contrast",
        "compare",
        "evaluate",
        "research",
        "investigate",
        "write a full",
        "create a detailed",
        "design",
        "architect",
        "debug",
        "optimize",
        "refactor",
        "implement",
    ]

    SIMPLE_KEYWORDS = [
        "what is",
        "define",
        "list",
        "name",
        "yes or no",
        "true or false",
        "translate",
        "summarize briefly",
        "quick",
        "simple",
    ]

    # Thresholds
    LONG_PROMPT_TOKENS = 300  # Tokens in user messages (adjusted for better sensitivity)
    MANY_TURNS = 5  # Number of conversation turns

    def __init__(self):
        """Initialize the heuristic classifier."""
        self.encoder = tiktoken.get_encoding("cl100k_base")  # GPT-4 encoding

    async def classify(self, request: ChatCompletionRequest) -> ClassificationResult:
        """Classify request complexity using heuristics."""
        score = 0.0
        reasons = []

        # 1. Token count (weight: 0.3)
        user_messages = [msg for msg in request.messages if msg.role == "user"]
        total_tokens = sum(len(self.encoder.encode(msg.content)) for msg in user_messages)

        if total_tokens > self.LONG_PROMPT_TOKENS:
            # Progressive scoring based on how far above threshold
            excess_ratio = (total_tokens - self.LONG_PROMPT_TOKENS) / self.LONG_PROMPT_TOKENS
            token_score = min(1.0, 0.5 + excess_ratio)
            score += token_score * 0.3
            reasons.append(f"Long prompt ({total_tokens} tokens)")

        # 2. Conversation length (weight: 0.2)
        num_turns = len([msg for msg in request.messages if msg.role in ["user", "assistant"]])
        if num_turns >= self.MANY_TURNS:
            turn_score = min(1.0, num_turns / (self.MANY_TURNS * 2))
            score += turn_score * 0.2
            reasons.append(f"Long conversation ({num_turns} turns)")

        # 3. Code blocks (weight: 0.2)
        combined_content = " ".join(msg.content for msg in request.messages)
        code_blocks = len(re.findall(r"```[\s\S]*?```", combined_content))
        if code_blocks > 0:
            score += min(1.0, code_blocks / 3) * 0.2
            reasons.append(f"Contains code ({code_blocks} blocks)")

        # 4. Complexity keywords (weight: 0.2)
        content_lower = combined_content.lower()
        complex_keyword_count = sum(1 for kw in self.COMPLEX_KEYWORDS if kw in content_lower)
        simple_keyword_count = sum(1 for kw in self.SIMPLE_KEYWORDS if kw in content_lower)

        if complex_keyword_count > simple_keyword_count:
            keyword_score = min(1.0, complex_keyword_count / 3)
            score += keyword_score * 0.2
            reasons.append(f"Complex keywords ({complex_keyword_count})")
        elif simple_keyword_count > 0:
            score -= 0.1  # Slight penalty for simple keywords
            reasons.append("Simple keywords detected")

        # 5. Structural complexity (weight: 0.1)
        # Lists, numbered steps, multiple questions
        has_list = bool(re.search(r"^\s*[-*]\s", combined_content, re.MULTILINE))
        has_numbered = bool(re.search(r"^\s*\d+\.\s", combined_content, re.MULTILINE))
        question_count = combined_content.count("?")

        if has_list or has_numbered or question_count > 2:
            score += 0.1
            reasons.append("Structured/multi-part query")

        # Normalize score to 0-1
        score = max(0.0, min(1.0, score))

        # Determine tier (threshold: 0.5)
        tier = ComplexityTier.COMPLEX if score >= 0.5 else ComplexityTier.SIMPLE

        reason = f"Score: {score:.2f}. " + "; ".join(reasons) if reasons else f"Score: {score:.2f}"

        return ClassificationResult(
            tier=tier,
            score=score,
            reason=reason,
            classifier_type="heuristic",
        )
