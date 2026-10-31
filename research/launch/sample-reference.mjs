// Sample observed pixel modes, rather than infer an uncompressed source palette.
import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const path = process.argv[2] ?? '/tmp/vstyle/reference-route-go.png';
const { data, info } = await sharp(path).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const tests = {
  background: (r,g,b) => r === 0 && g === 0 && b === 0,
  grid: (r,g,b) => r === g && g === b && r > 20 && r < 45,
  comment: (r,g,b) => r === g && g === b && r >= 150 && r <= 175,
  keyword: (r,g,b) => r > 235 && g > 40 && g < 110 && b > 110 && b < 170,
  type: (r,g,b) => r > 165 && r < 220 && g > 90 && g < 150 && b > 230,
  string: (r,g,b) => r < 25 && g > 180 && b > 55 && b < 120,
  punctuation: (r,g,b) => r === g && g === b && r >= 230 && r <= 245,
};
const colors = {};
for (const [role, test] of Object.entries(tests)) {
  const counts = new Map();
  for (let i=0;i<data.length;i+=3) {
    if (!test(data[i],data[i+1],data[i+2])) continue;
    const hex = '#' + data.subarray(i,i+3).toString('hex');
    counts.set(hex, (counts.get(hex) ?? 0)+1);
  }
  const [hex,pixels] = [...counts].sort((a,b)=>b[1]-a[1])[0];
  colors[role] = { hex, pixels };
}
// Crosshair is sampled within its top-left intersection, excluding the rules.
const counts = new Map();
for(let y=165;y<245;y++) for(let x=164;x<244;x++) {
  const i=(y*info.width+x)*3, [r,g,b]=data.subarray(i,i+3);
  if(r>50 && Math.max(r,g,b)-Math.min(r,g,b)<4) {
    const hex='#'+data.subarray(i,i+3).toString('hex'); counts.set(hex,(counts.get(hex)??0)+1);
  }
}
const [hex,pixels]=[...counts].sort((a,b)=>b[1]-a[1])[0];
colors.crosshair={hex,pixels};
const result={ reference: 'reference-route-go.png', sha256: createHash('sha256').update(readFileSync(path)).digest('hex'), width:info.width,height:info.height, method:'Modal observed RGB pixel in each semantic color band. Crosshair uses its top-left ROI. The reference contains resampling/compression noise; these are observed pixels, not claimed original theme constants.',colors };
writeFileSync(new URL('reference-palette.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(result);
