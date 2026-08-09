import { customAlphabet } from "nanoid";

const skuAlphabet = customAlphabet("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 10);
export const generateSKU = () => skuAlphabet();

export const generateInvoiceNumber = async (InvoiceModel) => {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `INV-${year}${month}`;

  const last = await InvoiceModel.findOne(
    { invoiceNumber: { $regex: `^${prefix}` } },
    { invoiceNumber: 1 },
    { sort: { createdAt: -1 } }
  );

  let seq = 1;
  if (last) {
    const parts = last.invoiceNumber.split("-");
    seq = parseInt(parts[parts.length - 1], 10) + 1;
  }
  return `${prefix}-${String(seq).padStart(4, "0")}`;
};
