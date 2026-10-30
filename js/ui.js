// UI helpers: toasts, an HTML escape helper and the error code map.
// Every server error code is mapped to a clear Arabic and English message.

export function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(message, type = 'info', duration = 3200) {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    root.style.cssText =
      'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:9999;' +
      'display:flex;flex-direction:column;gap:8px;width:min(92vw,26rem);pointer-events:none;';
    document.body.appendChild(root);
  }

  const colors = {
    success: '#16a34a',
    error: '#dc2626',
    warning: '#d97706',
    info: '#0284c7',
  };

  const toast = document.createElement('div');
  toast.style.cssText =
    'background:' + (colors[type] || colors.info) + ';color:#fff;' +
    'padding:12px 16px;border-radius:12px;font-size:0.9rem;font-weight:600;' +
    'text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.45);' +
    'border:1px solid rgba(255,255,255,.14);font-family:inherit;pointer-events:auto;';
  toast.textContent = message;

  root.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity .3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

export const errorCodes = {
  UNAUTHENTICATED: {
    ar: 'يجب تسجيل الدخول أولاً',
    en: 'You must sign in first',
  },
  ITEM_NOT_FOUND: {
    ar: 'المهمة غير موجودة',
    en: 'Item not found',
  },
  ITEM_PAST_DUE: {
    ar: 'انتهت مهلة هذه المهمة، لا يمكن إنشاء مجموعة أو إرسال طلب',
    en: 'This item is past its deadline; groups and requests are closed',
  },
  GROUPS_DISABLED_FOR_ITEM: {
    ar: 'هذه المهمة عمل فردي، فلا يمكن إنشاء مجموعات لها',
    en: 'This item is individual work; groups are disabled',
  },
  INVALID_MAX_SIZE: {
    ar: 'حجم المجموعة غير صالح: يجب أن يكون من 2 إلى الحد الأقصى للمهمة',
    en: 'Invalid group size: it must be between 2 and the item limit',
  },
  ALREADY_IN_GROUP_FOR_ITEM: {
    ar: 'أنت عضو في مجموعة أخرى لهذه المهمة',
    en: 'You already belong to another group for this item',
  },
  RATE_LIMIT_EXCEEDED: {
    ar: 'تجاوزت الحد المسموح: 20 طلب انضمام في 24 ساعة',
    en: 'Rate limit exceeded: 20 join requests in 24 hours',
  },
  GROUP_NOT_FOUND: {
    ar: 'المجموعة غير موجودة',
    en: 'Group not found',
  },
  GROUP_CLOSED: {
    ar: 'المجموعة مغلقة أمام الطلبات الجديدة',
    en: 'The group is closed to new requests',
  },
  GROUP_FULL: {
    ar: 'المجموعة ممتلئة',
    en: 'The group is full',
  },
  PENDING_REQUEST_EXISTS: {
    ar: 'لديك طلب معلّق لهذه المجموعة بالفعل',
    en: 'You already have a pending request to this group',
  },
  COOLDOWN_ACTIVE: {
    ar: 'لا يمكنك إرسال طلب جديد قبل {time}',
    en: 'You cannot send a new request before {time}',
  },
  REQUEST_NOT_FOUND_OR_NOT_PENDING: {
    ar: 'الطلب غير موجود أو تمت معالجته مسبقاً',
    en: 'Request not found or already handled',
  },
  REQUEST_NOT_PENDING: {
    ar: 'الطلب ليس معلّقاً',
    en: 'Request is not pending',
  },
  NOT_GROUP_OWNER: {
    ar: 'هذا الإجراء متاح لمالك المجموعة فقط',
    en: 'Only the group owner can do this',
  },
  NOT_GROUP_OWNER_OR_NOT_FOUND: {
    ar: 'المجموعة غير موجودة أو أنت لست مالكها',
    en: 'Group not found or you are not its owner',
  },
  ALREADY_IN_GROUP: {
    ar: 'الطالب انضم إلى مجموعة أخرى لهذه المهمة',
    en: 'The student already joined another group for this item',
  },
  NOT_A_MEMBER: {
    ar: 'أنت لست عضواً في هذه المجموعة',
    en: 'You are not a member of this group',
  },
  OWNER_MUST_TRANSFER_FIRST: {
    ar: 'انقل الملكية إلى عضو آخر قبل مغادرة المجموعة',
    en: 'Transfer ownership to another member before leaving',
  },
  CANNOT_REMOVE_SELF: {
    ar: 'لا يمكنك إزالة نفسك من المجموعة',
    en: 'You cannot remove yourself',
  },
  TARGET_NOT_A_MEMBER: {
    ar: 'الشخص المستهدف ليس عضواً في المجموعة',
    en: 'The target user is not a member of the group',
  },
  MAX_SIZE_BELOW_CURRENT_MEMBERS: {
    ar: 'الحجم الجديد أقل من عدد الأعضاء الحاليين',
    en: 'The new size is below the current member count',
  },
  MAX_SIZE_EXCEEDS_ITEM_LIMIT: {
    ar: 'حجم المجموعة أكبر من الحد المسموح للمهمة',
    en: 'The group size exceeds the item limit',
  },
  NEW_LIMIT_LOWER_THAN_EXISTING_GROUP_MEMBERS: {
    ar: 'لا يمكن خفض الحد لأن إحدى المجموعات الحالية أكبر منه',
    en: 'Cannot lower the limit because an existing group is larger',
  },
  // Read errors for items/events (Phase 3).
  DATA_LOAD_FAILED: {
    ar: 'تعذر تحميل البيانات. حاول مرة أخرى.',
    en: 'Could not load the data. Please try again.',
  },
  NETWORK_ERROR: {
    ar: 'تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.',
    en: 'Could not reach the server. Check your internet connection.',
  },
  PERMISSION_DENIED: {
    ar: 'ليست لديك صلاحية لعرض هذه البيانات.',
    en: 'You do not have permission to view this data.',
  },
  SESSION_EXPIRED: {
    ar: 'انتهت الجلسة. سجّل الدخول مرة أخرى.',
    en: 'Your session expired. Please sign in again.',
  },
  SCHEMA_MISMATCH: {
    ar: 'قاعدة البيانات لا تحتوي الجدول المطلوب. تحقق من مخطط قاعدة البيانات.',
    en: 'The database is missing a required table. Check the database schema.',
  },
};

