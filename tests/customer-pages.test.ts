import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
const fixture = path.join(__dirname, "fixtures/customer-site");
const site = process.env.NFD_SITE_TEST_ROOT || (fs.existsSync("../site/repair-quote/index.html") ? "../site" : fixture);
if (!fs.existsSync(`${site}/repair-quote/index.html`)) {
  throw new Error("The paired website checkout is required for customer-page verification");
}
function render(file: string, payload: any) {
  const html = fs.readFileSync(`${site}/${file}`, "utf8");
  const dom = new JSDOM(html, {
    url:
      "https://newforestdevicerepairs.co.uk/" +
      file +
      "?ref=ENQ-TEST&t=test-token&token=fund-token",
    runScripts: "outside-only",
  });
  const w: any = dom.window;
  w.fetch = async () => ({ ok: true, json: async () => payload });
  w.eval(html.match(/<script>([\s\S]*?)<\/script>/)![1]);
  return dom;
}
const tick = () => new Promise((r) => setTimeout(r, 20));
describe(
  "customer page rendering with mocked API responses",
  () => {
    it("uses exact customer HTML from the recorded paired website commit", () => {
      const source = JSON.parse(fs.readFileSync(`${fixture}/source.json`, 'utf8'));
      for (const [file, expected] of Object.entries(source.files)) {
        for (const root of new Set([site, fixture])) {
          const bytes = fs.readFileSync(`${root}/${file}`);
          const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
          expect(sha, `${root}/${file} must match the coordinated website fixture`).toBe(expected);
        }
      }
    });
    it("shows selected quality, colour, extras, complete price and both ordering payment choices", async () => {
      const dom = render("repair-quote/index.html", {
        reference: "NF-1",
        requested: true,
        status: "AWAITING_DEPOSIT",
        confirmed: true,
        quote_version: 1,
        quote: {
          device: "iPhone test",
          repair: "Screen",
          part_option: "Premium OLED",
          colour: "Black",
          accessories: [{ name: "Protector", price: 15 }],
          additional_repairs: [{ repair: "Battery", price: 50 }],
        },
        total_pence: 16500,
        paid_pence: 0,
        balance_due_pence: 16500,
        deposit_due_pence: 2000,
        requires_parts_order: true,
        can_pay: true,
        fund_allowed: true,
        price_available: true,
        available_addons: [],
        available_accessories: [],
      });
      await tick();
      const d = dom.window.document;
      expect(d.getElementById("selection")!.textContent).toBe(
        "Premium OLED · Black",
      );
      expect(d.getElementById("total")!.textContent).toBe("£165.00 total");
      expect(d.getElementById("deposit")!.textContent).toBe(
        "Pay £20.00 deposit",
      );
      expect(d.getElementById("full")!.textContent).toBe("Pay £165.00 in full");
      expect(d.getElementById("request")!.classList.contains("hidden")).toBe(
        true,
      );
      expect(d.getElementById("timing")!.textContent).toContain(
        "after ordering",
      );
      dom.window.close();
    });
    it("does not offer payments before staff confirmation or saving without a price", async () => {
      const dom = render("repair-quote/index.html", {
        reference: "ENQ-TEST",
        quote: { device: "Unknown", repair: "Diagnostic" },
        total_pence: 0,
        confirmed: false,
        can_pay: false,
        fund_allowed: false,
        price_available: false,
      });
      await tick();
      const d = dom.window.document;
      expect(d.getElementById("payments")!.classList.contains("hidden")).toBe(
        true,
      );
      expect((d.getElementById("save") as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(d.getElementById("next")!.textContent).toContain("No payment");
      dom.window.close();
    });
    it.each([
      ['READY_TO_ORDER', 'Ready to order your part', 'actually been ordered'],
      ['PARTS_ARRIVED', 'Your part has arrived', 'Bring your device'],
      ['READY_TO_COLLECT', 'Ready to collect', 'Collect during opening hours'],
    ])("shows repair progress after full payment: %s", async (status, title, next) => {
      const dom = render('repair-quote/index.html', {
        reference: 'NF-1', quote: {device: 'iPhone', repair: 'Screen'},
        status, confirmed: true, fully_paid: true, total_pence: 10000,
        paid_pence: 10000, balance_due_pence: 0, deposit_due_pence: 0,
        price_available: true, can_pay: true, requires_parts_order: true,
      });
      await tick();
      const d = dom.window.document;
      expect(d.getElementById('next-title')!.textContent).toBe(title);
      expect(d.getElementById('next')!.textContent).toContain(next);
      expect(d.getElementById('payments')!.classList.contains('hidden')).toBe(true);
      dom.window.close();
    });
    it("hides payment buttons when fully prepaid and shows a zero balance", async () => {
      const dom = render("pay/index.html", {
        device: "iPhone",
        total_pence: 16500,
        paid_pence: 16500,
        balance_due_pence: 0,
        deposit_due_pence: 0,
        fully_paid: true,
        can_pay: true,
      });
      await tick();
      expect(
        dom.window.document
          .getElementById("options")!
          .classList.contains("hidden"),
      ).toBe(true);
      expect(
        dom.window.document.getElementById("status")!.textContent,
      ).toContain("paid in full");
      dom.window.close();
    });
    it("requires reconfirmed parts/price before using savings", async () => {
      const dom = render("repair-fund/index.html", {
        device: "iPhone",
        repair: "Screen",
        target_pence: 16500,
        balance_pence: 5000,
        allocated_pence: 0,
        remaining_pence: 11500,
        percent: 30,
        status: "open",
        can_redeem: false,
      });
      await tick();
      expect(
        (dom.window.document.getElementById("redeem") as HTMLButtonElement)
          .disabled,
      ).toBe(true);
      expect(
        dom.window.document.getElementById("explanation")!.textContent,
      ).toContain("confirm");
      dom.window.close();
    });
  },
);
