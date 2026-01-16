const pages = Array.from(document.querySelectorAll("[data-page]"));

const pageTitles = {
  home: "UV-K5 Tools",
  channels: "Channel configuration",
  settings: "Basic settings",
  mirror: "Display mirror",
  smr: "SMR",
};

const bodyClassForPage = {
  mirror: "mirror-page",
  smr: "smr-page",
};

const setActivePage = (pageId) => {
  pages.forEach((page) => {
    const isActive = page.id === pageId;
    page.classList.toggle("active", isActive);
    page.hidden = !isActive;
  });

  const title = pageTitles[pageId] || pageTitles.home;
  document.title = title;

  document.body.classList.remove("mirror-page", "smr-page");
  const bodyClass = bodyClassForPage[pageId];
  if (bodyClass) {
    document.body.classList.add(bodyClass);
  }

  window.scrollTo({ top: 0, behavior: "auto" });
  window.dispatchEvent(new CustomEvent("spa:page", { detail: { pageId } }));
};

const resolvePageFromHash = () => {
  const hash = window.location.hash.replace("#", "");
  const target = pages.find((page) => page.id === hash);
  return target ? target.id : "home";
};

const ensureDefaultHash = () => {
  if (!window.location.hash) {
    window.location.hash = "#home";
  }
};

const handleRouteChange = () => {
  ensureDefaultHash();
  setActivePage(resolvePageFromHash());
};

window.addEventListener("hashchange", handleRouteChange);
handleRouteChange();
