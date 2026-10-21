// Label Studio shared render core (ims-feature-label-studio-*.md).
// Pure client-side — QR + text are drawn into a <canvas>, used by the
// Generate Label live preview, Library thumbnails, PNG download, and the
// browser-print page. Positions/sizes are internal px at 50mm x 30mm
// label size, ~12px/mm => 600x360.
import QRCode from "qrcode";

export const LABEL_WIDTH_PX = 600;
export const LABEL_HEIGHT_PX = 360;
export const FONT_SIZE_MIN = 1;
export const FONT_SIZE_MAX = 50;

// Curated Google Fonts — a dropdown, never free text, so nothing mistyped
// or unloadable ever ends up in a template/label.
export const LABEL_FONT_FAMILIES = ["Poppins", "Inter", "Plus Jakarta Sans", "Archivo Black", "League Spartan"] as const;
export type LabelFontFamily = (typeof LABEL_FONT_FAMILIES)[number];
export const DEFAULT_FONT_FAMILY: LabelFontFamily = "Inter";

// The weight actually requested for each family — Archivo Black only ships
// one weight on Google Fonts, so "bold" there just means "the only face it
// has" rather than a heavier numeric weight that would fail to load.
const FONT_WEIGHTS: Record<string, { normal: number; bold: number }> = {
  Poppins: { normal: 400, bold: 800 },
  Inter: { normal: 400, bold: 800 },
  "Plus Jakarta Sans": { normal: 400, bold: 700 },
  "Archivo Black": { normal: 400, bold: 400 },
  "League Spartan": { normal: 400, bold: 700 },
};

const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Poppins:wght@400;700;800",
    "family=Inter:wght@400;700;800",
    "family=Plus+Jakarta+Sans:wght@400;700",
    "family=Archivo+Black",
    "family=League+Spartan:wght@400;700",
  ].join("&") +
  "&display=swap";

let fontsLinkInjected = false;
let fontsReadyPromise: Promise<void> | null = null;

// Injects the Google Fonts <link> once, then explicitly loads every
// curated family/weight via the Font Loading API and waits for
// document.fonts.ready — so drawLabel() never renders a flash of the
// fallback font before the real one is in (test case 13).
export function ensureLabelFontsReady(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  if (fontsReadyPromise) return fontsReadyPromise;

  if (!fontsLinkInjected) {
    fontsLinkInjected = true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = GOOGLE_FONTS_HREF;
    document.head.appendChild(link);
  }

  const loads: Promise<unknown>[] = [];
  for (const family of LABEL_FONT_FAMILIES) {
    const w = FONT_WEIGHTS[family] ?? { normal: 400, bold: 700 };
    loads.push(document.fonts.load(`${w.normal} 16px "${family}"`).catch(() => {}));
    if (w.bold !== w.normal) {
      loads.push(document.fonts.load(`${w.bold} 16px "${family}"`).catch(() => {}));
    }
  }

  fontsReadyPromise = Promise.all(loads)
    .then(() => document.fonts.ready.catch(() => {}))
    .then(() => undefined);
  return fontsReadyPromise;
}

