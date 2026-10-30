// Phase 4: browse groups, manage a group, and the groups section on an item.
// Every write goes through the RPC functions in groups-data.js. User text is
// always escaped before it reaches innerHTML.
import { t, tf, getLang } from './i18n.js';
import { escapeHTML, showToast } from './ui.js';
import { fetchItems } from './data.js';
import { addDays, formatDate, formatDateTime, formatRelative, getItemUrgency } from './format.js';
import { GROUP_RETENTION_DAYS } from './config.js';
import { avatarHtml, profileUrl } from './assets.js';
import {
  fetchAllGroups,
  fetchGroupsForItem,
  fetchGroupBundle,
  fetchMembersForGroups,
  fetchProfilesByIds,
  fetchMyMemberships,
  fetchMyRequests,
  createGroup,
  requestJoin,
  cancelRequest,
  decideRequest,
  leaveGroup,
  removeMember,
  transferOwnership,
  updateGroup,
  deleteGroup,
  reportGroup,
  rpcErrorMessage,
} from './groups-data.js';
import {
  pageHero,
  sectionHeader,
  emptyPanel,
  loadingPanel,
  errorPanel,
  primaryActionClass,
  secondaryActionClass,
  typeBadge,
  urgencyBadge,
} from './cards.js';

const WHATSAPP_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/;

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 rounded-xl bg-dark-base border border-dark-border focus:border-brand-500 ' +
  'focus:ring-2 focus:ring-brand-500/30 outline-none text-white placeholder-dark-muted text-sm transition';
const LABEL_CLASS = 'block text-xs mono text-brand-500 font-bold mb-1.5';
const HINT_CLASS = 'text-[11px] text-dark-muted mt-1.5 leading-relaxed';
const DISABLED_CLASS = 'disabled:opacity-60 disabled:cursor-not-allowed';

function identity(profile) {
  return {
    name: String(profile?.display_name || profile?.username || t('unknownUser')),
    username: profile?.username ? '@' + profile.username : '',
  };
}

function identityHtml(profile, size = 'sm') {
  const { name, username } = identity(profile);
  const href = profileUrl(profile);
  const body = `<div class="flex items-center gap-2 min-w-0">
    ${avatarHtml(profile, size)}
    <div class="min-w-0">
      <div class="text-sm font-bold text-white truncate">${escapeHTML(name)}</div>
      ${username ? `<div class="text-[11px] mono text-dark-muted truncate" dir="ltr">${escapeHTML(username)}</div>` : ''}
    </div>
  </div>`;
  return href
    ? `<a href="${escapeHTML(href)}" class="min-w-0 hover:opacity-80 transition">${body}</a>`
    : body;
}

function field(label, inputHtml, hintHtml = '') {
  return `<div class="mb-3">
    <label class="${LABEL_CLASS}">${escapeHTML(label)}</label>
    ${inputHtml}
    ${hintHtml ? `<p class="${HINT_CLASS}">${escapeHTML(hintHtml)}</p>` : ''}
  </div>`;
}

