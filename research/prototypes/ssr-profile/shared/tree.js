import React from "react";
import { records, links } from "./data.js";
const h = React.createElement;
export function Cell({ value }) {
  return h("td", null, value);
}
export function Badge({ status }) {
  return h(
    "span",
    { className: status === "Paid" ? "paid" : "pending" },
    status,
  );
}
export function Row({ r }) {
  return h(
    "tr",
    null,
    h(Cell, { value: r.id }),
    h("td", null, h("strong", null, r.name)),
    h(Cell, { value: r.email }),
    h(Cell, { value: r.amount }),
    h(Cell, { value: r.date }),
    h("td", null, h(Badge, { status: r.status })),
  );
}
export function Page() {
  const rows = records();
  return h(
    "main",
    { id: "benchmark" },
    h(
      "header",
      null,
      h("h1", null, "Ledger & reports"),
      h(
        "nav",
        null,
        h("a", { href: "/" }, "Home"),
        h("a", { href: "/about" }, "About"),
      ),
    ),
    h(
      "aside",
      null,
      h(
        "ul",
        null,
        ...links.map((l) =>
          h("li", { key: l.href }, h("a", { href: l.href }, l.text)),
        ),
      ),
    ),
    h(
      "section",
      null,
      h("h2", null, "Accounts"),
      h(
        "p",
        null,
        "A clear view of every account. Reliable reports for teams <large> & small.",
      ),
      h(
        "table",
        null,
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            ...["ID", "Name", "Email", "Amount", "Date", "Status"].map((x) =>
              h("th", { key: x }, x),
            ),
          ),
        ),
        h("tbody", null, ...rows.map((r) => h(Row, { key: r.id, r }))),
      ),
    ),
    h("footer", null, "Example Company © 2026"),
  );
}
