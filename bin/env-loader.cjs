const _w = console.warn;
console.warn = (...a) => { if (String(a[0]).includes("bigint")) return; _w(...a); };
try { process.loadEnvFile(); } catch {}
