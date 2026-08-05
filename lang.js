const ANTIOCHIA_LANG = {
  defaultLanguage: "en",
  languages: [
    { code: "en", label: "EN", name: "English", dir: "ltr" },
    { code: "tr", label: "TR", name: "Türkçe", dir: "ltr" },
    { code: "ar", label: "AR", name: "العربية", dir: "rtl" }
  ],
  navItems: [
    { key: "navigation.items.home", href: "#home" },
    { key: "navigation.items.history", href: "#history" },
    { key: "navigation.items.stories", href: "#stories" },
    { key: "navigation.items.structures", href: "#structures" },
    { key: "navigation.items.beliefs", href: "#beliefs" },
    { key: "navigation.items.music", href: "#music" }
  ],
  sectionCards: [
    { titleKey: "cards.stories.title", bodyKey: "cards.stories.body", href: "#stories" },
    { titleKey: "cards.structures.title", bodyKey: "cards.structures.body", href: "#structures" },
    { titleKey: "cards.beliefs.title", bodyKey: "cards.beliefs.body", href: "#beliefs" },
    { titleKey: "cards.music.title", bodyKey: "cards.music.body", href: "#music" }
  ],
  translations: {
    en: {
      accessibility: { skipLink: "Skip to content" },
      brand: { name: "AntiochiaArchive", ariaLabel: "AntiochiaArchive home" },
      language: { label: "Choose language", option: "Switch language to {name}" },
      navigation: {
        primaryLabel: "Primary navigation",
        mobileLabel: "Mobile navigation",
        openMenu: "Open menu",
        closeMenu: "Close menu",
        items: {
          home: "Home",
          history: "History",
          stories: "Stories",
          structures: "Structures",
          beliefs: "Beliefs",
          music: "Music"
        }
      },
      actions: {
        contribute: "Contribute",
        explore: "Explore the archive",
        email: "Email the archive team"
      },
      hero: {
        eyebrow: "A living digital memory",
        title: "Every memory<br>has a <em>place.</em>",
        summary: "A multilingual archive preserving the voices, images, songs, and shared places of Antioch."
      },
      map: {
        ariaLabel: "Illustrated map of Antioch and the Orontes Valley",
        label: "Antioch & the Orontes Valley",
        coordinatesLabel: "Antioch coordinates",
        latitude: "36.2021° N",
        longitude: "36.1608° E"
      },
      mission: {
        ariaLabel: "Our mission",
        count: "01 — 05",
        title: "A city lives as long as its stories are told.",
        body: "AntiochiaArchive gathers testimony, family photographs, oral histories, architecture, belief traditions, and music into a durable public memory for future generations."
      },
      sections: {
        eyebrow: "Archive paths",
        title: "Four ways to enter the memory of Antioch"
      },
      cards: {
        stories: { title: "Stories", body: "Personal memories, oral histories, and neighborhood accounts." },
        structures: { title: "Structures", body: "Houses, churches, mosques, synagogues, streets, bridges, and civic landmarks." },
        beliefs: { title: "Beliefs", body: "Shared rituals, sacred calendars, foodways, and intercommunal traditions." },
        music: { title: "Music", body: "Songs, recordings, instruments, and soundscapes carried across generations." }
      },
      contribute: {
        eyebrow: "Contribute",
        title: "Help build a careful archive of Antioch.",
        body: "Share a story, photograph, recording, document, or place memory. Every contribution is reviewed with care, consent, and cultural context."
      }
    },
    tr: {
      accessibility: { skipLink: "İçeriğe geç" },
      brand: { name: "AntiochiaArchive", ariaLabel: "AntiochiaArchive ana sayfa" },
      language: { label: "Dil seç", option: "Dili {name} olarak değiştir" },
      navigation: {
        primaryLabel: "Birincil gezinme",
        mobileLabel: "Mobil gezinme",
        openMenu: "Menüyü aç",
        closeMenu: "Menüyü kapat",
        items: {
          home: "Ana Sayfa",
          history: "Tarih",
          stories: "Hikâyeler",
          structures: "Yapılar",
          beliefs: "İnançlar",
          music: "Müzik"
        }
      },
      actions: {
        contribute: "Katkıda Bulun",
        explore: "Arşivi keşfet",
        email: "Arşiv ekibine e-posta gönder"
      },
      hero: {
        eyebrow: "Yaşayan bir dijital hafıza",
        title: "Her hatıranın<br>bir <em>yeri vardır.</em>",
        summary: "Antakya'nın seslerini, görüntülerini, şarkılarını ve ortak mekânlarını koruyan çok dilli bir arşiv."
      },
      map: {
        ariaLabel: "Antakya ve Asi Vadisi'nin çizim haritası",
        label: "Antakya ve Asi Vadisi",
        coordinatesLabel: "Antakya koordinatları",
        latitude: "36.2021° K",
        longitude: "36.1608° D"
      },
      mission: {
        ariaLabel: "Misyonumuz",
        count: "01 — 05",
        title: "Bir şehir, hikâyeleri anlatıldıkça yaşar.",
        body: "AntiochiaArchive tanıklıkları, aile fotoğraflarını, sözlü tarihleri, mimariyi, inanç geleneklerini ve müziği gelecek kuşaklar için kalıcı bir kamusal hafızada toplar."
      },
      sections: {
        eyebrow: "Arşiv yolları",
        title: "Antakya hafızasına girmenin dört yolu"
      },
      cards: {
        stories: { title: "Hikâyeler", body: "Kişisel hatıralar, sözlü tarihler ve mahalle anlatıları." },
        structures: { title: "Yapılar", body: "Evler, kiliseler, camiler, sinagoglar, sokaklar, köprüler ve kamusal yapılar." },
        beliefs: { title: "İnançlar", body: "Ortak ritüeller, kutsal takvimler, yemek kültürü ve topluluklar arası gelenekler." },
        music: { title: "Müzik", body: "Kuşaklar boyunca taşınan şarkılar, kayıtlar, çalgılar ve ses manzaraları." }
      },
      contribute: {
        eyebrow: "Katkıda bulun",
        title: "Antakya için özenli bir arşiv oluşturmaya yardım edin.",
        body: "Bir hikâye, fotoğraf, kayıt, belge ya da mekân hafızası paylaşın. Her katkı özen, rıza ve kültürel bağlam gözetilerek değerlendirilir."
      }
    },
    ar: {
      accessibility: { skipLink: "انتقل إلى المحتوى" },
      brand: { name: "أرشيف أنطاكية", ariaLabel: "الصفحة الرئيسية لأرشيف أنطاكية" },
      language: { label: "اختر اللغة", option: "حوّل اللغة إلى {name}" },
      navigation: {
        primaryLabel: "التنقل الرئيسي",
        mobileLabel: "تنقل الهاتف",
        openMenu: "افتح القائمة",
        closeMenu: "أغلق القائمة",
        items: {
          home: "الرئيسية",
          history: "التاريخ",
          stories: "الحكايات",
          structures: "المعالم",
          beliefs: "المعتقدات",
          music: "الموسيقى"
        }
      },
      actions: {
        contribute: "ساهم معنا",
        explore: "استكشف الأرشيف",
        email: "راسل فريق الأرشيف"
      },
      hero: {
        eyebrow: "ذاكرة رقمية حيّة",
        title: "لكل ذكرى<br><em>مكان.</em>",
        summary: "أرشيف متعدد اللغات يحفظ أصوات أنطاكية وصورها وأغانيها وأماكنها المشتركة."
      },
      map: {
        ariaLabel: "خريطة مرسومة لأنطاكية ووادي العاصي",
        label: "أنطاكية ووادي العاصي",
        coordinatesLabel: "إحداثيات أنطاكية",
        latitude: "36.2021° شمالاً",
        longitude: "36.1608° شرقاً"
      },
      mission: {
        ariaLabel: "مهمتنا",
        count: "٠١ — ٠٥",
        title: "تبقى المدينة حيّة ما دامت حكاياتها تُروى.",
        body: "يجمع AntiochiaArchive الشهادات والصور العائلية والتاريخ الشفهي والعمارة وتقاليد المعتقد والموسيقى في ذاكرة عامة متينة للأجيال القادمة."
      },
      sections: {
        eyebrow: "مسارات الأرشيف",
        title: "أربع طرق لدخول ذاكرة أنطاكية"
      },
      cards: {
        stories: { title: "الحكايات", body: "ذكريات شخصية وتاريخ شفهي وروايات الأحياء." },
        structures: { title: "المعالم", body: "بيوت وكنائس ومساجد ومعابد وشوارع وجسور ومعالم مدنية." },
        beliefs: { title: "المعتقدات", body: "طقوس مشتركة وتقاويم مقدسة وثقافة طعام وتقاليد بين الجماعات." },
        music: { title: "الموسيقى", body: "أغانٍ وتسجيلات وآلات ومشاهد صوتية انتقلت عبر الأجيال." }
      },
      contribute: {
        eyebrow: "ساهم معنا",
        title: "ساعد في بناء أرشيف دقيق لأنطاكية.",
        body: "شارك حكاية أو صورة أو تسجيلاً أو وثيقة أو ذاكرة مكان. تُراجع كل مساهمة بعناية وبموافقة واضحة وسياق ثقافي."
      }
    }
  }
};
