import { describe, it, expect } from "vitest";
import { completeTotal, resolveRequest, snapshot } from "../lib/quote-pricing";
const catalogue = {
  quotes: [
    {
      quoteKey: "screen-oled",
      enabled: true,
      brand: "Apple",
      model: "iPhone test",
      repair: "Screen replacement",
      priceType: "fixed",
      customerPriceGbp: 100,
      partOption: "Premium OLED",
      colourRequired: true,
      colourOptions: ["Black"],
    },
    {
      quoteKey: "battery",
      enabled: true,
      brand: "Apple",
      model: "iPhone test",
      repair: "Battery replacement",
      priceType: "fixed",
      customerPriceGbp: 80,
      partOption: "Premium battery",
    },
  ],
  serviceGuidance: { combinedRepairDiscountPercent: 25 },
  accessories: [
    {
      name: "Protector",
      brand: "Apple",
      screenOnly: true,
      customerPriceGbp: 15,
    },
  ],
};
const request = {
  quote_key: "screen-oled",
  device_make: "Apple",
  device_model: "iPhone test",
  repair_type: "Screen replacement",
  device_colour: "Black",
  quoted_price: 1,
  additional_repairs: [{ repair: "Battery replacement", price: 1 }],
  accessories: [{ name: "Protector", price: 0 }],
};
describe("complete quote pricing", () => {
  it("verifies all lines, keeps the selected quality and colour, and produces one complete total", () => {
    const r = resolveRequest(catalogue, request);
    expect(r).toMatchObject({
      quoted_price: 100,
      part_option: "Premium OLED",
      device_colour: "Black",
    });
    expect(completeTotal(r)).toBe(17500);
    expect(snapshot({ ...request, ...r }).total_pence).toBe(17500);
  });
  it("uses changed published discount/accessory prices, with no browser-only fallback", () => {
    const c = {
      ...catalogue,
      serviceGuidance: { combinedRepairDiscountPercent: 10 },
      accessories: [{ ...catalogue.accessories[0], customerPriceGbp: 20 }],
    };
    expect(completeTotal(resolveRequest(c, request))).toBe(19200);
  });
  it("rejects disabled choices, wrong device, unknown accessories and invalid colour", () => {
    expect(() =>
      resolveRequest(
        {
          ...catalogue,
          quotes: catalogue.quotes.map((q) => ({ ...q, enabled: false })),
        },
        request,
      ),
    ).toThrow();
    expect(() =>
      resolveRequest(catalogue, { ...request, device_model: "wrong" }),
    ).toThrow();
    expect(() =>
      resolveRequest(catalogue, { ...request, device_colour: "Red" }),
    ).toThrow();
    expect(() =>
      resolveRequest(catalogue, {
        ...request,
        accessories: [{ name: "Free phone" }],
      }),
    ).toThrow();
  });
});