function formatCooldownTime(isoTime, lang) {
  const date = new Date(isoTime);
  if (Number.isNaN(date.getTime())) return isoTime;

  try {
    return date.toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch (err) {
    return date.toISOString();
  }
}

export function errorMessage(rawCode, lang) {
  const language = lang === 'en' ? 'en' : 'ar';
  const text = String(rawCode || '');

  // COOLDOWN_ACTIVE is followed by a colon and a UTC time: split on the first colon only.
  const colon = text.indexOf(':');
  const code = colon === -1 ? text : text.slice(0, colon);
  const extra = colon === -1 ? '' : text.slice(colon + 1).trim();

  const entry = errorCodes[code];
  if (!entry) return null;

  let message = entry[language];
  if (code === 'COOLDOWN_ACTIVE' && extra) {
    message = message.replace('{time}', formatCooldownTime(extra, language));
  }

  return message;
}

export function showError(rawCode, lang) {
  const message = errorMessage(rawCode, lang) || String(rawCode || '');
  showToast(message, 'error');
}

// Turn a PostgREST/Supabase read error into one of the messages above.
export function describeDataError(error, lang) {
  const code = String(error?.code || '');
  const detail = String(error?.message || (typeof error === 'string' ? error : ''));
  const text = detail.toLowerCase();

  let normalized = 'DATA_LOAD_FAILED';

  if (/failed to fetch|networkerror|load failed|network request failed/.test(text)) {
    normalized = 'NETWORK_ERROR';
  } else if (code === '42501' || /permission denied|row-level security/.test(text)) {
    normalized = 'PERMISSION_DENIED';
  } else if (code === 'PGRST301' || code === '401' || /jwt|session .*(expired|missing)/.test(text)) {
    normalized = 'SESSION_EXPIRED';
  } else if (code === '42P01' || /relation .* does not exist/.test(text)) {
    normalized = 'SCHEMA_MISMATCH';
  }

  return {
    message: errorMessage(normalized, lang) || errorMessage('DATA_LOAD_FAILED', lang),
    code: code || normalized,
    detail,
  };
}
