require('dotenv').config();

async function checkSchema() {
    const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/?apikey=${process.env.SUPABASE_SERVICE_ROLE_KEY}`);
    const spec = await response.json();
    console.log(JSON.stringify(spec.definitions.users, null, 2));
}
checkSchema();
