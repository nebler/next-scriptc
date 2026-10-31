import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
const rows=[];
for(const name of ['go-plain','go-v3','go-simd','go-binary','go-binary-v3','http-go']){
 const original=name.startsWith('go-binary');
 const args=['build',...(original?[]:['-C','examples/demo/go']),'-trimpath','-buildvcs=false','-ldflags=-s -w','-o',`/tmp/vector-cpu-levels/${name}`,original?'examples/scout/vectors/vectors.go':name==='http-go'?'.':'./cmd/vectors'];
 const env={...process.env,CGO_ENABLED:'0',GOOS:'linux',GOARCH:'amd64',GOAMD64:name.endsWith('v3')?'v3':'v1',GOEXPERIMENT:['go-simd','http-go'].includes(name)?'simd':''};
 execFileSync('go',args,{env,stdio:'inherit'});
 const bytes=readFileSync(`/tmp/vector-cpu-levels/${name}`);
 rows.push({name,args,GOAMD64:env.GOAMD64,GOEXPERIMENT:env.GOEXPERIMENT,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
writeFileSync(new URL('go-builds.json',import.meta.url),JSON.stringify({go:execFileSync('go',['version'],{encoding:'utf8'}).trim(),rows},null,2)+'\n');
