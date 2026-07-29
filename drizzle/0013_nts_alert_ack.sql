-- clients: 휴업 알림 확인(ack)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS nts_alert_acked_at timestamptz,
  ADD COLUMN IF NOT EXISTS nts_alert_acked_code text NOT NULL DEFAULT '';
