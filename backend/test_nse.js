
const { nseService } = require('./src/services/nse.service');

async function testNseFetch() {
    console.log('Testing NSE Expiry Fetch...');
    try {
        const data = await nseService.getOptionChainData('NIFTY');
        console.log('Response Keys:', Object.keys(data));
        if (data.records) {
            console.log('Records Found:', true);
            console.log('Expiry Dates:', data.records.expiryDates);
        } else {
            console.log('Records Found:', false);
            console.log('Raw Data:', JSON.stringify(data).substring(0, 200));
        }
    } catch (error) {
        console.error('Fetch Failed:', error.message);
    }
}

testNseFetch();
