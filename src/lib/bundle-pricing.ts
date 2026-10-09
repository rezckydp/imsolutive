// Bundle Pricing Engine — pos-pricing-promo-spec.md
//
// Pure, stateless functions: no DB access here so the exact same code runs
// both server-side (checkout validation) and client-side (live cart preview
// in /pos, recalculated on every cart change per spec section 8). Config
// (categories/packages/bulk tiers) is loaded separately — see
// src/lib/bundle-config.ts on the server and the /api/bundle/config
// endpoint on the client.
//
// Algorithm (spec section 3): for each bulk-tier category, try every valid
// "how many units go to the bulk tier" (0, or bulkMinQty..qty); whatever's
// left is solved exactly via dynamic programming over the fixed packages
// (including cross-category ones like Finisher). Cheapest total wins;
// ties broken by fewest lines on the receipt. v1 is verified correct for
// exactly 2 bundle categories (28 test cases in spec section 7) — see the
// scope note on calculateBundlePrice for what happens with a 3rd.

export interface FixedPackage {
  code: string;
  name: string;
  requirements: Record<string, number>; // qty dibutuhkan per kode kategori
  price: number;
}

export interface BulkTier {
  categoryCode: string;
  name: string;
  minQty: number;
  unitPrice: number;
}

export interface BundleLine {
  code: string;
  name: string;
  packageCount: number;
  unitPrice: number;
  subtotal: number;
}

export interface BundlePriceResult {
  lines: BundleLine[];
  total: number;
  normalTotal: number;
  savings: number;
}

export interface UpsellHint {
  categoryCode: string;
  categoryName: string;
  extraPay: number;
  newTotal: number;
  message: string;
}

const INF = Number.POSITIVE_INFINITY;

interface DpCell {
  cost: number;
  count: number;
  pick: string | null; // kode FixedPackage yang dipakai buat nyampe sel ini
}

// DP eksak 2 dimensi (kategori A/B) — cost[a][b] = biaya termurah buat nutup
// PERSIS a unit kategori A + b unit kategori B pakai kombinasi FixedPackage
// (boleh dipakai berkali-kali), count[a][b] = jumlah baris paket buat
// tie-break. Selalu reachable asalkan ada paket "Single" per kategori di
// data (dijamin di 6 BundlePackage contoh pada spec bagian 7).
function solveFixedPackages(
  catA: string | undefined,
  catB: string | undefined,
  maxA: number,
  maxB: number,
  packages: FixedPackage[]
): DpCell[][] {
  const grid: DpCell[][] = Array.from({ length: maxA + 1 }, () =>
    Array.from({ length: maxB + 1 }, () => ({ cost: INF, count: INF, pick: null }))
  );
  grid[0][0] = { cost: 0, count: 0, pick: null };

  for (let a = 0; a <= maxA; a++) {
    for (let b = 0; b <= maxB; b++) {
      if (a === 0 && b === 0) continue;
      let best: DpCell = { cost: INF, count: INF, pick: null };
      for (const pkg of packages) {
        const reqA = catA ? pkg.requirements[catA] ?? 0 : 0;
        const reqB = catB ? pkg.requirements[catB] ?? 0 : 0;
        if (reqA === 0 && reqB === 0) continue; // paket yang gak nyentuh kategori ini, abaikan
        if (reqA > a || reqB > b) continue;
        const prev = grid[a - reqA][b - reqB];
        if (prev.cost === INF) continue;
        const cost = prev.cost + pkg.price;
        const count = prev.count + 1;
        if (cost < best.cost || (cost === best.cost && count < best.count)) {
          best = { cost, count, pick: pkg.code };
        }
      }
      grid[a][b] = best;
    }
  }
  return grid;
}

function bulkOptions(qty: number, tier: BulkTier | undefined): number[] {
  const opts = [0];
  if (tier && qty >= tier.minQty) {
    for (let k = tier.minQty; k <= qty; k++) opts.push(k);
  }
  return opts;
}

/**
 * Hitung kombinasi termurah buat keranjang berisi item kategori bundle.
 *
 * Scope v1 (lihat pos-pricing-promo-spec.md bagian 1 & 10): algoritma DP di
 * sini diverifikasi benar untuk PERSIS 2 kategori bundle sekaligus (STAND +
 * DISPLAY). Kalau suatu saat ada kategori ke-3 dalam 1 keranjang, 2 kategori
 * pertama (berdasar urutan Object.keys) tetap dioptimasi lewat DP seperti
 * biasa, sementara kategori ke-3+ dihargai flat di normalPrice-nya masing2
 * (gak ikut dioptimasi, tapi tetap KEHITUNG — never silently undercharge).
 */
