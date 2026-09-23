import { mapEmbedUrl, mapOpenUrl } from "@/lib/expansion/maps";
import type { PropertyView } from "@/lib/expansion/types";

export default function MapEmbed({ property }: { property: PropertyView }) {
  const coords =
    property.latitude != null && property.longitude != null
      ? { latitude: property.latitude, longitude: property.longitude }
      : null;
  const embed = mapEmbedUrl(property.address, coords);
  const open = mapOpenUrl(property.mapUrl, property.address, coords);
  return (
    <div className="space-y-2">
      <p className="text-sm text-zinc-700 dark:text-zinc-300">{property.address}</p>
      {embed ? (
        <iframe
          title={`Map of ${property.title}`}
          src={embed}
          className="h-72 w-full rounded-md border border-zinc-200 dark:border-zinc-800"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : null}
      {open ? (
        <a href={open} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-sky-700 hover:underline dark:text-sky-400">
          Open in Google Maps ↗
        </a>
      ) : null}
      {!coords && property.mapUrl ? (
        <p className="text-xs text-zinc-500">
          The embedded map is based on the address; the Google Maps link above has the exact pin.
        </p>
      ) : null}
    </div>
  );
}
