import type { MediaItem } from "@/lib/expansion/types";
import { EmptyState } from "./ui";

export default function MediaGallery({ media }: { media: MediaItem[] }) {
  if (media.length === 0) return <EmptyState>No photos or videos uploaded.</EmptyState>;
  const images = media.filter((m) => m.kind === "image");
  const videos = media.filter((m) => m.kind === "video");
  return (
    <div className="space-y-4">
      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((m) => (
            <a
              key={m.id}
              href={`/api/media/${m.id}`}
              target="_blank"
              rel="noopener"
              className="group block overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            >
              {/* Authenticated media route: next/image's optimizer can't forward the session cookie. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/media/${m.id}`}
                alt={m.originalName}
                loading="lazy"
                className="aspect-[4/3] w-full object-cover transition-transform group-hover:scale-105"
              />
            </a>
          ))}
        </div>
      ) : null}
      {videos.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {videos.map((m) => (
            <figure key={m.id} className="space-y-1">
              <video
                src={`/api/media/${m.id}`}
                controls
                preload="metadata"
                className="aspect-video w-full rounded-md border border-zinc-200 bg-black dark:border-zinc-800"
              />
              <figcaption className="truncate text-xs text-zinc-500">{m.originalName}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}
