import hashlib
import json
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException

from .planning import serialize_wedding


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, path):
        self.path = str(path)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS weddings (
                    id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, brief TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft',
                    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS messages (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    wedding_id TEXT NOT NULL REFERENCES weddings(id),
                    role TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS messages_wedding ON messages(wedding_id, sequence);
                CREATE TABLE IF NOT EXISTS requests (
                    wedding_id TEXT NOT NULL REFERENCES weddings(id), request_id TEXT NOT NULL,
                    payload_hash TEXT NOT NULL, response TEXT NOT NULL,
                    PRIMARY KEY(wedding_id, request_id)
                );
                CREATE TABLE IF NOT EXISTS vendor_selections (
                    wedding_id TEXT PRIMARY KEY REFERENCES weddings(id), revision INTEGER NOT NULL,
                    criteria TEXT NOT NULL, shortlisted_ids TEXT NOT NULL,
                    reviewed_brief_revision INTEGER
                );
            """)

    @contextmanager
    def connection(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, brief):
        wedding_id, token, timestamp = str(uuid4()), secrets.token_urlsafe(32), now()
        with self.connection() as db:
            db.execute("INSERT INTO weddings(id, token_hash, brief, created_at, updated_at) VALUES(?,?,?,?,?)",
                       (wedding_id, hashlib.sha256(token.encode()).hexdigest(), brief.model_dump_json(), timestamp, timestamp))
            row = db.execute("SELECT * FROM weddings WHERE id=?", (wedding_id,)).fetchone()
        return {"wedding": serialize_wedding(row), "access_token": token}

    def get(self, wedding_id, token):
        with self.connection() as db:
            row = db.execute("SELECT * FROM weddings WHERE id=?", (wedding_id,)).fetchone()
        digest = hashlib.sha256((token or "").encode()).hexdigest()
        if not row or not secrets.compare_digest(row["token_hash"], digest):
            raise HTTPException(404, {"code": "wedding_not_found", "message": "Wedding not found or access token is invalid"})
        return row

    def history(self, wedding_id, limit=100):
        with self.connection() as db:
            rows = db.execute("SELECT role, content, created_at FROM messages WHERE wedding_id=? ORDER BY sequence DESC LIMIT ?",
                              (wedding_id, limit)).fetchall()
        return [dict(row) for row in reversed(rows)]

    def replay(self, wedding_id, request_id, payload_hash):
        with self.connection() as db:
            row = db.execute("SELECT * FROM requests WHERE wedding_id=? AND request_id=?",
                             (wedding_id, request_id)).fetchone()
        if row:
            if row["payload_hash"] != payload_hash:
                raise HTTPException(409, "request_id has already been used with different input")
            return json.loads(row["response"])

    def save(self, wedding_id, expected_revision, brief, status, messages=(), request=None, response_factory=None):
        with self.connection() as db:
            # Serialize writers before checking idempotency and revision.
            db.execute("BEGIN IMMEDIATE")
            if request:
                existing = db.execute("SELECT * FROM requests WHERE wedding_id=? AND request_id=?",
                                      (wedding_id, request[0])).fetchone()
                if existing:
                    if existing["payload_hash"] != request[1]:
                        raise HTTPException(409, "request_id has already been used with different input")
                    return json.loads(existing["response"])
            cursor = db.execute("""UPDATE weddings SET brief=?, revision=revision+1, status=?, updated_at=?
                                   WHERE id=? AND revision=?""",
                                (brief.model_dump_json(), status, now(), wedding_id, expected_revision))
            if cursor.rowcount != 1:
                raise HTTPException(409, "The wedding changed. Fetch the latest revision and retry.")
            for role, content in messages:
                db.execute("INSERT INTO messages(wedding_id, role, content, created_at) VALUES(?,?,?,?)",
                           (wedding_id, role, content, now()))
            row = db.execute("SELECT * FROM weddings WHERE id=?", (wedding_id,)).fetchone()
            wedding = serialize_wedding(row)
            response = response_factory(wedding) if response_factory else {"wedding": wedding}
            if request:
                db.execute("INSERT INTO requests VALUES(?,?,?,?)",
                           (wedding_id, request[0], request[1], json.dumps(response)))
            return response
