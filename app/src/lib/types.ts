export type Place = {
  longitude: number;
  latitude: number;
  name: string;
  address: string;
  city?: string;
  demo?: boolean;
  source?: 'address' | 'poi' | 'suggestion';
  distance?: number;
};

export type User = { id: string; username: string; nickname: string };
export type Coordinates = { longitude: number; latitude: number };
export type Photo = {
  uri: string;
  width: number;
  height: number;
  id?: string;
  remotePath?: string;
  previewPath?: string;
  previewUri?: string;
  cacheKey?: string;
  mimeType?: string;
  gps?: Coordinates;
  place?: Place;
  capturedAt?: string;
  locationError?: string;
};
export const categories = ['风景', '城市', '美食', '日常'] as const;
export type Category = (typeof categories)[number];
export type Entry = {
  id: string;
  title: string;
  body: string;
  photos: Photo[];
  place: Place;
  category: Category;
  createdAt: string;
  favorite: boolean;
  visibility?: 'public' | 'private';
  author?: User;
  syncStatus?: 'pending' | 'synced' | 'error';
  syncError?: string;
  locationSource?: 'photo' | 'manual';
  locationPhotoIndex?: number;
  deletedAt?: string;
  deletionBackup?: boolean;
  restorePending?: boolean;
};
export type NewEntry = Pick<
  Entry,
  'title' | 'body' | 'photos' | 'place' | 'category' | 'visibility' | 'locationSource' | 'locationPhotoIndex'
>;
export type ChatMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  body: string;
  createdAt: string;
  readAt?: string;
};
export type Conversation = { user: User; lastMessage: ChatMessage | null; unread: number };
export type FriendRequest = { id: string; user: User };

export type MapCommand =
  | { type: 'focus'; place: Place; origin?: 'user' | 'location'; zoom?: number }
  | {
      type: 'locate';
      coords: { longitude: number; latitude: number };
      requestId: number;
      settled?: boolean;
      center?: boolean;
    }
  | { type: 'overview' }
  | { type: 'entries'; entries: { id: string; title: string; place: Place; hasPhoto: boolean }[] };
export type MapMessage = {
  type: 'ready' | 'selected' | 'entry' | 'error' | 'locationError' | 'located' | 'lookupError';
  configured?: boolean;
  searchConfigured?: boolean;
  place?: Place;
  places?: Place[];
  id?: string;
  message?: string;
  requestId?: number;
  settled?: boolean;
  origin?: 'user' | 'location';
};
export type MapHandle = { send: (command: MapCommand) => void };
export type MapProps = { url: string; onMessage: (message: MapMessage) => void; onError: () => void };
