import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Solutive - Point of Sales",
  description: "Kasir Solutive — transaksi langsung, struk, dan riwayat penjualan.",
};

export default function PosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
