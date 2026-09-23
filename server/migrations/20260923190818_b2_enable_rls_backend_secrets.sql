-- Enable RLS on private secrets table (defense in depth).
-- No policies for anon/authenticated → Data API denied.
-- SECURITY DEFINER functions (table owner) still read secrets.

ALTER TABLE miplan_private.backend_secrets ENABLE ROW LEVEL SECURITY;
