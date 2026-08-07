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
    },
    actions: {
      contribute: "Contribute",
      explore:    "Explore the archive",
      learnMore:  "Learn more",
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
      body: "Discover the historic courtyard houses, ancient places of worship, stone bridges, and narrow streets that define Antioch's urban fabric.",
      struct1: {
        tag: "Cave Sanctuary",
        title: "St. Pierre Cave Church",
        desc: "One of the earliest Christian places of worship carved directly into the slopes of Mount Staurin."
      },
      struct2: {
        tag: "Historic Mosque",
        title: "Habib-i Neccar Mosque",
        desc: "Constructed on ancient foundations, representing Anatolia's earliest Islamic heritage site."
      },
      struct3: {
        tag: "Urban Fabric",
        title: "Traditional Courtyard Homes",
        desc: "Intricate stone residences featuring central courtyards, citrus trees, and decorative ironwork."
      },
      struct4: {
        tag: "Roman Engineering",
        title: "Aqueducts & Iron Gate",
        desc: "Engineering marvels that brought mountain spring water and fortified the mountain passes of Antioch."
      }
    },
    beliefsSection: {
      eyebrow: "Interfaith Heritage",
      title: "Shared Sanctuaries & Sacred Calendars",
      body: "Antioch's spiritual landscape is unique—a city where churches, mosques, and synagogues stand side-by-side, sharing holidays, traditions, and sacred spaces.",
      card1: {
        title: "Living Coexistence",
        desc: "Neighbors of Christian, Muslim, and Jewish heritages attending each other's celebration feasts for centuries."
      },
      card2: {
        title: "Shared Sacred Sites",
        desc: "Shrines and venerated hilltops visited together by different faiths seeking peace and reflection."
      },
      card3: {
        title: "Sacred Food Traditions",
        desc: "Hirisi, bayram breads, and holiday sweets prepared in communal copper cauldrons during festive seasons."
      }
    },
    musicSection: {
      eyebrow: "Musical Traditions",
      title: "Sounds, Melodies & Soundscapes",
      body: "The music of Antioch weaves together Levantine maqams, church hymns, local folk songs, and the resonant sounds of the Oud and Ney.",
      track1: {
        tag: "Folk Melody",
        title: "Longing Along the Orontes",
        desc: "Traditional modal song sung along the banks of the Orontes river during evening gatherings."
      },
      track2: {
        tag: "Sacred Chants",
        title: "Hymns of the Mountain",
        desc: "Aramaic and Arabic liturgical chants recorded in ancient stone chapels."
      },
      track3: {
        tag: "Urban Soundscape",
        title: "Old Bazaar Soundscape",
        desc: "Field recordings capturing coppersmith hammers, call to prayer, church bells, and street songs."
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
    },
    actions: {
      contribute: "Katkıda Bulun",
      explore:    "Arşivi keşfet",
      learnMore:  "Daha fazla",
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
      body: "Antakya'nın kent dokusunu oluşturan tarihi avlulu evleri, antik ibadethaneleri, taş köprüleri ve dar sokakları keşfedin.",
      struct1: {
        tag: "Mağara Mabedi",
        title: "St. Pierre Kilisesi",
        desc: "Staurin Dağı'nın kayalıklarına oyulmuş, Hristiyanlığın ilk ibadethanelerinden biri."
      },
      struct2: {
        tag: "Tarihi Camii",
        title: "Habib-i Neccar Camii",
        desc: "Anadolu'nun ilk cami yapılarından biri olarak kabul edilen tarihi ibadethane."
      },
      struct3: {
        tag: "Kent Dokusu",
        title: "Geleneksel Avlulu Evler",
        desc: "Turunç ağaçları, havuzlar ve taş işçiliğiyle bezeli tarihi Antakya evleri."
      },
      struct4: {
        tag: "Roma Mühendisliği",
        title: "Su Kemerleri ve Demirkapı",
        desc: "Dağ pınarlarını şehre taşıyan antik mühendislik harikası yapılar."
      }
    },
    beliefsSection: {
      eyebrow: "İnanç Kültürü",
      title: "Ortak Mabetler ve Kutsal Takvimler",
      body: "Antakya'nın inanç iklimi eşsizdir; camiler, kiliseler ve sinagoglar yan yana durur, bayramlar ve kutsal mekânlar ortaklaşa yaşatılır.",
      card1: {
        title: "Birlikte Yaşama Kültürü",
        desc: "Farklı inançlardan komşuların asırlardır birbiriyle paylaştığı bayram sofraları."
      },
      card2: {
        title: "Ortak Ziyaretgahlar",
        desc: "Huzur ve dua için farklı toplulukların birlikte gittiği tarihi makamlar."
      },
      card3: {
        title: "Kutsal Yemek Gelenekleri",
        desc: "Bayram dönemlerinde dev kazanlarda pişen hırısı ve ortak bayram çöreği gelenekleri."
      }
    },
    musicSection: {
      eyebrow: "Müzik Kültürü",
      title: "Sesler, Makamlar ve İlahiler",
      body: "Antakya müziği; Doğu makamlarını, kilise ilahilerini, yerel türküleri ve ud ile neyin yankılanan seslerini bir araya getirir.",
      track1: {
        tag: "Halk Ezgisi",
        title: "Asi Kıyısında Hasret",
        desc: "Akşam sohbetlerinde Asi nehri boyunca söylenen geleneksel makamlı türkü."
      },
      track2: {
        tag: "Kutsal İlahiler",
        title: "Dağın İlahileri",
        desc: "Tarihi taş şapellerde kaydedilmiş Süryanice ve Arapça ibadet ezgileri."
      },
      track3: {
        tag: "Ses Manzarası",
        title: "Eski Çarşı Sesleri",
        desc: "Bakırcı çekiçleri, ezan sesleri, kilise çanları ve sokak satıcılarının ritmi."
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
    },
    actions: {
      contribute: "ساهم معنا",
      explore:    "استكشف الأرشيف",
      learnMore:  "اعرف أكثر",
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
      body: "استكشف البيوت ذات الفناء التاريخية وأماكن العبادة القديمة والجسور الحجرية والأزقة الضيقة التي تشكل النسيج الحضري لأنطاكية.",
      struct1: {
        tag: "مغارة القديس بطرس",
        title: "كنيسة القديس بطرس",
        desc: "من أوائل أماكن العبادة المسيحية المنحوتة في جبل استاورين."
      },
      struct2: {
        tag: "جامع تاريخي",
        title: "جامع حبيب النجار",
        desc: "يُعتبر من أوائل المساجد المبنية في الأناضول."
      },
      struct3: {
        tag: "النسيج الحضري",
        title: "البيوت التقليدية ذات الفناء",
        desc: "بيوت حجريّة تمتاز بأفنيتها الداخلية وأشجار الحمضيات."
      },
      struct4: {
        tag: "الهندسة الرومانية",
        title: "القنوات والباب الحديدي",
        desc: "معالم هندسية قديمة جلب المياه العذبة وتحصين أنطاكية."
      }
    },
    beliefsSection: {
      eyebrow: "تراث التعايش والمعتقدات",
      title: "المقامات المشتركة والتقاويم المقدسة",
      body: "تتميز أنطاكية بطابعها الروحي الفريد حيث تجاور المساجد والكنائس والمعابد، وتتشارك الأعياد والتقاليد.",
      card1: {
        title: "ثقافة التعايش",
        desc: "جيران من مختلف الثقافات يتشاركون موائد الأعياد منذ قرون."
      },
      card2: {
        title: "المزارات المشتركة",
        desc: "مقامات تاريخية يزورها أبناء مختلف الجماعات للصلاة والسلام."
      },
      card3: {
        title: "تقاليد الطعام المقدس",
        desc: "إعداد الهريسة وخبز العيد في قدور نحاسية مشتركة."
      }
    },
    musicSection: {
      eyebrow: "التراث الموسيقي",
      title: "الألحان والمقامات والمشاهد الصوتية",
      body: "تنسج موسيقى أنطاكية المقامات الشرقية والأرانيم الكنسية والأغاني الشعبية وألحان العود والناي.",
      track1: {
        tag: "لحن شعبي",
        title: "حنين على ضفاف العاصي",
        desc: "أغنية مقامية تقليدية تُغنى على ضفاف نهر العاصي."
      },
      track2: {
        tag: "ترانيم مقدسة",
        title: "ترانيم الجبل",
        desc: "ترانيم سريانية وعربية مسجلة في كنائس حجرية قديمة."
      },
      track3: {
        tag: "مشهد صوتي",
        title: "أصوات السوق القديم",
        desc: "تسجيلات ميدانية لطرق النحاس والأذان وأجراس الكنائس."
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
    a11y: {
      skipLink:    "انتقل إلى المحتوى",
      openMenu:    "افتح قائمة التنقل",
      closeMenu:   "أغلق قائمة التنقل",
      langChooser: "اختر اللغة",
    },
  },
};
