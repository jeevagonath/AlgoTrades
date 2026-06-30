import { supabase } from '../services/supabase.service';

async function main() {
    console.log('Fetching logs...');
    const { data: logs, error } = await supabase
        .from('system_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
    if (error) console.error(error);
    console.log(`Found ${logs?.length || 0} logs:`);
    (logs || []).reverse().forEach((log: any) => {
        console.log(`[${log.time}] ${log.msg}`);
    });
}

main().catch(console.error);
