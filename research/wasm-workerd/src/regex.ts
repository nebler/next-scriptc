// Synthetic access-log normalization control: parse lines, redact PII, group routes.
const fixtures = new Map<number, string>();
function fixture(size: number): string {
  let text = fixtures.get(size);
  if (text !== undefined) return text;
  const lines: string[] = [];
  for (let i=0; i<size; i++) lines.push(`2026-01-01T12:34:56Z INFO user=user${i % 1000}@example.com ip=192.168.${i % 255}.${(i * 7) % 255} path=/api/items/${i % 10000}?token=abc${i} status=${i % 10 === 0 ? 500 : 200}`);
  text=lines.join('\n'); fixtures.set(size,text); return text;
}
export function regex(size: number) {
  const lines=fixture(size).split('\n');
  const groups=new Map<string,number>();let errors=0;let characters=0;
  for (const line of lines) {
    const clean=line.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,'[email]').replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g,'[ip]').replace(/token=[^ &]+/g,'token=[redacted]');
    const match=/path=(\S+) status=(\d+)/.exec(clean);
    if (!match) throw new Error('invalid fixture');
    const route=match[1].replace(/\/\d+/g,'/:id');
    groups.set(route,(groups.get(route)||0)+1);
    if (Number(match[2])>=500) errors++;
    characters+=clean.length;
  }
  return {lines:lines.length,errors,characters,routes:Array.from(groups.entries()).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)};
}
