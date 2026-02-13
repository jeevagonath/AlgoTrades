
import { nseService } from './src/services/nse.service';

async function testEndpoints() {
    console.log('Testing Endpoints...');
    try {
        console.log('\n0. Testing getExpiries (contract-info)...');
        const expiries = await nseService.getExpiries('NIFTY');
        console.log('Expiries found:', expiries.length);
        if (expiries.length > 0) console.log('First Expiry:', expiries[0]);

        console.log('\n1. Testing getOptionChainData (indices)...');
        const data1 = await nseService.getOptionChainData('NIFTY');
        console.log('Records Found:', !!(data1 && data1.records));

        console.log('\n2. Testing getSpotPrice (indices)...');
        const spot = await nseService.getSpotPrice('NIFTY');
        console.log('Spot Price:', spot);

    } catch (error: any) {
        console.error('Test Failed:', error.message);
    }
}

testEndpoints();
