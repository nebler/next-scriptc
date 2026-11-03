export function records() {
  return Array.from({ length: 500 }, (_, i) => ({
    id: String(i + 1),
    name: `Person <${i + 1}> & "team" 'A'`,
    email: `person${i + 1}@example.test`,
    amount: (((i * 137) % 100000) / 100).toFixed(2),
    date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
    status: i % 3 === 0 ? "Pending" : "Paid",
  }));
}
export const links = Array.from({ length: 50 }, (_, i) => ({
  href: `/reports/${i + 1}?a=1&b=2`,
  text: `Report ${i + 1} & details`,
}));
