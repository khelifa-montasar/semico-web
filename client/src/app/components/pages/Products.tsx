import { Cpu, Radio, Droplets, Sun, Gauge, Wifi, Package, type LucideIcon } from "lucide-react";
import { useLanguage } from "../../contexts/LanguageContext";
import { useLocalized } from "../../hooks/useLocalized";
import { useProducts } from "../../../features/content/useContent";

/**
 * Icons are resolved from the API's `iconKey` rather than by array position.
 *
 * The catalogue is database-driven now, so a product added or reordered server-side would have
 * shifted every icon after it under the old index-based lookup. An unrecognised key falls back to a
 * generic icon instead of mislabelling the product.
 *
 * NOTE: the public marketing pages are light-only by design — PublicLayout pins a white background
 * and these use fixed light values. That is why there is no `useTokens()` here.
 */
const PRODUCT_ICONS: Record<string, LucideIcon> = {
  Cpu,
  Droplets,
  Radio,
  Sun,
  Gauge,
  Wifi,
};

export function Products() {
  const { t, font } = useLanguage();
  const L = useLocalized();
  const p = t.products;

  const products = useProducts();
  const items = products.data ?? [];

  return (
    <div className="max-w-[960px] mx-auto px-6 py-16" style={{ fontFamily: font }}>
      <h1
        className="text-[24px] text-[#1A1A1A] text-center mb-2"
        style={{ fontFamily: font, fontWeight: 400 }}
      >
        {p.title}
      </h1>
      <p className="text-[14px] text-[#9CA3AF] text-center mb-12" style={{ fontFamily: font }}>
        {p.subtitle}
      </p>

      {products.isError && (
        <p className="text-[13px] text-center text-[#FF6B35]">
          {products.error instanceof Error ? products.error.message : "Could not load products."}
        </p>
      )}

      {!products.isLoading && !products.isError && items.length === 0 && (
        <p className="text-[13px] text-center text-[#9CA3AF]">No products to show.</p>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {items.map((item) => {
          const Icon = PRODUCT_ICONS[item.iconKey] ?? Package;
          return (
            <div
              key={item.id}
              className="border border-[#EAECF0] rounded-lg p-6 group hover:border-[#00A859]/30 transition-colors"
            >
              <Icon size={24} strokeWidth={1.5} className="text-[#4A4A4A] mb-4" />
              <h3 className="text-[15px] text-[#1A1A1A] mb-2" style={{ fontWeight: 500 }}>
                {L(item.title)}
              </h3>
              <p
                className="text-[13px] text-[#9CA3AF] mb-4"
                style={{ fontFamily: font, lineHeight: 1.6 }}
              >
                {L(item.description)}
              </p>
              <span className="text-[13px] text-[#0077B6] cursor-pointer hover:underline">
                {p.learnMore}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
