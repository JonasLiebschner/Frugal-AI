"""Manual test script for the classifier."""

import asyncio

from frugal_code.classifier import HeuristicClassifier
from frugal_code.models import ChatCompletionRequest, Message


async def main():
    """Test the classifier with various prompts."""
    classifier = HeuristicClassifier()

    test_cases = [
        "What is 2+2?",
        "Explain the detailed architecture of microservices with code examples",
        "Write a comprehensive analysis of distributed systems patterns",
        "Define machine learning",
        "Analyze and compare the trade-offs between SQL and NoSQL databases",
        "List the planets in our solar system",
        "Debug this code:\n```python\ndef broken():\n    return x / 0\n```",
    ]

    print("=" * 80)
    print("FRUGAL-AI COMPLEXITY CLASSIFIER - MANUAL TEST")
    print("=" * 80)

    for i, content in enumerate(test_cases, 1):
        request = ChatCompletionRequest(messages=[Message(role="user", content=content)])
        result = await classifier.classify(request)

        print(f"\n[Test {i}]")
        print(f"Prompt: {content[:70]}...")
        print(f"  Tier: {result.tier.value.upper()}")
        print(f"  Score: {result.score:.3f}")
        print(f"  Reason: {result.reason}")

    print("\n" + "=" * 80)


if __name__ == "__main__":
    asyncio.run(main())
