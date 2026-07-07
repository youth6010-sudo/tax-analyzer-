(function () {
  "use strict";

  const USER_KEY = "reviewUser";
  let accessCache = null;
  let portalSession = null;

  function isEmbed() {
    return !!window.__REVIEW_EMBED__;
  }

  async function loadAccessConfig() {
    if (accessCache) return accessCache;
    if (isEmbed() && portalSession && portalSession.access) {
      accessCache = portalSession.access;
      return accessCache;
    }
    const res = await fetch(isEmbed() ? "/api/review/session" : "./config/review-access.json");
    if (!res.ok) throw new Error("review-access 로드 실패");
    const data = await res.json();
    accessCache = data.access || data;
    return accessCache;
  }

  async function initFromPortal(session) {
    portalSession = session || null;
    if (session && session.access) {
      accessCache = session.access;
    }
    if (session && session.reviewOwner) {
      sessionStorage.setItem(USER_KEY, session.reviewOwner);
    }
    return portalSession;
  }

  function getUser() {
    if (isEmbed() && portalSession && portalSession.reviewOwner) {
      return portalSession.reviewOwner;
    }
    const name = sessionStorage.getItem(USER_KEY);
    return name && name.trim() ? name.trim() : null;
  }

  function setUser(name) {
    sessionStorage.setItem(USER_KEY, name.trim());
  }

  function clearUser() {
    sessionStorage.removeItem(USER_KEY);
    portalSession = null;
    accessCache = null;
  }

  function resetEmbed() {
    portalSession = null;
    accessCache = null;
  }

  function requireUser() {
    const user = getUser();
    if (!user) {
      if (!isEmbed()) {
        window.location.href = "./login.html";
      }
      return null;
    }
    return user;
  }

  async function isMaster(user) {
    if (isEmbed() && portalSession) {
      return !!portalSession.isMaster;
    }
    const access = await loadAccessConfig();
    return access.masters.includes(user);
  }

  async function getStaffMapping(user) {
    const access = await loadAccessConfig();
    return access.sheetMap[user] || null;
  }

  window.ReviewAuth = {
    isEmbed,
    loadAccessConfig,
    initFromPortal,
    getUser,
    setUser,
    clearUser,
    resetEmbed,
    requireUser,
    isMaster,
    getStaffMapping,
  };
})();
