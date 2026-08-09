import Setting from "../models/Setting.js";
import * as R from "../utils/response.js";

// Fallback defaults if never configured. Not mathematically reciprocal on
// purpose — shops often round differently in each direction (e.g. buy at
// 4100, sell/convert back at 4050).
const DEFAULT_USD_TO_KHR = 4100; // used when converting a USD-priced item INTO KHR totals
const DEFAULT_KHR_TO_USD = 4100; // used when converting a KHR-priced item INTO USD totals

// ── GET /api/settings ──
// Returns all settings as a flat object: { usdToKhr: 4100, khrToUsd: 4100, ... }
export const getSettings = async (req, res, next) => {
  try {
    const docs = await Setting.find({});
    const out = { usdToKhr: DEFAULT_USD_TO_KHR, khrToUsd: DEFAULT_KHR_TO_USD };
    for (const doc of docs) out[doc.key] = doc.value;
    R.success(res, out);
  } catch (err) { next(err); }
};

// ── GET /api/settings/exchange-rate ──
// Convenience endpoint — both rates together, used by InvoiceCreate on load
export const getExchangeRate = async (req, res, next) => {
  try {
    const docs = await Setting.find({ key: { $in: ["usdToKhr", "khrToUsd"] } });
    const map = {};
    for (const d of docs) map[d.key] = d.value;
    R.success(res, {
      usdToKhr: map.usdToKhr ?? DEFAULT_USD_TO_KHR,
      khrToUsd: map.khrToUsd ?? DEFAULT_KHR_TO_USD,
    });
  } catch (err) { next(err); }
};

// ── PUT /api/settings/exchange-rate ──
// Body: { usdToKhr: 4100, khrToUsd: 4050 } — either or both can be sent
export const updateExchangeRate = async (req, res, next) => {
  try {
    const { usdToKhr, khrToUsd } = req.body;

    if (usdToKhr === undefined && khrToUsd === undefined) {
      return R.badRequest(res, "សូមបញ្ចូលអត្រាប្ដូរយ៉ាងហោចណាស់មួយ");
    }

    const updates = {};

    if (usdToKhr !== undefined) {
      const rate = Number(usdToKhr);
      if (!rate || rate <= 0) return R.badRequest(res, "អត្រា USD → ៛ មិនត្រឹមត្រូវ (ត្រូវធំជាង 0)");
      await Setting.findOneAndUpdate(
        { key: "usdToKhr" },
        { value: rate, updatedBy: req.user._id },
        { upsert: true }
      );
      updates.usdToKhr = rate;
    }

    if (khrToUsd !== undefined) {
      const rate = Number(khrToUsd);
      if (!rate || rate <= 0) return R.badRequest(res, "អត្រា ៛ → USD មិនត្រឹមត្រូវ (ត្រូវធំជាង 0)");
      await Setting.findOneAndUpdate(
        { key: "khrToUsd" },
        { value: rate, updatedBy: req.user._id },
        { upsert: true }
      );
      updates.khrToUsd = rate;
    }

    R.success(res, updates, "អត្រាប្ដូររូបិយប័ណ្ណបានកែប្រែដោយជោគជ័យ");
  } catch (err) { next(err); }
};