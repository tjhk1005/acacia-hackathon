"""Vercel FastAPI entry point; service routing preserves the request path."""
from fastapi import Request

from app.main import app


@app.middleware('http')
async def planning_api_prefix(request: Request, call_next):
    prefix = '/planning-api'
    path = request.scope['path']
    if path == prefix or path.startswith(prefix + '/'):
        request.scope['path'] = path[len(prefix):] or '/'
        raw_path = request.scope.get('raw_path')
        if raw_path is not None:
            request.scope['raw_path'] = raw_path[len(prefix):] or b'/'
    return await call_next(request)
