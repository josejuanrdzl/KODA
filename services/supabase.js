if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ ignoreEnvFile: true, silent: true });
}
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getUserByTelegramId(telegram_id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('telegram_id', telegram_id.toString())
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching user:', error);
  }
  return data;
}

async function createUser(userData) {
  const { data, error } = await supabase
    .from('users')
    .insert([userData])
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function updateUser(id, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getRecentMessages(user_id, limit = 10) {
  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data ? data.reverse() : [];
}

async function saveMessage(messageData) {
  const { error } = await supabase
    .from('conversations')
    .insert([messageData]);

  if (error) throw error;
}

async function saveNote(user_id, content, tag) {
  // Review duplicates
  const { data: existingNotes, error: searchError } = await supabase
    .from('notes')
    .select('id')
    .eq('user_id', user_id)
    .eq('content', content)
    .limit(1);

  if (!searchError && existingNotes && existingNotes.length > 0) {
    console.log('Skipping duplicate note save');
    return;
  }

  const { error } = await supabase
    .from('notes')
    .insert([{ user_id, content, tag }]);

  if (error) throw error;
}

async function getRecentNotes(user_id, limit = 5) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function saveReminder(user_id, content, remind_at) {
  const { error } = await supabase
    .from('reminders')
    .insert([{ user_id, content, remind_at }]);

  if (error) throw error;
}

async function getActiveReminders(user_id = null) {
  let query = supabase
    .from('reminders')
    .select('*, users(telegram_id)')
    .eq('status', 'active');

  if (user_id) {
    query = query.eq('user_id', user_id);
  }

  const { data, error } = await query.order('remind_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function markReminderSent(id) {
  const { error } = await supabase
    .from('reminders')
    .update({ status: 'sent' })
    .eq('id', id);

  if (error) throw error;
}

async function saveMemory(user_id, category, key, value, context) {
  const { error } = await supabase
    .from('memories')
    .insert([{ user_id, category, key, value, context }]);

  if (error) throw error;
}

async function getRecentMemories(user_id, limit = 10) {
  const { data, error } = await supabase
    .from('memories')
    .select('*')
    .eq('user_id', user_id)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

module.exports = {
  supabase,
  getUserByTelegramId,
  createUser,
  updateUser,
  getRecentMessages,
  saveMessage,
  saveNote,
  getRecentNotes,
  saveReminder,
  getActiveReminders,
  markReminderSent,
  saveMemory,
  getRecentMemories
};