function formatTimeLeft(iso) {
  const until = new Date(iso).getTime();
  const diff = until - Date.now();
  if (!Number.isFinite(diff) || diff <= 0) return '';

  const totalMinutes = Math.ceil(diff / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const ar = getLang() === 'ar';

  if (hours > 0 && minutes > 0) return ar ? `${hours} س ${minutes} د` : `${hours}h ${minutes}m`;
  if (hours > 0) return ar ? `${hours} س` : `${hours}h`;
  return ar ? `${minutes} د` : `${minutes}m`;
}

function groupStatusBadge(group, memberCount) {
  if (!group.is_open) {
    return `<span class="inline-flex items-center rounded-md border border-slate-500/40 bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold mono text-slate-300">${escapeHTML(t('groupClosed'))}</span>`;
  }
  if (memberCount >= group.max_size) {
    return `<span class="inline-flex items-center rounded-md border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold mono text-red-300">${escapeHTML(t('groupFull'))}</span>`;
  }
  return `<span class="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold mono text-emerald-300">${escapeHTML(t('groupOpen'))}</span>`;
}

function getGroupState({ group, item, members, myMembership, myRequest, now = Date.now() }) {
  if (myMembership && myMembership.group_id === group.id) return { kind: 'member' };
  if (myMembership) return { kind: 'other-group', groupId: myMembership.group_id };
  if (myRequest?.status === 'pending') return { kind: 'pending', requestId: myRequest.id };

  const due = item?.due_at ? new Date(item.due_at).getTime() : 0;
  if (due && due <= now) return { kind: 'past' };

  if (!group.is_open) return { kind: 'closed' };
  if (members.length >= group.max_size) return { kind: 'full' };

  const retryAfter = myRequest?.status === 'rejected' && myRequest.retry_after
    ? new Date(myRequest.retry_after).getTime()
    : 0;
  if (retryAfter && retryAfter > now) {
    return { kind: 'cooldown', until: myRequest.retry_after };
  }

  return { kind: 'can-request' };
}

function stateActionHtml(state, group, isGuest = false) {
  const groupId = escapeHTML(group.id);
  const returnTo = '#/groups/' + group.id;

  if (isGuest) {
    if (state.kind === 'past') {
      return `<span class="inline-flex items-center rounded-md border border-slate-500/40 bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold mono text-slate-300">${escapeHTML(t('deadlinePassed'))}</span>`;
    }
    if (state.kind === 'closed') {
      return `<span class="inline-flex items-center rounded-md border border-slate-500/40 bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold mono text-slate-300">${escapeHTML(t('groupClosed'))}</span>`;
    }
    if (state.kind === 'full') {
      return `<span class="inline-flex items-center rounded-md border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold mono text-red-300">${escapeHTML(t('groupFull'))}</span>`;
    }
    return `<a href="#/signin" data-return-to="${escapeHTML(returnTo)}" class="${primaryActionClass}">
      <span aria-hidden="true">🔒</span>${escapeHTML(t('signInToJoin'))}
    </a>`;
  }

  switch (state.kind) {
    case 'member':
      return `<a href="#/groups/${groupId}" class="${primaryActionClass}">${escapeHTML(t('openGroup'))}</a>`;
    case 'other-group':
      return `<a href="#/groups/${escapeHTML(state.groupId)}" class="${secondaryActionClass}">${escapeHTML(t('openYourGroup'))}</a>
        <span class="text-[11px] text-dark-muted">${escapeHTML(t('alreadyInGroupForItem'))}</span>`;
    case 'pending':
      return `<span class="inline-flex items-center rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold mono text-sky-300">${escapeHTML(t('requestSent'))}</span>
        <button type="button" data-action="cancel-request" data-request-id="${escapeHTML(state.requestId)}"
          class="${secondaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('cancelRequest'))}</button>`;
    case 'cooldown':
      return `<span class="inline-flex items-center rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold mono text-amber-300">${escapeHTML(tf('requestAgainIn', { time: formatTimeLeft(state.until) }))}</span>`;
    case 'past':
      return `<span class="inline-flex items-center rounded-md border border-slate-500/40 bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold mono text-slate-300">${escapeHTML(t('deadlinePassed'))}</span>`;
    case 'closed':
      return `<span class="inline-flex items-center rounded-md border border-slate-500/40 bg-slate-500/15 px-2 py-0.5 text-[10px] font-bold mono text-slate-300">${escapeHTML(t('groupClosed'))}</span>`;
    case 'full':
      return `<span class="inline-flex items-center rounded-md border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold mono text-red-300">${escapeHTML(t('groupFull'))}</span>`;
    default:
      return `<button type="button" data-action="request" data-group-id="${groupId}"
        class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('requestToJoin'))}</button>`;
  }
}

function requestFormHtml(group) {
  return `<form data-request-form data-group-id="${escapeHTML(group.id)}"
    class="mt-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3">
    ${field(t('requestMessage'),
      `<textarea name="message" rows="2" maxlength="200" class="${INPUT_CLASS}"
        placeholder="${escapeHTML(t('requestMessageHint'))}"></textarea>`,
      t('requestMessageHint'))}
    <div class="flex flex-wrap gap-2">
      <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('sendRequest'))}</button>
      <button type="button" data-action="close-request" class="${secondaryActionClass}">${escapeHTML(t('cancel'))}</button>
    </div>
  </form>`;
}

function groupCard({ group, item, members, owner, myMembership, myRequest, isGuest = false }) {
  const groupId = escapeHTML(group.id);
  const itemId = escapeHTML(item?.id || group.item_id);
  const state = getGroupState({ group, item, members, myMembership, myRequest });
  const count = members.length;
  const description = String(group.description || '').trim();
  const subject = String(item?.subject_label || '').trim();
  const deadline = item?.due_at ? formatDateTime(item.due_at) : t('dateUnknown');
  const relative = item?.due_at ? formatRelative(item.due_at) : '';
  const { name: ownerName } = identity(owner);

  return `<article data-group-id="${groupId}" class="rounded-2xl border border-dark-border bg-dark-surface/90 overflow-hidden">
    <div class="p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-2 mb-2">
        ${item ? typeBadge(item.type) : ''}
        ${subject ? `<span class="inline-flex max-w-[10rem] truncate rounded-md border border-dark-border bg-dark-elevated px-2 py-0.5 text-[10px] mono text-dark-muted">${escapeHTML(subject)}</span>` : ''}
        ${groupStatusBadge(group, count)}
        <span class="ms-auto text-[10px] sm:text-[11px] mono text-dark-muted whitespace-nowrap">${escapeHTML(tf('memberCount', { n: count, max: group.max_size }))}</span>
      </div>

      <h3 class="text-base sm:text-lg font-extrabold text-white leading-snug break-words">
        <a href="#/groups/${groupId}" class="hover:text-brand-500 transition">${escapeHTML(group.name)}</a>
      </h3>
      ${description ? `<p class="mt-1.5 text-xs sm:text-sm text-dark-muted leading-relaxed break-words">${escapeHTML(description)}</p>` : ''}

      <div class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] sm:text-xs text-dark-muted">
        ${item ? `<a href="#/items/${itemId}" class="inline-flex items-center gap-1.5 hover:text-brand-500 transition"><span aria-hidden="true">📌</span><span>${escapeHTML(item.title)}</span></a>` : ''}
        <span class="inline-flex items-center gap-1.5"><span aria-hidden="true">📅</span><span>${escapeHTML(deadline)}</span></span>
        ${relative ? `<span class="text-[10px] mono">${escapeHTML(relative)}</span>` : ''}
      </div>

      <div class="mt-3 flex items-center gap-2">
        ${profileUrl(owner)
          ? `<a href="${escapeHTML(profileUrl(owner))}" class="flex items-center gap-2 min-w-0 hover:opacity-80 transition">
              ${avatarHtml(owner, 'sm')}
              <div class="min-w-0 text-[11px] sm:text-xs">
                <span class="font-bold text-white">${escapeHTML(ownerName)}</span>
                <span class="text-dark-muted"> · ${escapeHTML(t('owner'))}</span>
              </div>
            </a>`
          : `${avatarHtml(owner, 'sm')}
            <div class="min-w-0 text-[11px] sm:text-xs">
              <span class="font-bold text-white">${escapeHTML(ownerName)}</span>
              <span class="text-dark-muted"> · ${escapeHTML(t('owner'))}</span>
            </div>`}
      </div>

      <div class="mt-4 flex flex-wrap items-center gap-2">
        ${stateActionHtml(state, group, isGuest)}
      </div>
      <div data-request-slot></div>
    </div>
  </article>`;
}

function buildModel({ groups, items, members, profiles, memberships, requests }) {
  const itemMap = new Map((items || []).map((item) => [item.id, item]));
  const profileMap = new Map((profiles || []).map((profile) => [profile.id, profile]));
  const membersByGroup = new Map();

  (members || []).forEach((member) => {
    const key = String(member.group_id);
    if (!membersByGroup.has(key)) membersByGroup.set(key, []);
    membersByGroup.get(key).push(member);
  });

  const membershipByItem = new Map((memberships || []).map((membership) => [membership.item_id, membership]));
  const requestByGroup = new Map();
  (requests || []).forEach((request) => {
    if (!requestByGroup.has(request.group_id)) requestByGroup.set(request.group_id, request);
  });

  const visibleGroups = (groups || []).filter((group) => itemMap.has(group.item_id));
  visibleGroups.sort((a, b) => {
    const aMine = membershipByItem.has(a.item_id) ? 0 : 1;
    const bMine = membershipByItem.has(b.item_id) ? 0 : 1;
    if (aMine !== bMine) return aMine - bMine;
    const aDue = new Date(itemMap.get(a.item_id)?.due_at || 0).getTime();
    const bDue = new Date(itemMap.get(b.item_id)?.due_at || 0).getTime();
    if (aDue !== bDue) return aDue - bDue;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  return {
    groups: visibleGroups,
    groupMap: new Map(visibleGroups.map((group) => [group.id, group])),
    itemMap,
    profileMap,
    membersByGroup,
    membershipByItem,
    requestByGroup,
  };
}

function groupCreateEligibility(model) {
  const now = Date.now();
  const summary = {
    total: 0,
    eligible: [],
    items: [],
    pastDue: 0,
    groupsDisabled: 0,
    alreadyGrouped: 0,
  };

  for (const item of model.itemMap.values()) {
    summary.total += 1;

    const max = Number(item.max_group_size);
    if (!Number.isFinite(max) || max < 2) {
      summary.groupsDisabled += 1;
      summary.items.push({ item, reason: 'individual' });
      continue;
    }

    const due = item.due_at ? new Date(item.due_at).getTime() : 0;
    if (!due || due <= now) {
      summary.pastDue += 1;
      summary.items.push({ item, reason: 'pastDue' });
      continue;
    }

    const membership = model.membershipByItem.get(item.id);
    if (membership) {
      summary.alreadyGrouped += 1;
      summary.items.push({
        item,
        reason: 'grouped',
        groupId: membership.group_id,
        groupName: model.groupMap.get(membership.group_id)?.name || '',
      });
      continue;
    }

    summary.eligible.push(item);
    summary.items.push({ item, reason: 'eligible' });
  }

  summary.eligible.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime());
  return summary;
}

function groupItemReasonLabel(reason) {
  if (reason === 'individual') return t('itemStatusIndividual');
  if (reason === 'pastDue') return t('itemStatusPastDue');
  if (reason === 'grouped') return t('itemStatusGrouped');
  return t('itemStatusEligible');
}


function createEligibleItems(model) {
  return groupCreateEligibility(model).eligible;
}

function eligibilitySummaryHtml(summary) {
  const lines = [];
  if (summary.groupsDisabled) {
    lines.push(tf('eligibilityGroupsDisabled', { count: summary.groupsDisabled }));
  }
  if (summary.pastDue) {
    lines.push(tf('eligibilityPastDue', { count: summary.pastDue }));
  }
  if (summary.alreadyGrouped) {
    lines.push(tf('eligibilityAlreadyGrouped', { count: summary.alreadyGrouped }));
  }

  const visible = summary.items.slice(0, 8);
  const hidden = Math.max(0, summary.items.length - visible.length);
  const rows = visible.map(({ item, reason, groupId, groupName }) => {
    const title = escapeHTML(item?.title || t('untitledItem'));
    const status = escapeHTML(groupItemReasonLabel(reason));
    const link = reason === 'grouped' && groupId
      ? `<a href="#/groups/${escapeHTML(groupId)}" class="inline-flex max-w-full items-center gap-1 font-bold text-amber-100 underline decoration-amber-300/50 underline-offset-2 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/60 rounded">
          <span aria-hidden="true">↗</span>
          <span class="truncate">${escapeHTML(t('openYourGroup'))}${groupName ? ` — ${escapeHTML(groupName)}` : ''}</span>
        </a>`
      : '';

    return `<li class="flex flex-col gap-1 border-t border-amber-400/15 py-2 first:border-t-0 first:pt-0">
      <span class="min-w-0 break-words text-[11px] sm:text-xs font-bold text-white">${title}</span>
      <span class="text-[11px] text-amber-100/80">${status}</span>
      ${link ? `<span class="min-w-0">${link}</span>` : ''}
    </li>`;
  }).join('');

  if (!lines.length && !summary.items.length) return '';

  return `<div class="mt-2">
    ${lines.length ? `<ul class="space-y-1 text-[11px] sm:text-xs text-amber-100/90 list-disc ps-5">
      ${lines.map((line) => `<li>${escapeHTML(line)}</li>`).join('')}
    </ul>` : ''}
    ${visible.length ? `<details class="mt-2 rounded-xl border border-amber-400/20 bg-dark-base/40 px-3 py-2">
      <summary class="cursor-pointer select-none text-[11px] sm:text-xs font-bold text-amber-100">${escapeHTML(tf('eligibilityDetails', { count: summary.items.length }))}</summary>
      <ul class="mt-2">${rows}</ul>
      ${hidden ? `<p class="mt-2 text-[11px] text-amber-100/70">${escapeHTML(tf('eligibilityMoreItems', { count: hidden }))}</p>` : ''}
    </details>` : ''}
  </div>`;
}

function createGroupUnavailablePanel(model) {
  const summary = groupCreateEligibility(model);
  return `<div class="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:p-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-base font-extrabold text-white">${escapeHTML(t('createGroupUnavailable'))}</h3>
        <p class="mt-1 text-xs sm:text-sm text-amber-100/85 leading-relaxed">
          ${escapeHTML(summary.total ? t('createGroupUnavailableHint') : t('noItemsYet'))}
        </p>
        ${summary.total ? eligibilitySummaryHtml(summary) : ''}
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button type="button" data-action="close-create-group" class="${secondaryActionClass}">${escapeHTML(t('close'))}</button>
      </div>
    </div>
  </div>`;
}


function cardFor(model, group, isGuest = false) {
  return groupCard({
    group,
    item: model.itemMap.get(group.item_id),
    members: model.membersByGroup.get(group.id) || [],
    owner: model.profileMap.get(group.owner_id),
    myMembership: model.membershipByItem.get(group.item_id),
    myRequest: model.requestByGroup.get(group.id),
    isGuest,
  });
}

function filterGroups(model, ui) {
  const query = String(ui.q || '').trim().toLowerCase();
  const type = String(ui.type || '');
  const itemId = String(ui.item || '');
  const freeOnly = !!ui.free;

  return model.groups.filter((group) => {
    const item = model.itemMap.get(group.item_id);
    const owner = model.profileMap.get(group.owner_id);
    const members = model.membersByGroup.get(group.id) || [];

    if (!item) return false;
    if (type && item.type !== type) return false;
    if (itemId && group.item_id !== itemId) return false;
    if (freeOnly && members.length >= group.max_size) return false;
    if (!query) return true;

    return [group.name, item.title, item.subject_label, owner?.username, owner?.display_name]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query);
  });
}

function groupsPageHtml(model, ui, isGuest = false) {
  const eligibility = groupCreateEligibility(model);
  const createAction = isGuest
    ? `<a href="#/signin" data-return-to="#/groups" class="${primaryActionClass}"><span aria-hidden="true">🔒</span>${escapeHTML(t('signInToCreateGroup'))}</a>`
    : `<button type="button" data-action="toggle-create-group" class="${primaryActionClass}"><span aria-hidden="true">＋</span>${escapeHTML(t('createGroup'))}</button>`;
  const itemsWithGroups = [...new Set(model.groups.map((group) => group.item_id))]
    .map((id) => model.itemMap.get(id))
    .filter(Boolean)
    .sort((a, b) => String(a.title).localeCompare(String(b.title)));

  const itemOptions = [
    `<option value="" ${ui.item ? '' : 'selected'}>${escapeHTML(t('filterAllItems'))}</option>`,
    ...itemsWithGroups.map((item) =>
      `<option value="${escapeHTML(item.id)}" ${ui.item === item.id ? 'selected' : ''}>${escapeHTML(item.title)}</option>`
    ),
  ].join('');

  return `<div class="fade space-y-5">
    ${pageHero({
      path: '#/groups',
      title: t('groups'),
      subtitle: t('groupsIntro'),
      actionsHtml: createAction,
    })}

    <section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5" aria-label="${escapeHTML(t('filterGroups'))}">
      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label for="groupSearch" class="${LABEL_CLASS}">${escapeHTML(t('searchGroups'))}</label>
          <input id="groupSearch" type="search" value="${escapeHTML(ui.q)}"
            placeholder="${escapeHTML(t('searchGroupsPlaceholder'))}" class="${INPUT_CLASS}">
        </div>
        <div>
          <label for="groupTypeFilter" class="${LABEL_CLASS}">${escapeHTML(t('filterType'))}</label>
          <select id="groupTypeFilter" class="${INPUT_CLASS}">
            <option value="" ${ui.type ? '' : 'selected'}>${escapeHTML(t('filterAllTypes'))}</option>
            <option value="homework" ${ui.type === 'homework' ? 'selected' : ''}>${escapeHTML(t('typeHomework'))}</option>
            <option value="assignment" ${ui.type === 'assignment' ? 'selected' : ''}>${escapeHTML(t('typeAssignment'))}</option>
            <option value="presentation" ${ui.type === 'presentation' ? 'selected' : ''}>${escapeHTML(t('typePresentation'))}</option>
          </select>
        </div>
        <div>
          <label for="groupItemFilter" class="${LABEL_CLASS}">${escapeHTML(t('filterItem'))}</label>
          <select id="groupItemFilter" class="${INPUT_CLASS}">${itemOptions}</select>
        </div>
        <div class="flex items-end gap-3">
          <label class="inline-flex items-center gap-2 text-xs sm:text-sm text-dark-muted cursor-pointer">
            <input id="groupFreeOnly" type="checkbox" ${ui.free ? 'checked' : ''}
              class="w-4 h-4 rounded border-dark-border bg-dark-base text-brand-500 focus:ring-brand-500/40">
            ${escapeHTML(t('filterFreeOnly'))}
          </label>
          <button type="button" data-action="clear-filters" class="text-xs font-bold text-brand-500 hover:text-amber-400 transition ms-auto">${escapeHTML(t('clearFilters'))}</button>
        </div>
      </div>
      ${isGuest
        ? `<div class="mt-3 rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 text-xs sm:text-sm text-white/85 leading-relaxed">
            ${escapeHTML(t('guestGroupHint'))}
          </div>`
        : (eligibility.eligible.length
          ? ''
          : `<div data-create-notice class="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
              <p class="text-xs sm:text-sm font-bold text-amber-100">${escapeHTML(t('createGroupUnavailable'))}</p>
              <p class="mt-1 text-[11px] sm:text-xs text-amber-100/80 leading-relaxed">${escapeHTML(eligibility.total ? t('createGroupUnavailableHint') : t('noItemsYet'))}</p>
              ${eligibility.total ? eligibilitySummaryHtml(eligibility) : ''}
            </div>`)}
    </section>

    ${isGuest ? '' : '<div data-create-group-slot></div>'}

    <section>
      ${sectionHeader(t('groups'), { count: model.groups.length, icon: '👥' })}
      <div id="groupsList" class="space-y-3"></div>
    </section>
  </div>`;
}

function mountPage(root, id) {
  root.innerHTML = `<div id="${id}" class="fade space-y-5"></div>`;
  return root.querySelector('#' + id);
}

function renderList(page, model, ui, isGuest = false) {
  const list = page.querySelector('#groupsList');
  if (!list || !model) return;

  const filtered = filterGroups(model, ui);
  list.innerHTML = filtered.length
    ? filtered.map((group) => cardFor(model, group, isGuest)).join('')
    : emptyPanel('👥', t('noGroupsText'));
}

export async function renderGroups(root, ctx = {}) {
  const me = ctx.profile || null;
  const isGuest = !me;

  const page = mountPage(root, 'groupsPage');
  const ui = { q: '', type: '', item: '', free: false };
  let model = null;
  let generation = 0;
  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  async function load(force = false) {
    const current = ++generation;
    page.innerHTML = loadingPanel();

    try {
      const [groups, items] = await Promise.all([
        fetchAllGroups(),
        fetchItems({ force }),
      ]);
      if (isStale() || current !== generation) return;

      let memberships = [];
      let requests = [];
      if (me) {
        [memberships, requests] = await Promise.all([
          fetchMyMemberships(me.id),
          fetchMyRequests(me.id),
        ]);
        if (isStale() || current !== generation) return;
      }

      const members = await fetchMembersForGroups(groups.map((group) => group.id));
      if (isStale() || current !== generation) return;

      const profileIds = [
        ...groups.map((group) => group.owner_id),
        ...members.map((member) => member.user_id),
      ];
      if (me) profileIds.push(me.id);

      const profiles = await fetchProfilesByIds(profileIds);
      if (isStale() || current !== generation) return;

      model = buildModel({ groups, items, members, profiles, memberships, requests });
      page.innerHTML = groupsPageHtml(model, ui, isGuest);
      renderList(page, model, ui, isGuest);
    } catch (error) {
      if (isStale() || current !== generation) return;
      page.innerHTML = errorPanel({ message: rpcErrorMessage(error, getLang()), code: error?.code || '' }, 'groupsRetry');
    }
  }

  page.addEventListener('click', async (event) => {
    if (event.target.closest('#groupsRetry')) {
      load(true);
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;

    if (action === 'retry') {
      load(true);
      return;
    }

    if (action === 'clear-filters') {
      ui.q = '';
      ui.type = '';
      ui.item = '';
      ui.free = false;
      if (model) {
        page.innerHTML = groupsPageHtml(model, ui, isGuest);
        renderList(page, model, ui, isGuest);
      }
      return;
    }

    if (action === 'toggle-create-group') {
      if (!me) {
        window.location.hash = '#/signin';
        return;
      }
      const slot = page.querySelector('[data-create-group-slot]');
      if (!slot) return;
      const notice = page.querySelector('[data-create-notice]');
      if (slot.innerHTML.trim()) {
        slot.innerHTML = '';
        if (notice) notice.hidden = false;
        return;
      }
      if (!model) return;
      if (notice) notice.hidden = true;
      const items = createEligibleItems(model);
      if (!items.length) {
        slot.innerHTML = createGroupUnavailablePanel(model);
        return;
      }
      slot.innerHTML = createGroupPickerForm(items);
      syncPickerMaxSize(slot.querySelector('#groupsCreateForm'), model);
      slot.querySelector('select[name="itemId"]')?.focus();
      return;
    }

    if (action === 'close-create-group') {
      const slot = page.querySelector('[data-create-group-slot]');
      if (slot) slot.innerHTML = '';
      const notice = page.querySelector('[data-create-notice]');
      if (notice) notice.hidden = false;
      return;
    }

    if (action === 'request') {
      const card = actionEl.closest('article[data-group-id]');
      const group = card && model ? model.groupMap.get(card.dataset.groupId) : null;
      if (!card || !group) return;
      const slot = card.querySelector('[data-request-slot]');
      if (!slot) return;
      if (slot.innerHTML.trim()) {
        slot.innerHTML = '';
        return;
      }
      slot.innerHTML = requestFormHtml(group);
      slot.querySelector('textarea')?.focus();
      return;
    }

    if (action === 'close-request') {
      const card = actionEl.closest('article[data-group-id]');
      const slot = card?.querySelector('[data-request-slot]');
      if (slot) slot.innerHTML = '';
      return;
    }

    if (action === 'cancel-request') {
      const requestId = actionEl.dataset.requestId;
      if (!requestId) return;
      actionEl.disabled = true;
      try {
        await cancelRequest(requestId);
        showToast(t('requestCancelled'), 'success');
        await load(true);
      } catch (error) {
        showToast(rpcErrorMessage(error, getLang()), 'error');
        actionEl.disabled = false;
      }
    }
  });

  page.addEventListener('input', (event) => {
    if (event.target.id === 'groupSearch') {
      ui.q = event.target.value;
      renderList(page, model, ui, isGuest);
    }
  });

  page.addEventListener('change', (event) => {
    if (event.target.matches('#groupsCreateForm select[name="itemId"]')) {
      syncPickerMaxSize(event.target.form, model);
      return;
    }
    if (event.target.id === 'groupTypeFilter') ui.type = event.target.value;
    else if (event.target.id === 'groupItemFilter') ui.item = event.target.value;
    else if (event.target.id === 'groupFreeOnly') ui.free = event.target.checked;
    else return;
    renderList(page, model, ui, isGuest);
  });

  page.addEventListener('submit', async (event) => {
    if (!me) {
      event.preventDefault();
      return;
    }
    const createGroupFormEl = event.target.closest('#groupsCreateForm');
    if (createGroupFormEl) {
      event.preventDefault();
      if (!model) return;

      const itemId = String(createGroupFormEl.querySelector('select[name="itemId"]')?.value || '');
      const item = model.itemMap.get(itemId);
      if (!item) {
        showToast(t('chooseItem'), 'warning');
        return;
      }

      const name = String(createGroupFormEl.querySelector('input[name="name"]')?.value || '').trim();
      const description = String(createGroupFormEl.querySelector('textarea[name="description"]')?.value || '').trim();
      const maxSize = Number(createGroupFormEl.querySelector('input[name="maxSize"]')?.value || 0);
      const whatsappLink = String(createGroupFormEl.querySelector('input[name="whatsappLink"]')?.value || '').trim();

      const validation = validateGroupFields({ name, description, maxSize, whatsappLink }, item, 2);
      if (validation) {
        showToast(validation, 'warning');
        return;
      }

      const submit = createGroupFormEl.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        const created = await createGroup(item.id, name, description, maxSize, whatsappLink);
        const groupId = createdGroupId(created);
        showToast(t('groupCreated'), 'success');
        if (groupId) {
          window.location.hash = '#/groups/' + encodeURIComponent(groupId);
        } else {
          await load(true);
        }
      } catch (error) {
        showToast(rpcErrorMessage(error, getLang()), 'error');
        if (submit?.isConnected) submit.disabled = false;
      }
      return;
    }

    const form = event.target.closest('form[data-request-form]');
    if (!form) return;
    event.preventDefault();

    const groupId = form.dataset.groupId;
    const message = String(form.querySelector('textarea[name="message"]')?.value || '').trim();
    if (message.length > 200) {
      showToast(t('requestMessageTooLong'), 'warning');
      return;
    }

    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await requestJoin(groupId, message || null);
      showToast(t('joinRequestSent'), 'success');
      await load(true);
    } catch (error) {
      showToast(rpcErrorMessage(error, getLang()), 'error');
      if (submit?.isConnected) submit.disabled = false;
    }
  });

  await load();
}

