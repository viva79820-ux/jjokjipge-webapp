import { siteConfig } from "@/lib/site-config";
import { Suspense } from "react";
import { HomeBanner } from "@/components/home/banner";
import { HomeCategories } from "@/components/home/categories";
import { HomeDirectory } from "@/components/home/directory";
import { HomeFooter } from "@/components/home/footer";
import { HomeNoticeLine } from "@/components/home/notice-line";
import { HomeRecommend } from "@/components/home/recommend";
import { HomeStoreBand } from "@/components/home/store-band";
import { HomeStoreMenu } from "@/components/home/store-menu";
import { HomeNoticePopup } from "@/components/notices/home-popup";
import { getCounselors } from "@/lib/data/counselors";
import { homeBannerCounselors } from "@/lib/home/counselors";
import { loadHomeNoticeLine } from "@/lib/notices/data";

export default function Home() {
  return (
    <>
      <h1 id="home-start" tabIndex={-1} className="sr-only">
        {siteConfig.name} 홈
      </h1>
      <HomeNoticePopup />
      <Suspense
        fallback={
          <p
            role="status"
            className="px-4 pt-6 text-body text-muted @3xl/app:px-6"
          >
            홈 내용을 불러오는 중이에요.
          </p>
        }
      >
        <HomeContent />
      </Suspense>
    </>
  );
}

async function HomeContent() {
  const [counselors, notice] = await Promise.all([
    getCounselors(),
    loadHomeNoticeLine(),
  ]);
  const recommended = counselors.filter((counselor) => counselor.isRecommended);
  return (
    <div data-home-root className="min-w-0 px-4 pt-4 @3xl/app:px-6">
      <HomeBanner counselors={homeBannerCounselors(recommended)} />
      <div className="mt-4">
        <HomeCategories />
      </div>
      <div className="mt-4">
        <HomeStoreBand />
      </div>
      <div className="mt-7">
        <HomeRecommend counselors={recommended} />
      </div>
      <div className="mt-7">
        <HomeStoreMenu />
      </div>
      <div className="mt-7">
        <HomeDirectory counselors={counselors} />
      </div>
      <div className="mt-6">
        <HomeNoticeLine notice={notice} />
      </div>
      <div className="mt-6 pb-6">
        <HomeFooter />
      </div>
    </div>
  );
}
