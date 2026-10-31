"""Exercise the real OpenAI SDK/structured-output boundary without network or spend."""
import asyncio
import json

import httpx
import pytest
from openai import AsyncOpenAI

from app.agents import PreferencesAgent
from app.models import BriefPatch, PreferenceResult, WeddingBrief


@pytest.mark.parametrize("refusal", [False, True])
def test_sdk_structured_output_and_refusal(refusal):
    captured = []
    result = PreferenceResult(updates=BriefPatch(guests="100"), reply="Updated the guest count.", questions=[])

    def handle(request):
        body = json.loads(request.content)
        captured.append(body)
        content = [{"type": "refusal", "refusal": "Cannot process this request"}] if refusal else [
            {"type": "output_text", "text": result.model_dump_json(), "annotations": []}
        ]
        return httpx.Response(200, json={
            "id": "resp_test", "object": "response", "created_at": 1793404800,
            "model": "gpt-4o-mini", "status": "completed",
            "output": [{"id": "msg_test", "type": "message", "role": "assistant", "status": "completed", "content": content}],
        })

    async def exercise():
        agent = PreferencesAgent("test-key-not-real", "gpt-4o-mini")
        await agent.close()
        agent.client = AsyncOpenAI(api_key="test-key-not-real", http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        try:
            if refusal:
                with pytest.raises(ValueError):
                    await agent.extract(WeddingBrief(), [], "100 guests")
            else:
                parsed = await agent.extract(WeddingBrief(notes="Halal food"), [{"role": "user", "content": "Hello"}], "100 guests")
                assert parsed.updates.guests == "100"
                assert parsed.updates.notes is None
        finally:
            await agent.close()

    asyncio.run(exercise())
    body = captured[0]
    assert body["store"] is False
    assert body["text"]["format"]["type"] == "json_schema"
    assert body["text"]["format"]["strict"] is True
    assert body["text"]["format"]["schema"]["additionalProperties"] is False
    assert body["input"][-1]["content"] == "100 guests"
