"""PostgreSQL connection adapter for the application's SQLite-shaped SQL API."""
import re
import sqlite3
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row


class Row(dict):
    def __getitem__(self, key):
        return list(self.values())[key] if isinstance(key, int) else super().__getitem__(key)


class Cursor:
    def __init__(self, cursor):
        self.cursor = cursor
    @property
    def rowcount(self):
        return self.cursor.rowcount
    def fetchone(self):
        row = self.cursor.fetchone()
        return Row(row) if row is not None else None
    def fetchall(self):
        return [Row(row) for row in self.cursor.fetchall()]
    def __iter__(self):
        return iter(self.fetchall())


def translate(sql):
    sql = sql.strip().rstrip(';')
    sql = sql.replace('INTEGER PRIMARY KEY AUTOINCREMENT', 'BIGSERIAL PRIMARY KEY')
    ignore = bool(re.search(r'INSERT\s+OR\s+IGNORE', sql, re.I))
    sql = re.sub(r'INSERT\s+OR\s+IGNORE', 'INSERT', sql, flags=re.I)
    parts = re.split(r"('(?:''|[^'])*')", sql)
    sql = ''.join(part if i % 2 else part.replace('?', '%s') for i, part in enumerate(parts))
    if ignore:
        sql += ' ON CONFLICT DO NOTHING'
    return sql


class Connection:
    def __init__(self, db):
        self.db = db
    def execute(self, sql, parameters=()):
        if sql.strip().upper().startswith('PRAGMA TABLE_INFO'):
            table = re.search(r'\((\w+)\)', sql).group(1)
            return Cursor(self.db.execute('SELECT column_name AS name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=%s', (table,)))
        if sql.strip().upper().startswith(('PRAGMA ', 'BEGIN IMMEDIATE')):
            return Cursor(self.db.execute('SELECT 1 WHERE FALSE'))
        try:
            return Cursor(self.db.execute(translate(sql), parameters))
        except psycopg.IntegrityError as error:
            raise sqlite3.IntegrityError('Database constraint violated') from error
    def executescript(self, sql):
        for statement in sql.split(';'):
            if statement.strip():
                self.execute(statement)


@contextmanager
def connection(url):
    with psycopg.connect(url, row_factory=dict_row, connect_timeout=10) as db:
        # Preserve serialized-write semantics used by idempotency/revision checks.
        # Also serializes schema initialization across cold-starting instances.
        db.execute('SELECT pg_advisory_xact_lock(747381906)')
        yield Connection(db)
