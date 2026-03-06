-- 079 - Tldraw canvas snapshots (per-user persistence)
-- Stores the JSON blob from tldraw store.getSnapshot() keyed by user id.

CREATE TABLE IF NOT EXISTS tldraw_snapshots (
  user_id  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tldraw_snapshots ENABLE ROW LEVEL SECURITY;

-- RLS: only the owning user can see their own row
CREATE POLICY "Users read own tldraw snapshot"
  ON tldraw_snapshots FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users upsert own tldraw snapshot"
  ON tldraw_snapshots FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------
-- RPC: upsert snapshot (SECURITY DEFINER so it works even without RLS
-- when called from the agent path or other contexts)
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_upsert_tldraw_snapshot(p_snapshot jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tldraw_snapshots (user_id, snapshot, updated_at)
  VALUES (auth.uid(), p_snapshot, now())
  ON CONFLICT (user_id)
  DO UPDATE SET snapshot = p_snapshot, updated_at = now();
END;
$$;

-- -----------------------------------------------------------------------
-- RPC: load snapshot (SECURITY DEFINER)
-- -----------------------------------------------------------------------

CREATE OR REPLACE FUNCTION rpc_load_tldraw_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
BEGIN
  SELECT snapshot INTO v_snapshot
  FROM tldraw_snapshots
  WHERE user_id = auth.uid();

  RETURN v_snapshot;  -- NULL if no row exists
END;
$$;

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
