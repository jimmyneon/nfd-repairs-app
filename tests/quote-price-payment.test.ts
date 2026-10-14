import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function quotePage() {
  const root = fs.existsSync("../site/js/quote.js") ? "../site" : path.join(__dirname, "fixtures/customer-site");
  const script = fs.readFileSync(`${root}/js/quote.js`, "utf8");
  const dom = new JSDOM('<div id="quote-result-area"></div>', { url: "https://newforestdevicerepairs.co.uk/quote/", runScripts: "outside-only" });
  const w: any = dom.window;
  Object.defineProperty(w.document, "readyState", { get: () => "loading" });
  w.document.addEventListener = () => {};
  w.NFD_IMAGE_MAP = { getRepairIcon: () => "fa-battery", getRepairImage: () => null, getModelImage: () => null };
  w.NFD_CatalogueLoader = {
    isScreenRepair: () => false, getAdditionalRepairs: () => [], getTopUpsells: () => [], getQuoteColour: () => null,
    modelDisplayName: (s: string) => s, repairDisplayName: (s: string) => s,
  };
  // Expose the real renderers in this test context only; production code stays unchanged.
  w.eval(script.replace(/\}\)\(\);\s*$/, 'window.quoteTest = { set: function(s) { Object.assign(state,s); el.resultArea=document.getElementById("quote-result-area"); }, summary: renderSelectedOptionPriceSummary, simple: renderSimpleBreakdown };})();'));
  return { dom, w };
}
describe("payment options at the repair price", () => {
  it("shows Klarna/card/cash beside the complete selected price without extra payment buttons", () => {
    const { dom, w } = quotePage();
    w.quoteTest.set({price: 100, partOption: "Premium", repair: "Battery", additionalRepairs: [{repair: "Port", price: 30}]});
    dom.window.document.getElementById("quote-result-area")!.innerHTML = w.quoteTest.summary();
    const area = dom.window.document.getElementById("quote-result-area")!;
    expect(area.textContent).toContain("£130");
    expect(area.querySelectorAll(".quote-payment-options")).toHaveLength(1);
    expect(area.textContent).toContain("Pay with Klarna");
    expect(area.textContent).toContain("Cash on collection");
    expect(area.textContent).toContain("No payment needed now");
    expect(area.querySelectorAll("button")).toHaveLength(0);
    dom.window.close();
  });
  it("also shows the payment line on single-option repairs and hides it for an unpriced option", () => {
    const { dom, w } = quotePage();
    w.quoteTest.set({model: "iPhone test", repair: "Battery replacement", additionalRepairs: []});
    w.quoteTest.simple({customerPriceGbp: 50, displayPrice: "£50", partOption: "Battery", quoteKey: "battery-test"});
    expect(dom.window.document.querySelectorAll(".quote-payment-options")).toHaveLength(1);
    expect(dom.window.document.body.textContent).toContain("£50");
    w.quoteTest.set({price: null, quoteType: "personalized"});
    expect(w.quoteTest.summary()).not.toContain("Pay with Klarna");
    dom.window.close();
  });
});
