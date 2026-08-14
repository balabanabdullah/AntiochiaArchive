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
      communities: "Communities",
      places:      "Places",
      music:      "Music",
      gallery:    "Gallery",
      methodology: "Methodology",
    },
    actions: {
      contribute: "Contribute",
      explore:    "Explore the archive",
      learnMore:  "Learn more",
      viewRecord: "View record",
      viewAll:    "View all",
    },
    searchPlaceholder: "Search...",
    backToTop: "Back to Top",
    archiveLoading: "Loading archive data…",
    archiveLoadError: "Archive data could not be loaded.",
    archiveRetry: "Try Again",
    provenance: {
      sources: "Sources",
      addSource: "Add Source",
      removeSource: "Remove Source",
      imageInformation: "Image Information",
      imageSource: "Image Source",
      photographerAuthor: "Photographer / Author",
      license: "License",
      date: "Date",
      originalSource: "Original Source",
      accessDate: "Access Date",
      rightsNote: "Rights Note",
      aiGenerated: "AI-generated",
      photoBy: "Photo",
      sourceLabel: "Source",
      aiImageLabel: "Illustrative image — generated with artificial intelligence.",
    },
    detail: {
      aboutRecord: "About this record",
      backToCollection: "Back to collection",
      viewOriginal: "View original source",
      imagePending: "Image pending archival review",
      relatedEntities: "Related records",
    },
    notFound: {
      title: "This archive path could not be found.",
      body: "The record may have moved, or the address may be incomplete.",
      home: "Return home",
      archive: "Explore the archive",
    },
    filters: {
      all: "All",
      filterLabel: "Filter by Category",
      mosque: "Mosques",
      church: "Churches",
      synagogue: "Synagogues",
      shrine: "Shrines",
      folk: "Folk Melodies",
      hymn: "Sacred Hymns",
      courtyard: "Courtyard Homes",
      mosaic: "Roman Mosaics",
      infrastructure: "Water & Engineering",
      showAll: "Show all",
      showLess: "Show less",
      group: {
        periods: "Historical Periods",
        events: "Events",
        belief: "Belief & Culture",
        life: "Life & Place",
        other: "Other",
      },
    },
    hero: {
      eyebrow: "A living digital memory",
      titleHtml: "Every memory<br>has a <em>place.</em>",
      subtitle:
        "A multilingual archive preserving the voices, images, songs, and shared places of Antioch — for generations to come.",
      mapLabel: "Antioch & the Orontes Valley",
      coordLabel: "Coordinates",
      imageSourceLabel: "Source",
      imageRightsLabel: "Rights",
      imageRights: "Public Domain / No known copyright restrictions",
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
      eyebrow: "Belief Traditions",
      title: "Belief Traditions of Antioch",
      body: "Sunni Islam, the Arab Alawite / Nusayri tradition, Judaism, Greek Orthodox Christianity, and the region's other living belief traditions—documented alongside the interfaith heritage that binds them.",
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
    communitiesSection: {
      eyebrow: "Cultural Memory",
      title: "Communities of Antioch",
      body: "Documented cultural, ethnic, and religious communities of Antakya and Hatay, their language, history, and living identity.",
    },
    placesSection: {
      eyebrow: "Geography of Memory",
      title: "Places of Antioch",
      body: "Documented towns, districts, and landmarks of Antakya and Hatay province, their toponymy, and their place in the region's memory.",
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
      body:    "Use this form to send a written memory or archive note. Media uploads and location collection are not enabled in v1.0.",
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
        title: "Belief Traditions of Antioch",
        subtitle: "Sunni Islam, Arab Alawite / Nusayri tradition, Judaism, Greek Orthodox Christianity, and the interfaith heritage of Antakya.",
        badge: "Belief Traditions",
      },
      communities: {
        eyebrow: "Cultural Memory",
        title: "Communities of Antioch",
        subtitle: "Documented cultural, ethnic, and religious communities of Antakya and Hatay, their language, history, and living identity.",
        badge: "Community Archive",
      },
      places: {
        eyebrow: "Geography of Memory",
        title: "Places of Antioch",
        subtitle: "Documented towns, districts, and landmarks of Antakya and Hatay province, their toponymy, and their place in the region's memory.",
        badge: "Geographic Archive",
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
      methodology: {
        title: "Editorial & Media Methodology",
        subtitle: "How AntiochiaArchive qualifies cultural claims, reviews media provenance, and preserves uncertainty.",
        badge: "Project Practice",
        intro: "AntiochiaArchive is an independent digital cultural-memory project. Its records are multilingual and may combine documented places, community memory, and carefully qualified traditions.",
        evidenceTitle: "Records and evidence",
        evidenceBody: "Record-level historical sources are published only when they have been reviewed. Image provenance describes the image itself and is not treated automatically as evidence for every cultural claim in a record.",
        mediaTitle: "Media rights and provenance",
        mediaBody: "Published images retain available source, author, license, access-date, and rights notes. Unclear-rights or visibly watermarked images are held from publication. Public-domain and Creative Commons statements follow the reviewed source record and are not legal advice.",
        uncertaintyTitle: "Uncertainty and living tradition",
        uncertaintyBody: "Traditional and local religious beliefs are presented as tradition, not as independently verified historical fact. Artificially generated imagery, if ever used, must be labeled clearly and never presented as archival evidence.",
        correctionsTitle: "Corrections and editorial review",
        correctionsBody: "Corrections and additional evidence can be incorporated after editorial review. AntiochiaArchive does not claim university, museum, government, or academic peer-review affiliation.",
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
      contributions: {
        badge: "Community Contributions",
        title: "Shared Memories & Contributions",
        subtitle: "Explore place memories, family accounts, and testimonies preserved by the community.",
        countLabel: "Contributions",
        emptyState: "No community contributions shared yet.",
        by: "Contributor:",
        mapTitle: "Contributions Map",
        mapDesc: "Explore the geographic distribution of shared memories and testimonies from the community.",
      },
      cta: {
        eyebrow: "Preserve the Memory",
        title: "Do you have a memory or archive note to share?",
        body: "Send a written contribution through the current form. Media uploads are not enabled in v1.0.",
        btn: "Contribute to Archive",
      }
    },
    a11y: {
      skipLink:    "Skip to content",
      openMenu:    "Open navigation menu",
      closeMenu:   "Close navigation menu",
      langChooser: "Choose language",
      searchArchive: "Search archive",
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
      communities: "Topluluklar",
      places:      "Yerler",
      music:      "Müzik",
      gallery:    "Galeri",
      methodology: "Yöntem",
    },
    actions: {
      contribute: "Katkıda Bulun",
      explore:    "Arşivi keşfet",
      learnMore:  "Daha fazla",
      viewRecord: "Kaydı görüntüle",
      viewAll:    "Tümünü gör",
    },
    searchPlaceholder: "Bir şey ara...",
    backToTop: "Yukarı Çık",
    archiveLoading: "Arşiv verileri yükleniyor…",
    archiveLoadError: "Arşiv verileri yüklenemedi.",
    archiveRetry: "Tekrar Dene",
    provenance: {
      sources: "Kaynaklar",
      addSource: "Kaynak Ekle",
      removeSource: "Kaynağı Kaldır",
      imageInformation: "Görsel Bilgileri",
      imageSource: "Görsel Kaynağı",
      photographerAuthor: "Fotoğrafçı / Yazar",
      license: "Lisans",
      date: "Tarih",
      originalSource: "Özgün Kaynak",
      accessDate: "Erişim Tarihi",
      rightsNote: "Haklar Notu",
      aiGenerated: "Yapay zekâ ile oluşturulmuş",
      photoBy: "Fotoğraf",
      sourceLabel: "Kaynak",
      aiImageLabel: "Temsili görsel — yapay zekâ ile oluşturulmuştur.",
    },
    detail: {
      aboutRecord: "Bu kayıt hakkında",
      backToCollection: "Koleksiyona dön",
      viewOriginal: "Özgün kaynağı görüntüle",
      imagePending: "Görsel arşiv incelemesinde",
      relatedEntities: "İlgili kayıtlar",
    },
    notFound: {
      title: "Bu arşiv yolu bulunamadı.",
      body: "Kayıt taşınmış veya adres eksik olabilir.",
      home: "Ana sayfaya dön",
      archive: "Arşivi keşfet",
    },
    filters: {
      all: "Tümü",
      filterLabel: "Kategori Filtrele",
      mosque: "Camiler",
      church: "Kiliseler",
      synagogue: "Havralar",
      shrine: "Ziyaretgâhlar",
      folk: "Türküler & Ezgiler",
      hymn: "İlahiler",
      courtyard: "Avlulu Evler",
      mosaic: "Roma Mozaikleri",
      infrastructure: "Su & Roma Mühendisliği",
      showAll: "Tümünü Göster",
      showLess: "Daha Az Göster",
      group: {
        periods: "Tarihî Dönemler",
        events: "Olaylar",
        belief: "İnanç / Kültür",
        life: "Yaşam / Mekân",
        other: "Diğer",
      },
    },
    hero: {
      eyebrow: "Yaşayan bir dijital hafıza",
      titleHtml: "Her hatıranın<br>bir <em>yeri vardır.</em>",
      subtitle:
        "Antakya'nın seslerini, görüntülerini, şarkılarını ve ortak mekânlarını gelecek nesiller için koruyan çok dilli bir arşiv.",
      mapLabel: "Antakya ve Asi Vadisi",
      coordLabel: "Koordinatlar",
      imageSourceLabel: "Kaynak",
      imageRightsLabel: "Haklar",
      imageRights: "Kamu malı / Bilinen telif hakkı kısıtlaması yok",
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
      eyebrow: "İnanç Gelenekleri",
      title: "Antakya'nın İnanç Gelenekleri",
      body: "Sünni İslam, Arap Alevi/Nusayri geleneği, Musevilik, Rum Ortodoks Hristiyanlığı ve bölgenin diğer yaşayan inanç gelenekleri — onları birbirine bağlayan ortak mirasla birlikte belgelenir.",
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
    communitiesSection: {
      eyebrow: "Kültürel Hafıza",
      title: "Antakya'nın Toplulukları",
      body: "Antakya ve Hatay'ın belgelenmiş kültürel, etnik ve dini toplulukları; dilleri, tarihleri ve yaşayan kimlikleri.",
    },
    placesSection: {
      eyebrow: "Hafızanın Coğrafyası",
      title: "Antakya'nın Yerleri",
      body: "Antakya ve Hatay ilindeki belgelenmiş kasabalar, ilçeler ve simge yapılar; yer adları ve bölge hafızasındaki yerleri.",
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
      body:    "Bu formu yazılı bir anı veya arşiv notu göndermek için kullanın. v1.0 sürümünde medya yükleme ve konum toplama etkin değildir.",
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
        title: "Antakya'nın İnanç Gelenekleri",
        subtitle: "Sünni İslam, Arap Alevi/Nusayri geleneği, Musevilik, Rum Ortodoks Hristiyanlığı ve Antakya'nın dinler arası mirası.",
        badge: "İnanç Gelenekleri",
      },
      communities: {
        eyebrow: "Kültürel Hafıza",
        title: "Antakya'nın Toplulukları",
        subtitle: "Antakya ve Hatay'ın belgelenmiş kültürel, etnik ve dini toplulukları; dilleri, tarihleri ve yaşayan kimlikleri.",
        badge: "Topluluk Arşivi",
      },
      places: {
        eyebrow: "Hafızanın Coğrafyası",
        title: "Antakya'nın Yerleri",
        subtitle: "Antakya ve Hatay ilindeki belgelenmiş kasabalar, ilçeler ve simge yapılar; yer adları ve bölge hafızasındaki yerleri.",
        badge: "Coğrafi Arşiv",
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
      methodology: {
        title: "Editoryal ve Medya Yöntemi",
        subtitle: "AntiochiaArchive kültürel iddiaları nasıl nitelendirir, görsel kökenini nasıl inceler ve belirsizliği nasıl korur.",
        badge: "Proje Uygulaması",
        intro: "AntiochiaArchive bağımsız bir dijital kültürel hafıza projesidir. Kayıtları çok dillidir; belgelenmiş mekânları, toplumsal hafızayı ve dikkatle nitelendirilmiş gelenekleri bir araya getirebilir.",
        evidenceTitle: "Kayıtlar ve kanıt",
        evidenceBody: "Kayıt düzeyindeki tarihsel kaynaklar yalnızca incelendikten sonra yayımlanır. Görsel köken bilgisi görselin kendisini açıklar; kayıttaki her kültürel iddianın otomatik kanıtı sayılmaz.",
        mediaTitle: "Medya hakları ve köken bilgisi",
        mediaBody: "Yayımlanan görseller mevcut kaynak, yazar, lisans, erişim tarihi ve hak notlarını korur. Hakları belirsiz veya filigranlı görseller yayımlanmaz. Kamu malı ve Creative Commons ifadeleri incelenen kaynak kaydına dayanır ve hukuki danışmanlık değildir.",
        uncertaintyTitle: "Belirsizlik ve yaşayan gelenek",
        uncertaintyBody: "Geleneksel ve yerel dini inanışlar, bağımsız olarak doğrulanmış tarihsel gerçekler olarak değil, gelenek olarak sunulur. Yapay olarak üretilmiş görseller kullanılırsa açıkça etiketlenir ve arşiv kanıtı olarak sunulmaz.",
        correctionsTitle: "Düzeltmeler ve editoryal inceleme",
        correctionsBody: "Düzeltmeler ve ek kanıtlar editoryal incelemenin ardından eklenebilir. AntiochiaArchive üniversite, müze, kamu kurumu veya akademik hakemlik bağlantısı iddia etmez.",
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
      contributions: {
        badge: "Topluluk Katkıları",
        title: "Paylaşılan Hatıralar & Katkılar",
        subtitle: "Topluluk tarafından korunan mekan anılarını, sözlü tarih anlatımlarını ve görselleri keşfedin.",
        countLabel: "Katkı Sayısı",
        emptyState: "Henüz katkı gönderilmedi.",
        by: "Katkıda Bulunan:",
        mapTitle: "Katkı Haritası",
        mapDesc: "Topluluktan paylaşılan anıların ve tanıklıkların coğrafi dağılımını keşfedin.",
      },
      cta: {
        eyebrow: "Hafızayı Yaşatın",
        title: "Paylaşmak istediğiniz bir anı veya arşiv notu var mı?",
        body: "Mevcut form üzerinden yazılı katkı gönderin. v1.0 sürümünde medya yükleme etkin değildir.",
        btn: "Katkıda Bulun",
      }
    },
    a11y: {
      skipLink:    "İçeriğe geç",
      openMenu:    "Gezinme menüsünü aç",
      closeMenu:   "Gezinme menüsünü kapat",
      langChooser: "Dil seç",
      searchArchive: "Arşivde ara",
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
      communities: "المجتمعات",
      places:      "الأماكن",
      music:      "الموسيقى",
      gallery:    "المعرض",
      methodology: "المنهجية",
    },
    actions: {
      contribute: "ساهم معنا",
      explore:    "استكشف الأرشيف",
      learnMore:  "اعرف أكثر",
      viewRecord: "عرض السجل",
      viewAll:    "عرض الكل",
    },
    searchPlaceholder: "ابحث...",
    backToTop: "العودة إلى الأعلى",
    archiveLoading: "جارٍ تحميل بيانات الأرشيف…",
    archiveLoadError: "تعذر تحميل بيانات الأرشيف.",
    archiveRetry: "إعادة المحاولة",
    provenance: {
      sources: "المصادر",
      addSource: "إضافة مصدر",
      removeSource: "إزالة المصدر",
      imageInformation: "معلومات الصورة",
      imageSource: "مصدر الصورة",
      photographerAuthor: "المصور / المؤلف",
      license: "الترخيص",
      date: "التاريخ",
      originalSource: "المصدر الأصلي",
      accessDate: "تاريخ الوصول",
      rightsNote: "ملاحظة الحقوق",
      aiGenerated: "مولّدة بالذكاء الاصطناعي",
      photoBy: "تصوير",
      sourceLabel: "المصدر",
      aiImageLabel: "صورة توضيحية — تم إنشاؤها بالذكاء الاصطناعي.",
    },
    detail: {
      aboutRecord: "حول هذا السجل",
      backToCollection: "العودة إلى المجموعة",
      viewOriginal: "عرض المصدر الأصلي",
      imagePending: "الصورة قيد المراجعة الأرشيفية",
      relatedEntities: "سجلات ذات صلة",
    },
    notFound: {
      title: "تعذر العثور على هذا المسار في الأرشيف.",
      body: "ربما نُقل السجل أو كان العنوان غير مكتمل.",
      home: "العودة إلى الرئيسية",
      archive: "استكشف الأرشيف",
    },
    filters: {
      all: "الكل",
      filterLabel: "تصفية الفئات",
      mosque: "المساجد",
      church: "الكنائس",
      synagogue: "المعابد",
      shrine: "المزارات",
      folk: "الأغاني الشعبية",
      hymn: "الترانيم المقدسة",
      courtyard: "منازل الفناء",
      mosaic: "الفسيفساء الرومانية",
      infrastructure: "الهندسة المائية",
      showAll: "عرض الكل",
      showLess: "عرض أقل",
      group: {
        periods: "العصور التاريخية",
        events: "الأحداث",
        belief: "العقيدة والثقافة",
        life: "الحياة والمكان",
        other: "أخرى",
      },
    },
    hero: {
      eyebrow: "ذاكرة رقمية حيّة",
      titleHtml: "لكل ذكرى<br><em>مكان.</em>",
      subtitle:
        "أرشيف متعدد اللغات يحفظ أصوات أنطاكية وصورها وأغانيها وأماكنها المشتركة — للأجيال القادمة.",
      mapLabel: "أنطاكية ووادي العاصي",
      coordLabel: "الإحداثيات",
      imageSourceLabel: "المصدر",
      imageRightsLabel: "الحقوق",
      imageRights: "الملكية العامة / لا توجد قيود حقوق نشر معروفة",
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
      eyebrow: "تقاليد المعتقد",
      title: "تقاليد المعتقد في أنطاكية",
      body: "الإسلام السني، والتقليد العلوي العربي/النصيري، واليهودية، والمسيحية الأرثوذكسية اليونانية، وتقاليد المعتقد الحية الأخرى في المنطقة — موثقة إلى جانب التراث المشترك بين الأديان الذي يجمعها.",
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
    communitiesSection: {
      eyebrow: "الذاكرة الثقافية",
      title: "مجتمعات أنطاكية",
      body: "المجتمعات الثقافية والعرقية والدينية الموثقة في أنطاكية وهاتاي، بلغاتها وتاريخها وهويتها الحية.",
    },
    placesSection: {
      eyebrow: "جغرافيا الذاكرة",
      title: "أماكن أنطاكية",
      body: "البلدات والأحياء والمعالم الموثقة في أنطاكية ومحافظة هاتاي، وأسماؤها الجغرافية ومكانتها في ذاكرة المنطقة.",
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
      body:    "استخدم هذا النموذج لإرسال ذكرى مكتوبة أو ملاحظة أرشيفية. تحميل الوسائط وجمع الموقع غير متاحين في الإصدار 1.0.",
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
        title: "تقاليد المعتقد في أنطاكية",
        subtitle: "الإسلام السني، التقليد العلوي العربي/النصيري، اليهودية، المسيحية الأرثوذكسية اليونانية، والتراث المشترك بين الأديان في أنطاكية.",
        badge: "تقاليد المعتقد",
      },
      communities: {
        eyebrow: "الذاكرة الثقافية",
        title: "مجتمعات أنطاكية",
        subtitle: "المجتمعات الثقافية والعرقية والدينية الموثقة في أنطاكية وهاتاي، بلغاتها وتاريخها وهويتها الحية.",
        badge: "أرشيف المجتمعات",
      },
      places: {
        eyebrow: "جغرافيا الذاكرة",
        title: "أماكن أنطاكية",
        subtitle: "البلدات والأحياء والمعالم الموثقة في أنطاكية ومحافظة هاتاي، وأسماؤها الجغرافية ومكانتها في ذاكرة المنطقة.",
        badge: "الأرشيف الجغرافي",
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
      methodology: {
        title: "منهجية التحرير والوسائط",
        subtitle: "كيف يؤهّل AntiochiaArchive الادعاءات الثقافية ويراجع مصدر الصور ويحافظ على مواضع عدم اليقين.",
        badge: "ممارسة المشروع",
        intro: "AntiochiaArchive مشروع مستقل للذاكرة الثقافية الرقمية. سجلاته متعددة اللغات وقد تجمع بين الأماكن الموثقة والذاكرة المجتمعية والتقاليد المصاغة بحذر.",
        evidenceTitle: "السجلات والأدلة",
        evidenceBody: "لا تُنشر المصادر التاريخية على مستوى السجل إلا بعد مراجعتها. تصف بيانات مصدر الصورة الصورة نفسها، ولا تُعد تلقائياً دليلاً على كل ادعاء ثقافي في السجل.",
        mediaTitle: "حقوق الوسائط ومصدرها",
        mediaBody: "تحتفظ الصور المنشورة بما يتاح من المصدر والمؤلف والترخيص وتاريخ الوصول وملاحظات الحقوق. لا تُنشر الصور ذات الحقوق غير الواضحة أو العلامات المائية. تستند إشارات الملكية العامة والمشاع الإبداعي إلى سجل المصدر المراجع وليست استشارة قانونية.",
        uncertaintyTitle: "عدم اليقين والتقاليد الحية",
        uncertaintyBody: "تُعرض المعتقدات الدينية التقليدية والمحلية بوصفها تقاليد، لا حقائق تاريخية جرى التحقق منها بصورة مستقلة. وإذا استُخدمت صور مولدة اصطناعياً مستقبلاً فيجب تمييزها بوضوح وعدم تقديمها دليلاً أرشيفياً.",
        correctionsTitle: "التصحيحات والمراجعة التحريرية",
        correctionsBody: "يمكن إدراج التصحيحات والأدلة الإضافية بعد المراجعة التحريرية. لا يدّعي AntiochiaArchive انتساباً إلى جامعة أو متحف أو جهة حكومية أو مراجعة أكاديمية محكّمة.",
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
      contributions: {
        badge: "مساهمات المجتمع",
        title: "الذكريات والمساهمات المشتركة",
        subtitle: "استكشف ذكريات المكان والشهادات التاريخية المحفوظة من قبل المجتمع.",
        countLabel: "عدد المساهمات",
        emptyState: "لم يتم مشاركة أي مساهمات حتى الآن.",
        by: "بواسطة:",
        mapTitle: "خريطة المساهمات",
        mapDesc: "استكشف التوزيع الجغرافي للذكريات والشهادات المشتركة من المجتمع.",
      },
      cta: {
        eyebrow: "احفظ الذاكرة",
        title: "هل لديك ذكرى أو ملاحظة أرشيفية ترغب في مشاركتها؟",
        body: "أرسل مساهمة مكتوبة عبر النموذج الحالي. تحميل الوسائط غير متاح في الإصدار 1.0.",
        btn: "ساهم في الأرشيف",
      }
    },
    a11y: {
      skipLink:    "انتقل إلى المحتوى",
      openMenu:    "افتح قائمة التنقل",
      closeMenu:   "أغلق قائمة التنقل",
      langChooser: "اختر اللغة",
      searchArchive: "ابحث في الأرشيف",
    },
  },
};