// ---------- Group page ----------

function groupInfoPanel(group, item, members) {
  const count = members.length;
  const deleteDate = item?.due_at ? formatDate(addDays(item.due_at, GROUP_RETENTION_DAYS)) : t('dateUnknown');
  const deadline = item?.due_at ? formatDateTime(item.due_at) : t('dateUnknown');
  const status = !group.is_open
    ? t('groupClosed')
    : (count >= group.max_size ? t('groupFull') : t('groupOpen'));

  return `<section class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3" aria-label="${escapeHTML(t('groupDetails'))}">
    <div class="rounded-xl border border-brand-500/30 bg-brand-500/10 p-3 sm:p-4">
      <div class="text-[10px] sm:text-[11px] mono font-bold text-dark-muted mb-1">${escapeHTML(t('members'))}</div>
      <div class="text-lg sm:text-2xl font-extrabold mono text-white">${escapeHTML(tf('memberCount', { n: count, max: group.max_size }))}</div>
    </div>
    <div class="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 sm:p-4">
      <div class="text-[10px] sm:text-[11px] mono font-bold text-dark-muted mb-1">${escapeHTML(t('status'))}</div>
      <div class="text-sm sm:text-base font-extrabold text-white">${escapeHTML(status)}</div>
    </div>
    <div class="rounded-xl border border-dark-border bg-dark-base/40 p-3 sm:p-4">
      <div class="text-[10px] sm:text-[11px] mono font-bold text-dark-muted mb-1">${escapeHTML(t('deadline'))}</div>
      <div class="text-xs sm:text-sm font-bold text-white break-words">${escapeHTML(deadline)}</div>
    </div>
    <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 sm:p-4">
      <div class="text-[10px] sm:text-[11px] mono font-bold text-dark-muted mb-1">${escapeHTML(t('deletionDate'))}</div>
      <div class="text-xs sm:text-sm font-bold text-amber-200 break-words">${escapeHTML(deleteDate)}</div>
    </div>
  </section>`;
}

