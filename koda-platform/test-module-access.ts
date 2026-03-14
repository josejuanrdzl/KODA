import { checkModuleAccess } from './lib/backend/module.router.js';
const { getUserByTelegramId } = require('./lib/backend/services/supabase.js');

async function test() {
  try {
    const user = await getUserByTelegramId('390509861');
    const access = await checkModuleAccess(user, 'familia');
    console.log("Access to familia:", access);
  } catch (err) {
    console.error("Test error:", err);
  }
}
test();
