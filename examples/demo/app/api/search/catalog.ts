export type Product = {
  id: string;
  title: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
};

const collections = [
  { category: "lighting", name: "Desk lamp", description: "Dimmable LED task lighting with adjustable arm and warm white light for a home office." },
  { category: "seating", name: "Office chair", description: "Ergonomic mesh chair with lumbar support, adjustable seat height and quiet rolling casters." },
  { category: "desks", name: "Standing desk", description: "Electric height adjustable workstation with cable management and a durable oak desktop." },
  { category: "storage", name: "Shelving unit", description: "Modular open shelving for books, documents and office supplies with adjustable shelves." },
  { category: "audio", name: "Wireless headset", description: "Noise cancelling headphones with a clear microphone for video calls and focused work." },
  { category: "accessories", name: "Laptop stand", description: "Ventilated aluminium laptop riser with an ergonomic viewing angle and compact folding design." },
  { category: "kitchen", name: "Travel mug", description: "Insulated stainless steel coffee cup with a leak resistant lid, suitable for daily commuting." },
  { category: "outdoor", name: "Daypack", description: "Lightweight water resistant backpack with a padded laptop compartment and recycled fabric." },
];
const finishes = ["graphite", "sand", "forest", "navy", "copper", "ivory"];
const ranges = ["Essential", "Studio", "Professional", "Compact", "Signature"];

// A repeatable merchandising fixture: 3,000 SKUs, eight departments, sixty-three models.
export const products: Product[] = [];
for (let i = 0; i < 3000; i++) {
  const collection = collections[i % collections.length];
  const finish = finishes[Math.floor(i / collections.length) % finishes.length];
  const range = ranges[Math.floor(i / 48) % ranges.length];
  const model = 1 + Math.floor(i / 48);
  products.push({
    id: `SKU-${String(i + 1).padStart(5, "0")}`,
    title: `${range} ${collection.name} ${model} - ${finish}`,
    description: `${collection.description} ${range} collection, ${finish} finish. Model ${model} includes a two year warranty and replacement parts.`,
    category: collection.category,
    priceCents: 1900 + (i * 7919) % 78000,
    stock: (i * 17) % 151,
  });
}
