#!/usr/bin/env python3
"""
AgentBase migration runner.
Applies new SQL migration files in supabase/migrations/ to the target Supabase project.
Tracks applied migrations in a _schema_migrations table so nothing runs twice.

Connects via direct Postgres (psql) — bypasses Cloudflare which blocks the HTTP Management API.

Usage:
  python3 scripts/migrate.py

Environment variables required:
  DATABASE_URL  - Full postgres connection string
                  e.g. postgresql://postgres:<password>@db.lecsqzctdfjwencberdj.supabase.co:5432/postgres
"""

import os
import sys
import subprocess
import tempfile
from pathlib import Path

DATABASE_URL = os.environ.get("DATABASE_URL")
MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"


def run_sql(sql: str) -> list[dict]:
    """Execute SQL via psql and return rows as list of dicts."""
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL environment variable is not set")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as f:
        # Output as CSV for easy parsing
        f.write("\\pset format csv\n")
        f.write("\\pset tuples_only on\n")
        f.write(sql)
        tmp_path = f.name

    try:
        result = subprocess.run(
            ["psql", DATABASE_URL, "-f", tmp_path, "--no-psqlrc", "-q"],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"psql error: {result.stderr.strip()}")
        return result.stdout.strip()
    finally:
        os.unlink(tmp_path)


def run_sql_file(path: Path):
    """Execute a SQL file directly via psql."""
    result = subprocess.run(
        ["psql", DATABASE_URL, "-f", str(path), "--no-psqlrc", "-q"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql error: {result.stderr.strip()}")
    if result.stderr.strip():
        # psql prints notices to stderr — only fail on actual errors
        for line in result.stderr.strip().splitlines():
            if "ERROR" in line:
                raise RuntimeError(f"SQL error: {result.stderr.strip()}")


def ensure_migrations_table():
    run_sql("""
        CREATE TABLE IF NOT EXISTS _schema_migrations (
            filename TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)


def get_applied_migrations() -> set:
    output = run_sql("SELECT filename FROM _schema_migrations ORDER BY filename;")
    if not output:
        return set()
    return {line.strip().strip('"') for line in output.splitlines() if line.strip()}


def schema_exists() -> bool:
    output = run_sql("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'profiles';
    """)
    return output.strip() == "1"


def seed_prior_migrations(migration_files: list):
    """
    First run after switching to automated migrations: mark all but the last
    migration as already applied (they were run manually before this pipeline existed).
    """
    print("Existing schema detected — seeding prior migration history.")
    to_seed = migration_files[:-1]
    if not to_seed:
        return
    values = ", ".join(f"('{f}')" for f in to_seed)
    run_sql(f"""
        INSERT INTO _schema_migrations (filename)
        VALUES {values}
        ON CONFLICT (filename) DO NOTHING;
    """)
    print(f"  Marked {len(to_seed)} prior migration(s) as applied.")


def main():
    print("AgentBase migration runner")

    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set.", file=sys.stderr)
        sys.exit(1)

    # Check psql is available
    result = subprocess.run(["which", "psql"], capture_output=True)
    if result.returncode != 0:
        print("ERROR: psql not found. Install PostgreSQL client tools.", file=sys.stderr)
        sys.exit(1)

    migration_files = sorted(
        f.name for f in MIGRATIONS_DIR.glob("*.sql") if f.is_file()
    )

    if not migration_files:
        print("No migration files found.")
        return

    print(f"Found {len(migration_files)} migration file(s).")

    ensure_migrations_table()
    applied = get_applied_migrations()

    # First run with existing schema — seed prior migrations
    if not applied and schema_exists():
        seed_prior_migrations(migration_files)
        applied = get_applied_migrations()

    pending = [f for f in migration_files if f not in applied]

    if not pending:
        print("All migrations already applied. Nothing to do.")
        return

    print(f"{len(pending)} migration(s) to apply: {', '.join(pending)}")

    for filename in pending:
        print(f"  Applying {filename}...")
        run_sql_file(MIGRATIONS_DIR / filename)
        run_sql(f"INSERT INTO _schema_migrations (filename) VALUES ('{filename}') ON CONFLICT (filename) DO NOTHING;")
        print(f"  ✓ {filename} done.")

    print(f"\nDone. {len(pending)} migration(s) applied.")


if __name__ == "__main__":
    main()
