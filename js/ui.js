// UI helpers for IT Study Hub
// Toasts, HTML escape helper, error code map

// Escape HTML to prevent XSS
export function escapeHTML(str) {
  if (typeof str !== 'string') return String(str);
  return str
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, '&#039;');
}

// Show a toast message
export function showToast(message, type = 'info', duration = 3000) {
  const toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    document.body.appendChild(container);
  }
  
  const toast = document.createElement('div');
  toast.style.cssText = `
    background: #202c33;
    color: white;
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid #4a5568;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    min-width: 200px;
    word-wrap: break-word;
  `;
  toast.textContent = message;
  
  // Add color coding based on type
  const colors = {
    success: '#48bb78',
    error: '#f56565',
    warning: '#ed8936',
    info: '#4299e1'
  };
  
  if (colors[type] && toast.style.background !== colors[type]) {
    toast.style.background = colors[type];
    toast.style.color = '#fff';
  }
  
  // Find or create container
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    document.body.appendChild(container);
  }
  
  container.appendChild(toast);
  
  // Auto-remove after duration
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Display error codes with Arabic/English messages
export const errorCodes = {
  UNAUTHENTICATED: {
    ar: 'غير مصرح لك، يرجى تسجيل الدخول',
    en: 'Unauthenticated, please sign in'
  },
  ITEM_NOT_FOUND: {
    ar: 'لا توجد مادة بهذا المعرف',
    en: 'Item not found'
  },
  ITEM_PAST_DUE: {
    ar: 'لقد مرت المهلة',
    en: 'Item past due'
  },
  GROUPS_DISABLED_FOR_ITEM: {
    ar: 'لا يمكن تشكيل مجموعات لهذه المادة',
    en: 'Groups disabled for item'
  },
  INVALID_MAX_SIZE: {
    ar: 'حجم المجموعة غير صحيح',
    en: 'Invalid max size'
  },
  ALREADY_IN_GROUP_FOR_ITEM: {
    ar: 'أنت بالفعل في مجموعة لهذه المادة',
    en: 'Already in group for item'
  },
  RATE_LIMIT_EXCEEDED: {
    ar: 'تم تجاوز حد الطلبات',
    en: 'Rate limit exceeded'
  },
  GROUP_NOT_FOUND: {
    ar: 'لم يتم العثور على مجموعة',
    en: 'Group not found'
  },
  GROUP_CLOSED: {
    ar: 'المجموعة مغلقة',
    en: 'Group closed'
  },
  GROUP_FULL: {
    ar: 'المجموعة ممتلئة',
    en: 'Group full'
  },
  PENDING_REQUEST_EXISTS: {
    ar: 'طلب pending موجود',
    en: 'Pending request exists'
  },
  COOLDOWN_ACTIVE: {
    ar: 'جارِ عملية برد',
    en: 'Cooldown active'
  },
  REQUEST_NOT_FOUND_OR_NOT_PENDING: {
    ar: 'الطلب غير موجود أو已完成',
    en: 'Request not found or not pending'
  },
  REQUEST_NOT_PENDING: {
    ar: 'الطلب已完成',
    en: 'Request not pending'
  },
  NOT_GROUP_OWNER: {
    ar: 'لا يمكنك ذلك، أنت لستOwner',
    en: 'Not group owner'
  },
  NOT_GROUP_OWNER_OR_NOT_FOUND: {
    ar: 'لا يمكنك ذلك،Owner غير موجود',
    en: 'Not group owner or not found'
  },
  ALREADY_IN_GROUP: {
    ar: 'أنت بالفعل في مجموعة',
    en: 'Already in group'
  },
  NOT_A_MEMBER: {
    ar: 'أنت nicht عضو',
    en: 'Not a member'
  },
  OWNER_MUST_TRANSFER_FIRST: {
    ar: 'المالك ينقل ownership أولاً',
    en: 'Owner must transfer first'
  },
  CANNOT_REMOVE_SELF: {
    ar: 'لا يمكن للمالك إزالة نفسه',
    en: 'Cannot remove self'
  },
  TARGET_NOT_A_MEMBER: {
    ar: 'الهدف non عضو',
    en: 'Target not a member'
  },
  MAX_SIZE_BELOW_CURRENT_MEMBERS: {
    ar: 'الحجم أقل من الأعضاء الحاليين',
    en: 'Max size below current members'
  },
  MAX_SIZE_EXCEEDS_ITEM_LIMIT: {
    ar: 'الحجم exceeds حد المادة',
    en: 'Max size exceeds item limit'
  },
  NEW_LIMIT_LOWER_THAN_EXISTING_GROUP_MEMBERS: {
    ar: 'limit جديد أقل من المجموعات القائمة',
    en: 'New limit lower than existing group members'
  }
};

export function showError(code) {
  const msg = errorCodes[code];
  if (msg) {
    const ar = document.documentElement.dir === 'rtl';
    showToast(ar ? msg.ar : msg.en, 'error');
  } else {
    showToast(translate('error'), 'error');
  }
}