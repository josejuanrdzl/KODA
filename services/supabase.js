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

async function getAllUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*');

  if (error) throw error;
  return data || [];
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

async function getDailyMessageCount(user_id) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('conversations')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user_id)
    .eq('role', 'user')
    .gte('created_at', todayStart.toISOString());

  if (error) throw error;
  return count || 0;
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

async function saveJournalEntry(user_id, content, mood_score, mood_label, summary) {
  // Get today's start and end to check if an entry exists
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { data: existing } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', user_id)
    .gte('created_at', todayStart.toISOString())
    .lte('created_at', todayEnd.toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    // Update
    const { error } = await supabase
      .from('journal_entries')
      .update({ content, mood_score: parseInt(mood_score), mood_label, summary })
      .eq('id', existing[0].id);
    if (error) throw error;
  } else {
    // Insert
    const entry_date = new Date().toISOString().split('T')[0];
    const { error } = await supabase
      .from('journal_entries')
      .insert([{ user_id, entry_date, content, mood_score: parseInt(mood_score), mood_label, summary }]);
    if (error) throw error;
  }
}

async function getRecentJournalEntries(user_id, limit = 7) {
  const { data, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function saveEmotionalTimeline(user_id, mood_score, mood_label, mood_source) {
  const { error } = await supabase
    .from('emotional_timeline')
    .insert([{ user_id, mood_score: parseInt(mood_score), mood_label, mood_source }]);

  if (error) throw error;
}

async function getEmotionalTimeline(user_id, limit = 30) {
  const { data, error } = await supabase
    .from('emotional_timeline')
    .select('*')
    .eq('user_id', user_id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

async function saveMessageAnalysis(user_id, original_message, sender_alias, tone, summary) {
  const { error } = await supabase
    .from('message_analysis')
    .insert([{ user_id, original_message, sender_alias, tone_detected: tone, analysis_summary: summary }]);

  if (error) throw error;
}

module.exports = {
  supabase,
  getUserByTelegramId,
  createUser,
  updateUser,
  getAllUsers,
  getRecentMessages,
  getDailyMessageCount,
  saveMessage,
  saveNote,
  getRecentNotes,
  saveReminder,
  getActiveReminders,
  markReminderSent,
  saveMemory,
  getRecentMemories,
  saveJournalEntry,
  getRecentJournalEntries,
  saveEmotionalTimeline,
  getEmotionalTimeline,
  saveMessageAnalysis
};
