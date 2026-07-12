import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as XLSX from "xlsx";

const MAX_VARIANTS = 5;

interface VariantImport {
  color: string;
  colorHex: string;
  qty: number;
  barcode: string;
}

interface ProductImport {
  name: string;
  minStock: number;
  variants: VariantImport[];
}

// POST import products from Excel file
// Supports WIDE format: 1 row = 1 product, with Color N / Qty N / Barcode N columns
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file uploaded" },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (
      !validTypes.includes(file.type) &&
      !file.name.endsWith(".xlsx") &&
      !file.name.endsWith(".xls")
    ) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an .xlsx file." },
        { status: 400 }
      );
    }

    // Read file buffer
    const buffer = Buffer.from(await file.arrayBuffer());

    // Parse Excel file
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json(
        { error: "Excel file has no sheets" },
        { status: 400 }
      );
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        skipped: 0,
        errors: ["Excel file is empty"],
      });
    }

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Detect format: check if first row has "Color 1" column (wide format)
    // or "Color" column (old long format)
    const firstRow = rows[0];
    const isWideFormat = "Color 1" in firstRow || "color 1" in firstRow;

    let productMap: Map<string, ProductImport>;

    if (isWideFormat) {
      productMap = parseWideFormat(rows, errors);
    } else {
      productMap = await parseLongFormat(rows, errors);
    }

    // Create products
    for (const [sku, productData] of productMap) {
      try {
        if (productData.variants.length === 0) {
          errors.push(`SKU "${sku}": Skipped - no valid color variants found`);
          continue;
        }

        // Double-check SKU doesn't exist (race condition guard)
        const existing = await db.product.findUnique({ where: { sku } });
        if (existing) {
          skipped++;
          errors.push(`SKU "${sku}": Already exists in database`);
          continue;
        }

        await db.product.create({
          data: {
            sku,
            name: productData.name,
            minStock: productData.minStock,
            variants: {
              create: productData.variants.map((v) => ({
                color: v.color,
                colorHex: v.colorHex,
                qty: v.qty,
                barcode: v.barcode || null,
              })),
            },
          },
        });

        created++;
      } catch (err) {
        errors.push(
          `Failed to create product "${sku}": ${
            err instanceof Error ? err.message : "Unknown error"
          }`
        );
      }
    }

    return NextResponse.json({
      success: true,
      created,
      skipped,
      errors,
    });
  } catch (error) {
    console.error("Error importing products:", error);
    return NextResponse.json(
      { error: "Failed to import products" },
      { status: 500 }
    );
  }
}

/**
 * WIDE FORMAT: 1 row = 1 product
 * Columns: SKU, Product Name, Min Stock, Color 1, Qty 1, Barcode 1, Color 2, Qty 2, Barcode 2, ...
 */
function parseWideFormat(
  rows: Record<string, unknown>[],
  errors: string[]
): Map<string, ProductImport> {
  const productMap = new Map<string, ProductImport>();

  // Collect all existing SKUs first for efficiency
  const existingSkus = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // Excel row number (1-indexed, +1 for header)

    const rawSku = String(row["SKU"] || "").trim();

    // Skip completely empty rows
    if (!rawSku) continue;

    // Check for duplicate SKU within the import file
    if (productMap.has(rawSku) || existingSkus.has(rawSku)) {
      errors.push(
        `Row ${rowNum}: SKU "${rawSku}" is duplicated in the file, using first occurrence only`
      );
      continue;
    }

    const rawName = String(row["Product Name"] || row["Name"] || "").trim();
    const rawMinStock = Number(row["Min Stock"] || row["MinStock"]) || 10;

    // Extract variants from Color N / Qty N / Barcode N columns
    const variants: VariantImport[] = [];
    const seenColors = new Set<string>();

    for (let v = 1; v <= MAX_VARIANTS; v++) {
      const color = String(row[`Color ${v}`] || "").trim();
      if (!color) continue; // No color = no variant for this slot

      // Skip duplicate colors within same product
      const colorLower = color.toLowerCase();
      if (seenColors.has(colorLower)) {
        errors.push(
          `Row ${rowNum}: Duplicate color "${color}" for SKU "${rawSku}", skipping duplicate`
        );
        continue;
      }
      seenColors.add(colorLower);

      const qty = Math.max(0, Number(row[`Qty ${v}`]) || 0);
      const barcode = String(row[`Barcode ${v}`] || "").trim();

      variants.push({
        color,
        colorHex: getColorHex(color),
        qty,
        barcode,
      });
    }

    if (variants.length === 0) {
      errors.push(
        `Row ${rowNum}: SKU "${rawSku}" has no color variants, skipping`
      );
      continue;
    }

    productMap.set(rawSku, {
      name: rawName || rawSku,
      minStock: Math.max(0, rawMinStock),
      variants,
    });
  }

  return productMap;
}

