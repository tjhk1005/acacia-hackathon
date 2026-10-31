"""Temporary, rate-limited public gateway for the hackathon's local backend.

Only planning API routes are exposed. Wedding-token validation remains upstream.
Developer pages, webhooks and arbitrary upstream destinations are not exposed.
"""
import asyncio
import re
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response, JSONResponse


def create_gateway(client=None, clock=time.monotonic, lifetime=86400, chat_limit=30, create_limit=60):
    started=clock()
    expires=(datetime.now(timezone.utc)+timedelta(seconds=lifetime)).isoformat()
    windows=defaultdict(deque)
    limits={'requests':(600,60),'writes':(120,60),'creates':(create_limit,3600),'ai':(chat_limit,3600)}

    def take(key):
        maximum,seconds=limits[key]
        history=windows[key]
        while history and history[0]<=clock()-seconds:
            history.popleft()
        if len(history)>=maximum:
            raise HTTPException(429,'The public demo limit has been reached. Please try again later.',headers={'Retry-After':str(seconds)})
        history.append(clock())

    @asynccontextmanager
    async def lifespan(app):
        app.state.client=client or httpx.AsyncClient(timeout=38,follow_redirects=False)
        app.state.ai_slots=asyncio.Semaphore(3)
        try:
            yield
        finally:
            if client is None:
                await app.state.client.aclose()

    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None,lifespan=lifespan)

    @app.api_route('/{path:path}',methods=['GET','POST','PATCH'])
    async def forward(path:str,request:Request):
        if clock()-started>=lifetime:
            raise HTTPException(503,'The temporary demo backend has expired. A hosted backend or a restarted demo connection is needed.')
        allowed=path=='health' or path=='api/weddings' or re.fullmatch(r'api/weddings/[0-9a-fA-F-]{36}(?:/[a-z0-9/-]+)?',path)
        if not allowed or '..' in path or (path=='health' and request.method!='GET'):
            raise HTTPException(404,'Not found')
        take('requests')
        if request.method!='GET':take('writes')
        if path=='api/weddings' and request.method=='POST':take('creates')
        raw=bytearray()
        async for chunk in request.stream():
            raw.extend(chunk)
            if len(raw)>1_000_000:
                raise HTTPException(413,'Request is too large for the public demo')
        target='http://127.0.0.1:8000/'+path
        headers={key:request.headers[key] for key in ('content-type','x-wedding-token') if key in request.headers}
        ai_call=request.method=='POST' and (path.endswith('/chat') or path.endswith('/refine'))

        async def send():
            try:
                result=await app.state.client.request(request.method,target,params=request.query_params,
                    content=bytes(raw),headers=headers)
            except httpx.HTTPError:
                raise HTTPException(503,'The demo planning backend is temporarily unavailable.') from None
            if path=='health' and result.status_code==200:
                payload=result.json()
                payload.update(backend_hosting='temporary_demo',demo_expires_at=expires)
                return JSONResponse(payload,headers={'Cache-Control':'no-store'})
            return Response(content=result.content,status_code=result.status_code,
                headers={'Content-Type':result.headers.get('content-type','application/json'),'Cache-Control':'no-store'})

        if ai_call:
            # Three demo users can work at once; failed authentication does not
            # consume the model budget. No token, body or credential is logged.
            try:
                await asyncio.wait_for(app.state.ai_slots.acquire(),timeout=1)
            except asyncio.TimeoutError:
                raise HTTPException(429,'The demo AI is answering another request. Please try again shortly.',headers={'Retry-After':'5'})
            try:
                identity='http://127.0.0.1:8000/'+'/'.join(path.split('/')[:3])
                try:
                    check=await app.state.client.get(identity,headers=headers,timeout=5)
                except httpx.HTTPError:
                    raise HTTPException(503,'The demo backend could not verify this wedding.') from None
                if check.status_code!=200:
                    return Response(content=check.content,status_code=check.status_code,media_type='application/json')
                take('ai')
                return await send()
            finally:
                app.state.ai_slots.release()
        return await send()

    return app


app=create_gateway()
