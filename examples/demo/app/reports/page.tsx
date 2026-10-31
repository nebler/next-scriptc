import { Suspense } from "react";
import { connection } from "next/server";
import { revenue } from "../../lib/revenue.ts";
import { reportAction } from "../../lib/report-action.ts";

type Props = { searchParams: Promise<{ from?: string; to?: string; error?: string; message?: string; size?: string; profile?: string }> };

async function Report({ searchParams }: Props) {
  await connection();
  const params = await searchParams;
  try {
    const result = await revenue(params.from ?? "2026-01-01", params.to ?? "2026-01-31", [5000, 50000, 200000].includes(Number(params.size)) ? Number(params.size) : 5000, params.profile === "1");
    if (params.error) throw new Error(params.error);
    return <><h1>{params.message ?? "Revenue report"}</h1><pre id="result">{JSON.stringify(result)}</pre></>;
  } catch (error) {
    return <pre id="error">{error instanceof Error ? error.message : String(error)}</pre>;
  }
}

export default function Page({ searchParams }: Props) {
  return <><p>Monthly revenue dashboard: <a href="?size=5000">5,000</a> · <a href="?size=50000">50,000</a> · <a href="?size=200000">200,000</a> order events. Both runtimes use the same source and stored export; small inputs can cost more to offload.</p><Suspense fallback={<p>Loading report…</p>}><Report searchParams={searchParams} /><form action={reportAction}><input name="value" defaultValue="Revenue report" /><button>Send through a Server Action</button></form></Suspense></>;
}
