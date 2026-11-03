-- شركات المجموعة داخل ارتباط واحد: كل شركة لها سجل عميل (تابع لعميل المجموعة) وارتباط مكوّن مرتبط بارتباط المجموعة
ALTER TABLE clients ADD COLUMN IF NOT EXISTS parent_client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS clients_parent_idx ON clients(parent_client_id);
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS group_engagement_id UUID REFERENCES engagements(id) ON DELETE CASCADE;
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS entity_role TEXT CHECK (entity_role IN ('subsidiary', 'at_cost'));
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS ownership_pct NUMERIC(12,8);
ALTER TABLE engagements ADD COLUMN IF NOT EXISTS group_setup JSONB;
CREATE INDEX IF NOT EXISTS engagements_group_idx ON engagements(group_engagement_id);
