import mongoose from 'mongoose'

const cartDraftSchema = new mongoose.Schema({
  // Simple key so you can support multiple concurrent drafts later
  // (e.g. per staff terminal) — for now just always use "current".
  key: { type: String, required: true, unique: true, default: 'current' },

  invoiceType:   { type: String, default: 'customer' },
  customerName:  { type: String, default: '' },
  customerPhone: { type: String, default: '' },
  customerType:  { type: String, default: 'retail' },
  partnerId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Partner', default: null },
  note:          { type: String, default: '' },
  discountType:  { type: String, default: 'none' },
  discountValue: { type: Number, default: 0 },
  displayCurrency: { type: String, default: 'KHR' },
  paymentMode:   { type: String, default: 'paid' },
  deposit:       { type: Number, default: 0 },
  depositCurrency: { type: String, default: 'KHR' },

  // The cart itself — stored as-is (Mixed) since its shape varies
  // between normal items, custom items, and sheet-metal items with segments.
  cart: { type: mongoose.Schema.Types.Mixed, default: [] },

}, { timestamps: true })

export default mongoose.model('CartDraft', cartDraftSchema)