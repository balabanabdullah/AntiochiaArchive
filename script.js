// Dynamic language switching and mobile navigation behavior for AntiochiaArchive.
document.addEventListener("DOMContentLoaded", () => {
  console.log("Page loaded");

  // Translation strings map to elements using data-i18n and data-i18n-html keys.
  const translations = {
    en: {
      home: "Home",
      stories: "Stories",
      structures: "Structures",
      beliefs: "Beliefs",
      music: "Music",
      contribute: "Contribute",
      mapLabel: "Antioch & the Orontes Valley",
      eyebrow: "A living digital memory",
      title: "Every memory<br>has a <em>place.</em>",
      missionTitle: "A city lives as long as its stories are told.",
      missionText: "AntiochiaArchive gathers the voices, images, songs, and shared places of Antioch — creating a collective memory that can travel across generations and borders.",
      explore: "Explore the archive"
    },
    tr: {
      home: "Ana Sayfa",
      stories: "Hikâyeler",
      structures: "Yapılar",
      beliefs: "İnançlar",
      music: "Müzik",
      contribute: "Katkıda Bulun",
      mapLabel: "Antakya ve Asi Vadisi",
      eyebrow: "Yaşayan bir dijital hafıza",
      title: "Her hatıranın<br>bir <em>yeri vardır.</em>",
      missionTitle: "Bir şehir, hikâyeleri anlatıldıkça yaşar.",
      missionText: "AntiochiaArchive, Antakya'nın seslerini, görüntülerini, şarkılarını ve ortak mekânlarını bir araya getirerek nesiller ve sınırlar boyunca yolculuk eden kolektif bir hafıza oluşturur.",
      explore: "Arşivi keşfet"
    },
    ar: {
      home: "الرئيسية",
      stories: "الحكايات",
      structures: "المباني",
      beliefs: "المعتقدات",
      music: "الموسيقى",
      contribute: "ساهم معنا",
      mapLabel: "أنطاكية ووادي العاصي",
      eyebrow: "ذاكرة رقمية حيّة",
      title: "لكل ذكرى<br><em>مكان.</em>",
      missionTitle: "تبقى المدينة حيّة ما دامت حكاياتها تُروى.",
      missionText: "يجمع أرشيف أنطاكية الأصوات والصور والأغاني والأماكن المشتركة، ليصنع ذاكرة جماعية تعبر الأجيال والحدود.",
      explore: "استكشف الأرشيف"
    }
  };

  const languageButtons = document.querySelectorAll(".language-button");
  const menuToggle = document.getElementById("menu-toggle");
  const mobileMenu = document.querySelector(".mobile-menu");

  // Update every translated node and synchronize the page language/direction.
  function applyLanguage(language) {
    const dictionary = translations[language] || translations.en;

    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";

    document.querySelectorAll("[data-i18n]").forEach((element) => {
      const key = element.dataset.i18n;
      if (dictionary[key]) element.textContent = dictionary[key];
    });

    document.querySelectorAll("[data-i18n-html]").forEach((element) => {
      const key = element.dataset.i18nHtml;
      if (dictionary[key]) element.innerHTML = dictionary[key];
    });

    languageButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.lang === language));
    });
  }

  // Keep menu animation, accessibility states, and body scroll lock in sync.
  function setMenuOpen(isOpen) {
    if (!menuToggle || !mobileMenu) return;

    mobileMenu.classList.toggle("is-open", isOpen);
    mobileMenu.setAttribute("aria-hidden", String(!isOpen));
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
    document.body.classList.toggle("menu-open", isOpen);
  }

  languageButtons.forEach((button) => {
    button.addEventListener("click", () => applyLanguage(button.dataset.lang));
  });

  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", () => {
      const isOpen = menuToggle.getAttribute("aria-expanded") === "true";
      setMenuOpen(!isOpen);
    });

    mobileMenu.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => setMenuOpen(false));
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    });
  }

  applyLanguage(document.documentElement.lang || "en");
});
