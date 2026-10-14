import { createHash } from "crypto";

export type Catalogue = {
  quotes: any[];
  serviceGuidance: any;
  accessories?: any[];
};
export async function loadQuoteCatalogue(): Promise<Catalogue> {
  const url =
    process.env.QUOTE_CATALOGUE_URL ||
    "https://newforestdevicerepairs.co.uk/data/quote-catalogue.json";
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error("Pricing is temporarily unavailable");
  const catalogue = await response.json();
  if (!Array.isArray(catalogue.quotes))
    throw new Error("Invalid pricing catalogue");
  return catalogue;
}
export const pence = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || amount > 10000)
    throw new Error("Invalid price");
  return Math.round(amount * 100);
};
export function completeTotal(record: any): number {
  if (record.price_total != null) return pence(record.price_total);
  return (
    pence(record.quoted_price || 0) +
    [
      ...(record.additional_repairs || []),
      ...(record.accessories || []),
    ].reduce((sum, line) => sum + pence(line.price), 0)
  );
}
export function snapshot(record: any) {
  return {
    quote_key: record.quote_key || null,
    device: [record.device_make, record.device_model].filter(Boolean).join(" "),
    repair: record.repair_type || record.issue,
    part_option: record.part_option || record.screen_option || null,
    colour: record.device_colour || null,
    primary_price: record.quoted_price,
    additional_repairs: record.additional_repairs || [],
    accessories: record.accessories || [],
    total_pence: completeTotal(record),
  };
}
export function quoteFingerprint(value: any) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
const normal = (value: unknown) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, " ");
export function resolveRequest(catalogue: Catalogue, record: any) {
  const row = catalogue.quotes.find(
    (q) => q.quoteKey === record.quote_key && q.enabled !== false,
  );
  if (!row || row.priceType !== "fixed" || row.customerPriceGbp == null)
    throw new Error("This repair needs a confirmed price");
  if (
    normal(row.brand) !== normal(record.device_make) ||
    normal(row.model) !== normal(record.device_model)
  )
    throw new Error("Device does not match quote");
  const colour = record.device_colour
    ? String(record.device_colour).trim()
    : null;
  if (
    row.colourRequired &&
    (!colour ||
      (!row.allowCustomColour && !(row.colourOptions || []).includes(colour)))
  )
    throw new Error("Choose the required part colour");
  const discount = Number(
    catalogue.serviceGuidance?.combinedRepairDiscountPercent || 0,
  );
  const seen = new Set<string>();
  const additional = (record.additional_repairs || []).map((item: any) => {
    const matches = catalogue.quotes.filter(
      (q) =>
        q.enabled !== false &&
        q.brand === row.brand &&
        q.model === row.model &&
        normal(q.repair) === normal(item.repair) &&
        q.repair !== row.repair &&
        q.priceType === "fixed" &&
        q.customerPriceGbp != null,
    );
    const selected = item.quote_key
      ? matches.find((q) => q.quoteKey === item.quote_key)
      : matches.sort((a, b) => a.customerPriceGbp - b.customerPriceGbp)[0];
    if (!selected || seen.has(selected.repair))
      throw new Error("Additional repair is unavailable or duplicated");
    seen.add(selected.repair);
    const screen = /screen|display|lcd|oled|digitis|touch/i.test(
      selected.repair,
    );
    return {
      ...item,
      quote_key: selected.quoteKey,
      repair: selected.repair,
      display_name: selected.repair,
      part_option: selected.partOption,
      price: screen
        ? selected.customerPriceGbp
        : Math.round((selected.customerPriceGbp * (100 - discount)) / 100),
    };
  });
  const accessories = (record.accessories || []).map((item: any) => {
    const allowed = (catalogue.accessories || []).find(
      (a) =>
        a.name === item.name &&
        (!a.brand || a.brand === row.brand) &&
        (!a.screenOnly ||
          /screen|display|lcd|oled|digitis|touch/i.test(row.repair)),
    );
    if (!allowed || seen.has(allowed.name))
      throw new Error("Accessory is unavailable or duplicated");
    seen.add(allowed.name);
    return { name: allowed.name, price: allowed.customerPriceGbp };
  });
  return {
    quoted_price: row.customerPriceGbp,
    display_price: row.displayPrice,
    part_option: row.partOption,
    device_colour: colour,
    additional_repairs: additional,
    accessories,
  };
}
