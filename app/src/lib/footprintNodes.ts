import type { Entry } from './types';

export function footprintNodes(entries: Entry[]) {
  return entries.flatMap((entry) => {
    const places = [entry.place, ...entry.photos.flatMap((photo) => (photo.place ? [photo.place] : []))];
    return places
      .filter(
        (place, index) =>
          places.findIndex(
            (p) =>
              Math.abs(p.longitude - place.longitude) < 0.00001 &&
              Math.abs(p.latitude - place.latitude) < 0.00001,
          ) === index,
      )
      .map((place) => ({ id: entry.id, title: entry.title, place, hasPhoto: !!entry.photos.length }));
  });
}
