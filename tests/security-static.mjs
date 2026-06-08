import fs from 'fs';
import path from 'path';

const root = process.cwd();
const activeDirs = ['artifacts/api-server/src', 'artifacts/dashboard/src', 'lib/db/src'];
function files(dir) {
  const out=[];
  for (const ent of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const p=path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...files(p));
    else if (/\.(ts|tsx|js|mjs)$/.test(ent.name)) out.push(p);
  }
  return out;
}
const all = activeDirs.flatMap(files);
const text = Object.fromEntries(all.map(f => [f, fs.readFileSync(path.join(root,f),'utf8')]));
function assert(cond,msg){ if(!cond) throw new Error(msg); }
function absent(pattern, label, allow = []) {
  for (const [f,s] of Object.entries(text)) {
    if (allow.some(a => f.includes(a))) continue;
    assert(!pattern.test(s), `${label} found in ${f}`);
  }
}

absent(/free-ai|FREE_AI_BASE|63\.142\.251\.202|145\.223\.69\.146|80\.241\.208\.95/, 'Removed free/hardcoded AI proxy');
absent(/origin:\s*true|credentials:\s*true/, 'Insecure CORS');
absent(/OPENROUTER_API_KEY/, 'Frontend/provider key string', ['lib']);
assert(/AUTH_WEEKLY_ALLOWANCE\s*=\s*60_000/.test(text['artifacts/api-server/src/lib/tokens.ts']), 'auth weekly limit must be 60,000');
assert(/GUEST_WEEKLY_ALLOWANCE\s*=\s*20_000/.test(text['artifacts/api-server/src/lib/tokens.ts']), 'guest weekly limit must be 20,000');
for (const req of ['500_000,    cents: 500','1_000_000,  cents: 800','2_000_000,  cents: 1500','5_000_000,  cents: 3000','10_000_000, cents: 5000']) {
  assert(text['artifacts/api-server/src/routes/billing.ts'].includes(req), `missing package ${req}`);
}
for (const route of ['create-order','status/:orderId','callback']) assert(text['artifacts/api-server/src/routes/billing.ts'].includes(`/billing/dischub/${route}`), `missing DiscHub ${route}`);
for (const route of ['documents','search','search/suggestions','search/filters']) assert(text['artifacts/api-server/src/routes/documents.ts'].includes(`/v1/${route}`), `missing /api/v1/${route}`);
assert(text['artifacts/dashboard/src/lib/documents-api.ts'].includes('/api/v1'), 'frontend document client must use /api/v1');
assert(text['deploy/fail2ban/filter.d/zimsolve-security.conf']?.includes('SECURITY_EVENT') ?? fs.readFileSync('deploy/fail2ban/filter.d/zimsolve-security.conf','utf8').includes('SECURITY_EVENT'), 'fail2ban filter missing SECURITY_EVENT');

assert(text['artifacts/dashboard/src/lib/csrf-fetch.ts'].includes('X-CSRF-Token'), 'dashboard must attach CSRF token');
assert(text['artifacts/dashboard/src/main.tsx'].includes('installCsrfFetch'), 'dashboard must install CSRF fetch wrapper');
assert(text['artifacts/api-server/src/routes/admin.ts'].includes('/admin/email-users'), 'admin email route missing');
assert(text['artifacts/api-server/src/routes/admin.ts'].includes('sendAdminBroadcastEmail'), 'admin email sender missing');
assert(/\.update\(tokenPurchasesTable\)[\s\S]*creditedAt[\s\S]*creditedAt} IS NULL[\s\S]*INSERT INTO token_balances/.test(text['artifacts/api-server/src/routes/billing.ts']), 'DiscHub crediting must claim purchase before balance increment');
assert(text['artifacts/api-server/src/lib/tokens.ts'].includes('body.deviceId') && text['artifacts/api-server/src/lib/tokens.ts'].includes('req.query?.deviceId'), 'guest deviceId query/body support missing');
console.log('security static checks passed');