function itemPanel(item) {
  if (!item) return '';
  const subject = String(item.subject_label || '').trim();
  return `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
    <div class="flex flex-wrap items-center gap-2 mb-2">
      ${typeBadge(item.type)}
      ${urgencyBadge(getItemUrgency(item))}
      ${subject ? `<span class="inline-flex max-w-[12rem] truncate rounded-md border border-dark-border bg-dark-elevated px-2 py-0.5 text-[10px] mono text-dark-muted">${escapeHTML(subject)}</span>` : ''}
    </div>
    <a href="#/items/${escapeHTML(item.id)}" class="text-base sm:text-lg font-extrabold text-white hover:text-brand-500 transition break-words">${escapeHTML(item.title)}</a>
    <div class="mt-1.5 text-[11px] sm:text-xs text-dark-muted flex flex-wrap items-center gap-x-4 gap-y-1">
      <span>${escapeHTML(t('deadline'))}: ${escapeHTML(formatDateTime(item.due_at))}</span>
      <span class="mono">${escapeHTML(formatRelative(item.due_at))}</span>
    </div>
  </section>`;
}

function pendingRequestPanel(state) {
  return `<div class="rounded-xl border border-sky-500/35 bg-sky-500/10 p-4 flex flex-wrap items-center gap-3">
    <span class="inline-flex items-center rounded-md border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold mono text-sky-300">${escapeHTML(t('requestSent'))}</span>
    <span class="text-xs text-dark-muted">${escapeHTML(t('requestPendingHint'))}</span>
    <button type="button" data-action="cancel-request" data-request-id="${escapeHTML(state.requestId)}"
      class="${secondaryActionClass} ${DISABLED_CLASS} ms-auto">${escapeHTML(t('cancelRequest'))}</button>
  </div>`;
}

function joinPanel(state, group, isGuest = false) {
  if (isGuest) {
    return `<section>${sectionHeader(t('joinGroup'), { icon: '📨' })}
      <div class="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4 sm:p-5">
        <p class="text-xs sm:text-sm text-white/85 leading-relaxed mb-3">${escapeHTML(t('guestGroupHint'))}</p>
        <a href="#/signin" data-return-to="#/groups/${escapeHTML(group.id)}" class="${primaryActionClass}">
          <span aria-hidden="true">🔒</span>${escapeHTML(t('signInToJoin'))}
        </a>
      </div>
    </section>`;
  }

  if (state.kind === 'member') return '';

  if (state.kind === 'pending') {
    return `<section>${sectionHeader(t('joinGroup'), { icon: '📨' })}${pendingRequestPanel(state)}</section>`;
  }

  let body = '';
  if (state.kind === 'can-request') {
    body = `<div class="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 sm:p-5">
      <p class="text-xs sm:text-sm text-dark-muted mb-3">${escapeHTML(t('requestJoinHint'))}</p>
      ${requestFormHtml(group)}
    </div>`;
  } else if (state.kind === 'cooldown') {
    body = `<div class="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-sm font-bold text-amber-200">
      ${escapeHTML(tf('requestAgainIn', { time: formatTimeLeft(state.until) }))}
    </div>`;
  } else if (state.kind === 'other-group') {
    body = `<div class="rounded-xl border border-dark-border bg-dark-base/40 p-4 flex flex-wrap items-center gap-3">
      <span class="text-sm text-dark-muted">${escapeHTML(t('alreadyInGroupForItem'))}</span>
      <a href="#/groups/${escapeHTML(state.groupId)}" class="${secondaryActionClass}">${escapeHTML(t('openYourGroup'))}</a>
    </div>`;
  } else if (state.kind === 'past') {
    body = `<div class="rounded-xl border border-slate-500/35 bg-slate-500/10 p-4 text-sm text-slate-300">${escapeHTML(t('pastDueGroups'))}</div>`;
  } else if (state.kind === 'closed') {
    body = `<div class="rounded-xl border border-slate-500/35 bg-slate-500/10 p-4 text-sm text-slate-300">${escapeHTML(t('groupClosedHint'))}</div>`;
  } else if (state.kind === 'full') {
    body = `<div class="rounded-xl border border-red-500/35 bg-red-500/10 p-4 text-sm text-red-200">${escapeHTML(t('groupFullHint'))}</div>`;
  }

  return `<section>${sectionHeader(t('joinGroup'), { icon: '📨' })}${body}</section>`;
}

