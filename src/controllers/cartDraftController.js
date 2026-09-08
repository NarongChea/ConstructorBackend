import CartDraft from '../models/CartDraft.js'

// GET /api/cart-draft/:key
export const getDraft = async (req, res) => {
  try {
    const draft = await CartDraft.findOne({ key: req.params.key || 'current' })
    res.json(draft || null)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// PUT /api/cart-draft/:key  (upsert — create or overwrite)
export const saveDraft = async (req, res) => {
  try {
    const key = req.params.key || 'current'
    const draft = await CartDraft.findOneAndUpdate(
      { key },
      { ...req.body, key },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
    res.json(draft)
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}

// DELETE /api/cart-draft/:key  (clear after invoice is submitted)
export const clearDraft = async (req, res) => {
  try {
    await CartDraft.deleteOne({ key: req.params.key || 'current' })
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ message: err.message })
  }
}