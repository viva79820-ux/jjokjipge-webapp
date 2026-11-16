type PricedProduct = { name: string; price: number };

export function lowestPublicProduct<T extends PricedProduct>(
  products: readonly T[],
) {
  let selected: T | null = null;
  for (const product of products) {
    if (!selected || product.price < selected.price) selected = product;
  }
  return selected;
}

export function consultPriceLabel(products: readonly PricedProduct[]) {
  const product = lowestPublicProduct(products);
  if (!product) return null;
  const amount = `${product.price.toLocaleString("ko-KR")}원`;
  const suffix = products.length > 1 ? "~" : "";
  return `${product.name} ${amount}${suffix}`;
}
