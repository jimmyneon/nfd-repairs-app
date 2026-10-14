import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
let db: PGlite;
let legacyCoverage: any[] = [];
const id = "11111111-1111-4111-8111-111111111111",
  eid = "22222222-2222-4222-8222-222222222222",
  fid = "33333333-3333-4333-8333-333333333333";
async function money() {
  return (await db.query<any>("select repair_money($1,null) m", [id])).rows[0]
    .m;
}
async function reset() {
  await db.exec(
    "truncate repair_message_outbox,payments,repair_funds,enquiries,jobs cascade",
  );
  await db.query(
    "insert into jobs(id,job_ref,status,price_total,deposit_required,deposit_amount,quote_confirmed_at,quote_version,quote_accepted_version,quote_snapshot) values($1,'NF-1','AWAITING_DEPOSIT',165,true,20,now(),1,1,'{}')",
    [id],
  );
  await db.query(
    "insert into enquiries(id,enquiry_ref,converted_job_id,quote_action_token) values($1,'ENQ-TEST',$2,'secure-token')",
    [eid, id],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    fs.readFileSync(
      path.join(__dirname, "fixtures/payment-schema.sql"),
      "utf8",
    ),
  );
  for (const f of [
    "20261012120000_payments_and_repair_funds.sql",
    "20261012170000_repair_fund_redemption.sql",
    "20261014101437_quote_payment_journey.sql",
  ]) {
    if (f === "20261014101437_quote_payment_journey.sql") {
      await db.exec("insert into jobs(job_ref,price_total,deposit_required,deposit_amount,deposit_received,deposit_received_at) values('NF-9000',100,true,20,true,now()),('NF-9001',100,true,20,true,now());insert into payments(kind,job_id,amount_pence,status) select 'job_deposit',id,2000,'refunded' from jobs where job_ref='NF-9001'");
    }
    await db.exec(
      fs.readFileSync(
        path.join(__dirname, "../supabase/migrations", f),
        "utf8",
      ),
    );
  }
  legacyCoverage = (await db.query<any>("select job_ref,repair_money(id,null)->>'paid_pence' paid from jobs order by job_ref")).rows;
}, 30000);
afterAll(async () => db?.close());
describe("real isolated Postgres payment transactions", () => {
  it("backfills an evidenced legacy shop deposit without recreating an already refunded payment", () => {
    expect(legacyCoverage).toEqual([{job_ref: 'NF-9000', paid: '2000'}, {job_ref: 'NF-9001', paid: '0'}]);
  });
  it('merges simultaneous option additions without losing scope or requiring approval for a no-op',async()=>{await reset();await db.exec("update enquiries set additional_repairs='[]',accessories='[]';update jobs set additional_issues='[]',quote_confirmed_at=now(),quote_accepted_version=1");await Promise.all([db.query('select add_repair_options($1,$2,$3)',['ENQ-TEST',[{repair:'Battery',price:50}],[]]),db.query('select add_repair_options($1,$2,$3)',['ENQ-TEST',[],[{name:'Protector',price:15}]])]);const j=(await db.query<any>('select additional_issues,price_total,quote_confirmed_at from jobs')).rows[0];expect(j.additional_issues).toHaveLength(2);expect(j.quote_confirmed_at).toBe(null);await db.exec("update jobs set quote_confirmed_at=now(),quote_accepted_version=quote_version");await db.query('select add_repair_options($1,$2,$3)',['ENQ-TEST',[],[]]);expect((await db.query<any>('select quote_confirmed_at from jobs')).rows[0].quote_confirmed_at).not.toBe(null)})
  it("creates and links one job atomically with preserved part details, and keeps enquiry prepayments", async () => {
    await reset();
    await db.query(
      "update enquiries set converted_job_id=null,status='approved' where id=$1",
      [eid],
    );
    await db.exec("delete from jobs");
    await db.exec(
      "insert into payments(kind,enquiry_ref,amount_pence,status) values('enquiry_payment','ENQ-TEST',16500,'paid')",
    );
    const payload = {
      status: "AWAITING_DEPOSIT",
      customer_email: "test@example.com",
      price_total: 165,
      quoted_price: 100,
      deposit_required: true,
      deposit_amount: 20,
      part_option: "Premium OLED",
      device_colour: "Black",
    };
    const snap = {
      primary_price: 100,
      part_option: "Premium OLED",
      colour: "Black",
      total_pence: 16500,
    };
    const a = (
      await db.query<any>("select (confirm_repair_enquiry($1,$2,$3,false)).*", [
        eid,
        payload,
        snap,
      ])
    ).rows[0];
    const b = (
      await db.query<any>("select (confirm_repair_enquiry($1,$2,$3,false)).*", [
        eid,
        payload,
        snap,
      ])
    ).rows[0];
    expect(a.id).toBe(b.id);
    expect(a.payment_received).toBe(true);
    expect(a.deposit_received).toBe(true);
    expect(a.part_option).toBe("Premium OLED");
    expect(a.parts_ordered_at).toBe(null);
  });
  it("deducts a shop deposit and marks ready to order, not ordered", async () => {
    await reset();
    await db.query(
      "select record_manual_repair_payment($1,2000,'manual_deposit','shop-receipt-1')",
      [id],
    );
    expect(await money()).toMatchObject({
      paid_pence: 2000,
      balance_due_pence: 14500,
      deposit_due_pence: 0,
    });
    expect(
      (
        await db.query<any>(
          "select status,parts_ordered_at from jobs where id=$1",
          [id],
        )
      ).rows[0],
    ).toMatchObject({ status: "READY_TO_ORDER", parts_ordered_at: null });
  });
  it("records the same manual receipt once", async () => {
    await reset();
    await db.query(
      "select record_manual_repair_payment($1,2000,'manual_deposit','same')",
      [id],
    );
    await db.query(
      "select record_manual_repair_payment($1,2000,'manual_deposit','same')",
      [id],
    );
    expect((await money()).paid_pence).toBe(2000);
  });
  it("allows one checkout reservation across deposit and full-payment attempts", async () => {
    await reset();
    const a = (
      await db.query<any>(
        "select reserve_repair_checkout($1,null,null,'job_deposit',null) r",
        [id],
      )
    ).rows[0].r;
    const b = (
      await db.query<any>(
        "select reserve_repair_checkout($1,null,null,'job_payment',null) r",
        [id],
      )
    ).rows[0].r;
    expect(a.id).toBe(b.id);
    expect(a.amount_pence).toBe(2000);
    await expect(
      db.query(
        "select record_manual_repair_payment($1,2000,'manual_deposit','race')",
        [id],
      ),
    ).rejects.toThrow(/checkout/);
  });
  it("full receipt satisfies the deposit; duplicates are safe and partial refunds retain net paid", async () => {
    await reset();
    await db.query(
      "insert into payments(stripe_session_id,kind,job_id,amount_pence) values('cs_test','job_payment',$1,16500)",
      [id],
    );
    await db.exec(
      "select apply_verified_payment('evt','cs_test','pi_test',16500,'gbp',0);select apply_verified_payment('evt','cs_test','pi_test',16500,'gbp',0)",
    );
    expect(await money()).toMatchObject({
      fully_paid: true,
      deposit_due_pence: 0,
    });
    await db.exec(
      "select apply_verified_payment('refund','cs_test','pi_test',16500,'gbp',1000)",
    );
    expect(await money()).toMatchObject({
      paid_pence: 15500,
      balance_due_pence: 1000,
      fully_paid: false,
    });
    await db.exec(
      "select apply_verified_payment('refund-all','cs_test','pi_test',16500,'gbp',16500)",
    );
    expect((await money()).paid_pence).toBe(0);
    expect((await db.query<any>("select status from jobs where id=$1", [id])).rows[0].status).toBe("AWAITING_DEPOSIT");
  });
  it("rolls back receipt and job effects together on a database error and recovers on retry", async () => {
    await reset();
    await db.query(
      "insert into payments(stripe_session_id,kind,job_id,amount_pence) values('cs_error','job_payment',$1,16500)",
      [id],
    );
    await db.exec(
      "create function public.inject_error() returns trigger language plpgsql as $$ begin raise exception 'injected'; end $$;create trigger inject_error before update on jobs for each row execute function inject_error()",
    );
    await expect(
      db.exec(
        "select apply_verified_payment('evt','cs_error','pi_error',16500,'gbp',0)",
      ),
    ).rejects.toThrow(/injected/);
    expect((await money()).paid_pence).toBe(0);
    await db.exec(
      "drop trigger inject_error on jobs;drop function inject_error();select apply_verified_payment('evt','cs_error','pi_error',16500,'gbp',0)",
    );
    expect((await money()).fully_paid).toBe(true);
  });
  it("does not undo a successful refund when an older receipt is reconciled later", async () => {
    await reset();
    await db.query("insert into payments(stripe_session_id,kind,job_id,amount_pence) values('cs_stale','job_payment',$1,16500)", [id]);
    await db.exec("select apply_verified_payment('refund','cs_stale','pi_stale',16500,'gbp',1000);select apply_verified_payment('old','cs_stale','pi_stale',16500,'gbp',0)");
    expect(await money()).toMatchObject({ paid_pence: 15500, balance_due_pence: 1000 });
  });
  it("changing confirmation notes does not accept a quote on behalf of the customer", async () => {
    await reset();
    await db.exec("update jobs set quote_accepted_version=null,requires_parts_order=true,confirmation_notes='old';update enquiries set quote_version=1");
    const payload = { quoted_price: 165, price_total: 165, requires_parts_order: true, deposit_required: true, deposit_amount: 20, confirmation_notes: 'new' };
    await db.query("select confirm_repair_enquiry($1,$2,'{}',false)", [eid, payload]);
    expect((await db.query<any>("select quote_accepted_version from jobs")).rows[0].quote_accepted_version).toBe(null);
  });
  it("rejects amount mismatches and unaccepted prices", async () => {
    await reset();
    await db.query(
      "insert into payments(stripe_session_id,kind,job_id,amount_pence) values('cs_bad','job_payment',$1,16500)",
      [id],
    );
    await expect(
      db.exec(
        "select apply_verified_payment('evt','cs_bad','pi_bad',10000,'gbp',0)",
      ),
    ).rejects.toThrow(/mismatch/);
    await db.query("update jobs set quote_accepted_version=null where id=$1", [
      id,
    ]);
    await expect(
      db.query(
        "select reserve_repair_checkout($1,null,null,'job_payment',null)",
        [id],
      ),
    ).rejects.toThrow(/confirmed/);
  });
  it("recalculates fund credits on duplicate topups and applies partial savings atomically", async () => {
    await reset();
    await db.query(
      "insert into repair_funds(id,fund_token,customer_name,enquiry_ref,target_amount_pence,quote_version) values($1,'fund-test','Test','ENQ-TEST',16500,1)",
      [fid],
    );
    await db.query(
      "insert into payments(stripe_session_id,kind,repair_fund_id,amount_pence) values('cs_fund1','fund_topup',$1,5000),('cs_fund2','fund_topup',$1,3000)",
      [fid],
    );
    await db.exec(
      "select apply_verified_payment('a','cs_fund1','pi_f1',5000,'gbp',0);select apply_verified_payment('b','cs_fund2','pi_f2',3000,'gbp',0);select apply_verified_payment('a','cs_fund1','pi_f1',5000,'gbp',0)",
    );
    expect(
      (await db.query<any>("select balance_pence from repair_funds")).rows[0]
        .balance_pence,
    ).toBe(8000);
    await db.query("select redeem_repair_fund($1)", [fid]);
    await db.query("select redeem_repair_fund($1)", [fid]);
    expect((await money()).paid_pence).toBe(8000);
    await db.exec(
      "select apply_verified_payment('refund','cs_fund1','pi_f1',5000,'gbp',1000)",
    );
    expect((await money()).paid_pence).toBe(7000);
    await db.exec(
      "select apply_verified_payment('refund2','cs_fund1','pi_f1',5000,'gbp',2000)",
    );
    expect((await money()).paid_pence).toBe(6000);
  });
  it("blocks collection without money and invalidates acceptance on price changes", async () => {
    await reset();
    await expect(
      db.query("update jobs set status='COLLECTED' where id=$1", [id]),
    ).rejects.toThrow(/payment/);
    await db.query("update jobs set price_total=180 where id=$1", [id]);
    const j = (
      await db.query<any>(
        "select quote_version,quote_confirmed_at,quote_accepted_version from jobs",
      )
    ).rows[0];
    expect(j).toMatchObject({
      quote_version: 2,
      quote_confirmed_at: null,
      quote_accepted_version: null,
    });
  });
  it("does not let authenticated customers read or manipulate payment tables/functions", async () => {
    await reset();
    await db.exec("set role authenticated");
    try {
      await expect(db.exec("select * from payments")).rejects.toThrow(
        /permission/,
      );
      await expect(db.exec("truncate payments")).rejects.toThrow(/permission/);
      await expect(
        db.query("select repair_money($1,null)", [id]),
      ).rejects.toThrow(/permission/);
    } finally {
      await db.exec("reset role");
    }
  });
  it("keeps savings top-ups separate from repair payment and blocks them after cancellation", async () => {
    await reset();
    await db.exec("update enquiries set price_verified=true,quote_version=1");
    await db.query("insert into repair_funds(id,fund_token,customer_name,enquiry_ref,target_amount_pence,quote_version) values($1,'fund-test','Test','ENQ-TEST',16500,1)", [fid]);
    const reserved = (await db.query<any>("select reserve_repair_checkout(null,null,$1,'fund_topup',5000) r", [fid])).rows[0].r;
    expect(reserved.job_id).toBe(null);
    expect(reserved.enquiry_ref).toBe(null);
    await db.exec("update jobs set customer_response='cancel';update enquiries set customer_response='cancel'");
    await expect(db.query("select reserve_repair_checkout(null,null,$1,'fund_topup',5000)", [fid])).rejects.toThrow(/saving/);
    await expect(db.query("select accept_repair_quote($1,1)", [id])).rejects.toThrow(/changed/);
  });
});
