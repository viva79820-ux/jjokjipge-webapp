import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "쪽집게천사 관리자",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto min-h-screen max-w-app bg-background">
      {children}
    </div>
  );
}
