/**
 * Gallery Type Definitions
 * Data models for vertical tabs, sections, cells, and dynamic spanning.
 */

export interface GalleryCell {
  id: string;
  name?: string;
  mathml: string;
  latex?: string;
  previewText?: string;
  spanX?: number; // 1 to 6
  spanY?: number; // 1 to 4
  isCustom?: boolean;
}

export interface GallerySection {
  id: string;
  name: string;
  cells: GalleryCell[];
  isCustom?: boolean;
}

export interface GalleryTab {
  id: string;
  name: string;
  icon?: string;
  sections: GallerySection[];
  isCustom?: boolean;
}

export interface LegacyGalleryItem {
  id: string;
  name: string;
  mathml: string;
  previewText?: string;
}

export interface LegacyGalleryCategory {
  id: string;
  title: string;
  items: LegacyGalleryItem[];
}
