let cachedServerIp: string | null = null;

export function getCachedPublicIp(): string | null {
    return cachedServerIp;
}

export function setCachedPublicIp(ip: string) {
    if (ip && ip.length > 0) cachedServerIp = ip;
}

export function clearCachedPublicIp() {
    cachedServerIp = null;
}

export default {
    getCachedPublicIp,
    setCachedPublicIp,
    clearCachedPublicIp,
};
