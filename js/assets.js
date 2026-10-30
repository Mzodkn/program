// Phase 6: Supabase Storage helpers, client-side image processing and shared
// avatar/banner rendering. Paths are stored in the database, never full URLs.
import { ASSETS_BUCKET } from './config.js';
import { supabase } from './supabase.js';
import { escapeHTML } from './ui.js';

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const AVATAR_SIZE_PX = 400;
export const BANNER_WIDTH_PX = 1600;
export const BANNER_HEIGHT_PX = 400;
export const BANNER_MIN_WIDTH_PX = 800;

const BANNER_MIN_RATIO = 3;
const BANNER_MAX_RATIO = 5.2;

const AVATAR_SIZES = {
  sm: 'w-8 h-8 text-[10px]',
  md: 'w-10 h-10 text-xs',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 sm:w-24 sm:h-24 text-2xl',
};

export function assetUrl(path) {
  const value = String(path || '').trim();
  if (!value || !ASSETS_BUCKET) return '';
  try {
    const { data } = supabase.storage.from(ASSETS_BUCKET).getPublicUrl(value);
    return data?.publicUrl || '';
  } catch (error) {
    return '';
  }
}

export function avatarUrl(path) {
  return assetUrl(path);
}

// Animated banners use their generated poster in compact areas. The public
// profile can request the original file so the animation plays.
export function bannerImageUrl(profile, { animated = false } = {}) {
  if (!profile) return '';
  if (profile.banner_is_animated) {
    return assetUrl(animated ? profile.banner_path : (profile.banner_poster_path || profile.banner_path));
  }
  return assetUrl(profile.banner_path);
}

export function initials(profile) {
  const name = String(profile?.display_name || profile?.username || '?').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts.slice(0, 2).map((part) => part[0]).join('') || '?').toUpperCase();
}

export function profileUrl(profile) {
  const username = String(profile?.username || '').trim();
  return username ? `#/u/${encodeURIComponent(username)}` : '';
}

export function avatarHtml(profile, size = 'md', { alt = '' } = {}) {
  const className = AVATAR_SIZES[size] || AVATAR_SIZES.md;
  const url = avatarUrl(profile?.avatar_path);
  if (url) {
    return `<img src="${escapeHTML(url)}" alt="${escapeHTML(alt)}" loading="lazy" decoding="async"
      class="${className} rounded-full object-cover border border-dark-border bg-dark-elevated shrink-0">`;
  }
  return `<span class="${className} inline-flex items-center justify-center rounded-full border border-dark-border bg-dark-elevated font-bold text-brand-500 shrink-0"
    aria-hidden="true">${escapeHTML(initials(profile))}</span>`;
}

export function avatarLinkHtml(profile, size = 'md') {
  const name = String(profile?.display_name || profile?.username || '').trim();
  const inner = avatarHtml(profile, size, { alt: name });
  const href = profileUrl(profile);
  if (!href) return inner;
  return `<a href="${escapeHTML(href)}" class="shrink-0 rounded-full focus:outline-none focus:ring-2 focus:ring-brand-500/50"
    aria-label="${escapeHTML(name || 'Profile')}">${inner}</a>`;
}

function imageError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function validateImageFile(file) {
  if (!file) return imageError('imageMissing');
  if (!ALLOWED_IMAGE_TYPES.includes(String(file.type || '').toLowerCase())) {
    return imageError('imageTypeNotAllowed');
  }
  if (file.size > MAX_IMAGE_BYTES) return imageError('imageTooLarge');
  return null;
}

// GIF and animated WebP banners keep their animation. A static poster is drawn
// from the first frame in the browser for lists and compact cards.
export async function isAnimatedImage(file) {
  if (!file) return false;
  if (file.type === 'image/gif') return true;
  if (file.type !== 'image/webp') return false;

  try {
    const buffer = await file.slice(0, 4096).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i + 3 < bytes.length; i += 1) {
      if (bytes[i] === 0x41 && bytes[i + 1] === 0x4e && bytes[i + 2] === 0x49 && bytes[i + 3] === 0x4d) {
        return true;
      }
    }
  } catch (error) {
    return false;
  }
  return false;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(imageError('imageDecodeFailed'));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(imageError('imageEncodeFailed'))),
      type,
      quality
    );
  });
}

