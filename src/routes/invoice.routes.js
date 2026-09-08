export const createInvoice = async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      invoiceType = "customer",
      partnerId,
      customerName, customerPhone, customerType = "retail",
      items, discountType = "none", discountValue = 0, note, status,
      depositInputAmount: rawDeposit,
      depositInputCurrency,
      currency = "KHR",
      usdToKhrRate, khrToUsdRate,
    } = req.body;

    if (!items || items.length === 0) {
      await session.abortTransaction();
      return R.badRequest(res, "Invoice must have at least one item");
    }

    if (Number(rawDeposit) > 0 && !depositInputCurrency) {
      await session.abortTransaction();
      return R.badRequest(res, "depositInputCurrency is required when depositInputAmount > 0");
    }

    let partnerDoc = null;
    if (invoiceType === "partner") {
      if (!partnerId) { await session.abortTransaction(); return R.badRequest(res, "partnerId is required for partner invoices"); }
      partnerDoc = await Partner.findById(partnerId).session(session);
      if (!partnerDoc) { await session.abortTransaction(); return R.notFound(res, "Partner not found"); }
      if (!partnerDoc.canBuyFromUs) { await session.abortTransaction(); return R.badRequest(res, "This partner is not configured as a buyer"); }
    }

    const invoiceItems = [];
    let subtotal = 0;
    let subtotalKHR = 0;
    let subtotalUSD = 0;

    for (const item of items) {
      // ── Sheet-metal (ស័ង្កសី) items: subtotal comes from the frontend
      //    as the SUM of its segments (length × qty × price-per-meter),
      //    NOT quantity × unitPrice — item.quantity here is a total SHEET
      //    COUNT (sum of segment qty), and unitPrice is price PER METER,
      //    so quantity × unitPrice would be the wrong number entirely. ──
      const isSheetMetal = !!item.isSheetMetal;
      const segments = isSheetMetal && Array.isArray(item.segments)
        ? item.segments.map(seg => ({
            length:          Number(seg.length) || 0,
            qty:             Number(seg.qty) || 0,
            type:            seg.type || "",
            typeLabel:       seg.typeLabel || "",
            extra1:          Number(seg.extra1) || 0,
            extra2:          Number(seg.extra2) || 0,
            effectiveLength: Number(seg.effectiveLength ?? seg.length) || 0,
            subtotal:        Number(seg.subtotal) || 0,
          }))
        : [];

      // ── Custom item (not in DB) ──
      if (item.isCustom) {
        const unitPrice    = Number(item.unitPrice) || 0;
        const qty          = Number(item.quantity)  || 1;
        const itemSubtotal = isSheetMetal ? (Number(item.subtotal) || 0) : qty * unitPrice;
        const itemCurrency = currency === "BOTH" ? (item.currency || "KHR") : currency;

        if (currency === "BOTH") {
          if (itemCurrency === "USD") subtotalUSD += itemSubtotal; else subtotalKHR += itemSubtotal;
        } else {
          subtotal += itemSubtotal;
        }

        invoiceItems.push({
          variantId: null, productId: null, sku: "",
          productName: item.productName || "Custom Item",
          brand: "", unit: "", unitValue: null, unitTypeName: null, attributes: [],
          quantity: qty, priceType: "custom", currency: itemCurrency,
          unitPrice, subtotal: itemSubtotal, isCustom: true,
          isSheetMetal, segments,
        });
        continue;
      }

      if (!item.variantId) { await session.abortTransaction(); return R.badRequest(res, "variantId is required for non-custom items"); }

      const variant = await ProductVariant.findById(item.variantId).session(session);
      if (!variant)          { await session.abortTransaction(); return R.notFound(res, `Variant ${item.variantId} not found`); }
      if (!variant.isActive) { await session.abortTransaction(); return R.badRequest(res, `Variant ${variant.sku} is inactive`); }
      if (variant.stock < item.quantity) {
        await session.abortTransaction();
        return R.badRequest(res, `Insufficient stock for SKU: ${variant.sku} (available: ${variant.stock}, requested: ${item.quantity})`);
      }

      let unitPrice, priceType;
      if (item.unitPrice !== undefined) {
        unitPrice = Number(item.unitPrice); priceType = item.priceType || "custom";
      } else {
        const resolved = await resolveItemPrice(variant, {
          userId:    invoiceType === "customer" ? req.user._id : null,
          partnerId: invoiceType === "partner"  ? partnerId    : null,
          customerType, quantity: item.quantity,
        });
        unitPrice = resolved.price; priceType = resolved.priceType;
      }

      const itemSubtotal = isSheetMetal ? (Number(item.subtotal) || 0) : item.quantity * unitPrice;
      const itemCurrency = currency === "BOTH" ? (variant.currency || "KHR") : currency;

      if (currency === "BOTH") {
        if (itemCurrency === "USD") subtotalUSD += itemSubtotal; else subtotalKHR += itemSubtotal;
      } else {
        subtotal += itemSubtotal;
      }

      const productDoc = await Product.findById(variant.productId).select("name attributes").session(session);

      let unitTypeName = null;
      if (variant.unitTypeId) {
        const { default: UnitType } = await import("../models/UnitType.js");
        const ut = await UnitType.findById(variant.unitTypeId).select("displayName name").session(session);
        unitTypeName = ut?.displayName || ut?.name || null;
      }

      invoiceItems.push({
        variantId: variant._id, productId: variant.productId,
        sku: variant.sku, productName: productDoc?.name || "Unknown",
        brand: variant.brand, unit: variant.unit, unitValue: variant.unitValue, unitTypeName,
        attributes: productDoc?.attributes || [],
        quantity: item.quantity, priceType, currency: itemCurrency,
        unitPrice, subtotal: itemSubtotal, isCustom: false,
        isSheetMetal, segments,
      });

      const previousStock = variant.stock;
      variant.stock -= item.quantity;
      await variant.save({ session });
      await StockHistory.create([{
        variantId: variant._id, productId: variant.productId,
        type: "out", quantity: item.quantity, previousStock, newStock: variant.stock,
        reason: invoiceType === "partner" ? `Sale to partner — ${partnerDoc.name}` : `Sale invoice — ${customerType} customer`,
        referenceType: "invoice", createdBy: req.user._id,
      }], { session });
    }

    let invoiceFields;

    if (currency === "BOTH") {
      const discountAmountKHR = applyDiscount(subtotalKHR, discountType, discountValue);
      const discountAmountUSD = discountType === "percent" ? applyDiscount(subtotalUSD, discountType, discountValue) : 0;
      const totalKHR = Math.max(0, subtotalKHR - discountAmountKHR);
      const totalUSD = Math.max(0, subtotalUSD - discountAmountUSD);

      const grandTotalInInputCurrency = depositInputCurrency === "USD"
        ? totalUSD + (totalKHR / (Number(khrToUsdRate) || 4100))
        : totalKHR + (totalUSD * (Number(usdToKhrRate) || 4100));
      const cappedInput = Math.min(Math.max(0, Number(rawDeposit) || 0), grandTotalInInputCurrency);

      const { depositKHR, depositUSD, remainingKHR, remainingUSD } = applyCascadingDeposit({
        inputAmount: cappedInput,
        inputCurrency: depositInputCurrency,
        totalKHR, totalUSD,
        usdToKhrRate: Number(usdToKhrRate) || 4100,
        khrToUsdRate: Number(khrToUsdRate) || 4100,
      });

      const bothCovered = remainingKHR === 0 && remainingUSD === 0;
      const anyCovered  = (depositKHR > 0 || depositUSD > 0);
      const invoiceStatus = status && status !== "auto"
        ? status
        : bothCovered ? "paid" : anyCovered ? "partial" : "paid";

      invoiceFields = {
        currency: "BOTH",
        usdToKhrRate: Number(usdToKhrRate) || 4100,
        khrToUsdRate: Number(khrToUsdRate) || 4100,
        subtotal: 0, total: 0, discountAmount: 0,
        subtotalKHR, subtotalUSD,
        discountAmountKHR, discountAmountUSD,
        totalKHR, totalUSD,
        depositKHR, depositUSD,
        depositInputAmount: cappedInput,
        depositInputCurrency: cappedInput > 0 ? depositInputCurrency : null,
        remainingKHR, remainingUSD,
        depositAmount: 0, remainingAmount: 0,
        status: invoiceStatus,
      };
    } else {
      const discountAmount = applyDiscount(subtotal, discountType, discountValue);
      const total = Math.max(0, subtotal - discountAmount);

      const convertedDeposit = convertDepositToInvoiceCurrency({
        inputAmount: Number(rawDeposit) || 0,
        inputCurrency: depositInputCurrency || currency,
        invoiceCurrency: currency,
        usdToKhrRate: Number(usdToKhrRate) || 4100,
        khrToUsdRate: Number(khrToUsdRate) || 4100,
      });
      const depositAmount   = Math.min(Math.max(0, convertedDeposit), total);
      const remainingAmount = Math.max(0, total - depositAmount);
      const invoiceStatus   = computeStatus(total, depositAmount, status);

      invoiceFields = {
        currency,
        usdToKhrRate: Number(usdToKhrRate) || 4100,
        khrToUsdRate: Number(khrToUsdRate) || 4100,
        subtotal, discountAmount, total,
        subtotalKHR: 0, subtotalUSD: 0, discountAmountKHR: 0, discountAmountUSD: 0, totalKHR: 0, totalUSD: 0,
        depositKHR: 0, depositUSD: 0,
        depositInputAmount: Number(rawDeposit) || 0,
        depositInputCurrency: Number(rawDeposit) > 0 ? (depositInputCurrency || currency) : null,
        depositAmount, remainingAmount,
        remainingKHR: 0, remainingUSD: 0,
        status: invoiceStatus,
      };
    }

    const invoiceNumber = await generateInvoiceNumber(Invoice);

    const [invoice] = await Invoice.create([{
      invoiceNumber, invoiceType,
      partnerId:    invoiceType === "partner"  ? partnerId    : null,
      partnerName:  invoiceType === "partner"  ? partnerDoc.name : null,
      customerName: invoiceType === "partner"  ? partnerDoc.name : (customerName || "Walk-in Customer"),
      customerPhone,
      customerType: invoiceType === "partner"  ? "partner" : customerType,
      items: invoiceItems,
      discountType, discountValue,
      note,
      createdBy: req.user._id,
      ...invoiceFields,
    }], { session });

    await StockHistory.updateMany(
      { referenceType: "invoice", referenceId: null, createdBy: req.user._id },
      { $set: { referenceId: invoice._id } },
      { session }
    );

    await session.commitTransaction();

    const populated = await Invoice.findById(invoice._id)
      .populate("createdBy", "name")
      .populate("partnerId", "name phone");
    R.created(res, populated, "Invoice created");
  } catch (err) {
    await session.abortTransaction();
    next(err);
  } finally {
    session.endSession();
  }
};