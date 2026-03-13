const fs = require('fs');
const dotenv = require('dotenv');

const envPath = fs.existsSync('.env.local') ? '.env.local' : '.env';
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function enableAllModules() {
  try {
    const { data: plans, error: planError } = await supabase.from('plans').select('id');
    if (planError) throw planError;
    
    const { data: modules, error: modError } = await supabase.from('modules').select('id');
    if (modError) throw modError;

    const newEntries = [];
    for (const plan of plans) {
      for (const mod of modules) {
        newEntries.push({ plan_id: plan.id, module_id: mod.id });
      }
    }

    const { data, error } = await supabase
      .from('plan_modules')
      .upsert(newEntries, { onConflict: 'plan_id,module_id' })
      .select();

    if (error) throw error;
    console.log('Successfully enabled all modules para all plans. Upserted count:', data ? data.length : 0);
  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

enableAllModules();
