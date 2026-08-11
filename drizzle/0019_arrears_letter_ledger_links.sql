-- 공문 ↔ 원장(코드) 수동/자동 연결 (원장 반영 전 스테이징)
CREATE TABLE IF NOT EXISTS arrears_letter_ledger_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_soft_key TEXT NOT NULL,
  letter_company_name TEXT NOT NULL DEFAULT '',
  letter_filename TEXT NOT NULL DEFAULT '',
  manager_name TEXT NOT NULL DEFAULT '',
  ledger_external_code TEXT NOT NULL DEFAULT '',
  ledger_company_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'manual',
  updated_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS arrears_letter_ledger_links_soft_uidx
  ON arrears_letter_ledger_links (letter_soft_key);

CREATE INDEX IF NOT EXISTS arrears_letter_ledger_links_ledger_code_idx
  ON arrears_letter_ledger_links (ledger_external_code);