function whatsappPanel(secret) {
  const link = String(secret?.whatsapp_link || '').trim();
  return `<section>${sectionHeader(t('whatsappGroup'), { icon: '💬' })}
    <div class="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 sm:p-5">
      <p class="text-[11px] sm:text-xs text-dark-muted mb-2">${escapeHTML(t('whatsappMembersOnly'))}</p>
      ${link
        ? `<a href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer"
            class="${primaryActionClass} bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400">
            <span aria-hidden="true">💬</span>${escapeHTML(t('openWhatsapp'))}
          </a>
          <p class="mt-2 text-[10px] mono text-emerald-200/70 break-all" dir="ltr">${escapeHTML(link)}</p>`
        : `<p class="text-sm text-dark-muted">${escapeHTML(t('noWhatsappLink'))}</p>`}
    </div>
  </section>`;
}

function leavePanel(group, members, me) {
  const isOwner = group.owner_id === me.id;
  const isMember = members.some((member) => member.user_id === me.id);
  if (!isMember) return '';

  const onlyMember = members.length === 1;
  const blocked = isOwner && !onlyMember;
  const hint = blocked
    ? t('ownerMustTransfer')
    : (isOwner ? t('leaveDeletesGroupHint') : t('leaveGroupHint'));

  return `<section class="rounded-2xl border border-red-500/30 bg-red-500/5 p-4 sm:p-5">
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" data-action="leave" ${blocked ? 'disabled' : ''}
        class="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-200 font-bold text-xs sm:text-sm transition ${DISABLED_CLASS}">
        ${escapeHTML(t('leaveGroup'))}
      </button>
      <span class="text-[11px] sm:text-xs text-dark-muted">${escapeHTML(hint)}</span>
    </div>
  </section>`;
}

function requestsPanel(bundle) {
  const { group, requests, members, profileMap } = bundle;
  const full = members.length >= group.max_size;

  return `<section>${sectionHeader(t('joinRequests'), { count: requests.length, icon: '📥' })}
    ${requests.length
      ? `<div class="space-y-2">${requests.map((request) => {
          const profile = profileMap.get(request.user_id);
          const message = String(request.message || '').trim();
          return `<div class="rounded-xl border border-dark-border bg-dark-surface/90 p-3 sm:p-4" data-request-id="${escapeHTML(request.id)}">
            <div class="flex flex-wrap items-center gap-3">
              ${identityHtml(profile, 'md')}
              <span class="text-[10px] mono text-dark-muted ms-auto">${escapeHTML(formatRelative(request.created_at))}</span>
            </div>
            ${message ? `<p class="mt-2 text-xs sm:text-sm text-dark-muted leading-relaxed break-words">${escapeHTML(message)}</p>` : ''}
            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" data-action="accept" data-request-id="${escapeHTML(request.id)}" ${full ? 'disabled' : ''}
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 text-xs font-bold transition ${DISABLED_CLASS}">
                ${escapeHTML(t('accept'))}
              </button>
              <button type="button" data-action="reject" data-request-id="${escapeHTML(request.id)}"
                class="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-500/40 bg-red-500/15 hover:bg-red-500/25 text-red-200 text-xs font-bold transition ${DISABLED_CLASS}">
                ${escapeHTML(t('reject'))}
              </button>
              ${full ? `<span class="text-[11px] text-amber-300">${escapeHTML(t('groupFullAcceptHint'))}</span>` : ''}
            </div>
          </div>`;
        }).join('')}</div>`
      : emptyPanel('📭', t('noJoinRequests'))}
  </section>`;
}

function membersPanel(bundle, me) {
  const { group, members, profileMap } = bundle;
  const meId = me?.id || '';
  const isOwner = !!me && group.owner_id === meId;

  return `<section>${sectionHeader(t('members'), { count: members.length, icon: '👥' })}
    <div class="grid sm:grid-cols-2 gap-2 sm:gap-3">
      ${members.map((member) => {
        const profile = profileMap.get(member.user_id);
        const isGroupOwner = member.user_id === group.owner_id;
        const isMe = !!me && member.user_id === meId;
        return `<div class="rounded-xl border border-dark-border bg-dark-base/40 p-3 flex items-center gap-3">
          ${profileUrl(profile)
            ? `<a href="${escapeHTML(profileUrl(profile))}" class="shrink-0 rounded-full hover:opacity-80 transition">${avatarHtml(profile, 'md')}</a>`
            : avatarHtml(profile, 'md')}
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-1.5">
              ${profileUrl(profile)
                ? `<a href="${escapeHTML(profileUrl(profile))}" class="text-sm font-bold text-white truncate hover:text-brand-500 transition">${escapeHTML(identity(profile).name)}</a>`
                : `<span class="text-sm font-bold text-white truncate">${escapeHTML(identity(profile).name)}</span>`}
              ${isGroupOwner ? `<span class="rounded-md border border-brand-500/40 bg-brand-500/15 px-1.5 py-0.5 text-[9px] font-bold mono text-brand-500">${escapeHTML(t('owner'))}</span>` : ''}
              ${isMe ? `<span class="rounded-md border border-sky-500/40 bg-sky-500/15 px-1.5 py-0.5 text-[9px] font-bold mono text-sky-300">${escapeHTML(t('you'))}</span>` : ''}
            </div>
            ${profile?.username ? `<div class="text-[10px] mono text-dark-muted truncate" dir="ltr">@${escapeHTML(profile.username)}</div>` : ''}
            <div class="text-[10px] text-dark-muted mt-0.5">${escapeHTML(tf('memberSince', { date: formatDate(member.joined_at) }))}</div>
          </div>
          ${isOwner && !isGroupOwner && !isMe
            ? `<button type="button" data-action="remove-member" data-user-id="${escapeHTML(member.user_id)}" data-name="${escapeHTML(identity(profile).name)}"
                class="shrink-0 px-2.5 py-1.5 rounded-lg border border-red-500/35 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-[10px] font-bold transition ${DISABLED_CLASS}">
                ${escapeHTML(t('removeMember'))}
              </button>`
            : ''}
        </div>`;
      }).join('')}
    </div>
  </section>`;
}

function managePanel(bundle) {
  const { group, item, members, secret } = bundle;
  const link = String(secret?.whatsapp_link || '').trim();
  const minSize = Math.max(2, members.length);
  const maxSize = Math.max(minSize, Number(item?.max_group_size) || minSize);
  const others = members.filter((member) => member.user_id !== group.owner_id);

  return `<section>${sectionHeader(t('manageGroup'), { icon: '⚙️' })}
    <div class="space-y-3">
      <div class="rounded-xl border border-dark-border bg-dark-surface/90 p-3 sm:p-4 flex flex-wrap items-center gap-2">
        <span class="text-xs text-dark-muted">${escapeHTML(group.is_open ? t('groupOpenHint') : t('groupClosedHint'))}</span>
        <button type="button" data-action="toggle-open" class="${secondaryActionClass} ${DISABLED_CLASS} ms-auto">
          ${escapeHTML(group.is_open ? t('closeGroup') : t('reopenGroup'))}
        </button>
        <button type="button" data-action="delete" class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-200 font-bold text-xs sm:text-sm transition ${DISABLED_CLASS}">
          ${escapeHTML(t('deleteGroup'))}
        </button>
      </div>

      <details class="group rounded-2xl border border-dark-border bg-dark-surface/90 overflow-hidden">
        <summary class="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer list-none hover:bg-dark-elevated/40 transition">
          <span class="text-sm font-extrabold text-white">${escapeHTML(t('editGroup'))}</span>
          <span class="text-dark-muted group-open:rotate-180 transition" aria-hidden="true">⌄</span>
        </summary>
        <div class="border-t border-dark-border p-4 sm:p-5">
          <form id="editGroupForm" novalidate>
            ${field(t('groupName'),
              `<input name="name" type="text" required maxlength="60" value="${escapeHTML(group.name)}" class="${INPUT_CLASS}">`,
              t('groupNameHint'))}
            ${field(t('groupDescription'),
              `<textarea name="description" rows="3" maxlength="300" class="${INPUT_CLASS}">${escapeHTML(group.description || '')}</textarea>`,
              t('groupDescriptionHint'))}
            ${field(t('groupMaxSize'),
              `<input name="maxSize" type="number" min="${minSize}" max="${maxSize}" value="${escapeHTML(group.max_size)}" required class="${INPUT_CLASS}">`,
              tf('groupMaxSizeHint', { min: minSize, max: maxSize }))}
            <label class="inline-flex items-center gap-2 text-xs sm:text-sm text-dark-muted cursor-pointer mb-3">
              <input name="isOpen" type="checkbox" ${group.is_open ? 'checked' : ''}
                class="w-4 h-4 rounded border-dark-border bg-dark-base text-brand-500 focus:ring-brand-500/40">
              ${escapeHTML(t('groupOpenLabel'))}
            </label>
            ${field(t('groupWhatsapp'),
              `<input name="whatsappLink" type="text" dir="ltr" value="${escapeHTML(link)}"
                placeholder="https://chat.whatsapp.com/..." class="${INPUT_CLASS}">`,
              t('editWhatsappHint'))}
            <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('saveChanges'))}</button>
          </form>
        </div>
      </details>

      ${others.length
        ? `<div class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
            <h3 class="text-sm font-extrabold text-white mb-2">${escapeHTML(t('transferOwnership'))}</h3>
            <form id="transferForm" class="flex flex-col sm:flex-row gap-2 sm:items-end">
              <label class="flex-1">
                <span class="${LABEL_CLASS}">${escapeHTML(t('transferTo'))}</span>
                <select name="newOwner" required class="${INPUT_CLASS}">
                  <option value="" selected disabled>${escapeHTML(t('chooseMember'))}</option>
                  ${others.map((member) => {
                    const profile = bundle.profileMap.get(member.user_id);
                    return `<option value="${escapeHTML(member.user_id)}">${escapeHTML(identity(profile).name)}</option>`;
                  }).join('')}
                </select>
              </label>
              <button type="submit" class="${secondaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('transferOwnership'))}</button>
            </form>
          </div>`
        : ''}
    </div>
  </section>`;
}