function fontString(family: string | undefined, size: number, bold: boolean): string {
  const fam = family || DEFAULT_FONT_FAMILY;
  const w = FONT_WEIGHTS[fam] ?? { normal: 400, bold: 700 };
  const weight = bold ? w.bold : w.normal;
  return `${weight} ${size}px "${fam}", sans-serif`;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextBox extends Box {
  fontSize: number;
  fontFamily?: string;
  maxLines?: number;
  show?: boolean;
}

export interface TemplateElements {
  qr: Box;
  sku: TextBox;
  name: TextBox;
  keterangan: TextBox;
  swatch: TextBox;
}

export const DEFAULT_TEMPLATE_ELEMENTS: TemplateElements = {
  qr: { x: 24, y: 64, w: 232, h: 232 },
  sku: { x: 280, y: 48, w: 280, h: 40, fontSize: 32, fontFamily: "Poppins" },
  name: { x: 280, y: 92, w: 292, h: 52, fontSize: 19, fontFamily: "Inter", maxLines: 2 },
  keterangan: { x: 280, y: 158, w: 260, h: 24, fontSize: 16, fontFamily: "Inter", show: true },
  swatch: { x: 280, y: 290, w: 160, h: 34, fontSize: 24, fontFamily: "Inter", show: true },
};

export interface Guides {
  v: number[];
  h: number[];
}

export const DEFAULT_GUIDES: Guides = { v: [], h: [] };

export interface FontOverride {
  size?: number;
  family?: string;
}

// Per-label override — only the fields the user actually touched in
// Generate Label are set here; everything else falls back to the template.
export interface LabelFontOverride {
  sku?: FontOverride;
  name?: FontOverride;
  keterangan?: FontOverride;
  swatch?: FontOverride;
  show?: {
    keterangan?: boolean;
    swatch?: boolean;
  };
}

export interface DrawLabelParams {
  skuName: string;
  qrCode: string;
  productName: string;
  color: string;
  keterangan?: string | null;
  fonts?: LabelFontOverride | null;
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    lines.length = maxLines;
  } else if (words.length > 0 && lines.join(" ").split(/\s+/).length < words.length && lines.length === maxLines) {
    // truncated — mark last line with ellipsis
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.replace(/\s*$/, "") + "…";
  }
  return lines.slice(0, maxLines);
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Renders one label into `ctx` (expected canvas size LABEL_WIDTH_PX x
// LABEL_HEIGHT_PX). `template` supplies positions/sizes/fonts/defaults;
// `params.fonts` carries this specific label's font size/family/show
// overrides.
export async function drawLabel(
  ctx: CanvasRenderingContext2D,
  template: TemplateElements,
  params: DrawLabelParams
): Promise<void> {
  const { skuName, qrCode, productName, color, keterangan, fonts } = params;

  await ensureLabelFontsReady();

  ctx.clearRect(0, 0, LABEL_WIDTH_PX, LABEL_HEIGHT_PX);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, LABEL_WIDTH_PX, LABEL_HEIGHT_PX);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  // QR
  if (qrCode && qrCode.trim()) {
    try {
      const dataUrl = await QRCode.toDataURL(qrCode, { margin: 0, width: Math.round(template.qr.w) });
      const img = await loadImage(dataUrl);
      ctx.drawImage(img, template.qr.x, template.qr.y, template.qr.w, template.qr.h);
    } catch {
      // bad/empty QR value — leave the area blank rather than failing the whole render
    }
  }

  // SKU — bold, 1 line, clipped to its box
  const skuBox = template.sku;
  const skuFontSize = fonts?.sku?.size ?? skuBox.fontSize;
  const skuFontFamily = fonts?.sku?.family ?? skuBox.fontFamily;
  ctx.save();
  ctx.beginPath();
  ctx.rect(skuBox.x, skuBox.y, skuBox.w, skuBox.h);
  ctx.clip();
  ctx.font = fontString(skuFontFamily, skuFontSize, true);
  ctx.fillText(skuName || "", skuBox.x, skuBox.y + (skuBox.h - skuFontSize) / 2);
  ctx.restore();

  // Nama Produk — wraps up to maxLines
  const nameBox = template.name;
  const nameFontSize = fonts?.name?.size ?? nameBox.fontSize;
  const nameFontFamily = fonts?.name?.family ?? nameBox.fontFamily;
  const maxLines = nameBox.maxLines ?? 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(nameBox.x, nameBox.y, nameBox.w, nameBox.h);
  ctx.clip();
  ctx.font = fontString(nameFontFamily, nameFontSize, false);
  const lineHeight = nameFontSize * 1.25;
  const lines = wrapLines(ctx, productName || "", nameBox.w, maxLines);
  lines.forEach((line, i) => {
    ctx.fillText(line, nameBox.x, nameBox.y + i * lineHeight);
  });
  ctx.restore();

  // Keterangan — 1 line, shown only if (override ?? template default) AND non-empty
  const ketBox = template.keterangan;
  const ketShow = fonts?.show?.keterangan ?? ketBox.show ?? true;
  if (ketShow && keterangan && keterangan.trim()) {
    const ketFontSize = fonts?.keterangan?.size ?? ketBox.fontSize;
    const ketFontFamily = fonts?.keterangan?.family ?? ketBox.fontFamily;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ketBox.x, ketBox.y, ketBox.w, ketBox.h);
    ctx.clip();
    ctx.font = fontString(ketFontFamily, ketFontSize, false);
    ctx.fillText(keterangan, ketBox.x, ketBox.y + (ketBox.h - ketFontSize) / 2);
    ctx.restore();
  }

  // Swatch — outline circle (never filled with the real color) + warna text
  const swatchBox = template.swatch;
  const swatchShow = fonts?.show?.swatch ?? swatchBox.show ?? true;
  if (swatchShow && color && color.trim()) {
    const swatchFontSize = fonts?.swatch?.size ?? swatchBox.fontSize;
    const swatchFontFamily = fonts?.swatch?.family ?? swatchBox.fontFamily;
    const radius = Math.min(swatchBox.h, swatchFontSize * 1.4) / 2;
    const cx = swatchBox.x + radius;
    const cy = swatchBox.y + swatchBox.h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000000";
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(swatchBox.x + radius * 2 + 8, swatchBox.y, swatchBox.w - radius * 2 - 8, swatchBox.h);
    ctx.clip();
    ctx.font = fontString(swatchFontFamily, swatchFontSize, false);
    ctx.fillText(color, swatchBox.x + radius * 2 + 8, swatchBox.y + (swatchBox.h - swatchFontSize) / 2);
    ctx.restore();
  }
}
