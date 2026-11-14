import type { ListingCategory } from "./schemas";

export type ListingStatus = "draft" | "pending_review" | "published" | "rejected" | "archived" | "removed";

export type BusinessSummary = {
  id: string;
  name: string;
  slug: string;
  category: string;
  location: string | null;
  verified: boolean;
  logoUrl: string | null;
};

export type BusinessDetail = BusinessSummary & {
  ownerId: string;
  description: string | null;
  website: string | null;
  contactEmail: string | null;
  registrationNumber: string | null;
  status: "draft" | "pending_review" | "approved" | "rejected" | "suspended";
  reviewNote: string | null;
  evidencePaths: string[];
  logoPath: string | null;
};

export type ListingCard = {
  id: string;
  slug: string;
  title: string;
  category: ListingCategory;
  summary: string | null;
  city: string | null;
  country: string | null;
  priceFromMinor: number | null;
  currency: string | null;
  priceUnit: string | null;
  visibility: "public" | "members";
  coverUrl: string | null;
  business: BusinessSummary;
  savedByViewer: boolean;
};

export type ListingDetail = ListingCard & {
  description: string | null;
  amenities: string[];
  status: ListingStatus;
  reviewNote: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  coverPath: string | null;
  media: { id: string; url: string | null; alt: string | null; path: string }[];
  isOwner: boolean;
};

export type InquiryView = {
  id: string;
  listingId: string;
  listingTitle: string;
  listingSlug: string;
  message: string;
  preferredDates: string | null;
  partySize: number | null;
  status: "new" | "responded" | "closed";
  createdAt: string;
  senderName: string;
  senderHandle: string;
};
