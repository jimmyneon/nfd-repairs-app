"use client";
import { useEffect, useRef, useState } from "react";
export default function PaymentsPage() {
  const [rows, setRows] = useState<any[]>([]),
    [error, setError] = useState(""),
    requests = useRef<Record<string, string>>({});
  async function load() {
    const r = await fetch("/api/payments/admin"),
      d = await r.json();
    if (r.ok) setRows(d.payments);
    else setError(d.error);
  }
  useEffect(() => {
    load();
  }, []);
  async function refund(p: any) {
    const amount = window.prompt(
      "Refund amount (£):",
      String((p.amount_pence - p.refunded_pence) / 100),
    );
    if (!amount || !window.confirm("Issue this Stripe refund?")) return;
    const key = p.id + ":" + amount,
      id =
        requests.current[key] || (requests.current[key] = crypto.randomUUID());
    const r = await fetch("/api/payments/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payment_id: p.id,
          amount: Number(amount),
          request_id: id,
        }),
      }),
      d = await r.json();
    if (!r.ok) setError(d.error);
    else {
      delete requests.current[key];
      await load();
    }
  }
  return (
    <main className="max-w-4xl mx-auto p-6 pt-24">
      <h1 className="text-2xl font-bold">Payments and repair savings</h1>
      <p className="my-3">
        All provider receipts, including savings before a job is created. Review
        refund requests from notifications. Pending refunds must complete before
        another refund of the same money.
      </p>
      <p role="alert" className="text-red-600">
        {error}
      </p>
      {rows.map((p) => (
        <section key={p.id} className="border rounded-xl p-4 my-3">
          <p>
            {p.kind} · {p.status} · £{(p.amount_pence / 100).toFixed(2)} ·
            refunded £{(p.refunded_pence / 100).toFixed(2)}
          </p>
          <p className="text-sm">
            {p.enquiry_ref || p.job_id || p.repair_fund_id}
          </p>
          {p.stripe_payment_intent_id && p.amount_pence > p.refunded_pence && (
            <button className="underline" onClick={() => refund(p)}>
              Issue refund
            </button>
          )}
        </section>
      ))}
    </main>
  );
}
