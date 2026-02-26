#!/usr/bin/env python3
"""
AgentBase migration runner.

Applies new SQL migration files in supabase/migrations/ in order.
Tracks applied migrations in a _schema_migrations table so nothing runs twice.

Run from your Mac terminal (requires psql installed):

  DATABASE_URL="postgresql://postgres:<password>@db.lecsqzctdfjwencberdj.supabase.co:5432/postgres" \
  python3 scripts/migrate.py

Get the password from:
  supabase.com/dashboard/project/lecsqzctdfjwencberdj/settings/database
"""

import os
import sys
import subprocess
import tempfile
from pathlib import Path

DATABASE_URL = os.environ.get("DATABASE_URL", "")
MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"


def psql(sql: str) -> str:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as f:
        f.write("\\pset format unaligned\n\\pset tuples_only on\n")
        f.write(sql)
        tmp = f.name
    try:
        r = subprocess.run(["psql", DATABASE_URL, "--no-psqlrc", "-q", "-f", tmp],
                           capture_output=True, text=True)
        if r.returncode != 0:
            raise RuntimeError(r.stderr.strip())
        return r.stdout.strip()
    finally:
        os.unlink(tmp)


def psql_file(path: Path):
    r = subprocess.run(["psql", DATABASE_URL, "--no-psqlrc", "-q", "-f", str(path)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    for line in r.stderr.splitlines():
        if "ERROR" in line:
            raise RuntimeError(r.stderr.strip())


def main():
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set.\n")
        print("Usage:")
        print('  DATABASE_URL="postgresql://postgres:<password>@db.lecsqzctdfjwencberdj.supabase.co:5432/postgres" \\')
        print("  python3 scripts/migrate.py")
        sys.exit(1)

    if subprocess.run(["which", "psql"], capture_output=True).returncode != 0:
        print("ERROR: psql not found. Install with: brew install libpq")
        sys.exit(1)

    files = sorted(f.name for f in MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print("No migration files found.")
        return

    print(f"Found {len(files)} migration file(s).")

    # Ensure tracking table exists
    psql("CREATE TABLE IF NOT EXISTS _schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());")

    applied = set(psql("SELECT filename FROM _schema_migrations;").splitlines())

    # First run with existing schema: seed prior migrations as already applied
    if not applied:
        schema_check = psql("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles';")
        if schema_check.strip() == "1":
            print("Existing schema detected — seeding prior migration history.")
            to_seed = files[:-1]
            if to_seed:
                values = ", ".join(f"('{f}')" for f in to_seed)
                psql(f"INSERT INTO _schema_migrations (filename) VALUES {values} ON CONFLICT DO NOTHING;")
                print(f"  Marked {len(to_seed)} prior migration(s) as applied.")
            applied = set(psql("SELECT filename FROM _schema_migrations;").splitlines())

    pending = [f for f in files if f not in applied]

    if not pending:
        print("All migrations already applied. Nothing to do.")
        return

    print(f"\n{len(pending)} pending: {', '.join(pending)}\n")
    for filename in pending:
        print(f"  Applying {filename}...")
        psql_file(MIGRATIONS_DIR / filename)
        psql(f"INSERT INTO _schema_migrations (filename) VALUES ('{filename}') ON CONFLICT DO NOTHING;")
        print(f"  ✓ Done.")

    print(f"\nAll done. {len(pending)} migration(s) applied.")


if __name__ == "__main__":
    main()
