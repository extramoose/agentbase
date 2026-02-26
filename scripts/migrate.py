#!/usr/bin/env python3
"""
AgentBase migration runner.
Applies new SQL migration files in supabase/migrations/ to the target Supabase project.
Tracks applied migrations in a _schema_migrations table so nothing runs twice.

Connects via direct Postgres (psql) — bypasses Cloudflare which blocks the HTTP Management API.
Uses PG* env vars (not DATABASE_URL) so PGHOSTADDR is respected for IPv4 forcing.

Usage:
  python3 scripts/migrate.py

Environment variables required:
  PGHOST      - Supabase DB hostname
  PGPASSWORD  - Postgres password
  PGUSER      - postgres
  PGDATABASE  - postgres
  PGPORT      - 5432
  PGSSLMODE   - require
  PGHOSTADDR  - (optional) IPv4 address to force IPv4 connection
"""

import os
import sys
import socket
import subprocess
import tempfile
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent.parent / "supabase" / "migrations"


def force_ipv4():
    """
    Resolve PGHOST to IPv4 and replace it directly.
    GitHub Actions runners have no IPv6, so psql's default DNS (which returns AAAA first)
    causes 'Network is unreachable'. Replacing PGHOST with the numeric IPv4 skips DNS.
    sslmode=require encrypts without validating the cert hostname, so the IP swap is safe.
    """
    host = os.environ.get("PGHOST", "")
    if not host or host.replace(".", "").isdigit():
        return  # Already an IP, nothing to do
    try:
        results = socket.getaddrinfo(host, 5432, socket.AF_INET)
        ipv4 = results[0][4][0]
        os.environ["PGHOST"] = ipv4
        print(f"  Resolved {host} → {ipv4} (IPv4 forced)")
        sys.stdout.flush()
    except Exception as e:
        print(f"  Warning: IPv4 resolution failed ({e}), psql may try IPv6")
        sys.stdout.flush()


def run_sql(sql: str) -> str:
    """Execute SQL via psql using PG* env vars. Returns stdout."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False) as f:
        f.write("\\pset format unaligned\n")
        f.write("\\pset tuples_only on\n")
        f.write(sql)
        tmp_path = f.name

    try:
        result = subprocess.run(
            ["psql", "--no-psqlrc", "-q", "-f", tmp_path],
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
        ["psql", "--no-psqlrc", "-q", "-f", str(path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"psql error: {result.stderr.strip()}")
    if result.stderr.strip():
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

    if not os.environ.get("PGPASSWORD"):
        print("ERROR: PGPASSWORD not set. Set PG* environment variables.", file=sys.stderr)
        sys.exit(1)

    force_ipv4()

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
