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

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextBox extends Box {
  fontSize: number;
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
  sku: { x: 280, y: 48, w: 280, h: 40, fontSize: 32 },
  name: { x: 280, y: 92, w: 292, h: 52, fontSize: 19, maxLines: 2 },
  keterangan: { x: 280, y: 158, w: 260, h: 24, fontSize: 16, show: true },
  swatch: { x: 280, y: 290, w: 160, h: 34, fontSize: 24, show: true },
};

export interface Guides {
  v: number[];
  h: number[];
}

export const DEFAULT_GUIDES: Guides = { v: [], h: [] };

// Per-label override — only the fields the user actually touched in
// Generate Label are set here; everything else falls back to the template.
export interface LabelFontOverride {
  sku?: number;
  name?: number;
  keterangan?: number;
  swatch?: number;
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
// LABEL_HEIGHT_PX). `template` supplies positions/sizes/defaults;
// `params.fonts` carries this specific label's font-size/show overrides.
export async function drawLabel(
  ctx: CanvasRenderingContext2D,
  template: TemplateElements,
  params: DrawLabelParams
): Promise<void> {
  const { skuName, qrCode, productName, color, keterangan, fonts } = params;

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
  const skuFontSize = fonts?.sku ?? skuBox.fontSize;
  ctx.save();
  ctx.beginPath();
  ctx.rect(skuBox.x, skuBox.y, skuBox.w, skuBox.h);
  ctx.clip();
  ctx.font = `bold ${skuFontSize}px sans-serif`;
  ctx.fillText(skuName || "", skuBox.x, skuBox.y + (skuBox.h - skuFontSize) / 2);
  ctx.restore();

  // Nama Produk — wraps up to maxLines
  const nameBox = template.name;
  const nameFontSize = fonts?.name ?? nameBox.fontSize;
  const maxLines = nameBox.maxLines ?? 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(nameBox.x, nameBox.y, nameBox.w, nameBox.h);
  ctx.clip();
  ctx.font = `${nameFontSize}px sans-serif`;
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
    const ketFontSize = fonts?.keterangan ?? ketBox.fontSize;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ketBox.x, ketBox.y, ketBox.w, ketBox.h);
    ctx.clip();
    ctx.font = `${ketFontSize}px sans-serif`;
    ctx.fillText(keterangan, ketBox.x, ketBox.y + (ketBox.h - ketFontSize) / 2);
    ctx.restore();
  }

  // Swatch — outline circle (never filled with the real color) + warna text
  const swatchBox = template.swatch;
  const swatchShow = fonts?.show?.swatch ?? swatchBox.show ?? true;
  if (swatchShow && color && color.trim()) {
    const swatchFontSize = fonts?.swatch ?? swatchBox.fontSize;
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
    ctx.font = `${swatchFontSize}px sans-serif`;
    ctx.fillText(color, swatchBox.x + radius * 2 + 8, swatchBox.y + (swatchBox.h - swatchFontSize) / 2);
    ctx.restore();
  }
}