function reportPanel() {
  return `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-xs text-dark-muted">${escapeHTML(t('reportGroupHint'))}</p>
      <button type="button" data-action="toggle-report" class="${secondaryActionClass}">${escapeHTML(t('reportGroup'))}</button>
    </div>
    <div data-report-panel class="hidden mt-3">
      <form id="reportGroupForm" novalidate>
        ${field(t('reportReason'),
          `<textarea name="reason" rows="3" required maxlength="500" class="${INPUT_CLASS}"
            placeholder="${escapeHTML(t('reportReasonHint'))}"></textarea>`,
          t('reportReasonHint'))}
        <div class="flex flex-wrap gap-2">
          <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('sendReport'))}</button>
          <button type="button" data-action="close-report" class="${secondaryActionClass}">${escapeHTML(t('cancel'))}</button>
        </div>
      </form>
    </div>
  </section>`;
}

function guestReportPanel(groupId) {
  return `<section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
    <p class="text-xs text-dark-muted mb-3">${escapeHTML(t('reportGroupHint'))}</p>
    <a href="#/signin" data-return-to="#/groups/${escapeHTML(groupId)}" class="${secondaryActionClass}">
      <span aria-hidden="true">⚑</span>${escapeHTML(t('signInToReport'))}
    </a>
  </section>`;
}

function groupPageHtml(bundle, me, isGuest = false) {
  const { group, item, members, secret, requests, profileMap, myMembership, myRequest } = bundle;
  const isOwner = !!me && group.owner_id === me.id;
  const isMember = !!me && members.some((member) => member.user_id === me.id);
  const state = getGroupState({ group, item, members, myMembership, myRequest });
  const owner = profileMap.get(group.owner_id);
  const description = String(group.description || '').trim();
  const ownerIdentity = identity(owner);

  return `<div class="fade space-y-5">
    ${pageHero({
      path: '#/groups/' + group.id,
      title: group.name,
      subtitle: item?.title || '',
      actionsHtml: `<a href="#/groups" class="${secondaryActionClass}"><span aria-hidden="true">${getLang() === 'ar' ? '→' : '←'}</span>${escapeHTML(t('backToGroups'))}</a>
        ${item ? `<a href="#/items/${escapeHTML(item.id)}" class="${primaryActionClass}">${escapeHTML(t('openItem'))}</a>` : ''}`,
    })}

    ${itemPanel(item)}
    ${groupInfoPanel(group, item, members)}

    <section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-4 sm:p-5">
      <div class="flex flex-wrap items-center gap-3">
        ${profileUrl(owner)
          ? `<a href="${escapeHTML(profileUrl(owner))}" class="shrink-0 rounded-full hover:opacity-80 transition">${avatarHtml(owner, 'md')}</a>`
          : avatarHtml(owner, 'md')}
        <div class="min-w-0">
          <div class="text-[10px] mono font-bold text-brand-500 mb-0.5">${escapeHTML(t('owner'))}</div>
          ${profileUrl(owner)
            ? `<a href="${escapeHTML(profileUrl(owner))}" class="text-sm font-bold text-white truncate hover:text-brand-500 transition">${escapeHTML(ownerIdentity.name)}</a>`
            : `<div class="text-sm font-bold text-white truncate">${escapeHTML(ownerIdentity.name)}</div>`}
          ${ownerIdentity.username ? `<div class="text-[11px] mono text-dark-muted" dir="ltr">${escapeHTML(ownerIdentity.username)}</div>` : ''}
        </div>
        <div class="ms-auto text-[11px] mono text-dark-muted">${escapeHTML(tf('groupWillBeDeleted', { date: formatDate(addDays(item?.due_at, GROUP_RETENTION_DAYS)) }))}</div>
      </div>
      ${description ? `<p class="mt-3 text-sm text-dark-muted leading-relaxed whitespace-pre-line break-words">${escapeHTML(description)}</p>` : ''}
    </section>

    ${joinPanel(state, group, isGuest)}
    ${isMember ? whatsappPanel(secret) : ''}
    ${isOwner ? requestsPanel({ group, requests, members, profileMap }) : ''}
    ${membersPanel({ group, members, profileMap }, me)}
    ${me ? leavePanel(group, members, me) : ''}
    ${isOwner ? managePanel(bundle) : ''}
    ${isGuest ? guestReportPanel(group.id) : reportPanel()}
  </div>`;
}

export async function renderGroupPage(root, ctx = {}) {
  const me = ctx.profile || null;
  const isGuest = !me;

  const groupId = String(ctx.route?.params?.id || '');
  const page = mountPage(root, 'groupDetail');
  let bundle = null;
  let generation = 0;
  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  function notFound() {
    document.title = `${t('groupNotFound')} | IT Study Hub`;
    page.innerHTML = `<div class="fade space-y-5">
      ${pageHero({
        path: '#/groups/' + groupId,
        title: t('groupNotFound'),
        actionsHtml: `<a href="#/groups" class="${secondaryActionClass}">${escapeHTML(t('backToGroups'))}</a>`,
      })}
      <section class="rounded-2xl border border-dark-border bg-dark-surface/90 p-6 sm:p-8">
        ${emptyPanel('📭', t('groupNotFoundText'))}
      </section>
    </div>`;
  }

  function navigateBack() {
    window.location.hash = '#/groups';
  }

  async function load(force = false) {
    const current = ++generation;
    page.innerHTML = loadingPanel();

    try {
      const data = await fetchGroupBundle(groupId, me?.id || null);
      if (isStale() || current !== generation) return;
      if (!data) {
        notFound();
        return;
      }
      bundle = data;
      document.title = `${data.group.name} | IT Study Hub`;
      page.innerHTML = groupPageHtml(data, me, isGuest);
    } catch (error) {
      if (isStale() || current !== generation) return;
      if (error?.code === '22P02') {
        notFound();
        return;
      }
      page.innerHTML = errorPanel({ message: rpcErrorMessage(error, getLang()), code: error?.code || '' }, 'groupRetry');
    }
  }

  async function runAction(button, action) {
    if (!me) {
      window.location.hash = '#/signin';
      return;
    }
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      await action();
    } catch (error) {
      showToast(rpcErrorMessage(error, getLang()), 'error');
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }

  page.addEventListener('click', async (event) => {
    if (event.target.closest('#groupRetry')) {
      load(true);
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl || !bundle) return;
    const action = actionEl.dataset.action;
    const { group, secret, members } = bundle;

    if (action === 'accept' || action === 'reject') {
      const requestId = actionEl.dataset.requestId;
      if (!requestId) return;
      await runAction(actionEl, async () => {
        await decideRequest(requestId, action === 'accept');
        showToast(t(action === 'accept' ? 'requestAccepted' : 'requestRejected'), 'success');
        await load(true);
      });
      return;
    }

    if (action === 'cancel-request') {
      const requestId = actionEl.dataset.requestId;
      if (!requestId) return;
      await runAction(actionEl, async () => {
        await cancelRequest(requestId);
        showToast(t('requestCancelled'), 'success');
        await load(true);
      });
      return;
    }

    if (action === 'close-request') {
      // Re-render so the join panel returns to its normal state.
      load(true);
      return;
    }

    if (action === 'remove-member') {
      const userId = actionEl.dataset.userId;
      const name = actionEl.dataset.name || t('unknownUser');
      if (!userId) return;
      if (!window.confirm(tf('removeMemberConfirm', { name }))) return;
      await runAction(actionEl, async () => {
        await removeMember(group.id, userId);
        showToast(t('memberRemoved'), 'success');
        await load(true);
      });
      return;
    }

    if (action === 'leave') {
      const onlyMember = members.length === 1;
      const confirmText = group.owner_id === me.id && onlyMember
        ? t('leaveDeletesGroupConfirm')
        : t('leaveGroupConfirm');
      if (!window.confirm(confirmText)) return;
      await runAction(actionEl, async () => {
        await leaveGroup(group.id);
        showToast(t('leftGroup'), 'success');
        navigateBack();
      });
      return;
    }

    if (action === 'delete') {
      if (!window.confirm(t('deleteGroupConfirm'))) return;
      await runAction(actionEl, async () => {
        await deleteGroup(group.id);
        showToast(t('groupDeleted'), 'success');
        navigateBack();
      });
      return;
    }

    if (action === 'toggle-open') {
      await runAction(actionEl, async () => {
        await updateGroup(group.id, {
          name: group.name,
          description: group.description || '',
          isOpen: !group.is_open,
          maxSize: group.max_size,
          whatsappLink: secret?.whatsapp_link || '',
        });
        showToast(t(group.is_open ? 'groupClosedToast' : 'groupReopenedToast'), 'success');
        await load(true);
      });
      return;
    }

    if (action === 'toggle-report') {
      const panel = actionEl.closest('section')?.querySelector('[data-report-panel]');
      if (panel) panel.classList.toggle('hidden');
      return;
    }

    if (action === 'close-report') {
      const panel = actionEl.closest('[data-report-panel]');
      if (panel) panel.classList.add('hidden');
      return;
    }
  });

  page.addEventListener('submit', async (event) => {
    if (!me) {
      event.preventDefault();
      return;
    }
    if (!bundle) return;
    const { group, item, secret, members } = bundle;

    const requestForm = event.target.closest('form[data-request-form]');
    if (requestForm) {
      event.preventDefault();
      const message = String(requestForm.querySelector('textarea[name="message"]')?.value || '').trim();
      if (message.length > 200) {
        showToast(t('requestMessageTooLong'), 'warning');
        return;
      }
      const submit = requestForm.querySelector('button[type="submit"]');
      await runAction(submit, async () => {
        await requestJoin(group.id, message || null);
        showToast(t('joinRequestSent'), 'success');
        await load(true);
      });
      return;
    }

    const editForm = event.target.closest('#editGroupForm');
    if (editForm) {
      event.preventDefault();
      const name = String(editForm.querySelector('input[name="name"]')?.value || '').trim();
      const description = String(editForm.querySelector('textarea[name="description"]')?.value || '').trim();
      const maxSize = Number(editForm.querySelector('input[name="maxSize"]')?.value || 0);
      const isOpen = !!editForm.querySelector('input[name="isOpen"]')?.checked;
      const whatsappLink = String(editForm.querySelector('input[name="whatsappLink"]')?.value || '').trim();

      const validation = validateGroupFields({ name, description, maxSize, whatsappLink }, item, Math.max(2, members.length));
      if (validation) {
        showToast(validation, 'warning');
        return;
      }

      const submit = editForm.querySelector('button[type="submit"]');
      await runAction(submit, async () => {
        await updateGroup(group.id, { name, description, isOpen, maxSize, whatsappLink });
        showToast(t('groupSaved'), 'success');
        await load(true);
      });
      return;
    }

    const transferForm = event.target.closest('#transferForm');
    if (transferForm) {
      event.preventDefault();
      const newOwnerId = String(transferForm.querySelector('select[name="newOwner"]')?.value || '');
      if (!newOwnerId) {
        showToast(t('chooseMember'), 'warning');
        return;
      }
      const select = transferForm.querySelector('select[name="newOwner"]');
      const selectedName = select?.selectedOptions?.[0]?.textContent?.trim() || t('unknownUser');
      if (!window.confirm(tf('transferOwnershipConfirm', { name: selectedName }))) return;

      const submit = transferForm.querySelector('button[type="submit"]');
      await runAction(submit, async () => {
        await transferOwnership(group.id, newOwnerId);
        showToast(t('ownershipTransferred'), 'success');
        await load(true);
      });
      return;
    }

    const reportForm = event.target.closest('#reportGroupForm');
    if (reportForm) {
      event.preventDefault();
      const reason = String(reportForm.querySelector('textarea[name="reason"]')?.value || '').trim();
      if (!reason) {
        showToast(t('reportReasonRequired'), 'warning');
        return;
      }
      if (reason.length > 500) {
        showToast(t('reportReasonTooLong'), 'warning');
        return;
      }

      const submit = reportForm.querySelector('button[type="submit"]');
      await runAction(submit, async () => {
        await reportGroup(group.id, me.id, reason);
        reportForm.reset();
        reportForm.closest('[data-report-panel]')?.classList.add('hidden');
        showToast(t('reportSent'), 'success');
      });
    }
  });

  await load();
}

