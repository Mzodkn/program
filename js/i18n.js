// Internationalization for IT Study Hub
// Arabic (RTL) and English (LTR) dictionaries and direction switch

const dictionaries = {
  ar: {
    dir: 'rtl',
    lang: 'Arabic',
    // Dashboard/home
    home: 'الرئيسية',
    dashboard: 'لوحة التحكم',
    calendar: 'التقويم',
    groups: 'المجموعات',
    items: 'المهام',
    profile: 'الملف الشخصي',
    settings: 'الإعدادات',
    admin: 'الادارة',
    // Subjects
    programming: 'البرمجة',
    networking: 'شبكات',
    discrete_math: 'رياضيات منفصلة',
    information_systems: 'نظم معلومات',
    computer_ethics: 'أخلاقيات الكمبيوتر',
    technical_english: 'إنجليزية تقنية',
    business: 'أعمال',
    accounting: 'محاسبة',
    // Navigation
    search: 'بحث',
    login: 'تسجيل دخول',
    signup: 'تسجيل جديد',
    logout: 'تسجيل خروج',
    // Error messages
    error: 'خطأ',
    // ... more translations can be added
  },
  en: {
    dir: 'ltr',
    lang: 'English',
    // Dashboard/home
    home: 'Home',
    dashboard: 'Dashboard',
    calendar: 'Calendar',
    groups: 'Groups',
    items: 'Items',
    profile: 'Profile',
    settings: 'Settings',
    admin: 'Admin',
    // Subjects
    programming: 'Programming',
    networking: 'Networking',
    discrete_math: 'Discrete Math',
    information_systems: 'Information Systems',
    computer_ethics: 'Computer Ethics',
    technical_english: 'Technical English',
    business: 'Business',
    accounting: 'Accounting',
    // Navigation
    search: 'Search',
    login: 'Login',
    signup: 'Sign up',
    logout: 'Log out',
    // Error messages
    error: 'Error',
    // ... more translations can be added
  }
};

let currentLang = 'en';

export function init(i18nConfig) {
  // Initialize from config if provided
  if (i18nConfig && i18nConfig.lang) {
    currentLang = i18nConfig.lang;
  }
  setLanguage(currentLang);
}

export function setLanguage(lang) {
  currentLang = lang;
  document.documentElement.lang = lang;
  document.documentElement.dir = dictionaries[lang].dir;
  
  const langBtn = document.getElementById('langBtn');
  if (langBtn) {
    langBtn.textContent = dictionaries[lang].dir === 'rtl' ? 'English' : 'العربية';
  }
  
  // Update all elements with data-i18n attribute
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const key = element.getAttribute('data-i18n');
    const translation = dictionaries[lang][key];
    if (translation) {
      element.textContent = translation;
    }
  });
  
  // Store preference in localStorage
  try {
    localStorage.setItem('itHub_lang', lang);
  } catch (e) {
    // Ignore storage errors
  }
}

export function translate(key) {
  return dictionaries[currentLang][key] || key;
}

export function t(key) {
  return translate(key);
}