export function calculateBundlePrice(
  qtyByCategory: Record<string, number>,
  packages: FixedPackage[],
  bulkTiers: BulkTier[],
  normalPriceByCategory: Record<string, number>
): BundlePriceResult {
  const categories = Object.keys(qtyByCategory).filter((c) => (qtyByCategory[c] ?? 0) > 0);
  const normalTotal = categories.reduce((sum, c) => sum + (normalPriceByCategory[c] ?? 0) * qtyByCategory[c], 0);

  if (categories.length === 0) {
    return { lines: [], total: 0, normalTotal: 0, savings: 0 };
  }

  const dpCategories = categories.slice(0, 2);
  const overflowCategories = categories.slice(2);
  const [catA, catB] = dpCategories;
  const qtyA = catA ? qtyByCategory[catA] : 0;
  const qtyB = catB ? qtyByCategory[catB] : 0;
  const tierA = bulkTiers.find((t) => t.categoryCode === catA);
  const tierB = catB ? bulkTiers.find((t) => t.categoryCode === catB) : undefined;

  const grid = solveFixedPackages(catA, catB, qtyA, qtyB, packages);

  let best: { cost: number; count: number; k: number; m: number } | null = null;
  for (const k of bulkOptions(qtyA, tierA)) {
    for (const m of catB ? bulkOptions(qtyB, tierB) : [0]) {
      const remA = qtyA - k;
      const remB = qtyB - m;
      const cell = grid[remA]?.[remB];
      if (!cell || cell.cost === INF) continue;
      const bulkCost = k * (tierA?.unitPrice ?? 0) + m * (tierB?.unitPrice ?? 0);
      const bulkLineCount = (k > 0 ? 1 : 0) + (m > 0 ? 1 : 0);
      const cost = bulkCost + cell.cost;
      const count = bulkLineCount + cell.count;
      if (!best || cost < best.cost || (cost === best.cost && count < best.count)) {
        best = { cost, count, k, m };
      }
    }
  }

  const lines: BundleLine[] = [];

  if (best) {
    if (best.k > 0 && tierA) {
      lines.push({
        code: `BULK_${tierA.categoryCode}`,
        name: `${tierA.name} (${best.k})`,
        packageCount: best.k,
        unitPrice: tierA.unitPrice,
        subtotal: best.k * tierA.unitPrice,
      });
    }
    if (best.m > 0 && tierB) {
      lines.push({
        code: `BULK_${tierB.categoryCode}`,
        name: `${tierB.name} (${best.m})`,
        packageCount: best.m,
        unitPrice: tierB.unitPrice,
        subtotal: best.m * tierB.unitPrice,
      });
    }

    // Reconstruct which fixed packages covered the DP remainder by walking
    // the `pick` trail backward from (qtyA-k, qtyB-m) to (0,0).
    const picks: Record<string, number> = {};
    let a = qtyA - best.k;
    let b = qtyB - best.m;
    while (a > 0 || b > 0) {
      const cell = grid[a][b];
      if (!cell?.pick) break; // safety net — shouldn't happen if cost !== INF
      const pkg = packages.find((p) => p.code === cell.pick);
      if (!pkg) break;
      picks[pkg.code] = (picks[pkg.code] ?? 0) + 1;
      a -= catA ? pkg.requirements[catA] ?? 0 : 0;
      b -= catB ? pkg.requirements[catB] ?? 0 : 0;
    }
    for (const [code, count] of Object.entries(picks)) {
      const pkg = packages.find((p) => p.code === code);
      if (!pkg) continue;
      lines.push({ code: pkg.code, name: pkg.name, packageCount: count, unitPrice: pkg.price, subtotal: pkg.price * count });
    }
  } else {
    // Unreachable in practice (requires a Single package per category to be
    // missing from the admin config) — fail safe to normal pricing instead
    // of silently charging 0.
    for (const c of dpCategories) {
      const qty = qtyByCategory[c] ?? 0;
      if (qty <= 0) continue;
      const unitPrice = normalPriceByCategory[c] ?? 0;
      lines.push({ code: `PLAIN_${c}`, name: c, packageCount: qty, unitPrice, subtotal: unitPrice * qty });
    }
  }

  // Kategori ke-3+ (di luar scope DP v1) — harga normal flat, tetap kehitung.
  for (const c of overflowCategories) {
    const qty = qtyByCategory[c] ?? 0;
    const unitPrice = normalPriceByCategory[c] ?? 0;
    lines.push({ code: `PLAIN_${c}`, name: c, packageCount: qty, unitPrice, subtotal: unitPrice * qty });
  }

  const total = lines.reduce((sum, l) => sum + l.subtotal, 0);
  const savings = normalTotal - total;

  return { lines, total, normalTotal, savings };
}

/**
 * "Kalau nambah 1 item kategori X, bayar tambahan cuma segini" — dihitung
 * dengan membandingkan total sekarang vs total kalau qty kategori itu +1,
 * untuk tiap kategori yang dikenal sistem bundle (punya paket atau bulk
 * tier). Fitur tambahan (direkomendasikan), bukan keputusan final — lihat
 * pos-pricing-promo-spec.md bagian 4.
 */
export function getUpsellHints(
  qtyByCategory: Record<string, number>,
  packages: FixedPackage[],
  bulkTiers: BulkTier[],
  normalPriceByCategory: Record<string, number>,
  categoryNameByCode: Record<string, string> = {}
): UpsellHint[] {
  const relevantCategories = new Set<string>();
  for (const p of packages) Object.keys(p.requirements).forEach((c) => relevantCategories.add(c));
  for (const t of bulkTiers) relevantCategories.add(t.categoryCode);
  if (relevantCategories.size === 0) return [];

  const current = calculateBundlePrice(qtyByCategory, packages, bulkTiers, normalPriceByCategory);
  const hints: UpsellHint[] = [];

  for (const cat of relevantCategories) {
    const next = calculateBundlePrice(
      { ...qtyByCategory, [cat]: (qtyByCategory[cat] ?? 0) + 1 },
      packages,
      bulkTiers,
      normalPriceByCategory
    );
    const extraPay = next.total - current.total;
    if (extraPay <= 0) continue; // gak ada insentif buat di-hint kalau gratis/lebih murah
    const name = categoryNameByCode[cat] ?? cat;
    hints.push({
      categoryCode: cat,
      categoryName: name,
      extraPay,
      newTotal: next.total,
      message: `Tambah 1 ${name} cuma +Rp ${extraPay.toLocaleString('id-ID')}`,
    });
  }

  return hints.sort((a, b) => a.extraPay - b.extraPay);
}
