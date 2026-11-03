import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeMain} from '../normalize.mjs';
test('normalize only supported anchors and entity spelling, retain structural differences',()=>{
 const s='<main id="benchmark"><!--[--><a href="/?a=1&amp;b=2">&lt;&gt;&amp;"\'</a><!----><!--]--></main>';
 assert.equal(normalizeMain(s,'svelte'),'<main id="benchmark"><a href="/?a=1&amp;b=2">&lt;&gt;&amp;&quot;&#x27;</a></main>');
 assert.equal(normalizeMain(s,'react'),s);
 assert.match(normalizeMain('<main><!--unknown--> </main>','nuxt'),/<!--unknown--> /);
 assert.notEqual(normalizeMain('<main> </main>','astro'),'<main></main>');
});
