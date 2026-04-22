import { createClient } from "npm:@supabase/supabase-js@2.104.0";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "sb_secret_YOUR_SERVICE_ROLE_KEY_HERE";
const supabase = createClient("http://127.0.0.1:54321", supabaseServiceRoleKey);

const fallback = await supabase.from('volunteers').select('*').eq('status', 'available').limit(10);
console.log("Fallback result count:", fallback.data?.length);
console.log("Data:", fallback.data);
