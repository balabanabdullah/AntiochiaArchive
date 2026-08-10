/**
 * AntiochiaArchive — Translation Data
 * Supports: English (en), Turkish (tr), Arabic (ar)
 */
const TRANSLATIONS = {
  en: {
    dir: "ltr",
    nav: {
      home:       "Home",
      history:    "History",
      stories:    "Stories",
      structures: "Structures",
      beliefs:    "Beliefs",
      music:      "Music",
      gallery:    "Gallery",
    },
    actions: {
      contribute: "Contribute",
      explore:    "Explore the archive",
      learnMore:  "Learn more",
    },
    searchPlaceholder: "Search...",
    filters: {
      all: "All",
      filterLabel: "Filter by Category",
      mosque: "Mosques",
      church: "Churches",
      synagogue: "Synagogues",
      folk: "Folk Melodies",
      hymn: "Sacred Hymns",
      courtyard: "Courtyard Homes",
      mosaic: "Roman Mosaics",
      infrastructure: "Water & Engineering"
    },
    hero: {
      eyebrow: "A living digital memory",
      titleHtml: "Every memory<br>has a <em>place.</em>",
      subtitle:
        "A multilingual archive preserving the voices, images, songs, and shared places of Antioch — for generations to come.",
      mapLabel: "Antioch & the Orontes Valley",
      coordLabel: "Coordinates",
    },
    mission: {
      eyebrow: "Our Mission",
      title: "A city lives as long as its stories are told.",
      body:
        "AntiochiaArchive gathers testimony, family photographs, oral histories, architecture, belief traditions, and music into a durable public memory. It is a project built by and for the people of Antioch.",
      stat1: { value: "2,500+", label: "Years of History" },
      stat2: { value: "12+",    label: "Communities" },
      stat3: { value: "Open",   label: "Source & Access" },
    },
    historyTitle: "Twenty-Five Centuries of Heritage",
    historyBody: "Founded in 300 BCE along the Orontes River, Antioch grew into one of the ancient Mediterranean's great capitals—a crossroads of silk routes, philosophies, and faith traditions.",
    structuresTitle: "Stones of Time & Faith",
    structuresBody: "Discover the historic courtyard houses, ancient places of worship, stone bridges, and narrow streets that define Antioch's urban fabric.",
    beliefsTitle: "Shared Sanctuaries & Sacred Calendars",
    beliefsBody: "Antioch's spiritual landscape is unique—a city where churches, mosques, and synagogues stand side-by-side, sharing holidays, traditions, and sacred spaces.",
    musicTitle: "Sounds, Melodies & Soundscapes",
    musicBody: "The music of Antioch weaves together Levantine maqams, church hymns, local folk songs, and the resonant sounds of the Oud and Ney.",
    historySection: {
      eyebrow: "Chronicle of a City",
      title: "Twenty-Five Centuries of Heritage",
      body: "Founded in 300 BCE along the Orontes River, Antioch grew into one of the ancient Mediterranean's great capitals—a crossroads of silk routes, philosophies, and faith traditions.",
      milestone1: {
        era: "300 BCE — Roman Capital",
        title: "Crossroads of the Ancient Mediterranean",
        body: "Established by Seleucus I Nicator, Antioch became the third largest city of the Roman Empire, renowned for its colonnaded avenues and mosaic masterpieces."
      },
      milestone2: {
        era: "Medieval & Ottoman Eras",
        title: "Mosaic of Cultures & Trade",
        body: "Through centuries of transformation, the city maintained its position as a vibrant hub of silk trade, craftsmanship, and peaceful co-existence."
      },
      milestone3: {
        era: "Modern Memory",
        title: "Preserving Identity Across Time",
        body: "Today, AntiochiaArchive safeguards physical landmarks and intangible heritage so future generations can retrace the living memory of Antioch."
      }
    },
    sections: {
      eyebrow: "Archive Paths",
      title:   "Four ways to enter the memory of Antioch",
    },
    cards: {
      stories: {
        title: "Stories",
        body:  "Personal memories, oral histories, and neighborhood accounts passed down through generations.",
      },
      structures: {
        title: "Structures",
        body:  "Houses, churches, mosques, synagogues, streets, bridges, and civic landmarks documented in detail.",
      },
      beliefs: {
        title: "Beliefs",
        body:  "Shared rituals, sacred calendars, foodways, and intercommunal traditions that define the city's soul.",
      },
      music: {
        title: "Music",
        body:  "Songs, recordings, instruments, and soundscapes carried across generations and borders.",
      },
    },
    readMore: "Read Story",
    fullStoryNotice: "The full story text will be available here soon.",
    storyTitle1: "The Old Stone House on Kurtuluş Street",
    storySummary1: "An oral account of multi-generational life inside one of Antioch's historic courtyard homes before the earthquake.",
    storyTitle2: "Echoes of the Orontes Waterwheels",
    storySummary2: "Memories of the ancient wooden waterwheels along the Orontes river that once fed the gardens of Antioch.",
    storyTitle3: "Bread & Salt: Shared Festive Tables",
    storySummary3: "How neighboring communities gathered across religious calendars to share festive dishes and holiday breads.",
    storiesSection: {
      eyebrow: "Oral Histories",
      title: "Voices & Memories of Antioch",
      intro: "Every neighborhood in Antioch holds memories carried across generations—from courtyard conversations to old trade routes.",
      readMore: "Read Story",
      fullStoryNotice: "The full story text will be available here soon.",
      story1: {
        tag: "Kurtuluş Street",
        title: "The Old Stone House on Kurtuluş Street",
        body: "An oral account of multi-generational life inside one of Antioch's historic courtyard homes before the earthquake.",
        ariaLabel: "Read story about the Old Stone House on Kurtuluş Street"
      },
      story2: {
        tag: "Orontes River",
        title: "Echoes of the Orontes Waterwheels",
        body: "Memories of the ancient wooden waterwheels along the Orontes river that once fed the gardens of Antioch.",
        ariaLabel: "Read story about the Echoes of the Orontes Waterwheels"
      },
      story3: {
        tag: "Old Quarter",
        title: "Bread & Salt: Shared Festive Tables",
        body: "How neighboring communities gathered across religious calendars to share festive dishes and holiday breads.",
        ariaLabel: "Read story about Bread & Salt: Shared Festive Tables"
      }
    },
    structuresSection: {
      eyebrow: "Architectural Heritage",
      title: "Stones of Time & Faith",
      body: "Discover the historic courtyard houses, ancient places of worship, Roman mosaic treasures, and historic sanctuaries that define Antioch.",
      struct1: {
        tag: "Historic Mosque",
        title: "Habib-i Neccar Mosque",
        desc: "Constructed on ancient foundations, representing Anatolia's earliest Islamic heritage site."
      },
      struct2: {
        tag: "Cave Sanctuary",
        title: "St. Pierre Cave Church",
        desc: "One of the earliest Christian places of worship carved directly into the slopes of Mount Staurin."
      },
      struct3: {
        tag: "Roman Heritage",
        title: "Roman Mosaics of Antioch",
        desc: "World-renowned floor mosaics depicting ancient myths, natural themes, and seasonal motifs."
      },
      struct4: {
        tag: "Urban Fabric",
        title: "Traditional Antioch Houses",
        desc: "Intricate stone residences featuring central courtyards, citrus trees, and decorative ironwork."
      }
    },
    beliefsSection: {
      eyebrow: "Interfaith Heritage",
      title: "Shared Sanctuaries & Faith History",
      body: "Antioch's spiritual landscape is unique—a city where mosques, churches, and synagogues stand side-by-side, sharing sacred history and traditions.",
      card1: {
        title: "Habib-i Neccar Shrine",
        desc: "Venerated by Muslims and Christians alike, honoring Habib-i Neccar, the historic martyr of Antioch."
      },
      card2: {
        title: "St. Pierre Cave Church",
        desc: "Carved into Mount Staurin, it is considered one of the earliest cave churches in Christian history."
      },
      card3: {
        title: "Antioch Synagogue",
        desc: "A historic place of worship preserving centuries-old Torah scrolls and the living memory of Antioch's Jewish community."
      }
    },
    musicSection: {
      eyebrow: "Musical Traditions",
      title: "Sounds, Melodies & Soundscapes",
      body: "The music of Antioch weaves together Levantine maqams, sacred Ziyaret chants, Mesopotamian melodies, and traditional local folk songs.",
      track1: {
        tag: "Ancient Heritage",
        title: "Mesopotamian Melodies",
        desc: "Ancient modal structures and acoustic traditions echoing through centuries of Levantine history."
      },
      track2: {
        tag: "Sacred Chants",
        title: "Ziyaret & Sacred Chants",
        desc: "Liturgical chants and spiritual melodies sung in sacred spaces, shrines, and seasonal gatherings."
      },
      track3: {
        tag: "Local Folk Songs",
        title: "Antioch Folk Songs & Ballads",
        desc: "Heartfelt folk ballads, courtyard songs, and celebratory music reflecting the daily rhythm of Antioch."
      }
    },
    contribute: {
      eyebrow: "Open Contribution",
      title:   "Help build a careful archive of Antioch.",
      body:    "Share a story, photograph, recording, document, or place memory. Every contribution is reviewed with care, consent, and cultural context.",
      formName:    "Full name",
      formEmail:   "Email address",
      formMessage: "Your contribution or message",
      formSubmit:  "Send contribution",
      success:     "Thank you! Your contribution has been successfully received.",
      error:       "An error occurred. Please try again.",
      sending:     "Sending…",
      requiredFields: "Please fill in all fields.",
    },
    footerAbout: "A living digital memory preserving the voices, images, oral histories, and shared places of Antioch.",
    openSource: "Open source & community driven project.",
    copyright: "AntiochiaArchive. Open source, open memory.",
    footer: {
      tagline: "A living digital memory of Antioch.",
      connect: "Connect",
      links: {
        about:   "About",
        contact: "Contact",
        privacy: "Privacy",
        license: "License",
      },
      copyright: "AntiochiaArchive. Open source, open memory.",
    },
    pages: {
      backToHome: "← Back to Home",
      history: {
        eyebrow: "Chronicle of a City",
        title: "History of Antioch",
        subtitle: "Explore twenty-five centuries of Mediterranean civilization, silk routes, and living heritage along the Orontes.",
        badge: "Timeline Chronicle",
      },
      stories: {
        eyebrow: "Oral Archive",
        title: "Voices & Oral Histories",
        subtitle: "Listen to and read multi-generational testimonies, courtyard accounts, and memories carried across generations.",
        badge: "Oral Histories",
      },
      structures: {
        eyebrow: "Built Heritage",
        title: "Stones of Time & Faith",
        subtitle: "Discover historic courtyard houses, cave sanctuaries, ancient mosques, aqueducts, and narrow stone alleys.",
        badge: "Architectural Records",
      },
      beliefs: {
        eyebrow: "Spiritual Landscape",
        title: "Shared Sanctuaries & Sacred Calendars",
        subtitle: "A testament to centuries of interfaith coexistence, shared holiday feasts, venerated hilltops, and traditions.",
        badge: "Interfaith Heritage",
      },
      music: {
        eyebrow: "Audio Archive",
        title: "Sounds, Melodies & Soundscapes",
        subtitle: "Listen to traditional Levantine maqams, mountain hymns, bazaar coppersmith rhythms, and urban soundscapes.",
        badge: "Sound Recordings",
      },
      gallery: {
        eyebrow: "Visual Archive",
        title: "Archive Gallery",
        subtitle: "Discover historical photographs, architectural studies, and visual documentation of Antioch's living heritage.",
        badge: "Visual Collection",
      },
      submissions: {
        badge: "Visitor Contributions",
        title: "Visitor Contributions",
        subtitle: "Review incoming place memories, oral accounts, and photographic contributions from the community.",
        colName: "Contributor",
        colEmail: "Email",
        colMessage: "Message",
        colDate: "Date",
        colActions: "Actions",
        btnDelete: "Delete",
        btnRefresh: "Refresh",
        emptyState: "No visitor contributions found.",
        confirmDelete: "Are you sure you want to delete this contribution record?",
        deletedSuccess: "Contribution record deleted successfully.",
      },
      cta: {
        eyebrow: "Preserve the Memory",
        title: "Do you have a memory, photo, or recording to share?",
        body: "AntiochiaArchive grows through community contributions. Help us keep Antioch's living heritage vibrant.",
        btn: "Contribute to Archive",
      }
    },
    a11y: {
      skipLink:    "Skip to content",
      openMenu:    "Open navigation menu",
      closeMenu:   "Close navigation menu",
      langChooser: "Choose language",
    },
  },

  tr: {
    dir: "ltr",
    nav: {
      home:       "Ana Sayfa",
      history:    "Tarih",
      stories:    "Hikâyeler",
      structures: "Yapılar",
      beliefs:    "İnançlar",
      music:      "Müzik",
      gallery:    "Galeri",
    },
    actions: {
      contribute: "Katkıda Bulun",
      explore:    "Arşivi keşfet",
      learnMore:  "Daha fazla",
    },
    searchPlaceholder: "Bir şey ara...",
    filters: {
      all: "Tümü",
      filterLabel: "Kategori Filtrele",
      mosque: "Camiler",
      church: "Kiliseler",
      synagogue: "Havralar",
      folk: "Türküler & Ezgiler",
      hymn: "İlahiler",
      courtyard: "Avlulu Evler",
      mosaic: "Roma Mozaikleri",
      infrastructure: "Su & Roma Mühendisliği"
    },
    hero: {
      eyebrow: "Yaşayan bir dijital hafıza",
      titleHtml: "Her hatıranın<br>bir <em>yeri vardır.</em>",
      subtitle:
        "Antakya'nın seslerini, görüntülerini, şarkılarını ve ortak mekânlarını gelecek nesiller için koruyan çok dilli bir arşiv.",
      mapLabel: "Antakya ve Asi Vadisi",
      coordLabel: "Koordinatlar",
    },
    mission: {
      eyebrow: "Misyonumuz",
      title: "Bir şehir, hikâyeleri anlatıldıkça yaşar.",
      body:
        "AntiochiaArchive, tanıklıkları, aile fotoğraflarını, sözlü tarihleri, mimariyi, inanç geleneklerini ve müziği gelecek kuşaklar için kalıcı bir kamusal hafızada toplar. Bu proje, Antakya halkı tarafından ve onlar için inşa edilmektedir.",
      stat1: { value: "2.500+", label: "Yıllık Tarih" },
      stat2: { value: "12+",    label: "Topluluk" },
      stat3: { value: "Açık",   label: "Kaynak ve Erişim" },
    },
    historyTitle: "Yirmi Beş Asırlık Miras",
    historyBody: "MÖ 300 yılında Asi Nehri kıyısında kurulan Antakya, İpek Yolu'nun, felsefenin ve inanç geleneklerinin kesişim noktasında antik Akdeniz'in en büyük başkentlerinden biri haline geldi.",
    structuresTitle: "Zamanın ve İnancın Taşları",
    structuresBody: "Antakya'nın kent dokusunu oluşturan tarihi avlulu evleri, antik ibadethaneleri, taş köprüleri ve dar sokakları keşfedin.",
    beliefsTitle: "Ortak Mabetler ve Kutsal Takvimler",
    beliefsBody: "Antakya'nın inanç iklimi eşsizdir; camiler, kiliseler ve sinagoglar yan yana durur, bayramlar ve kutsal mekânlar ortaklaşa yaşatılır.",
    musicTitle: "Sesler, Makamlar ve İlahiler",
    musicBody: "Antakya müziği; Doğu makamlarını, kilise ilahilerini, yerel türküleri ve ud ile neyin yankılanan seslerini bir araya getirir.",
    historySection: {
      eyebrow: "Bir Şehrin Kronolojisi",
      title: "Yirmi Beş Asırlık Miras",
      body: "MÖ 300 yılında Asi Nehri kıyısında kurulan Antakya, İpek Yolu'nun, felsefenin ve inanç geleneklerinin kesişim noktasında antik Akdeniz'in en büyük başkentlerinden biri haline geldi.",
      milestone1: {
        era: "MÖ 300 — Roma Başkenti",
        title: "Antik Akdeniz'in Kesişim Noktası",
        body: "I. Seleukos Nicator tarafından kurulan Antakya, sütunlu caddeleri ve mozaik şaheserleriyle Roma İmparatorluğu'nun üçüncü büyük şehri olmuştur."
      },
      milestone2: {
        era: "Orta Çağ ve Osmanlı Dönemi",
        title: "Kültürlerin ve Ticaretin Mozaiği",
        body: "Asırlar süren dönüşümler boyunca şehir; ipek ticareti, zanaatkarlık ve barış içinde birlikte yaşamın canlı merkezi olma konumunu korudu."
      },
      milestone3: {
        era: "Modern Hafıza",
        title: "Kimliği Zamana Karşı Korumak",
        body: "Bugün AntiochiaArchive, gelecek nesillerin Antakya'nın yaşayan hafızasını izleyebilmesi için fiziksel ve somut olmayan mirası koruyor."
      }
    },
    sections: {
      eyebrow: "Arşiv Yolları",
      title:   "Antakya hafızasına girmenin dört yolu",
    },
    cards: {
      stories: {
        title: "Hikâyeler",
        body:  "Kuşaktan kuşağa aktarılan kişisel hatıralar, sözlü tarihler ve mahalle anlatıları.",
      },
      structures: {
        title: "Yapılar",
        body:  "Evler, kiliseler, camiler, sinagoglar, sokaklar, köprüler ve ayrıntılı biçimde belgelenen kamusal yapılar.",
      },
      beliefs: {
        title: "İnançlar",
        body:  "Şehrin ruhunu tanımlayan ortak ritüeller, kutsal takvimler, yemek kültürü ve topluluklar arası gelenekler.",
      },
      music: {
        title: "Müzik",
        body:  "Kuşaklar ve sınırlar boyunca taşınan şarkılar, kayıtlar, çalgılar ve ses manzaraları.",
      },
    },
    readMore: "Tamamını oku",
    fullStoryNotice: "Tam metin burada olacak.",
    storyTitle1: "Kurtuluş Caddesi'ndeki Eski Taş Ev",
    storySummary1: "Antakya'nın avlulu tarihi evlerinden birinde kuşaklar boyu süren yaşamın sözlü anlatısı.",
    storyTitle2: "Asi Su Çarklarının Yankısı",
    storySummary2: "Bir zamanlar Antakya bahçelerini besleyen Asi nehri kıyısındaki tarihi ahşap su çarklarının hatıraları.",
    storyTitle3: "Ekmek ve Tuz: Ortak Sofra Gelenekleri",
    storySummary3: "Farklı toplulukların kutsal günlerde ve bayramlarda ortak tarifleri ve ekmekleri paylaşma geleneği.",
    storiesSection: {
      eyebrow: "Sözlü Tarihler",
      title: "Antakya'nın Sesleri ve Hafızası",
      intro: "Antakya'nın her mahallesi, avlu sohbetlerinden eski ticaret yollarına kadar kuşaklar boyu aktarılan hatıraları barındırır.",
      readMore: "Tamamını oku",
      fullStoryNotice: "Tam metin burada olacak.",
      story1: {
        tag: "Kurtuluş Caddesi",
        title: "Kurtuluş Caddesi'ndeki Eski Taş Ev",
        body: "Antakya'nın avlulu tarihi evlerinden birinde kuşaklar boyu süren yaşamın sözlü anlatısı.",
        ariaLabel: "Kurtuluş Caddesi'ndeki Eski Taş Ev hikâyesini oku"
      },
      story2: {
        tag: "Asi Nehri",
        title: "Asi Su Çarklarının Yankısı",
        body: "Bir zamanlar Antakya bahçelerini besleyen Asi nehri kıyısındaki tarihi ahşap su çarklarının hatıraları.",
        ariaLabel: "Asi Su Çarklarının Yankısı hikâyesini oku"
      },
      story3: {
        tag: "Eski Mahalle",
        title: "Ekmek ve Tuz: Ortak Sofra Gelenekleri",
        body: "Farklı toplulukların kutsal günlerde ve bayramlarda ortak tarifleri ve ekmekleri paylaşma geleneği.",
        ariaLabel: "Ekmek ve Tuz hikâyesini oku"
      }
    },
    structuresSection: {
      eyebrow: "Mimari Miras",
      title: "Zamanın ve İnancın Taşları",
      body: "Antakya'nın antik mozaiklerini, tarihi camilerini, kaya ibadethanelerini ve avlulu geleneksel evlerini keşfedin.",
      struct1: {
        tag: "Tarihi Cami",
        title: "Habib-i Neccar Camii",
        desc: "Anadolu'da inşa edilen ilk cami olarak kabul edilen, antik temeller üzerindeki tarihi ibadethane."
      },
      struct2: {
        tag: "Kaya Kilisesi",
        title: "St. Pierre Kilisesi",
        desc: "Staurin Dağı'nın yamaçlarına doğrudan oyulmuş, Hristiyanlığın en eski ibadethanelerinden biri."
      },
      struct3: {
        tag: "Roma Mirası",
        title: "Roma Mozaikleri",
        desc: "Antik mitleri, mevsimleri ve doğa motiflerini işleyen, dünyaca ünlü antik taban mozaikleri."
      },
      struct4: {
        tag: "Kent Dokusu",
        title: "Antakya Evleri",
        desc: "Yüksek taş duvarlar arkasında gizli avluları, narenciye ağaçları ve süslü demir işçiliği ile ünlü tarihi evler."
      }
    },
    beliefsSection: {
      eyebrow: "İnanç Kültürü",
      title: "İnançlar ve Kutsal Mabetler",
      body: "Antakya'nın inanç iklimi eşsizdir; camiler, kiliseler ve sinagoglar yan yana durur, asırlık kutsal miras ortaklaşa yaşatılır.",
      card1: {
        title: "Habib-i Neccar Türbesi",
        desc: "Müslümanlar ve Hristiyanlarca saygı duyulan, Yasin Suresi'nde yer alan Habib-i Neccar'ın tarihi türbesi."
      },
      card2: {
        title: "St. Pierre Mağara Kilisesi",
        desc: "Staurin Dağı yamaçlarına oyulmuş, inananlara ilk kez 'Hristiyan' adının verildiği tarihi ibadethane."
      },
      card3: {
        title: "Yahudi Havrası",
        desc: "Asırlık Tevrat tomarını ve Antakya Musevi cemaatinin kadim hafızasını yaşatan tarihi ibadethane."
      }
    },
    musicSection: {
      eyebrow: "Müzik Kültürü",
      title: "Sesler, Makamlar ve İlahiler",
      body: "Antakya müziği; Doğu Akdeniz makamlarını, Ziyaret/Necef ilahilerini, Mezopotamya ezgilerini ve mahalli halk türkülerini bir araya getirir.",
      track1: {
        tag: "Kadim Miras",
        title: "Mezopotamya Ezgileri",
        desc: "Doğu Akdeniz ve Levanten kültürünün asırlardır yankılanan makam yapıları ve antik enstrüman gelenekleri."
      },
      track2: {
        tag: "Kutsal İlahiler",
        title: "Ziyaret / Necef İlahileri",
        desc: "Kutsal mekânlarda, manevi ziyaretgahlar ve bayram toplantılarında seslendirilen ilahiler ve dualar."
      },
      track3: {
        tag: "Mahalli Türküler",
        title: "Antakya Türküleri / Mahalli Şarkılar",
        desc: "Antakya sokaklarında, avlularında ve düğünlerinde söylenen samimi halk türküleri ve mahalli ezgiler."
      }
    },
    contribute: {
      eyebrow: "Açık Katkı",
      title:   "Antakya için özenli bir arşiv oluşturmaya yardım edin.",
      body:    "Bir hikâye, fotoğraf, kayıt, belge ya da mekân hafızası paylaşın. Her katkı, özen, rıza ve kültürel bağlam gözetilerek değerlendirilir.",
      formName:    "Ad soyad",
      formEmail:   "E-posta adresi",
      formMessage: "Katkınız veya mesajınız",
      formSubmit:  "Katkı gönder",
      success:     "Teşekkürler! Katkınız başarıyla alındı.",
      error:       "Bir hata oluştu. Lütfen tekrar deneyiniz.",
      sending:     "Gönderiliyor…",
      requiredFields: "Lütfen tüm alanları doldurunuz.",
    },
    footerAbout: "Antakya'nın seslerini, görüntülerini, sözlü tarihlerini ve ortak mekânlarını koruyan yaşayan bir dijital hafıza.",
    openSource: "Açık kaynaklı ve topluluk odaklı proje.",
    copyright: "AntiochiaArchive. Açık kaynak, açık hafıza.",
    footer: {
      tagline: "Antakya'nın yaşayan dijital hafızası.",
      connect: "Bağlantı & İletişim",
      links: {
        about:   "Hakkında",
        contact: "İletişim",
        privacy: "Gizlilik",
        license: "Lisans",
      },
      copyright: "AntiochiaArchive. Açık kaynak, açık hafıza.",
    },
    pages: {
      backToHome: "← Ana Sayfaya Dön",
      history: {
        eyebrow: "Bir Şehrin Kronolojisi",
        title: "Antakya Tarihi",
        subtitle: "Asi Nehri boyunca yirmi beş asırlık Akdeniz medeniyetini, İpek Yolu mirasını ve yaşayan hafızayı keşfedin.",
        badge: "Tarihsel Kronoloji",
      },
      stories: {
        eyebrow: "Sözlü Tarih Arşivi",
        title: "Sesler ve Sözlü Tarihler",
        subtitle: "Kuşaklar boyunca aktarılan mahalle anlatılarını, avlu yaşamlarını ve kişisel tanıklıkları okuyun.",
        badge: "Sözlü Anlatılar",
      },
      structures: {
        eyebrow: "Mimari Miras",
        title: "Zamanın ve İnancın Taşları",
        subtitle: "Tarihi avlulu evleri, kaya kiliselerini, antik camileri, su kemerlerini ve dar taş sokakları keşfedin.",
        badge: "Mimari Belgeler",
      },
      beliefs: {
        eyebrow: "İnanç İklimi",
        title: "Ortak Mabetler ve Kutsal Takvimler",
        subtitle: "Asırlar süren dinler arası bir arada yaşamın, ortak bayram yemeklerinin ve kutsal mekanların mirası.",
        badge: "Ortak Miras",
      },
      music: {
        eyebrow: "Ses Arşivi",
        title: "Sesler, Makamlar ve İlahiler",
        subtitle: "Geleneksel Doğu makamlarını, dağ ilahilerini, bakırcılar çarşısının ritimlerini ve kentsel sesleri dinleyin.",
        badge: "Ses Kayıtları",
      },
      gallery: {
        eyebrow: "Görsel Arşiv",
        title: "Arşiv Galerisi",
        subtitle: "Antakya'nın yaşayan mirasına ait tarihi fotoğrafları, mimari çizimleri ve görsel belgeleri keşfedin.",
        badge: "Görsel Koleksiyon",
      },
      submissions: {
        badge: "Ziyaretçi Katkıları",
        title: "Ziyaretçi Katkıları",
        subtitle: "Topluluktan gelen hatıra, sözlü tarih ve görsel katkı formlarını inceleyin ve yönetin.",
        colName: "Katkı Sahibi",
        colEmail: "E-posta",
        colMessage: "Mesaj",
        colDate: "Tarih",
        colActions: "İşlemler",
        btnDelete: "Sil",
        btnRefresh: "Yenile",
        emptyState: "Henüz gösterilecek ziyaretçi katkısı bulunmamaktadır.",
        confirmDelete: "Bu katkı kaydını silmek istediğinizden emin misiniz?",
        deletedSuccess: "Katkı kaydı başarıyla silindi.",
      },
      cta: {
        eyebrow: "Hafızayı Yaşatın",
        title: "Paylaşmak istediğiniz bir anı, fotoğraf veya kayıt var mı?",
        body: "AntiochiaArchive topluluk katkılarıyla büyür. Antakya'nın yaşayan mirasını korumamıza yardımcı olun.",
        btn: "Katkıda Bulun",
      }
    },
    a11y: {
      skipLink:    "İçeriğe geç",
      openMenu:    "Gezinme menüsünü aç",
      closeMenu:   "Gezinme menüsünü kapat",
      langChooser: "Dil seç",
    },
  },

  ar: {
    dir: "rtl",
    nav: {
      home:       "الرئيسية",
      history:    "التاريخ",
      stories:    "الحكايات",
      structures: "المعالم",
      beliefs:    "المعتقدات",
      music:      "الموسيقى",
      gallery:    "المعرض",
    },
    actions: {
      contribute: "ساهم معنا",
      explore:    "استكشف الأرشيف",
      learnMore:  "اعرف أكثر",
    },
    searchPlaceholder: "ابحث...",
    filters: {
      all: "الكل",
      filterLabel: "تصفية الفئات",
      mosque: "المساجد",
      church: "الكنائس",
      synagogue: "المعابد",
      folk: "الأغاني الشعبية",
      hymn: "الترانيم المقدسة",
      courtyard: "منازل الفناء",
      mosaic: "الفسيفساء الرومانية",
      infrastructure: "الهندسة المائية"
    },
    hero: {
      eyebrow: "ذاكرة رقمية حيّة",
      titleHtml: "لكل ذكرى<br><em>مكان.</em>",
      subtitle:
        "أرشيف متعدد اللغات يحفظ أصوات أنطاكية وصورها وأغانيها وأماكنها المشتركة — للأجيال القادمة.",
      mapLabel: "أنطاكية ووادي العاصي",
      coordLabel: "الإحداثيات",
    },
    mission: {
      eyebrow: "مهمتنا",
      title: "تبقى المدينة حيّة ما دامت حكاياتها تُروى.",
      body:
        "يجمع AntiochiaArchive الشهادات والصور العائلية والتاريخ الشفهي والعمارة وتقاليد المعتقد والموسيقى في ذاكرة عامة متينة للأجيال القادمة. هذا مشروع بُني من أهل أنطاكية ولأهلها.",
      stat1: { value: "+٢٥٠٠", label: "سنة من التاريخ" },
      stat2: { value: "+١٢",    label: "مجتمع" },
      stat3: { value: "مفتوح",  label: "المصدر والوصول" },
    },
    historyTitle: "خمسة وعشرون قرناً من التراث",
    historyBody: "تأسست أنطاكية عام ٣٠٠ قبل الميلاد على ضفاف نهر العاصي، ونمت لتصبح واحدة من كبرى عواصم البحر الأبيض المتوسط القديم ومفترق طرق للتجارة والفلسفة.",
    structuresTitle: "حجارة الزمن والإيمان",
    structuresBody: "استكشف البيوت ذات الفناء التاريخية وأماكن العبادة القديمة والجسور الحجرية والأزقة الضيقة التي تشكل النسيج الحضري لأنطاكية.",
    beliefsTitle: "المقامات المشتركة والتقاويم المقدسة",
    beliefsBody: "تتميز أنطاكية بطابعها الروحي الفريد حيث تجاور المساجد والكنائس والمعابد، وتتشارك الأعياد والتقاليد.",
    musicTitle: "الألحان والمقامات والمشاهد الصوتية",
    musicBody: "تنسج موسيقى أنطاكية المقامات الشرقية والأرانيم الكنسية والأغاني الشعبية وألحان العود والناي.",
    historySection: {
      eyebrow: "تاريخ مدينة",
      title: "خمسة وعشرون قرناً من التراث",
      body: "تأسست أنطاكية عام ٣٠٠ قبل الميلاد على ضفاف نهر العاصي، ونمت لتصبح واحدة من كبرى عواصم البحر الأبيض المتوسط القديم ومفترق طرق للتجارة والفلسفة.",
      milestone1: {
        era: "٣٠٠ ق.م — العاصمة الرومانية",
        title: "ملتقى البحر الأبيض المتوسط القديم",
        body: "تأسست على يد سلوقس الأول، وأصبحت ثالث أكبر مدينة في الإمبراطورية الرومانية."
      },
      milestone2: {
        era: "العصور الوسطى والعثمانية",
        title: "فسيفساء الثقافات والتجارة",
        body: "عبر قرون من التحول، حافظت المدينة على مكانتها كمركز حيوي لتجارة الحرير والتعايش السلمي."
      },
      milestone3: {
        era: "الذاكرة الحديثة",
        title: "حفظ الهوية عبر الزمن",
        body: "اليوم يحمي AntiochiaArchive المعالم المادية والتراث غير المادي لتتبع الذاكرة الحية لأنطاكية."
      }
    },
    sections: {
      eyebrow: "مسارات الأرشيف",
      title:   "أربع طرق لدخول ذاكرة أنطاكية",
    },
    cards: {
      stories: {
        title: "الحكايات",
        body:  "ذكريات شخصية وتاريخ شفهي وروايات الأحياء تتناقلها الأجيال.",
      },
      structures: {
        title: "المعالم",
        body:  "بيوت وكنائس ومساجد ومعابد وشوارع وجسور ومعالم مدنية موثقة بالتفصيل.",
      },
      beliefs: {
        title: "المعتقدات",
        body:  "طقوس مشتركة وتقاويم مقدسة وثقافة طعام وتقاليد بين الجماعات تحدد روح المدينة.",
      },
      music: {
        title: "الموسيقى",
        body:  "أغانٍ وتسجيلات وآلات ومشاهد صوتية انتقلت عبر الأجيال والحدود.",
      },
    },
    readMore: "اقرأ القصة كاملة",
    fullStoryNotice: "سيكون النص الكامل هنا قريباً.",
    storyTitle1: "البيت الحجري القديم في شارع كورتولوش",
    storySummary1: "رواية شفهية للحياة عبر الأجيال داخل أحد البيوت التاريخية ذات الفناء في أنطاكية.",
    storyTitle2: "أصداء نواعير نهر العاصي",
    storySummary2: "ذكريات النواعير الخشبية القديمة على طول نهر العاصي التي كانت تسقي بساتين أنطاكية.",
    storyTitle3: "خبز وملح: موائد الأعياد المشتركة",
    storySummary3: "كيف كانت المجتمعات المجاورة تتجمع عبر التقاويم الدينية لتشارك أطباق الأعياد والخبز.",
    storiesSection: {
      eyebrow: "التاريخ الشفهي",
      title: "أصوات أنطاكية وذكرياتها",
      intro: "يحمل كل حي في أنطاكية ذكريات متوارثة عبر الأجيال من أحاديث الفناء إلى طرق التجارة القديمة.",
      readMore: "اقرأ القصة كاملة",
      fullStoryNotice: "سيكون النص الكامل هنا قريباً.",
      story1: {
        tag: "شارع كورتولوش",
        title: "البيت الحجري القديم في شارع كورتولوش",
        body: "رواية شفهية للحياة عبر الأجيال داخل أحد البيوت التاريخية ذات الفناء في أنطاكية.",
        ariaLabel: "اقرأ قصة البيت الحجري القديم في شارع كورتولوش"
      },
      story2: {
        tag: "نهر العاصي",
        title: "أصداء نواعير نهر العاصي",
        body: "ذكريات النواعير الخشبية القديمة على طول نهر العاصي التي كانت تسقي بساتين أنطاكية.",
        ariaLabel: "اقرأ قصة أصداء نواعير نهر العاصي"
      },
      story3: {
        tag: "البلدة القديمة",
        title: "خبز وملح: موائد الأعياد المشتركة",
        body: "كيف كانت المجتمعات المجاورة تتجمع عبر التقاويم الدينية لتشارك أطباق الأعياد والخبز.",
        ariaLabel: "اقرأ قصة خبز وملح: موائد الأعياد المشتركة"
      }
    },
    structuresSection: {
      eyebrow: "التراث المعماري",
      title: "حجارة الزمن والإيمان",
      body: "استكشف الفسيفساء الرومانية القديمة والمساجد التاريخية والكنائس الكهفية والبيوت التقليدية التي تشكل النسيج الحضري لأنطاكية.",
      struct1: {
        tag: "مسجد تاريخي",
        title: "جامع حبيب النجار",
        desc: "أحد أقدم المساجد في الأناضول، بُني على أسس قديمة ليصبح رمزاً للتراث الإسلامي."
      },
      struct2: {
        tag: "كنيسة الكهف",
        title: "كنيسة القديس بطرس",
        desc: "واحدة من أقدم أطلال العبادة المسيحية المنحوتة في منحدرات جبل استاورين."
      },
      struct3: {
        tag: "التراث الروماني",
        title: "الفسيفساء الرومانية",
        desc: "فسيفساء أرضية عالمية الشهرة تجسد الأساطير القديمة والفصول والمشاهد الطبيعية."
      },
      struct4: {
        tag: "النسيج الحضري",
        title: "بيوت أنطاكية التقليدية",
        desc: "منازل حجريّة تتميّز بأفنيتها الداخلية النضرة، وأشجار الحمضيات والأعمال الحديدية الزخرفية."
      }
    },
    beliefsSection: {
      eyebrow: "تراث التعايش والمعتقدات",
      title: "المعتقدات والمقامات المقدسة",
      body: "تتميز أنطاكية بطابعها الروحي الفريد حيث تجاور المساجد والكنائس والمعابد، وتتشارك التاريخ والتراث الروحي.",
      card1: {
        title: "مقام حبيب النجار",
        desc: "مقام مقدس يحظى باحترام المسلمين والمسيحيين، يُكرم حبيب النجار المذكور في سورة يس."
      },
      card2: {
        title: "كنيسة القديس بطرس الكهفية",
        desc: "مُنحوتة في جبل استاورين، وتُعتبر أول كنيسة كهفية في العالم حيث أُطلق اسم 'مسيحيين' لأول مرة."
      },
      card3: {
        title: "كنيس أنطاكية",
        desc: "مكان عبادة تاريخي يحفظ لفيات التوراة القديمة والذاكرة الحية للجالية اليهودية في أنطاكية."
      }
    },
    musicSection: {
      eyebrow: "التراث الموسيقي",
      title: "الألحان والمقامات والمشاهد الصوتية",
      body: "تنسج موسيقى أنطاكية المقامات الشرقية وأناشيد الزيارات والمقامات القديمة والأغاني الشعبية المحلية.",
      track1: {
        tag: "تراث قديم",
        title: "ألحان بلاد ما بين النهرين",
        desc: "بُنى مقامية قديمة وتقاليد صوتية عريقة تتردد أصداؤها عبر قرون من تاريخ المشرق."
      },
      track2: {
        tag: "أناشيد مقدسة",
        title: "ترانيم الزيارات وأناشيد النجف",
        desc: "أناشيد طقسية وألحان روحية تُنشَد في الأماكن المقدسة والمزارات والتجمعات الموسمية."
      },
      track3: {
        tag: "أغانٍ شعبية محليّة",
        title: "أغاني وأهازيج أنطاكية المحلية",
        desc: "أغاني شعبية صادقة وألحان الأفنية والمناسبات التي تعكس الإيقاع اليومي للحياة في أنطاكية."
      }
    },
    contribute: {
      eyebrow: "مساهمة مفتوحة",
      title:   "ساعد في بناء أرشيف دقيق لأنطاكية.",
      body:    "شارك حكاية أو صورة أو تسجيلاً أو وثيقة أو ذاكرة مكان. تُراجع كل مساهمة بعناية وبموافقة واضحة وسياق ثقافي.",
      formName:    "الاسم الكامل",
      formEmail:   "البريد الإلكتروني",
      formMessage: "مساهمتك أو رسالتك",
      formSubmit:  "إرسال المساهمة",
      success:     "شكراً لك! تم استلام مساهمتك بنجاح.",
      error:       "حدث خطأ. يرجى المحاولة مرة أخرى.",
      sending:     "جارٍ الإرسال…",
      requiredFields: "يرجى ملء جميع الحقول.",
    },
    footerAbout: "ذاكرة رقمية حية تحفظ أصوات أنطاكية وصورها وتاريخها الشفهي وأماكنها المشتركة.",
    openSource: "مشروع مفتوح المصدر يقوده المجتمع.",
    copyright: "AntiochiaArchive. مصدر مفتوح، ذاكرة مفتوحة.",
    footer: {
      tagline: "ذاكرة رقمية حيّة لأنطاكية.",
      connect: "التواصل",
      links: {
        about:   "حول المشروع",
        contact: "تواصل معنا",
        privacy: "الخصوصية",
        license: "الترخيص",
      },
      copyright: "AntiochiaArchive. مصدر مفتوح، ذاكرة مفتوحة.",
    },
    pages: {
      backToHome: "← العودة إلى الصفحة الرئيسية",
      history: {
        eyebrow: "تسلسل تاريخي للمدينة",
        title: "تاريخ أنطاكية",
        subtitle: "استكشف خمسة وعشرين قرناً من الحضارة المتوسطية وطرق الحرير والتراث الحي على ضفاف نهر العاصي.",
        badge: "تسلسل تاريخي",
      },
      stories: {
        eyebrow: "أرشيف التاريخ الشفهي",
        title: "أصوات وحكايات شفهية",
        subtitle: "اقرأ شهادات وتفاصيل الحياة في المنازل ذات الأفنية والذكريات المنقولة عبر الأجيال.",
        badge: "روايات شفهية",
      },
      structures: {
        eyebrow: "التراث المعماري",
        title: "حجارة الزمن والإيمان",
        subtitle: "اكتشف المنازل الحجرية ذات الأفنية، كنائس الكهوف، المساجد القديمة، القناوات والأزقة الضيقة.",
        badge: "وثائق معمارية",
      },
      beliefs: {
        eyebrow: "المشهد الروحي",
        title: "المقدسات المشتركة والتقاويم المقدسة",
        subtitle: "شهادة على قرون من التعايش بين الأديان ومشاركة موائد الأعياد والمواقع المبجلة.",
        badge: "تراث مشترك",
      },
      music: {
        eyebrow: "الأرشيف الصوتي",
        title: "الأصوات والمقامات والترانيم",
        subtitle: "استمع إلى المقامات الشرقية التقليدية، ترانيم الجبال، إيقاعات النحاسين والمشاهد الصوتية.",
        badge: "تسجيلات صوتية",
      },
      gallery: {
        eyebrow: "الأرشيف البصري",
        title: "معرض الأرشيف",
        subtitle: "استكشف الصور التاريخية والدراسات المعمارية والوثائق البصرية لتراث أنطاكية الحي.",
        badge: "مجموعة بصرية",
      },
      submissions: {
        badge: "مساهمات الزوار",
        title: "مساهمات الزوار",
        subtitle: "استكشف وراجع نماذج المساهمات الشفهية والبصرية والذكريات الواردة من المجتمع.",
        colName: "صاحب المساهمة",
        colEmail: "البريد الإلكتروني",
        colMessage: "الرسالة",
        colDate: "التاريخ",
        colActions: "الإجراءات",
        btnDelete: "حذف",
        btnRefresh: "تحديث",
        emptyState: "لا توجد مساهمات زوار للعرض حالياً.",
        confirmDelete: "هل أنت تأكد من رغبتك في حذف سجل المساهمة هذا؟",
        deletedSuccess: "تم حذف سجل المساهمة بنجاح.",
      },
      cta: {
        eyebrow: "احفظ الذاكرة",
        title: "هل لديك ذكرى أو صورة أو تسجيل ترغب في مشاركته؟",
        body: "ينمو AntiochiaArchive بمساهمات المجتمع. ساعدنا في الحفاظ على تراث أنطاكية الحي.",
        btn: "ساهم في الأرشيف",
      }
    },
    a11y: {
      skipLink:    "انتقل إلى المحتوى",
      openMenu:    "افتح قائمة التنقل",
      closeMenu:   "أغلق قائمة التنقل",
      langChooser: "اختر اللغة",
    },
  },
};
