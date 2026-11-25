const base = process.env.API_URL ?? 'http://localhost:3001';

const response = await fetch(`${base}/api/health`);
if (!response.ok) {
  console.error(`API health check failed: ${response.status}`);
  process.exit(1);
}
console.log(await response.text());
