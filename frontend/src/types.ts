export type OptionChoice = { name: string; price_delta: number };
export type OptionGroup = {
  name: string;
  type: "single" | "multi";
  required: boolean;
  choices: OptionChoice[];
};

export type MenuItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  category: string;
  tags: string[];
  popular: boolean;
  available: boolean;
  options: OptionGroup[];
};

export type Restaurant = {
  id: string;
  name: string;
  cuisine: string;
  price_level: string;
  halal: boolean;
  rating: number;
  review_count: number;
  status: string;
  availability: "available" | "limited" | "full" | "closed";
  description: string;
  tags: string[];
  hero_image: string;
  avatar_image: string;
  estimate_min: number;
  estimate_max: number;
  distance_km: number;
  capacity_tables: number;
  community_rating: number;
  community_pick: boolean;
  address: string;
  open_hours: string;
};

export type Reel = {
  id: string;
  restaurant_id: string;
  restaurant_name: string;
  user_name: string;
  user_handle: string;
  user_avatar: string;
  caption: string;
  thumb: string;
  duration: string;
  views: number;
  rating: number;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  username: string;
  avatar_url: string;
  referral_code: string;
  total_orders: number;
  favorites_count: number;
  invited_friends: number;
};

export type SelectedOption = { group: string; choice: string; price_delta: number };

export type CartItem = {
  lineId: string;
  restaurantId: string;
  restaurantName: string;
  menuItemId: string;
  name: string;
  image: string;
  basePrice: number;
  unitPrice: number; // base + option deltas
  quantity: number;
  options: SelectedOption[];
  notes: string;
};

export type PaymentMethodId = "qris" | "gopay" | "card" | "cash";

export type OrderStatus = "paid" | "preparing" | "ready" | "completed" | "cancelled";

export type DineInInfo = { table: string; time: string };

export type Order = {
  id: string;
  code: string; // ETL-XXXX
  restaurantId: string;
  restaurantName: string;
  restaurantAvatar: string;
  items: CartItem[];
  dineIn: DineInInfo;
  paymentMethod: PaymentMethodId;
  promoCode: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: OrderStatus;
  qrToken: string;
  createdAt: number;
  reviewed?: boolean;
  cancellableUntil?: number;
};

export type Review = {
  id: string;
  userName: string;
  userAvatar: string;
  rating: number;
  comment: string;
  createdAt: number;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  orderId: string;
  type: string;
  read: boolean;
  createdAt: number;
};

// ---------------------------------------------------------------------------
// Social: Feed & Reels
// ---------------------------------------------------------------------------
export type PostType = "photo" | "carousel" | "video" | "reel";

export type PostMedia = { type: "image" | "video"; url: string; poster?: string };

export type PostAuthor = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  verified: boolean;
  following: boolean;
};

export type Post = {
  id: string;
  type: PostType;
  isReel: boolean;
  author: PostAuthor;
  media: PostMedia[];
  caption: string;
  hashtags: string[];
  mentions: string[];
  restaurantId: string | null;
  restaurantName: string | null;
  dishId: string | null;
  dishName: string | null;
  location: string;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  viewCount: number;
  liked: boolean;
  saved: boolean;
  createdAt: number;
  timeAgo: string;
};

export type FeedPage = { items: Post[]; nextCursor: string | null; hasMore: boolean };

export type PostComment = {
  id: string;
  postId: string;
  parentId: string | null;
  userId: string;
  userName: string;
  userAvatar: string;
  text: string;
  likeCount: number;
  replyCount: number;
  liked: boolean;
  isOwner: boolean;
  createdAt: number;
  timeAgo: string;
};

export type CommentPage = { items: PostComment[]; nextCursor: string | null; hasMore: boolean };

export type SocialProfile = {
  id: string;
  name: string;
  username: string;
  avatar: string;
  bio: string;
  verified: boolean;
  postCount: number;
  followerCount: number;
  followingCount: number;
  isFollowing: boolean;
  isSelf: boolean;
};

export type SearchResults = {
  users: { id: string; name: string; username: string; avatar: string; verified: boolean }[];
  posts: Post[];
  restaurants: { id: string; name: string; cuisine: string; image: string }[];
  hashtags: { tag: string; count: number }[];
};

export type ReportTarget = "post" | "comment" | "user";
export type ReportReason = "spam" | "inappropriate" | "harassment" | "misleading" | "copyright" | "other";
