"""Expose only signed messaging callbacks, never the planner API, through a tunnel.

Run: backend/.venv/bin/uvicorn webhook_proxy:app --app-dir backend --host 127.0.0.1 --port 8001
"""
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response


def create_proxy(client=None):
    @asynccontextmanager
    async def lifespan(app):
        app.state.client = client or httpx.AsyncClient(timeout=10, follow_redirects=False)
        try:
            yield
        finally:
            if client is None:
                await app.state.client.aclose()

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)

    async def forward(request):
        raw = bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw) > 1_000_000:
                raise HTTPException(413, 'Webhook body too large')
        target = 'http://127.0.0.1:8000' + request.url.path
        if request.url.query:
            target += '?' + request.url.query
        headers = {key: request.headers[key] for key in ['content-type', 'x-twilio-signature', 'x-hub-signature-256'] if key in request.headers}
        try:
            response = await app.state.client.request(request.method, target, content=bytes(raw), headers=headers)
        except httpx.HTTPError:
            raise HTTPException(503, 'Messaging backend unavailable') from None
        return Response(content=response.content, status_code=response.status_code,
                        headers={'Content-Type': response.headers.get('content-type', 'text/plain')})

    @app.post('/webhooks/twilio/whatsapp')
    @app.post('/webhooks/twilio/status')
    @app.post('/webhooks/whatsapp')
    @app.get('/webhooks/whatsapp')
    async def webhook(request: Request):
        return await forward(request)

    return app


app = create_proxy()
