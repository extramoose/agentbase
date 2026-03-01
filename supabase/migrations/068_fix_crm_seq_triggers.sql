-- The per-tenant seq triggers for CRM + library were lost when 062 was emptied
-- Only tasks got its trigger recreated (in 066). Fix the rest.

DROP TRIGGER IF EXISTS trg_companies_per_tenant_seq ON companies;
CREATE TRIGGER trg_companies_per_tenant_seq BEFORE INSERT ON companies
  FOR EACH ROW EXECUTE FUNCTION set_per_tenant_seq();

DROP TRIGGER IF EXISTS trg_people_per_tenant_seq ON people;
CREATE TRIGGER trg_people_per_tenant_seq BEFORE INSERT ON people
  FOR EACH ROW EXECUTE FUNCTION set_per_tenant_seq();

DROP TRIGGER IF EXISTS trg_deals_per_tenant_seq ON deals;
CREATE TRIGGER trg_deals_per_tenant_seq BEFORE INSERT ON deals
  FOR EACH ROW EXECUTE FUNCTION set_per_tenant_seq();

DROP TRIGGER IF EXISTS trg_library_items_per_tenant_seq ON library_items;
CREATE TRIGGER trg_library_items_per_tenant_seq BEFORE INSERT ON library_items
  FOR EACH ROW EXECUTE FUNCTION set_per_tenant_seq();

NOTIFY pgrst, 'reload schema';
