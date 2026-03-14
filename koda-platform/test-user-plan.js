const { getUserByTelegramId } = require('./lib/backend/services/supabase.js');

async function test() {
  try {
    const user = await getUserByTelegramId('390509861');
    console.log("USER object keys:", Object.keys(user));
    console.log("tenant_id:", user.tenant_id);
    console.log("plan:", user.plan);
    console.log("role:", user.role);
  } catch (err) {
    console.error(err);
  }
}
test();
