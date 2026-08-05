const appState = {
  language: window.ANTIOCHIA_LANG?.defaultLanguage || "en",
  menuOpen: false
};

function getLanguageConfig(languageCode) {
  return ANTIOCHIA_LANG.languages.find((language) => language.code === languageCode) || ANTIOCHIA_LANG.languages[0];
}

function translate(key, languageCode = appState.language) {
  return key.split(".").reduce((value, part) => value?.[part], ANTIOCHIA_LANG.translations[languageCode]) || "";
}

function format(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] || "");
}

function setTextContent(languageCode) {
  document.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = translate(element.dataset.i18n, languageCode);
  });

  document.querySelectorAll("[data-i18n-html]").forEach((element) => {
    element.innerHTML = translate(element.dataset.i18nHtml, languageCode);
  });

  document.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", translate(element.dataset.i18nAriaLabel, languageCode));
  });
}

function renderNavigation() {
  document.querySelectorAll("[data-nav]").forEach((nav) => {
    nav.replaceChildren();

    ANTIOCHIA_LANG.navItems.forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href;
      link.dataset.i18n = item.key;
      nav.append(link);
    });
  });
}

function renderLanguageSwitcher() {
  const switcher = document.querySelector("[data-language-switcher]");
  switcher.replaceChildren();

  ANTIOCHIA_LANG.languages.forEach((language) => {
    const button = document.createElement("button");
    button.className = "language-button";
    button.type = "button";
    button.dataset.lang = language.code;
    button.textContent = language.label;
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => applyLanguage(language.code));
    switcher.append(button);
  });
}

function renderSectionCards() {
  const cardGrid = document.querySelector("[data-section-cards]");
  cardGrid.replaceChildren();

  ANTIOCHIA_LANG.sectionCards.forEach((card) => {
    const article = document.createElement("article");
    article.className = "archive-card";
    if (card.href !== "#stories") article.id = card.href.replace("#", "");

    const title = document.createElement("h3");
    title.dataset.i18n = card.titleKey;

    const body = document.createElement("p");
    body.dataset.i18n = card.bodyKey;

    const link = document.createElement("a");
    link.href = card.href;
    link.dataset.i18n = "actions.explore";

    article.append(title, body, link);
    cardGrid.append(article);
  });
}

function updateLanguageButtons(languageCode) {
  document.querySelectorAll(".language-button").forEach((button) => {
    const language = getLanguageConfig(button.dataset.lang);
    const isActive = button.dataset.lang === languageCode;
    button.setAttribute("aria-pressed", String(isActive));
    button.setAttribute("aria-label", format(translate("language.option", languageCode), { name: language.name }));
  });
}

function setMenuOpen(isOpen) {
  const menuButton = document.getElementById("menu-toggle");
  const mobileMenu = document.getElementById("mobile-menu");

  appState.menuOpen = isOpen;
  mobileMenu.classList.toggle("is-open", isOpen);
  mobileMenu.setAttribute("aria-hidden", String(!isOpen));
  menuButton.setAttribute("aria-expanded", String(isOpen));
  menuButton.setAttribute("aria-label", translate(isOpen ? "navigation.closeMenu" : "navigation.openMenu"));
  document.body.classList.toggle("menu-open", isOpen);
}

function applyLanguage(languageCode) {
  const language = getLanguageConfig(languageCode);

  appState.language = language.code;
  document.documentElement.lang = language.code;
  document.documentElement.dir = language.dir;

  setTextContent(language.code);
  updateLanguageButtons(language.code);
  setMenuOpen(false);
}

function bindNavigationEvents() {
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
  renderSectionCards();
  bindNavigationEvents();
  applyLanguage(appState.language);
}

document.addEventListener("DOMContentLoaded", initAntiochiaArchive);
