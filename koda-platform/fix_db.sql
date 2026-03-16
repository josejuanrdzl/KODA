INSERT INTO koda_commands
  (trigger_type, trigger_value, module_slug, intent, priority, plan_required, is_active)
VALUES
  ('exact','dolar','fx-rates','get_rate',10,'free', true),
  ('exact','tipo de cambio','fx-rates','get_rate',10,'free', true),
  ('exact','usd','fx-rates','get_rate',10,'free', true),
  ('exact','usd/mxn','fx-rates','get_rate',10,'free', true)
ON CONFLICT DO NOTHING;
