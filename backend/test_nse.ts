import { nseService } from './src/services/nse.service';

async function test() {
    try {
        console.log("Initialising session...");
        await (nseService as any).initSession();
        
        console.log("Fetching contract info...");
        const response = await (nseService as any).axiosInstance.get(
            '/api/option-chain-contract-info?symbol=NIFTY',
            { headers: (nseService as any).ajaxHeaders }
        );
        console.log("Contract Info Keys:", Object.keys(response.data));
        if (response.data.underlyingValue) {
            console.log("Underlying Value:", response.data.underlyingValue);
        }
        if (response.data.records && response.data.records.underlyingValue) {
            console.log("Records Underlying Value:", response.data.records.underlyingValue);
        }
    } catch (e) {
        console.error("Test failed:", e);
    }
}

test();
