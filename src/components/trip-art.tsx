import { artSrc, type DestinationArt } from "@/data/destinations";

/**
 * 여행지 그림 한 장 (`public/art/*.svg`, `detect(제목).art[n]`). 장식이라 스크린 리더에는 숨긴다.
 * `size-12` 같은 크기 클래스를 붙이지 않는다: 크기는 부르는 쪽 클래스(`.wr-hero` 등)가 정한다.
 * (`size-12`는 유틸리티 층이라 components 층의 `.wr-hero` 크기를 덮어써 48px로 줄어든다.)
 */
export function DestinationArtImage({ art, className }: { art: DestinationArt; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={artSrc(art)} alt="" aria-hidden width={200} height={200} className={className} />
  );
}

/** 여행 머리 줄 (시안 .trip): 굵은 이름 + 회색 한 줄. 그림은 없다. */
export function TripHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="min-w-0">
      <b className="block truncate text-lead font-bold">{title}</b>
      {meta ? <span className="block truncate text-caption text-sub">{meta}</span> : null}
    </div>
  );
}
