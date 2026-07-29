-- users.menu_prefs: 사이드바·헤더 메뉴 개인화
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS menu_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;