// Center-crop to the target box and encode as WebP with a JPEG fallback.
async function cropAndEncode(file, width, height, quality = 0.86) {
  const image = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) throw imageError('imageEncodeFailed');
  context.fillStyle = '#0f172a';
  context.fillRect(0, 0, width, height);

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) throw imageError('imageDecodeFailed');

  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);

  let blob = await canvasToBlob(canvas, 'image/webp', quality);
  if (blob.type !== 'image/webp') {
    blob = await canvasToBlob(canvas, 'image/jpeg', quality);
  }

  return {
    blob,
    ext: blob.type === 'image/webp' ? 'webp' : 'jpg',
    width,
    height,
  };
}

async function readDimensions(file) {
  const image = await loadImage(file);
  return {
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
  };
}

export async function processAvatar(file) {
  const invalid = validateImageFile(file);
  if (invalid) throw invalid;
  const processed = await cropAndEncode(file, AVATAR_SIZE_PX, AVATAR_SIZE_PX, 0.88);
  return { ...processed, isAnimated: false, posterBlob: null, posterExt: '', contentType: processed.blob.type };
}

export async function processBanner(file) {
  const invalid = validateImageFile(file);
  if (invalid) throw invalid;

  const dimensions = await readDimensions(file);
  const animated = await isAnimatedImage(file);

  if (animated) {
    if (dimensions.width < BANNER_MIN_WIDTH_PX) throw imageError('bannerTooNarrow');
    const ratio = dimensions.width / dimensions.height;
    if (!Number.isFinite(ratio) || ratio < BANNER_MIN_RATIO || ratio > BANNER_MAX_RATIO) {
      throw imageError('bannerBadRatio');
    }

    const poster = await cropAndEncode(file, BANNER_WIDTH_PX, BANNER_HEIGHT_PX, 0.82);
    return {
      blob: file,
      ext: file.type === 'image/gif' ? 'gif' : 'webp',
      contentType: file.type,
      isAnimated: true,
      posterBlob: poster.blob,
      posterExt: poster.ext,
      width: dimensions.width,
      height: dimensions.height,
    };
  }

  const still = await cropAndEncode(file, BANNER_WIDTH_PX, BANNER_HEIGHT_PX, 0.85);
  return {
    blob: still.blob,
    ext: still.ext,
    contentType: still.blob.type,
    isAnimated: false,
    posterBlob: null,
    posterExt: '',
  };
}

export async function uploadProfileAsset(userId, { blob, ext, contentType, kind }) {
  const owner = String(userId || '').trim();
  if (!owner) throw imageError('imageUploadFailed');
  if (!blob) throw imageError('imageMissing');

  // A unique filename per upload acts as a cache buster and keeps CDNs honest.
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const extension = String(ext || 'webp').replace(/[^a-z0-9]/gi, '') || 'webp';
  const path = `${owner}/${kind}-${suffix}.${extension}`;

  const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, blob, {
    cacheControl: '31536000',
    contentType: contentType || blob.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) {
    if (/too large|exceeded.*size|payload/i.test(String(error.message || ''))) {
      throw imageError('imageTooLarge');
    }
    if (/mime|content type/i.test(String(error.message || ''))) {
      throw imageError('imageTypeNotAllowed');
    }
    throw error;
  }
  return path;
}

export async function deleteProfileAssets(paths) {
  const list = [...new Set((paths || []).filter(Boolean).map((path) => String(path).trim()))];
  if (!list.length) return;
  try {
    await supabase.storage.from(ASSETS_BUCKET).remove(list);
  } catch (error) {
    // Best effort: an orphaned file is harmless.
  }
}
