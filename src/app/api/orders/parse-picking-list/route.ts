import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

interface ExtractedItem {
  code: string; // matched barcode/SKU string as found in the PDF
  variantId: string | null;
  sku: string;
  name: string;
  color: string;
  colorHex: string;
  type: string;
  currentStock: number;
  qty: number;
  matched: boolean;
}

// POST — upload a Picking List PDF, extract Picking List No + line items
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json(
        { error: "File PDF wajib diupload" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let text = "";
    try {
      const parsed = await pdfParse(buffer);
      text = parsed.text || "";
    } catch {
      return NextResponse.json(
        { error: "Gagal membaca PDF. Pastikan file adalah PDF Picking List yang valid." },
        { status: 400 }
      );
    }

    if (!text.trim()) {
      return NextResponse.json(
        { error: "Tidak ada teks yang bisa dibaca dari PDF ini (kemungkinan hasil scan gambar, bukan PDF asli)." },
        { status: 422 }
      );
    }

    // 1. Extract Picking List No (e.g. PICK-000775)
    const pickingListMatch = text.match(/PICK-\d+/i);
    const pickingListNo = pickingListMatch ? pickingListMatch[0].toUpperCase() : "";

    // 2. Load all known barcodes/SKUs from DB to match against
    const variants = await db.productVariant.findMany({
      where: { barcode: { not: null } },
      include: { product: true },
    });
    const products = await db.product.findMany({ include: { variants: true } });

    const barcodeMap = new Map<string, (typeof variants)[number]>();
    for (const v of variants) {
      if (v.barcode) barcodeMap.set(v.barcode.toUpperCase(), v);
    }
    const skuMap = new Map<string, (typeof products)[number]>();
    for (const p of products) {
      skuMap.set(p.sku.toUpperCase(), p);
    }

    // 3. Tokenize and scan for known codes + nearby quantity
    const tokens = text.split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    const items: ExtractedItem[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const raw = tokens[i];
      const code = raw.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      if (code.length < 4 || !code.includes("-")) continue;

      const variant = barcodeMap.get(code);
      const product = !variant ? skuMap.get(code) : undefined;
      if (!variant && !product) continue;
      if (seen.has(code)) continue; // already resolved this code earlier in the stream

      // Look ahead a few tokens for a standalone small integer = Qty
      let qty = 1;
      for (let j = i + 1; j < Math.min(i + 8, tokens.length); j++) {
        if (/^\d{1,3}$/.test(tokens[j])) {
          qty = parseInt(tokens[j], 10);
          break;
        }
      }

      seen.add(code);

      if (variant) {
        items.push({
          code,
          variantId: variant.id,
          sku: variant.product.sku,
          name: variant.product.name,
          color: variant.color,
          colorHex: variant.colorHex,
          type: variant.type,
          currentStock: variant.qty,
          qty,
          matched: true,
        });
      } else if (product && product.variants.length === 1) {
        const v = product.variants[0];
        items.push({
          code,
          variantId: v.id,
          sku: product.sku,
          name: product.name,
          color: v.color,
          colorHex: v.colorHex,
          type: v.type,
          currentStock: v.qty,
          qty,
          matched: true,
        });
      } else {
        // Product SKU matched but has multiple variants — can't auto-resolve color, flag for manual review
        items.push({
          code,
          variantId: null,
          sku: product!.sku,
          name: product!.name,
          color: "",
          colorHex: "#000000",
          type: "",
          currentStock: 0,
          qty,
          matched: false,
        });
      }
    }

    // 4. Anything that looked like a SKU code (has a hyphen, uppercase) but matched nothing — surface as unmatched rows
    const unmatchedCodes = new Set<string>();
    for (const raw of tokens) {
      const code = raw.toUpperCase().replace(/[^A-Z0-9-]/g, "");
      if (code.length < 4 || !code.includes("-")) continue;
      if (seen.has(code) || unmatchedCodes.has(code)) continue;
      if (barcodeMap.has(code) || skuMap.has(code)) continue;
      // Heuristic: looks like a product code (letters+digits+hyphen, not a long marketplace order id)
      if (/^[A-Z]{2,}[A-Z0-9]*-[A-Z0-9-]+$/.test(code) && code.length <= 25) {
        unmatchedCodes.add(code);
      }
    }
    for (const code of unmatchedCodes) {
      items.push({
        code,
        variantId: null,
        sku: code,
        name: "",
        color: "",
        colorHex: "#000000",
        type: "",
        currentStock: 0,
        qty: 1,
        matched: false,
      });
    }

    return NextResponse.json({ pickingListNo, items });
  } catch (error) {
    console.error("Error parsing picking list PDF:", error);
    return NextResponse.json(
      { error: "Gagal memproses PDF" },
      { status: 500 }
    );
  }
}
