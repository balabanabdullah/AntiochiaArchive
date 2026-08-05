const config = window.ANTIOCHIA_LANG;

const appState = {
  language: getInitialLanguage(),
  menuOpen: false
};

function getInitialLanguage() {
  const savedLanguage = localStorage.getItem(config.storageKey);
  const browserLanguage = navigator.language?.slice(0, 2);
  const supportedCodes = config.languages.map((language) => language.code);

  if (supportedCodes.includes(savedLanguage)) return savedLanguage;
  if (supportedCodes.includes(browserLanguage)) return browserLanguage;
  return config.defaultLanguage;
}

function getLanguage(languageCode) {
  return config.languages.find((language) => language.code === languageCode) || config.languages[0];
}

function t(key, languageCode = appState.language) {
  return key.split(".").reduce((value, part) => value?.[part], config.dictionary[languageCode]) || "";
}

function format(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
}

function updateTranslatedContent(languageCode) {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n, languageCode);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = t(element.dataset.i18nHtml, languageCode);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel, languageCode));
  });
}

function createTranslatedLink(item, className = "") {
  const link = document.createElement("a");
  link.href = item.href;
  link.dataset.i18n = item.key;
  if (className) link.className = className;
  return link;
}

function renderNavigation() {
  document.querySelectorAll("[data-nav]").forEach((nav) => {
    nav.replaceChildren(...config.navItems.map((item) => createTranslatedLink(item)));
  });
}

function renderLanguageSwitcher() {
  const switcher = document.querySelector("[data-language-switcher]");

  switcher.replaceChildren(...config.languages.map((language) => {
    const button = document.createElement("button");
    button.className = "language-button";
    button.type = "button";
    button.dataset.lang = language.code;
    button.textContent = language.label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => applyLanguage(language.code));
    return button;
  }));
}

function renderCards() {
  const cardGrid = document.querySelector("[data-section-cards]");

  cardGrid.replaceChildren(...config.sectionCards.map((card) => {
    const article = document.createElement("article");
    article.className = "archive-card";
    article.id = card.id;

    const media = document.createElement("div");
    media.className = "archive-card-media";
    media.setAttribute("aria-hidden", "true");
    media.textContent = card.icon;

    const title = document.createElement("h3");
    title.dataset.i18n = card.titleKey;

    const body = document.createElement("p");
    body.dataset.i18n = card.bodyKey;

    const link = document.createElement("a");
    link.href = card.href;
    link.dataset.i18n = "actions.explore";

    article.append(media, title, body, link);
    return article;
  }));
}

function renderStats() {
  const statsGrid = document.querySelector("[data-stats]");

  statsGrid.replaceChildren(...config.stats.map((item) => {
    const stat = document.createElement("article");
    stat.className = "stat-card";

    const value = document.createElement("strong");
    value.textContent = item.value;

    const label = document.createElement("span");
    label.dataset.i18n = item.labelKey;

    stat.append(value, label);
    return stat;
  }));
}

function renderFooterLinks() {
  const footerLinks = document.querySelector("[data-footer-links]");
  footerLinks.replaceChildren(...config.footerLinks.map((item) => createTranslatedLink(item)));
}

function updateLanguageButtons(languageCode) {
  document.querySelectorAll(".language-button").forEach((button) => {
    const language = getLanguage(button.dataset.lang);
    const isActive = button.dataset.lang === languageCode;

    button.setAttribute("aria-pressed", String(isActive));
    button.setAttribute("aria-label", format(t("language.option", languageCode), { name: language.name }));
  });
}

function setMenuOpen(isOpen) {
  const menuButton = document.getElementById("menu-toggle");
  const mobileMenu = document.getElementById("mobile-menu");

  appState.menuOpen = isOpen;
  mobileMenu.classList.toggle("is-open", isOpen);
  mobileMenu.setAttribute("aria-hidden", String(!isOpen));
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", t(isOpen ? "navigation.closeMenu" : "navigation.openMenu"));
  document.body.classList.toggle("menu-open", isOpen);
}

function applyLanguage(languageCode) {
  const language = getLanguage(languageCode);

  appState.language = language.code;
  document.documentElement.lang = language.code;
  document.documentElement.dir = language.dir;
  localStorage.setItem(config.storageKey, language.code);

  updateTranslatedContent(language.code);
  updateLanguageButtons(language.code);
  setMenuOpen(false);
}

function bindMenuEvents() {
  const menuButton = document.getElementById("menu-toggle");
  const mobileMenu = document.getElementById("mobile-menu");

  menuButton.addEventListener("click", () => {
    setMenuOpen(menuButton.getAttribute("aria-expanded") !== "true");
  });

  mobileMenu.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenuOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && appState.menuOpen) {
      setMenuOpen(false);
      menuButton.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth >= 768 && appState.menuOpen) setMenuOpen(false);
  });
}

function initAntiochiaArchive() {
  renderNavigation();
  renderLanguageSwitcher();
  renderCards();
  renderStats();
  renderFooterLinks();
  bindMenuEvents();
  applyLanguage(appState.language);
}

document.addEventListener("DOMContentLoaded", initAntiochiaArchive);
