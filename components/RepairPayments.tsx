"use client";
import { useEffect, useState, useRef } from "react";
export default function RepairPayments({
  jobId,
  onChange,
}: {
  jobId: string;
  onChange: () => void;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const requests = useRef<Record<string, string>>({});
  const requestId = (key: string) =>
    requests.current[key] || (requests.current[key] = crypto.randomUUID());
  const fmt = (p: number) => `£${(p / 100).toFixed(2)}`;
  async function load() {
    const r = await fetch(
      "/api/payments/ledger?job_id=" + encodeURIComponent(jobId),
    );
    const d = await r.json();
    if (r.ok) setData(d);
    else setError(d.error);
  }
  useEffect(() => {
    load();
  }, [jobId]);
  async function action(url: string, body: any) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      requests.current = {};
      await load();
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function confirmRepair() {
    const amount = window.prompt(
      "Confirm complete current repair total (£):",
      String((data?.total_pence || 0) / 100),
    );
    if (amount && !data.enquiry_id) {
      action("/api/jobs/confirm", {
        job_id: jobId,
        confirmed_total: Number(amount),
        part_option: data.part_option,
      });
      return;
    }
    if (amount)
      action("/api/enquiries/convert-to-job", {
        enquiry_id: data.enquiry_id,
        stock_status: data.requires_parts_order ? "parts_needed" : "in_stock",
        confirmed_total: Number(amount),
        part_option: data.part_option,
        device_colour: data.device_colour,
      });
  }
  function shopPayment() {
    const amount = window.prompt(
      "Cash/card payment received (£):",
      String((data?.balance_due_pence || 0) / 100),
    );
    if (
      amount &&
      window.confirm(
        "Confirm this amount has actually been received in the shop?",
      )
    )
      action("/api/payments/manual", {
        job_id: jobId,
        amount: Number(amount),
        reference: requestId("shop:" + amount),
      });
  }
  function refund(row: any) {
    const amount = window.prompt(
      "Refund amount (£):",
      String((row.amount_pence - row.refunded_pence) / 100),
    );
    if (amount && window.confirm("Issue this refund through Stripe?"))
      action("/api/payments/refund", {
        payment_id: row.id,
        amount: Number(amount),
        request_id: requestId("refund:" + row.id + ":" + amount),
      });
  }
  return (
    <section className="rounded-xl border p-4 my-4 bg-white dark:bg-gray-800">
      <h3 className="font-bold">Payments and refunds</h3>
      <a href="/app/payments" className="text-sm underline">
        All payments and savings refunds
      </a>
      {data && (
        <>
          <>
            {data.needs_confirmation && (
              <button
                disabled={busy}
                onClick={confirmRepair}
                className="bg-blue-700 text-white p-2 rounded"
              >
                Confirm updated repair details
              </button>
            )}
          </>
          <p>
            Received {fmt(data.paid_pence)} · Outstanding{" "}
            {fmt(data.balance_due_pence)}
          </p>
          <button
            disabled={busy}
            onClick={shopPayment}
            className="bg-green-700 text-white rounded px-3 py-2 my-2"
          >
            Record shop payment
          </button>
          <div className="space-y-2">
            {data.payments.map((row: any) => (
              <div key={row.id} className="text-sm border-t py-2">
                {row.kind} · {row.status} · {fmt(row.amount_pence)}
                {row.refunded_pence > 0 &&
                  ` · refunded ${fmt(row.refunded_pence)}`}
                {["open", "creating"].includes(row.status) && (
                  <button disabled={busy} className="ml-3 underline" onClick={() => action("/api/payments/close-checkout", {payment_id: row.id})}>
                    Close unpaid checkout
                  </button>
                )}
                {row.stripe_payment_intent_id &&
                  row.amount_pence > row.refunded_pence && (
                    <button
                      disabled={busy}
                      onClick={() => refund(row)}
                      className="ml-3 underline"
                    >
                      Refund
                    </button>
                  )}
              </div>
            ))}
          </div>
          <p className="text-xs mt-2">
            Legacy fully-paid flags without a receipt must be checked and
            recorded before collection. Stripe is the provider record. Use its
            Dashboard if an app action fails; reconciliation will recover
            provider updates.
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
