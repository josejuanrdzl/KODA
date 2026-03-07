-- Alter users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'starter';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_status TEXT DEFAULT 'trial';
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS billing_currency TEXT DEFAULT 'usd';
ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_admin_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Create plan_limits table
CREATE TABLE IF NOT EXISTS plan_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  plan TEXT UNIQUE NOT NULL,
  messages_per_day INTEGER NOT NULL,
  memory_days INTEGER NOT NULL,
  max_notes INTEGER NOT NULL,
  max_reminders INTEGER NOT NULL,
  journal_enabled BOOLEAN DEFAULT true,
  proactive_enabled BOOLEAN DEFAULT true,
  message_analysis_enabled BOOLEAN DEFAULT true,
  shared_spaces INTEGER DEFAULT 0,
  max_users INTEGER DEFAULT 1,
  ryse_integration BOOLEAN DEFAULT false
);

-- Seed plan limits
INSERT INTO plan_limits (plan, messages_per_day, memory_days, max_notes, max_reminders, journal_enabled, proactive_enabled, message_analysis_enabled, shared_spaces, max_users, ryse_integration)
VALUES 
  ('starter', 15, 30, 50, 5, true, true, true, 0, 1, false),
  ('basic', 100, 180, 500, 20, true, true, true, 0, 1, false),
  ('executive', -1, -1, -1, -1, true, true, true, 1, 3, false),
  ('corporate', -1, -1, -1, -1, true, true, true, 5, 5, true)
ON CONFLICT (plan) DO UPDATE SET 
  messages_per_day = EXCLUDED.messages_per_day,
  memory_days = EXCLUDED.memory_days,
  max_notes = EXCLUDED.max_notes,
  max_reminders = EXCLUDED.max_reminders,
  journal_enabled = EXCLUDED.journal_enabled,
  proactive_enabled = EXCLUDED.proactive_enabled,
  message_analysis_enabled = EXCLUDED.message_analysis_enabled,
  shared_spaces = EXCLUDED.shared_spaces,
  max_users = EXCLUDED.max_users,
  ryse_integration = EXCLUDED.ryse_integration;

-- Create subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount DECIMAL(10, 2),
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Create team_members table
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  member_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  joined_at TIMESTAMP WITH TIME ZONE
);
