import { NextResponse } from "next/server";
import { loadBundleEngineConfig } from "@/lib/bundle-config";

// GET the Bundle Pricing Engine config shaped for the client (/pos) to run
// the same calculateBundlePrice/getUpsellHints functions locally for a live
// cart preview, recalculated on every cart change (pos-pricing-promo-spec.md
// bagian 8). The server independently re-validates/recomputes this at
// checkout — this endpoint only feeds the UI preview, never trusted as the
// final price.
export async function GET() {
  try {
    const config = await loadBundleEngineConfig();
    return NextResponse.json({
      categories: config.categories,
      packages: config.packages,
      bulkTiers: config.bulkTiers,
    });
  } catch (error) {
    console.error("Error loading bundle config:", error);
    return NextResponse.json({ error: "Failed to load bundle config" }, { status: 500 });
  }
}
