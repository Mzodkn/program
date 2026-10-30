// Hash router. Routes:
// #/dashboard, #/calendar, #/groups, #/groups/:id, #/items/:id,
// #/u/:username, #/settings, #/admin
// The site works on any static host without server rewrites.

const ROUTES = [
  { name: 'dashboard', re: /^$/ },
  { name: 'dashboard', re: /^dashboard$/ },
  { name: 'calendar', re: /^calendar$/ },
  { name: 'groups', re: /^groups$/ },
  { name: 'group', re: /^groups\/([^/]+)$/, params: ['id'] },
  { name: 'item', re: /^items\/([^/]+)$/, params: ['id'] },
  { name: 'user', re: /^u\/([^/]+)$/, params: ['username'] },
  { name: 'settings', re: /^settings$/ },
  { name: 'admin', re: /^admin$/ },
];

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (err) {
    return value;
  }
}

export function parseRoute(hash) {
  let raw = String(hash || '');

  // Supabase auth redirects carry tokens in the hash (confirmation, recovery).
  // Treat those as the dashboard; onAuthStateChange handles the actual flow.
  if (/access_token=|error_description=|type=(recovery|signup|invite|magiclink)/.test(raw)) {
    return { name: 'dashboard', params: {}, path: '' };
  }

  const query = raw.indexOf('?');
  if (query !== -1) raw = raw.slice(0, query);

  const path = raw.replace(/^#\/?/, '').replace(/\/+$/, '');

  for (const route of ROUTES) {
    const match = path.match(route.re);
    if (!match) continue;

    const params = {};
    (route.params || []).forEach((name, index) => {
      params[name] = safeDecode(match[index + 1] || '');
    });

    return { name: route.name, params, path };
  }

  return { name: 'notFound', params: {}, path };
}

export function navigate(path) {
  const clean = String(path || '').replace(/^#\/?/, '');
  const target = '#/' + clean;

  if (window.location.hash === target) {
    window.dispatchEvent(new Event('hashchange'));
  } else {
    window.location.hash = target;
  }
}

export function startRouter(onRoute) {
  const handle = () => {
    if (!window.location.hash || window.location.hash === '#') {
      history.replaceState(null, '', '#/dashboard');
    }
    onRoute(parseRoute(window.location.hash));
  };

  window.addEventListener('hashchange', handle);
  handle();
}
