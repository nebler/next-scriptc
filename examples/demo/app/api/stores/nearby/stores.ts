export type Store = { id: number; name: string; lat: number; lng: number };
export const stores: Store[] = [];
// Independent coprime strides spread stores across both coordinate axes.
for (let i = 0; i < 20000; i++) {
  stores.push({ id: i + 1, name: `Store ${i + 1}`,
    lat: -85 + ((i * 7919) % 20000) * 170 / 20000,
    lng: -179 + ((i * 1543) % 20000) * 358 / 20000 });
}
