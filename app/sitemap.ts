import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://finances.machcomputing.com", lastModified: now },
    { url: "https://finances.machcomputing.com/summary", lastModified: now },
    { url: "https://finances.machcomputing.com/edit", lastModified: now },
    { url: "https://finances.machcomputing.com/categories", lastModified: now },
    { url: "https://finances.machcomputing.com/import", lastModified: now },
    { url: "https://finances.machcomputing.com/accounts", lastModified: now },
  ];
}
