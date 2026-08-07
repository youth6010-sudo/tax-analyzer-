-- 우편물대장: 태그·메모 작성자 이력
ALTER TABLE mail_receipts
  ADD COLUMN IF NOT EXISTS memos jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 레거시 string[] 태그 → 작성자 객체
UPDATE mail_receipts
SET tags = (
  SELECT coalesce(
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(elem) = 'string' THEN jsonb_build_object(
          'id', gen_random_uuid()::text,
          'label', trim(both '"' from elem::text),
          'authorName', coalesce(nullif(created_by_name, ''), '알 수 없음'),
          'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
        )
        ELSE elem
      END
    ),
    '[]'::jsonb
  )
  FROM jsonb_array_elements(coalesce(tags, '[]'::jsonb)) AS elem
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_array_elements(coalesce(tags, '[]'::jsonb)) AS e
  WHERE jsonb_typeof(e) = 'string'
);

-- 레거시 memo 텍스트 → memos 배열 (비어 있을 때만)
UPDATE mail_receipts
SET memos = jsonb_build_array(
  jsonb_build_object(
    'id', gen_random_uuid()::text,
    'authorName', coalesce(nullif(created_by_name, ''), '알 수 없음'),
    'body', memo,
    'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  )
)
WHERE trim(coalesce(memo, '')) <> ''
  AND (memos IS NULL OR memos = '[]'::jsonb);
