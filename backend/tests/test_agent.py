"""Exercise the real OpenAI SDK/structured-output boundary without network or spend."""
import asyncio
import json

import httpx
import pytest
from openai import AsyncOpenAI
from anthropic import AsyncAnthropic

from app.agents import ClaudePreferencesAgent, PreferencesAgent, configured_agent
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


@pytest.mark.parametrize("stop_reason", ["end_turn", "max_tokens", "refusal"])
def test_claude_sdk_structured_output_and_stop_reason(stop_reason):
    captured = []
    result = PreferenceResult(updates=BriefPatch(guests="100"), reply="Updated to 100 guests.", questions=[])

    def handle(request):
        body = json.loads(request.content)
        captured.append(body)
        assert request.headers["x-api-key"] == "claude-test-key-not-real"
        return httpx.Response(200, json={
            "id": "msg_test", "type": "message", "role": "assistant", "model": "claude-haiku-5-5",
            "content": [{"type": "text", "text": result.model_dump_json()}],
            "stop_reason": stop_reason, "stop_sequence": None,
            "usage": {"input_tokens": 10, "output_tokens": 20},
        })

    async def exercise():
        agent = ClaudePreferencesAgent("claude-test-key-not-real", "claude-haiku-5-5")
        await agent.close()
        agent.client = AsyncAnthropic(api_key="claude-test-key-not-real", http_client=httpx.AsyncClient(transport=httpx.MockTransport(handle)))
        try:
            if stop_reason != "end_turn":
                with pytest.raises(ValueError):
                    await agent.extract(WeddingBrief(), [], "100 guests")
            else:
                parsed = await agent.extract(WeddingBrief(), [], "100 guests")
                assert parsed.updates.guests == "100"
        finally:
            await agent.close()

    asyncio.run(exercise())
    assert captured[0]["output_config"]["format"]["type"] == "json_schema"
    assert captured[0]["messages"][-1]["content"] == "100 guests"


def test_provider_selection_never_reuses_another_providers_key(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "anthropic")
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key-not-real")
    assert configured_agent() is None
    monkeypatch.setenv("AI_PROVIDER", "not-a-provider")
    with pytest.raises(ValueError):
        configured_agent()
