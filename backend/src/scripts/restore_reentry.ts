
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://anuhnacfmzyjqmoxmubg.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_UHsUNkJQRw5cwn7H9EeKxg_hRc0GCG_';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function restoreReEntry() {
    console.log('🔄 Restoring lost Re-Entry state...');

    const now = new Date();
    // Set scheduled time to 2 mins ago so it triggers immediately on start
    const pastTime = new Date(now.getTime() - 2 * 60 * 1000);

    const reEntryPayload = {
        isEligible: true,
        hasReEntered: false,
        originalExitTime: new Date().toISOString(), // Approximate
        originalExitReason: 'Restored via Script',
        positionAge: 1, // Treat as yesterday's position to ensure eligibility
        scheduledReEntryTime: pastTime.toISOString()
    };

    const { error } = await supabase
        .from('strategy_state')
        .update({
            re_entry: reEntryPayload,
            status: 'IDLE', // Ensure it's IDLE so resume picks it up
            engine_activity: 'Waiting for Re-Entry (Restored)'
        })
        .eq('id', 1);

    if (error) {
        console.error('❌ Failed to restore state:', error);
    } else {
        console.log('✅ State restored successfully!');
        console.log('Simply RESTART the backend server now, and it should execute re-entry immediately.');
    }
}

restoreReEntry();
