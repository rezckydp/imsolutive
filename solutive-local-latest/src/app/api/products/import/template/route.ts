import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

// GET download Excel import template
// Format: 1 row = 1 product, color variants extend to the right (up to 5 variants)
export async function GET() {
  try {
    const MAX_VARIANTS = 5;

    // Build header row
    const headers: string[] = ["SKU", "Product Name", "Min Stock"];
    for (let i = 1; i <= MAX_VARIANTS; i++) {
      headers.push(`Color ${i}`, `Qty ${i}`, `Barcode ${i}`);
    }

    // Build sample data as array of arrays for precise column control
    const aoa: (string | number)[][] = [headers];

    // Sample Row 1: 2 variants
    aoa.push([
      "UCS001", "Abstract Wave Case", 10,
      "Black", 50, "8901234567890",
      "White", 30, "8901234567891",
    ]);
    // Pad empty variant columns
    while (aoa[1].length < headers.length) aoa[1].push("");

    // Sample Row 2: 3 variants
    aoa.push([
      "UCS002", "Floral Pattern Cover", 5,
      "Pink", 25, "8901234567892",
      "Red", 20, "8901234567893",
      "Blue", 15, "8901234567894",
    ]);
    while (aoa[2].length < headers.length) aoa[2].push("");

    // Sample Row 3: 1 variant
    aoa.push([
      "UCS003", "Minimalist Line Art", 8,
      "Black", 40, "8901234567895",
    ]);
    while (aoa[3].length < headers.length) aoa[3].push("");

    // Sample Row 4: 5 variants (max)
    aoa.push([
      "UCS004", "Full Color Collection", 10,
      "Black", 20, "8901234567001",
      "White", 20, "8901234567002",
      "Pink", 15, "8901234567003",
      "Red", 15, "8901234567004",
      "Blue", 10, "8901234567005",
    ]);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(aoa);

    // Set column widths
    worksheet["!cols"] = [
      { wch: 15 }, // SKU
      { wch: 28 }, // Product Name
      { wch: 10 }, // Min Stock
      // Variant groups (Color, Qty, Barcode) x 5
      { wch: 15 }, { wch: 8 }, { wch: 18 }, // Variant 1
      { wch: 15 }, { wch: 8 }, { wch: 18 }, // Variant 2
      { wch: 15 }, { wch: 8 }, { wch: 18 }, // Variant 3
      { wch: 15 }, { wch: 8 }, { wch: 18 }, // Variant 4
      { wch: 15 }, { wch: 8 }, { wch: 18 }, // Variant 5
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, "Products");

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Return as downloadable file
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition":
          'attachment; filename="product_import_template.xlsx"',
      },
    });
  } catch (error) {
    console.error("Error generating template:", error);
    return NextResponse.json(
      { error: "Failed to generate template" },
      { status: 500 }
    );
  }
}
