require('dotenv').config();
const { supabase } = require('./services/supabase');

async function check() {
  const { data, error } = await supabase.from('reminders').select('*').order('created_at', { ascending: false }).limit(20);
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}
check();
