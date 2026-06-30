import { supabase } from '../services/supabase.service';

async function main() {
    const { data, error } = await supabase
        .from('manual_expiry_settings')
        .select('*')
        .eq('is_active', true);

    if (error) console.error(error);
    console.log(`Found ${data?.length || 0} active manual expiries:`);
    (data || []).forEach((d: any) => {
        console.log(d.expiry_date);
    });
}

main().catch(console.error);
