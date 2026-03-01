-- 054: Drop old get_activity_log overloads causing PGRST203 ambiguity errors
-- PostgREST can't choose between multiple signatures with different param counts

DROP FUNCTION IF EXISTS get_activity_log(integer, integer, text, uuid, uuid, date, text);
DROP FUNCTION IF EXISTS get_activity_log(integer, integer, text, uuid, uuid, date, text, date);

NOTIFY pgrst, 'reload schema';
