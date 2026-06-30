import { supabase } from '../services/supabase.service';

async function main() {
    console.log('Querying specific timeframe (12:50 to 13:00)...');
    const { data: logs, error } = await supabase
        .from('system_logs')
        .select('*')
        .gte('created_at', '2026-06-30T07:20:00.000Z') // 12:50 IST is 07:20 UTC
        .lte('created_at', '2026-06-30T07:35:00.000Z') // 13:05 IST is 07:35 UTC
        .order('created_at', { ascending: true });

    if (error) console.error(error);
    console.log(`Found ${logs?.length || 0} logs:`);
    (logs || []).forEach((log: any) => {
        console.log(`[${log.time}] (${log.created_at}) ${log.msg}`);
    });
}

main().catch(console.error);
