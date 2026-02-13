
import { shoonya } from './src/services/shoonya.service';

async function testShoonyaSearch() {
    console.log('Testing Shoonya Search...');
    try {
        // Need to resume session or mock login? 
        // shoonya.resumeSession reads from DB.

        // This might fail if not logged in.
        // Assuming we are testing in an environment where we can't easily login interactively.
        // But the user might have a valid session in DB.

        console.log('Searching NFO NIFTY...');
        const results: any = await shoonya.searchScrip('NFO', 'NIFTY CE');

        if (results && results.length > 0) {
            console.log(`Found ${results.length} results.`);
            console.log('Sample:', results.slice(0, 3));

            // Extract expiries?
            // "tsym": "NIFTY27MAR25P20850"
            // We can regex parse tsym to get expiries.
        } else {
            console.log('No results.');
        }

    } catch (error: any) {
        console.error('Test Failed:', error.message || error);
    }
}

testShoonyaSearch();
