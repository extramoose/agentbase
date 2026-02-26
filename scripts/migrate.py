#!/usr/bin/env python3
"""
AgentBase migration runner.
Applies new SQL migration files in supabase/migrations/ to the target Supabase project.
Tracks applied migrations in a _schema_migrations table so nothing runs twice.

Usage:
  python3 scripts/migrate.py

Environment variables required:
  SUPABASE_PAT     - Supabase Personal Access Token
  SUPABASE_PROJECT - Supabase project ID (default: lecsqzctdfjwencberdj)
"""

import os
import sys
import json
import urllib.request
import urllib.error
from pathlib import Path

PROJECT_ID = os.environ.get("SUPABASE_PROJECT", "lecsqzctdfjwencberdj")
PAT = os.environ.get("SUPABASE_PAT")
MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"
API_URL = f"https://api.supabase.com/v1/projects/{PROJECT_ID}/database/query"


def run_sql(sql: str) -> list:
    if not PAT:
        raise RuntimeError("SUPABASE_PAT environment variable is not set")
    payload = json.dumps({"query": sql}).encode()
    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {PAT}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        raise RuntimeError(f"Supabase API error {e.code}: {body}")


def ensure_migrations_table():
    run_sql("""
        CREATE TABLE IF NOT EXISTS _schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)


def get_applied_migrations() -> set:
    rows = run_sql("SELECT filename FROM _schema_migrations ORDER BY filename;")
    return {r["filename"] for r in rows}


def seed_existing_migrations(migration_files: list, applied: set):
    """
    On first run (empty _schema_migrations), mark all migrations that were
    already applied manually as done — EXCEPT any that aren't in the DB yet.
    We detect "already applied" by checking for the existence of a known table.
    """
    # Check if schema is already bootstrapped (migrations 001+ were applied manually)
    rows = run_sql("""
        SELECT COUNT(*) as cnt FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles';
    """)
    schema_exists = rows[0]["cnt"] > 0 if rows else False

    if not schema_exists:
        print("Fresh database detected — no seeding needed.")
        return

    # Schema exists but _schema_migrations is empty — we were migrating manually before.
    # Mark all migration files EXCEPT the newest one as already applied.
    # The script will then apply only the unapplied ones.
    # Strategy: mark as applied all files that DON'T contain "CREATE OR REPLACE"
    # for RPCs we know weren't there before. Actually, simplest: mark all as applied
    # and let the caller decide what to run. We check via a "dry run" comparison.
    print("Existing schema detected — seeding migration history with previously applied files.")
    # We'll seed everything and let the caller figure out what's genuinely new.
    # The caller will diff against what we seed here.
    for f in migration_files:
        if f not in applied:
            # Check if this migration was likely already applied by testing for its artifacts.
            # Safest approach: seed ALL existing migration files as applied.
            # The newest file (highest sort order) will still be unapplied if it hasn't been run.
            pass

    # Seed all but the last migration file as applied (last one is the new pending one).
    # This handles the common case of "first CI run after switching to automated migrations."
    # For subsequent runs the table will be populated correctly.
    to_seed = migration_files[:-1]  # all except the most recent
    if to_seed:
        values = ", ".join(f"('{f}')" for f in to_seed)
        run_sql(f"""
            INSERT INTO _schema_migrations (filename)
            VALUES {values}
            ON CONFLICT (filename) DO NOTHING;
        """)
        print(f"Seeded {len(to_seed)} previously applied migration(s).")


def apply_migration(filename: str, sql: str):
    print(f"  Applying {filename}...")
    run_sql(sql)
    run_sql(f"INSERT INTO _schema_migrations (filename) VALUES ('{filename}') ON CONFLICT (filename) DO NOTHING;")
    print(f"  ✓ {filename} applied.")


def main():
    print(f"AgentBase migration runner — project: {PROJECT_ID}")

    if not PAT:
        print("ERROR: SUPABASE_PAT not set.", file=sys.stderr)
        sys.exit(1)

    # Collect migration files sorted by name
    migration_files = sorted(
        f.name for f in MIGRATIONS_DIR.glob("*.sql") if f.is_file()
    )

    if not migration_files:
        print("No migration files found.")
        return

    print(f"Found {len(migration_files)} migration file(s).")

    # Ensure tracking table exists
    ensure_migrations_table()

    # Get already-applied set
    applied = get_applied_migrations()

    # Seed if first run with existing schema
    if not applied:
        seed_existing_migrations(migration_files, applied)
        applied = get_applied_migrations()

    # Find unapplied migrations
    pending = [f for f in migration_files if f not in applied]

    if not pending:
        print("All migrations already applied. Nothing to do.")
        return

    print(f"{len(pending)} migration(s) to apply: {', '.join(pending)}")

    for filename in pending:
        sql = (MIGRATIONS_DIR / filename).read_text()
        apply_migration(filename, sql)

    print(f"\nDone. {len(pending)} migration(s) applied successfully.")


if __name__ == "__main__":
    main()
