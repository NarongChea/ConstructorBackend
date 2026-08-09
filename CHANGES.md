# Construction System — Changes & Upgrade Guide

## What Changed & Why

### 1. `src/models/Product.js` — Flexible Attributes Array

**Before:** No attribute storage on products (only on variants with a fixed `{size, color}` object).

**After:** Products now carry a flexible `attributes` array:
```json
{
  "attributes": [
    { "name": "thickness", "value": "2mm" },
    { "name": "length",    "value": "6m"  }
  ]
}
```
- Metal sheets can store `thickness`, `length`, `grade`
- Cement bags can store `weight`, `type`, `setting_time`
- Tiles can store `size`, `finish`, `material`
- No empty or meaningless fields forced on unrelated products

**API Usage — Create product with attributes:**
```http
POST /api/products
{
  "name": "Steel Sheet",
  "categoryId": "...",
  "attributes": [
    { "name": "thickness", "value": "2mm" },
    { "name": "length",    "value": "6m"  },
    { "name": "grade",     "value": "SS400" }
  ]
}
```

---

### 2. `src/models/ProductVariant.js` — Multi-Tier Pricing + Per-Variant Stock

**Before:** Single `price` field, `attributes: { size, color }` fixed object.

**After:**
- **`pricingTiers[]`** supports `retail`, `wholesale`, `vip`, `bulk` (quantity-based)
- **`stock`** stays on the variant (correct — each combination tracks its own stock)
- Old `price` field kept for backward compatibility (auto-synced to retail tier)

**Pricing resolution logic:**
1. Bulk tiers are checked first (highest `minQty` that fits quantity wins)
2. Then customer-type tier (`retail` / `wholesale` / `vip`)
3. Falls back to base `price`

**API Usage — Create variant with pricing tiers:**
```http
POST /api/variants
{
  "productId": "...",
  "brand": "BlueStar",
  "unit": "sheet",
  "unitValue": 1,
  "price": 45,
  "pricingTiers": [
    { "type": "retail",    "price": 45,  "minQty": 1 },
    { "type": "wholesale", "price": 38,  "minQty": 50 },
    { "type": "vip",       "price": 35,  "minQty": 1  },
    { "type": "bulk",      "price": 30,  "minQty": 200, "description": "Min 200 sheets" }
  ]
}
```

**Resolve price for a customer type + quantity (without creating invoice):**
```http
GET /api/variants/:id/price?customerType=wholesale&quantity=100
```
Response:
```json
{
  "variantId": "...",
  "sku": "ABCD123456",
  "customerType": "wholesale",
  "quantity": 100,
  "unitPrice": 38,
  "subtotal": 3800,
  "pricingTiers": [...]
}
```

---

### 3. `src/models/Invoice.js` — Attribute Snapshot + Customer Type

**Before:** Invoice items stored only `sku`, `brand`, `unit`, `unitValue`.

**After:**
- `customerType` field on invoice (`retail` / `wholesale` / `vip`)
- `priceType` per item (which tier was used)
- `attributes[]` snapshot on each item — records product attributes at time of sale so reprinting an old invoice still shows correct specs even if the product changes later
- `productId` stored per item for easier reporting

---

### 4. `src/controllers/invoice.controller.js` — Auto-Price + Preview Endpoint

**Before:** Frontend had to send `unitPrice` manually.

**After:**
- **`POST /api/invoices/preview`** — calculate totals without saving. Frontend calls this in real time as the user builds the invoice.
- If `unitPrice` is omitted from an item, the backend auto-resolves it using `customerType` + `quantity` via `variant.resolvePrice()`
- Stock deduction is per-variant (unchanged, but now with clearer error messages)
- Attribute snapshot captured from product at time of save

**Preview endpoint:**
```http
POST /api/invoices/preview
{
  "customerType": "wholesale",
  "items": [
    { "variantId": "...", "quantity": 100 },
    { "variantId": "...", "quantity": 50  }
  ],
  "discountType": "percent",
  "discountValue": 5
}
```
Returns full calculated breakdown including resolved prices, attributes, stock availability — without touching the database.

---

### 5. `src/routes/invoice.routes.js` — New File

Invoice routes were missing from the original codebase. Added:
```
POST   /api/invoices/preview    ← auto-calculate, no save
GET    /api/invoices            ← list with filtering by customerType
GET    /api/invoices/:id        ← full invoice with items
POST   /api/invoices            ← create + deduct stock
PATCH  /api/invoices/:id/status ← update status (admin)
PATCH  /api/invoices/:id/print  ← mark as printed
```

---

### 6. `src/routes/variant.routes.js` — Price Resolution Route

Added:
```
GET /api/variants/:id/price?customerType=vip&quantity=50
```

---

### 7. `frontend/InvoiceForm.jsx` — Full Frontend Component

React component that:
- Loads products and variants from API
- Shows product attributes (thickness, weight, length…) as pills
- Auto-selects price based on customer type and pricing tiers
- Calls `/api/invoices/preview` on every change (debounced 350ms) to show live totals
- Allows overriding unit price per item
- Shows all available pricing tiers as badges
- Saves invoice to backend
- **Print mode:** `@media print` CSS hides all UI chrome; only the clean invoice table prints
- Marks invoice as printed via API after user clicks Print

---

## Migration Notes

Existing products have no `attributes` array — they will return `[]` which is correct.

Existing variants have no `pricingTiers` — `resolvePrice()` falls back to the base `price` field, so old variants work without any data migration.

Existing invoices have no `customerType` / `priceType` / `attributes` snapshot — these fields default gracefully (`retail`, `retail`, `[]`).

No breaking changes to any existing API endpoints.
