-- 053: Reload PostgREST schema cache after function signature changes in 051/052
NOTIFY pgrst, 'reload schema';