// ---------- Groups on an item page ----------

function validateGroupFields({ name, description, maxSize, whatsappLink }, item, minSize = 2) {
  if (!name || name.length > 60) return t('groupNameInvalid');
  if (description.length > 300) return t('groupDescriptionInvalid');

  const limit = Number(item?.max_group_size) || 0;
  if (!Number.isInteger(maxSize) || maxSize < minSize || (limit && maxSize > limit)) {
    return tf('groupMaxSizeInvalid', { min: minSize, max: limit || 20 });
  }
  if (whatsappLink && !WHATSAPP_RE.test(whatsappLink)) return t('groupWhatsappInvalid');
  return '';
}

// create_group may return a bare uuid, an array, or a group row depending on
// how the database function was created.
function createdGroupId(created) {
  const record = Array.isArray(created) ? created[0] : created;
  if (!record) return '';
  if (typeof record === 'string') return record;
  return String(record.id || record.group_id || '');
}

function pickerItemLabel(item) {
  const title = String(item?.title || '');
  const due = item?.due_at ? formatDateTime(item.due_at) : '';
  return due ? `${title} — ${due}` : title;
}

// Create form used on #/groups: the user picks the item first, then fills the
// same fields as the item-page form.
function createGroupPickerForm(items) {
  const first = items[0];
  const firstMax = Math.max(2, Number(first?.max_group_size) || 2);
  const options = items.map((item) => {
    const max = Math.max(2, Number(item.max_group_size) || 2);
    return `<option value="${escapeHTML(item.id)}" data-max-size="${escapeHTML(String(max))}">${escapeHTML(pickerItemLabel(item))}</option>`;
  }).join('');

  return `<form id="groupsCreateForm" class="rounded-2xl border border-brand-500/35 bg-brand-500/5 p-4 sm:p-5" novalidate>
    <h3 class="text-base font-extrabold text-white mb-1">${escapeHTML(t('createGroup'))}</h3>
    <p class="text-[11px] sm:text-xs text-dark-muted mb-3">${escapeHTML(t('createGroupHint'))}</p>
    ${field(t('chooseItem'),
      `<select name="itemId" class="${INPUT_CLASS}" required>${options}</select>`)}
    ${field(t('groupName'),
      `<input name="name" type="text" required maxlength="60" placeholder="${escapeHTML(t('groupNamePlaceholder'))}" class="${INPUT_CLASS}">`,
      t('groupNameHint'))}
    ${field(t('groupDescription'),
      `<textarea name="description" rows="2" maxlength="300" placeholder="${escapeHTML(t('groupDescriptionPlaceholder'))}" class="${INPUT_CLASS}"></textarea>`,
      t('groupDescriptionHint'))}
    ${field(t('groupMaxSize'),
      `<input name="maxSize" type="number" min="2" max="${firstMax}" value="${firstMax}" required class="${INPUT_CLASS}">`,
      tf('groupMaxSizeHint', { min: 2, max: firstMax }))}
    ${field(t('groupWhatsapp'),
      `<input name="whatsappLink" type="text" dir="ltr" placeholder="https://chat.whatsapp.com/..." class="${INPUT_CLASS}">`,
      t('groupWhatsappHint'))}
    <div class="flex flex-wrap gap-2">
      <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('createGroupSubmit'))}</button>
      <button type="button" data-action="close-create-group" class="${secondaryActionClass}">${escapeHTML(t('cancel'))}</button>
    </div>
  </form>`;
}

// Keep the max-size field within the selected item's limit.
function syncPickerMaxSize(form, model) {
  if (!form || !model) return;
  const select = form.querySelector('select[name="itemId"]');
  const input = form.querySelector('input[name="maxSize"]');
  if (!select || !input) return;

  const item = model.itemMap.get(String(select.value || ''));
  const max = Math.max(2, Number(item?.max_group_size) || 2);
  input.min = '2';
  input.max = String(max);
  if (!input.value || !Number.isInteger(Number(input.value)) || Number(input.value) < 2 || Number(input.value) > max) {
    input.value = String(max);
  }

  const hint = input.parentElement?.querySelector('p');
  if (hint) hint.textContent = tf('groupMaxSizeHint', { min: 2, max });
}


function createGroupForm(item) {
  const maxSize = Math.max(2, Number(item.max_group_size) || 2);
  return `<form id="createGroupForm" class="rounded-2xl border border-brand-500/35 bg-brand-500/5 p-4 sm:p-5" novalidate>
    <h3 class="text-base font-extrabold text-white mb-1">${escapeHTML(t('createGroup'))}</h3>
    <p class="text-[11px] sm:text-xs text-dark-muted mb-3">${escapeHTML(t('createGroupHint'))}</p>
    ${field(t('groupName'),
      `<input name="name" type="text" required maxlength="60" placeholder="${escapeHTML(t('groupNamePlaceholder'))}" class="${INPUT_CLASS}">`,
      t('groupNameHint'))}
    ${field(t('groupDescription'),
      `<textarea name="description" rows="2" maxlength="300" placeholder="${escapeHTML(t('groupDescriptionPlaceholder'))}" class="${INPUT_CLASS}"></textarea>`,
      t('groupDescriptionHint'))}
    ${field(t('groupMaxSize'),
      `<input name="maxSize" type="number" min="2" max="${maxSize}" value="${maxSize}" required class="${INPUT_CLASS}">`,
      tf('groupMaxSizeHint', { min: 2, max: maxSize }))}
    ${field(t('groupWhatsapp'),
      `<input name="whatsappLink" type="text" dir="ltr" placeholder="https://chat.whatsapp.com/..." class="${INPUT_CLASS}">`,
      t('groupWhatsappHint'))}
    <div class="flex flex-wrap gap-2">
      <button type="submit" class="${primaryActionClass} ${DISABLED_CLASS}">${escapeHTML(t('createGroupSubmit'))}</button>
      <button type="button" data-action="close-create" class="${secondaryActionClass}">${escapeHTML(t('cancel'))}</button>
    </div>
  </form>`;
}

