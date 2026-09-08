import express from 'express'
import { getDraft, saveDraft, clearDraft } from '../controllers/cartDraftController.js'

const router = express.Router()

router.get('/:key', getDraft)
router.put('/:key', saveDraft)
router.delete('/:key', clearDraft)

export default router