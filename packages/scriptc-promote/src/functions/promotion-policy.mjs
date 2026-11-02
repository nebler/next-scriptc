// A non-overlapping paired sign test: under a median effect at the threshold,
// P(Binomial(24, .5) >= 19) = .003305. No repeated looks within an epoch.
export const stabilityDefaults = Object.freeze({samples:24, required:19, coldSamples:2, promoteRatio:0.9, demoteRatio:1.05, recheckEvery:200});
export function decideLane(pairs, lane, policy=stabilityDefaults) {
 if(pairs.length<policy.samples)return lane;
 const ratios=pairs.map(([js,native])=>native/js).sort((a,b)=>a-b);
 const threshold=lane==='native'?policy.demoteRatio:policy.promoteRatio;
 const votes=ratios.filter(r=>lane==='native'?r>threshold:r<threshold).length;
 return votes>=policy.required?(lane==='native'?'js-final':'native'):lane;
}
