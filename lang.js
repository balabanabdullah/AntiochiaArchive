const translations = {
  defaultLanguage: "en",
  storageKey: "antiochiaarchive-language",
  languages: [
    { code: "en", label: "EN", name: "English", dir: "ltr" },
    { code: "tr", label: "TR", name: "Türkçe", dir: "ltr" },
    { code: "ar", label: "AR", name: "العربية", dir: "rtl" }
  ],
  navItems: [
    { key: "navigation.items.home", href: "#home" },
    { key: "navigation.items.history", href: "#mission" },
    { key: "navigation.items.stories", href: "#stories" },
    { key: "navigation.items.structures", href: "#structures" },
    { key: "navigation.items.beliefs", href: "#beliefs" },
    { key: "navigation.items.music", href: "#music" }
  ],
  sectionCards: [
    { id: "history", icon: "⌂", titleKey: "cards.history.title", bodyKey: "cards.history.body", href: "#mission" },
    { id: "stories", icon: "□", titleKey: "cards.stories.title", bodyKey: "cards.stories.body", href: "#stories" },
    { id: "structures", icon: "⌒", titleKey: "cards.structures.title", bodyKey: "cards.structures.body", href: "#structures" },
    { id: "beliefs", icon: "✝", titleKey: "cards.beliefs.title", bodyKey: "cards.beliefs.body", href: "#beliefs" },
    { id: "music", icon: "♪", titleKey: "cards.music.title", bodyKey: "cards.music.body", href: "#music" }
  ],
  stats: [
    { value: "1,245+", labelKey: "stats.items.stories" },
    { value: "320+", labelKey: "stats.items.structures" },
    { value: "2,800+", labelKey: "stats.items.community" },
    { value: "460+", labelKey: "stats.items.recordings" }
  ],
  footerLinks: [
    { key: "footer.links.about", href: "#mission" },
    { key: "footer.links.archive", href: "#stories" },
    { key: "footer.links.contribute", href: "#contribute" }
  ],
  dictionary: {
    en: {
      accessibility: { skipLink: "Skip to content" },
      brand: { name: "AntiochiaArchive", tagline: "A living memory", ariaLabel: "AntiochiaArchive home" },
      language: { label: "Choose language", option: "Switch language to {name}" },
      navigation: {
        primaryLabel: "Primary navigation",
        mobileLabel: "Mobile navigation",
        openMenu: "Open menu",
        closeMenu: "Close menu",
        items: { home: "Home", history: "History", stories: "Stories", structures: "Structures", beliefs: "Beliefs", music: "Music" }
      },
      actions: { contribute: "Contribute", explore: "Explore the archive", mission: "Our mission", email: "Contribute now" },
      hero: {
        eyebrow: "A living digital memory",
        title: "Every memory<br>has a <em>place.</em>",
        summary: "AntiochiaArchive preserves the stories, places, beliefs, and music of Antioch and keeps its heritage alive for future generations."
      },
      map: {
        ariaLabel: "Illustrated map-inspired landscape of Antioch and the Orontes Valley",
        label: "Antioch & the Orontes Valley",
        coordinatesLabel: "Antioch coordinates",
        latitude: "36.2021° N",
        longitude: "36.1608° E"
      },
      mission: {
        ariaLabel: "Our mission",
        count: "01 — 05",
        eyebrow: "Our mission",
        title: "A city lives as long as its stories are told.",
        body: "We collect, preserve, and share voices, images, songs, documents, and places of Antioch — building a collective memory that travels across generations and borders."
      },
      sections: { eyebrow: "Archive paths", title: "Explore Antioch through living memory" },
      cards: {
        history: { title: "History", body: "Discover the rich history of Antioch through timelines, archives, and collective research." },
        stories: { title: "Stories", body: "Read personal memories and oral histories from the people of Antioch." },
        structures: { title: "Structures", body: "Explore architectural heritage, public landmarks, streets, and sacred spaces." },
        beliefs: { title: "Beliefs", body: "Learn about diverse belief traditions, rituals, calendars, and shared practices." },
        music: { title: "Music", body: "Listen to songs, recordings, instruments, and soundscapes carried across generations." }
      },
      stats: {
        title: "Archive statistics",
        items: { stories: "Stories collected", structures: "Historic structures", community: "Community members", recordings: "Songs & recordings" }
      },
      contribute: {
        eyebrow: "Join our community",
        title: "Help preserve<br><em>our shared heritage.</em>",
        body: "Share your stories, photographs, documents, recordings, or place memories and become part of Antioch's living archive."
      },
      footer: {
        label: "Footer links",
        summary: "A living digital memory of Antioch. Preserving stories, places, beliefs, and music for future generations.",
        copyright: "© 2026 AntiochiaArchive. All rights reserved.",
        links: { about: "About", archive: "Archive", contribute: "Contribute" }
      }
    },
    tr: {
      accessibility: { skipLink: "İçeriğe geç" },
      brand: { name: "AntiochiaArchive", tagline: "Yaşayan hafıza", ariaLabel: "AntiochiaArchive ana sayfa" },
      language: { label: "Dil seç", option: "Dili {name} olarak değiştir" },
      navigation: {
        primaryLabel: "Birincil gezinme",
        mobileLabel: "Mobil gezinme",
        openMenu: "Menüyü aç",
        closeMenu: "Menüyü kapat",
        items: { home: "Ana Sayfa", history: "Tarih", stories: "Hikâyeler", structures: "Yapılar", beliefs: "İnançlar", music: "Müzik" }
      },
      actions: { contribute: "Katkıda Bulun", explore: "Arşivi keşfet", mission: "Misyonumuz", email: "Hemen katkı ver" },
      hero: {
        eyebrow: "Yaşayan bir dijital hafıza",
        title: "Her hatıranın<br>bir <em>yeri vardır.</em>",
        summary: "AntiochiaArchive, Antakya'nın hikâyelerini, mekânlarını, inançlarını ve müziğini korur; mirasını gelecek kuşaklar için canlı tutar."
      },
      map: {
        ariaLabel: "Antakya ve Asi Vadisi'nden esinlenen çizim harita manzarası",
        label: "Antakya ve Asi Vadisi",
        coordinatesLabel: "Antakya koordinatları",
        latitude: "36.2021° K",
        longitude: "36.1608° D"
      },
      mission: {
        ariaLabel: "Misyonumuz",
        count: "01 — 05",
        eyebrow: "Misyonumuz",
        title: "Bir şehir, hikâyeleri anlatıldıkça yaşar.",
        body: "Antakya'nın seslerini, görüntülerini, şarkılarını, belgelerini ve mekânlarını topluyor, koruyor ve paylaşıyoruz; nesiller ve sınırlar boyunca taşınan ortak bir hafıza kuruyoruz."
      },
      sections: { eyebrow: "Arşiv yolları", title: "Antakya'yı yaşayan hafıza üzerinden keşfet" },
      cards: {
        history: { title: "Tarih", body: "Antakya'nın zengin tarihini zaman çizelgeleri, arşivler ve kolektif araştırmalarla keşfedin." },
        stories: { title: "Hikâyeler", body: "Antakyalıların kişisel hatıralarını ve sözlü tarih anlatılarını okuyun." },
        structures: { title: "Yapılar", body: "Mimari mirası, kamusal yapıları, sokakları ve kutsal mekânları inceleyin." },
        beliefs: { title: "İnançlar", body: "Çeşitli inanç geleneklerini, ritüelleri, takvimleri ve ortak pratikleri öğrenin." },
        music: { title: "Müzik", body: "Kuşaklar boyunca taşınan şarkıları, kayıtları, çalgıları ve ses manzaralarını dinleyin." }
      },
      stats: {
        title: "Arşiv istatistikleri",
        items: { stories: "Toplanan hikâye", structures: "Tarihi yapı", community: "Topluluk üyesi", recordings: "Şarkı ve kayıt" }
      },
      contribute: {
        eyebrow: "Topluluğumuza katıl",
        title: "Ortak mirasımızı<br><em>korumaya yardım edin.</em>",
        body: "Hikâyelerinizi, fotoğraflarınızı, belgelerinizi, kayıtlarınızı ya da mekân hafızalarınızı paylaşarak Antakya'nın yaşayan arşivinin parçası olun."
      },
      footer: {
        label: "Alt bilgi bağlantıları",
        summary: "Antakya'nın yaşayan dijital hafızası. Hikâyeleri, mekânları, inançları ve müziği gelecek kuşaklar için korur.",
        copyright: "© 2026 AntiochiaArchive. Tüm hakları saklıdır.",
        links: { about: "Hakkında", archive: "Arşiv", contribute: "Katkıda bulun" }
      }
    },
    ar: {
      accessibility: { skipLink: "انتقل إلى المحتوى" },
      brand: { name: "أرشيف أنطاكية", tagline: "ذاكرة حيّة", ariaLabel: "الصفحة الرئيسية لأرشيف أنطاكية" },
      language: { label: "اختر اللغة", option: "حوّل اللغة إلى {name}" },
      navigation: {
        primaryLabel: "التنقل الرئيسي",
        mobileLabel: "تنقل الهاتف",
        openMenu: "افتح القائمة",
        closeMenu: "أغلق القائمة",
        items: { home: "الرئيسية", history: "التاريخ", stories: "الحكايات", structures: "المعالم", beliefs: "المعتقدات", music: "الموسيقى" }
      },
      actions: { contribute: "ساهم معنا", explore: "استكشف الأرشيف", mission: "مهمتنا", email: "ساهم الآن" },
      hero: {
        eyebrow: "ذاكرة رقمية حيّة",
        title: "لكل ذكرى<br><em>مكان.</em>",
        summary: "يحفظ أرشيف أنطاكية الحكايات والأماكن والمعتقدات والموسيقى، ويبقي تراث المدينة حيّاً للأجيال القادمة."
      },
      map: {
        ariaLabel: "مشهد خريطة مستوحى من أنطاكية ووادي العاصي",
        label: "أنطاكية ووادي العاصي",
        coordinatesLabel: "إحداثيات أنطاكية",
        latitude: "36.2021° شمالاً",
        longitude: "36.1608° شرقاً"
      },
      mission: {
        ariaLabel: "مهمتنا",
        count: "٠١ — ٠٥",
        eyebrow: "مهمتنا",
        title: "تبقى المدينة حيّة ما دامت حكاياتها تُروى.",
        body: "نجمع ونحفظ ونشارك أصوات أنطاكية وصورها وأغانيها ووثائقها وأماكنها، ونبني ذاكرة جماعية تعبر الأجيال والحدود."
      },
      sections: { eyebrow: "مسارات الأرشيف", title: "استكشف أنطاكية عبر الذاكرة الحيّة" },
      cards: {
        history: { title: "التاريخ", body: "اكتشف تاريخ أنطاكية الغني من خلال الجداول الزمنية والأرشيفات والبحث الجماعي." },
        stories: { title: "الحكايات", body: "اقرأ الذكريات الشخصية والتاريخ الشفهي لأهل أنطاكية." },
        structures: { title: "المعالم", body: "استكشف التراث المعماري والمعالم العامة والشوارع والأماكن المقدسة." },
        beliefs: { title: "المعتقدات", body: "تعرّف إلى تقاليد المعتقد والطقوس والتقاويم والممارسات المشتركة." },
        music: { title: "الموسيقى", body: "استمع إلى الأغاني والتسجيلات والآلات والمشاهد الصوتية المنقولة عبر الأجيال." }
      },
      stats: {
        title: "إحصاءات الأرشيف",
        items: { stories: "حكاية مجموعة", structures: "معلم تاريخي", community: "عضو في المجتمع", recordings: "أغنية وتسجيل" }
      },
      contribute: {
        eyebrow: "انضم إلى مجتمعنا",
        title: "ساعد في حفظ<br><em>تراثنا المشترك.</em>",
        body: "شارك حكاياتك وصورك ووثائقك وتسجيلاتك أو ذاكرة مكان، وكن جزءاً من الأرشيف الحي لأنطاكية."
      },
      footer: {
        label: "روابط التذييل",
        summary: "ذاكرة رقمية حيّة لأنطاكية تحفظ الحكايات والأماكن والمعتقدات والموسيقى للأجيال القادمة.",
        copyright: "© 2026 AntiochiaArchive. جميع الحقوق محفوظة.",
        links: { about: "من نحن", archive: "الأرشيف", contribute: "ساهم معنا" }
      }
    }
  }
};

window.ANTIOCHIA_LANG = translations;
