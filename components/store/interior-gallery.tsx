import Image from "next/image";
import { DragRow } from "@/components/ui/drag-row";
import { storeInteriorSizes } from "@/lib/images";
import { interiorPhotos } from "./present";

export function InteriorGallery() {
  return (
    <div data-store-gallery className="min-w-0">
      <DragRow className="min-w-0" containerClassName="gap-2">
        {interiorPhotos.map((photo) => (
          <div
            key={photo.src}
            className="relative h-37.5 w-60 shrink-0 overflow-hidden rounded-input"
          >
            <Image
              src={photo.src}
              alt={photo.alt}
              fill
              sizes={storeInteriorSizes}
              quality={90}
              draggable={false}
              className="object-cover"
            />
          </div>
        ))}
      </DragRow>
    </div>
  );
}