/**
 * LONG FORMAT (legacy): 1 row = 1 variant, same SKU = same product
 * Columns: SKU, Name, Color, Quantity, MinStock, Barcode
 */
async function parseLongFormat(
  rows: Record<string, unknown>[],
  errors: string[]
): Promise<Map<string, ProductImport>> {
  const productMap = new Map<string, ProductImport>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const rawSku = String(row["SKU"] || "").trim();
    const rawName = String(row["Name"] || "").trim();
    const rawColor = String(row["Color"] || "").trim();
    const rawQty = Number(row["Quantity"] || row["Qty"]) || 0;
    const rawMinStock = Number(row["MinStock"] || row["Min Stock"]) || 10;
    const rawBarcode = String(row["Barcode"] || "").trim();

    if (!rawSku) {
      errors.push(`Row ${rowNum}: Skipped - empty SKU`);
      continue;
    }
    if (!rawColor) {
      errors.push(`Row ${rowNum}: Skipped - empty Color for SKU "${rawSku}"`);
      continue;
    }

    // Check if product already exists in DB
    const existing = await db.product.findUnique({ where: { sku: rawSku } });
    if (existing) {
      // Mark as skipped so we report it
      if (!productMap.has(rawSku)) {
        productMap.set(rawSku, {
          name: rawName,
          minStock: rawMinStock,
          variants: [], // Empty variants = will be skipped in creation
        });
      }
      continue;
    }

    if (productMap.has(rawSku)) {
      const product = productMap.get(rawSku)!;
      const colorExists = product.variants.some(
        (v) => v.color.toLowerCase() === rawColor.toLowerCase()
      );
      if (!colorExists) {
        product.variants.push({
          color: rawColor,
          colorHex: getColorHex(rawColor),
          qty: Math.max(0, rawQty),
          barcode: rawBarcode,
        });
      }
    } else {
      productMap.set(rawSku, {
        name: rawName || rawSku,
        minStock: Math.max(0, rawMinStock),
        variants: [
          {
            color: rawColor,
            colorHex: getColorHex(rawColor),
            qty: Math.max(0, rawQty),
            barcode: rawBarcode,
          },
        ],
      });
    }
  }

  return productMap;
}

// Helper: Map common color names to hex codes
function getColorHex(colorName: string): string {
  const colorMap: Record<string, string> = {
    black: "#000000",
    white: "#ffffff",
    red: "#e74c3c",
    blue: "#3498db",
    green: "#27ae60",
    yellow: "#f1c40f",
    orange: "#f39c12",
    purple: "#9b59b6",
    pink: "#e91e63",
    brown: "#795548",
    grey: "#9e9e9e",
    gray: "#9e9e9e",
    "sky blue": "#87ceeb",
    "light brown": "#d2a679",
    "olive green": "#6b8e23",
    teal: "#1abc9c",
    navy: "#2c3e50",
    beige: "#f5f5dc",
    maroon: "#800000",
    gold: "#ffd700",
    silver: "#c0c0c0",
    cream: "#fffdd0",
    coral: "#ff7f50",
    lavender: "#e6e6fa",
    mint: "#98ff98",
    charcoal: "#36454f",
    burgundy: "#800020",
  };

  const lower = colorName.toLowerCase().trim();
  return colorMap[lower] || "#4b5563"; // Default grey
}
