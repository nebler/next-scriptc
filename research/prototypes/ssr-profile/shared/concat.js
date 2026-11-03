import { records, links } from "./data.js";
export function escape(value) {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#x27;",
      })[c],
  );
}
export function concat() {
  let s =
    '<main id="benchmark"><header><h1>Ledger &amp; reports</h1><nav><a href="/">Home</a><a href="/about">About</a></nav></header><aside><ul>';
  for (const l of links)
    s += '<li><a href="' + escape(l.href) + '">' + escape(l.text) + "</a></li>";
  s +=
    "</ul></aside><section><h2>Accounts</h2><p>A clear view of every account. Reliable reports for teams &lt;large&gt; &amp; small.</p><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>";
  for (const r of records())
    s +=
      "<tr><td>" +
      escape(r.id) +
      "</td><td><strong>" +
      escape(r.name) +
      "</strong></td><td>" +
      escape(r.email) +
      "</td><td>" +
      escape(r.amount) +
      "</td><td>" +
      escape(r.date) +
      '</td><td><span class="' +
      (r.status === "Paid" ? "paid" : "pending") +
      '">' +
      escape(r.status) +
      "</span></td></tr>";
  return (
    s +
    "</tbody></table></section><footer>Example Company © 2026</footer></main>"
  );
}