function itemGroupsHtml(item, model, myMembership, isGuest = false) {
  const pastDue = new Date(item.due_at).getTime() <= Date.now();
  const groupCount = model.groups.length;
  const canCreate = !pastDue && !myMembership && !isGuest;
  const guestCreate = isGuest && !pastDue && !myMembership
    ? `<a href="#/signin" data-return-to="#/items/${escapeHTML(item.id)}" class="${primaryActionClass}"><span aria-hidden="true">🔒</span>${escapeHTML(t('signInToCreateGroup'))}</a>`
    : '';

  return `<section class="rounded-2xl border border-dark-border bg-dark-surface/60 p-4 sm:p-5">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <h2 class="flex items-center gap-2 text-base sm:text-lg font-extrabold text-white">
        <span class="text-brand-500 mono" aria-hidden="true">❯</span>
        <span>${escapeHTML(t('groupsForItem'))}</span>
        <span class="inline-flex min-w-6 items-center justify-center rounded-md border border-dark-border bg-dark-elevated px-1.5 py-0.5 text-[10px] mono text-dark-muted">${escapeHTML(String(groupCount))}</span>
      </h2>
      ${canCreate
        ? `<button type="button" data-action="toggle-create" class="${primaryActionClass}">${escapeHTML(t('createGroup'))}</button>`
        : guestCreate}
    </div>

    ${isGuest
      ? `<p class="mb-3 text-[11px] sm:text-xs text-dark-muted leading-relaxed">${escapeHTML(t('guestGroupHint'))}</p>`
      : ''}

    ${myMembership
      ? `<a href="#/groups/${escapeHTML(myMembership.group_id)}" class="mb-3 flex items-center gap-2 rounded-xl border border-brand-500/35 bg-brand-500/10 p-3 text-sm font-bold text-brand-500 hover:bg-brand-500/15 transition">
          <span aria-hidden="true">👥</span>${escapeHTML(t('yourGroup'))}
          <span class="ms-auto" aria-hidden="true">${getLang() === 'ar' ? '←' : '→'}</span>
        </a>`
      : ''}

    ${pastDue ? `<div class="mb-3 rounded-xl border border-slate-500/35 bg-slate-500/10 p-3 text-xs sm:text-sm text-slate-300">${escapeHTML(t('pastDueGroups'))}</div>` : ''}

    <div class="space-y-3" data-item-group-list>
      ${groupCount
        ? model.groups.map((group) => groupCard({
            group,
            item: model.itemMap.get(group.item_id),
            members: model.membersByGroup.get(group.id) || [],
            owner: model.profileMap.get(group.owner_id),
            myMembership: model.membershipByItem.get(group.item_id),
            myRequest: model.requestByGroup.get(group.id),
            isGuest,
          })).join('')
        : emptyPanel('👥', t('noGroupsForItem'))}
    </div>

    ${canCreate && !groupCount
      ? `<p class="mt-3 text-center text-xs text-dark-muted">${escapeHTML(t('createFirstGroup'))}</p>`
      : ''}

    <div data-create-slot class="mt-3"></div>
  </section>`;
}

export async function renderItemGroups(root, item, ctx = {}) {
  const me = ctx.profile || null;
  const isGuest = !me;
  if (!root || !item) return;

  if (Number(item.max_group_size) === 1) {
    root.innerHTML = `<section class="rounded-2xl border border-dark-border bg-dark-surface/60 p-4 sm:p-5">
      <h2 class="flex items-center gap-2 text-base sm:text-lg font-extrabold text-white mb-2">
        <span class="text-brand-500 mono" aria-hidden="true">❯</span>${escapeHTML(t('groupsForItem'))}
      </h2>
      <p class="text-sm text-dark-muted">${escapeHTML(t('individualWorkNoGroups'))}</p>
    </section>`;
    return;
  }

  const page = mountPage(root, 'itemGroupsInner');
  page.classList.remove('space-y-5');
  let model = null;
  let generation = 0;
  const isStale = () => typeof ctx.isStale === 'function' && ctx.isStale();

  async function load(force = false) {
    const current = ++generation;
    page.innerHTML = loadingPanel();

    try {
      const [groups] = await Promise.all([
        fetchGroupsForItem(item.id),
      ]);
      if (isStale() || current !== generation) return;

      let memberships = [];
      let requests = [];
      if (me) {
        [memberships, requests] = await Promise.all([
          fetchMyMemberships(me.id),
          fetchMyRequests(me.id),
        ]);
        if (isStale() || current !== generation) return;
      }

      const members = await fetchMembersForGroups(groups.map((group) => group.id));
      if (isStale() || current !== generation) return;

      const profileIds = [
        ...groups.map((group) => group.owner_id),
        ...members.map((member) => member.user_id),
      ];
      if (me) profileIds.push(me.id);

      const profiles = await fetchProfilesByIds(profileIds);
      if (isStale() || current !== generation) return;

      model = buildModel({ groups, items: [item], members, profiles, memberships, requests });
      const membership = model.membershipByItem.get(item.id) || null;
      // A membership row can outlive the 3-day visibility window, so only show
      // it when its group is still present in the readable group list.
      const myMembership = membership
        && groups.some((group) => group.id === membership.group_id)
        ? membership
        : null;
      page.innerHTML = itemGroupsHtml(item, model, myMembership, isGuest);
    } catch (error) {
      if (isStale() || current !== generation) return;
      page.innerHTML = errorPanel({ message: rpcErrorMessage(error, getLang()), code: error?.code || '' }, 'itemGroupsRetry');
    }
  }

  page.addEventListener('click', async (event) => {
    if (event.target.closest('#itemGroupsRetry')) {
      load(true);
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    if (!me) return;
    const action = actionEl.dataset.action;

    if (action === 'toggle-create') {
      const slot = page.querySelector('[data-create-slot]');
      if (!slot) return;
      if (slot.innerHTML.trim()) {
        slot.innerHTML = '';
        return;
      }
      slot.innerHTML = createGroupForm(item);
      slot.querySelector('input[name="name"]')?.focus();
      return;
    }

    if (action === 'close-create') {
      const slot = page.querySelector('[data-create-slot]');
      if (slot) slot.innerHTML = '';
      return;
    }

    if (action === 'request') {
      const card = actionEl.closest('article[data-group-id]');
      const group = card && model ? model.groupMap.get(card.dataset.groupId) : null;
      if (!card || !group) return;
      const slot = card.querySelector('[data-request-slot]');
      if (!slot) return;
      if (slot.innerHTML.trim()) {
        slot.innerHTML = '';
        return;
      }
      slot.innerHTML = requestFormHtml(group);
      slot.querySelector('textarea')?.focus();
      return;
    }

    if (action === 'close-request') {
      const card = actionEl.closest('article[data-group-id]');
      const slot = card?.querySelector('[data-request-slot]');
      if (slot) slot.innerHTML = '';
      return;
    }

    if (action === 'cancel-request') {
      const requestId = actionEl.dataset.requestId;
      if (!requestId) return;
      actionEl.disabled = true;
      try {
        await cancelRequest(requestId);
        showToast(t('requestCancelled'), 'success');
        await load(true);
      } catch (error) {
        showToast(rpcErrorMessage(error, getLang()), 'error');
        actionEl.disabled = false;
      }
    }
  });

  page.addEventListener('submit', async (event) => {
    if (!me) {
      event.preventDefault();
      return;
    }
    const createForm = event.target.closest('#createGroupForm');
    if (createForm) {
      event.preventDefault();
      const name = String(createForm.querySelector('input[name="name"]')?.value || '').trim();
      const description = String(createForm.querySelector('textarea[name="description"]')?.value || '').trim();
      const maxSize = Number(createForm.querySelector('input[name="maxSize"]')?.value || 0);
      const whatsappLink = String(createForm.querySelector('input[name="whatsappLink"]')?.value || '').trim();

      const validation = validateGroupFields({ name, description, maxSize, whatsappLink }, item, 2);
      if (validation) {
        showToast(validation, 'warning');
        return;
      }

      const submit = createForm.querySelector('button[type="submit"]');
      if (submit) submit.disabled = true;
      try {
        const created = await createGroup(item.id, name, description, maxSize, whatsappLink);
        const groupId = createdGroupId(created);
        showToast(t('groupCreated'), 'success');
        if (groupId) {
          window.location.hash = '#/groups/' + encodeURIComponent(groupId);
        } else {
          await load(true);
        }
      } catch (error) {
        showToast(rpcErrorMessage(error, getLang()), 'error');
        if (submit?.isConnected) submit.disabled = false;
      }
      return;
    }

    const requestForm = event.target.closest('form[data-request-form]');
    if (!requestForm) return;
    event.preventDefault();

    const groupId = requestForm.dataset.groupId;
    const message = String(requestForm.querySelector('textarea[name="message"]')?.value || '').trim();
    if (message.length > 200) {
      showToast(t('requestMessageTooLong'), 'warning');
      return;
    }

    const submit = requestForm.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      await requestJoin(groupId, message || null);
      showToast(t('joinRequestSent'), 'success');
      await load(true);
    } catch (error) {
      showToast(rpcErrorMessage(error, getLang()), 'error');
      if (submit?.isConnected) submit.disabled = false;
    }
  });

  await load();
}
