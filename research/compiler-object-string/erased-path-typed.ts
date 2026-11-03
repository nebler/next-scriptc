// Own-code reduction of the CSV escaped-dot scan and nested path walk.
// @ts-nocheck
const n = Number(process.argv[2] || '50000');
const reps = Number(process.argv[3] || '35');
const rows: any = JSON.parse('[{"nested":{"note":"alpha"}},{"nested":{"note":"beta"}}]');
function evaluate(record: any, path: any): any {
  let start = 0;
  for (let i = 0; i < path.length; i++) {
    if (path[i] === '.' && (i === 0 || path[i - 1] !== "\\")) {
      record = record[path.slice(start, i)];
      start = i + 1;
    }
  }
  return record[path.slice(start)];
}
function run(): number {
  let checksum = 0;
  for (let i = 0; i < n; i++) checksum += evaluate(rows[i % 2], 'nested.note').length;
  return checksum;
}
for (let i = 0; i < 50; i++) run();
for (let i = 0; i < reps; i++) {
  const start = performance.now(); const checksum = run();
  console.log(JSON.stringify({ms: performance.now() - start, checksum}));
}
