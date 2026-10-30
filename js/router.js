// Hash router for IT Study Hub
// Supports routes: #/dashboard, #/calendar, #/groups, #/groups/:id, #/items/:id, #/u/:username, #/settings, #/admin

export function navigate(url) {
  // url can be a full hash route or a path
  const hash = url.startsWith('#') ? url : `#${url}`;
  history.pushState({}, '', hash);
  render();
}

export function resolveRoute(pathname) {
  // Remove leading # and trailing /
  const path = pathname.replace(/^#/, '').replace(/\/+$/, '');
  const parts = path.split('/').filter(p => p);
  
  if (parts.length === 0) {
    return 'home';
  }
  
  const route = {
    page: parts[0],
    params: {},
    id: null,
    username: null
  };
  
  switch (route.page) {
    case 'groups':
      if (parts[1]) {
        route.id = parts[1];
        route.params.groupId = parts[1];
      }
      break;
    case 'items':
      if (parts[1]) {
        route.id = parts[1];
        route.params.itemId = parts[1];
      }
      break;
    case 'u':
      if (parts[1]) {
        route.username = parts[1];
        route.params.username = parts[1];
      }
      break;
    case 'admin':
      route.params.admin = true;
      break;
  }
  
  return route;
}

export function listen(callback) {
  const handleHashChange = () => {
    const route = resolveRoute(window.location.hash || '');
    callback(route);
  };
  
  window.addEventListener('hashchange', handleHashChange);
  // Initial render
  handleHashChange();
  
  return () => window.removeEventListener('hashchange', handleHashChange);
}