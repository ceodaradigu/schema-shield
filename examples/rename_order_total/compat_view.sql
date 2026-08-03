-- OFFLINE SNAPSHOT — NO LIVE DATAHUB WRITEBACK
CREATE VIEW schema_shield_compat AS
SELECT
  *,
  gross_amount AS order_total
FROM acme.orders;
