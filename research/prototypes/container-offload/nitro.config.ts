import {scriptcNitro} from 'scriptc-promote/nitro';
export default {srcDir:'server',preset:process.env.CO1_PRESET || 'node-server',
 modules:process.env.CO1_PRESET ? [] : [scriptcNitro({sourceDir:'compute'})],
 externals:{inline:['scriptc-promote']}};
