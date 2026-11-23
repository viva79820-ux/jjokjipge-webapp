import Link from "next/link";
import { connection } from "next/server";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminAccessDenied } from "@/components/admin/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductAdminFilter } from "@/components/products/admin-filter";
import {
  ProductDeletedCleanup,
  ProductEditor,
} from "@/components/products/editor";
import { ProductCartActions } from "@/components/products/add-to-cart";
import { ShopCartLink } from "@/components/products/cart-link";
import { ProductPhoto } from "@/components/products/photo";
import { cartMessages } from "@/lib/products/cart";
import { cleanupAction } from "@/lib/products/cleanup";
import {
  adminProductDetail,
  adminProductList,
  publicProductDetail,
  publicProductList,
} from "@/lib/products/data";
import {
  formatWon,
  pageSize,
  productEditUrl,
  productFilters,
  productListUrl,
  productNewUrl,
  publicImageUrl,
  type ProductQuery,
  type PublicProductSummary,
} from "@/lib/products/rules";

function ProductCard({
  row,
  href,
  admin = false,
}: {
  row: PublicProductSummary & {
    is_published?: boolean;
    description?: string;
  };
  href: string;
  admin?: boolean;
}) {
  return (
    <article className="min-w-0 overflow-hidden rounded-card border border-border bg-surface">
      <Link href={href} className="block min-h-11 cursor-pointer">
        <ProductPhoto
          src={publicImageUrl(row.image_path)}
          alt={row.image_alt || `${row.name} 사진`}
          missing={!row.image_path}
        />
        <div className="space-y-2 p-3 @3xl/app:p-4">
          <h2 className="text-subtitle font-bold wrap-anywhere text-foreground">
            {row.name}
          </h2>
          <p className="text-price font-extrabold text-pink">
            {formatWon(row.price)}
          </p>
          <div className="flex flex-wrap gap-2">
            {row.is_sold_out ? <Badge>품절</Badge> : <Badge>판매 가능</Badge>}
            {admin && <Badge>{row.is_published ? "공개" : "비공개"}</Badge>}
            {admin && "sort_order" in row && (
              <Badge>정렬 {row.sort_order}</Badge>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

export async function ProductListPage({
  searchParams,
  admin = false,
}: {
  searchParams: Promise<ProductQuery>;
  admin?: boolean;
}) {
  await connection();
  if (admin && !(await requireAdmin())) return <AdminAccessDenied />;
  const filters = productFilters(await searchParams, admin);
  if (!filters)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href={productListUrl(admin)} variant="secondary">
          조건 초기화
        </Button>
      </div>
    );
  const result = admin
    ? await adminProductList(filters.page, filters.status)
    : await publicProductList(filters.page);
  if (!result) return <AdminAccessDenied />;
  const pages = Math.max(1, Math.ceil(result.count / pageSize));
  if (filters.page > pages)
    redirect(productListUrl(admin, pages, filters.status));
  return (
    <div className="space-y-7 wrap-anywhere">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-display font-extrabold">타로샵</h1>
          {!admin && <ShopCartLink />}
        </div>
        <p className="text-body text-muted">
          {admin
            ? "타로카드 상품의 공개와 품절을 관리합니다. 상담 상품과는 따로 저장됩니다."
            : `매장의 타로카드 상품입니다. ${cartMessages.checkout}`}
        </p>
      </div>
      {admin && filters.result === "deleted" && (
        <p role="status" className="text-body text-brand">
          상품을 삭제했습니다.
        </p>
      )}
      {admin && (
        <>
          <Button href={productNewUrl(filters.page, filters.status)}>
            상품 등록
          </Button>
          <ProductAdminFilter
            status={filters.status}
            page={filters.page}
            result={filters.result}
          />
        </>
      )}
      <p className="text-caption text-muted">총 {result.count}건</p>
      {!result.data.length && <p role="status">등록된 상품이 없습니다.</p>}
      <div className={admin ? "grid gap-3" : "grid grid-cols-2 gap-3"}>
        {result.data.map((row) => (
          <ProductCard
            key={row.id}
            row={row}
            admin={admin}
            href={
              admin
                ? productEditUrl(row.id, filters.page, filters.status)
                : `/shop/${row.id}`
            }
          />
        ))}
      </div>
      <nav
        aria-label="상품 페이지"
        className="flex flex-wrap items-center justify-center gap-3"
      >
        {filters.page > 1 && (
          <Button
            href={productListUrl(admin, filters.page - 1, filters.status)}
            variant="secondary"
          >
            이전
          </Button>
        )}
        <span className="text-body">
          {filters.page} / {pages}
        </span>
        {filters.page < pages && (
          <Button
            href={productListUrl(admin, filters.page + 1, filters.status)}
            variant="secondary"
          >
            다음
          </Button>
        )}
      </nav>
    </div>
  );
}

export async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const row = await publicProductDetail((await params).id);
  if (!row) notFound();
  return (
    <article className="space-y-7 wrap-anywhere">
      <Button href="/shop" variant="secondary">
        상품 목록
      </Button>
      <ProductPhoto
        src={publicImageUrl(row.image_path)}
        alt={row.image_alt || `${row.name} 사진`}
        missing={!row.image_path}
      />
      <header className="space-y-3">
        <h1 className="text-display font-extrabold wrap-anywhere">
          {row.name}
        </h1>
        <p className="text-price font-extrabold text-pink">
          {formatWon(row.price)}
        </p>
        <Badge>{row.is_sold_out ? "품절" : "판매 가능"}</Badge>
      </header>
      <p className="text-body wrap-anywhere whitespace-pre-wrap break-all">
        {row.description}
      </p>
      {row.is_sold_out && (
        <p className="text-body text-muted">{cartMessages.soldOutNote}</p>
      )}
      <ProductCartActions productId={row.id} soldOut={row.is_sold_out} />
      <p className="text-body text-muted">{cartMessages.checkout}</p>
    </article>
  );
}

export async function ProductEditorPage({
  params,
  searchParams,
}: {
  params?: Promise<{ id: string }>;
  searchParams: Promise<ProductQuery>;
}) {
  await connection();
  const admin = await requireAdmin();
  if (!admin) return <AdminAccessDenied />;
  const filters = productFilters(await searchParams, true);
  if (!filters)
    return (
      <div role="alert" className="space-y-3">
        <p>목록 조건이 올바르지 않습니다.</p>
        <Button href="/admin/shop-products" variant="secondary">
          상품 목록
        </Button>
      </div>
    );
  if (!params)
    return (
      <ProductEditor
        initial={null}
        page={filters.page}
        status={filters.status}
        initialMessage=""
      />
    );
  const productId = (await params).id;
  const loaded = await adminProductDetail(productId);
  if (!loaded) return <AdminAccessDenied />;
  if ("missing" in loaded)
    return (
      <ProductDeletedCleanup
        id={productId}
        page={filters.page}
        status={filters.status}
      />
    );
  if ("error" in loaded) throw Error("상품을 불러오지 못했습니다.");
  return (
    <ProductEditor
      key={loaded.row.id}
      initial={loaded.row}
      page={filters.page}
      status={filters.status}
      initialMessage={filters.result === "saved" ? "상품을 저장했습니다." : ""}
      initialCleanup={
        loaded.row.image_path
          ? cleanupAction(
              loaded.row.image_path,
              admin.userId,
              undefined,
              loaded.row,
            )
          : undefined
      }
    />
  );
}
