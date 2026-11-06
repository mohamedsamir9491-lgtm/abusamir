-- حلقة التعلم: كل سؤال للمساعد مع نتيجته وتقييم المستخدم، لمراجعة ما لم يُجب عنه أو قُيّم سلبًا
CREATE TABLE IF NOT EXISTS assistant_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  channel text NOT NULL,                 -- assistant | chat
  scope text,                            -- legal | office | engagement | standard | help | external
  intent text,
  question text NOT NULL,
  answered boolean NOT NULL DEFAULT true,
  weak boolean NOT NULL DEFAULT false,   -- «أقرب ما وجدته»
  answer_head text,                      -- أول سطر من الرد للمراجعة
  rating smallint CHECK (rating IN (-1, 1)),
  note text,
  reviewed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_log_created_idx ON assistant_log(created_at DESC);
