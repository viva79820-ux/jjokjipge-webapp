export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div data-shop-page className="px-4 py-6 @3xl/app:px-6">
      {children}
    </div>
  );
}
