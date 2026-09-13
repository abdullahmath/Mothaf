/**
 * Seed content for the first experience.
 *
 * IMPORTANT — this copy is illustrative scaffolding, not verified curatorial
 * text. It is written to be plausible and general rather than to assert
 * specific dates, measurements or attributions, precisely because a heritage
 * platform must not put invented facts in front of visitors under a cultural
 * authority's name. Everything here is editable in the admin, and the
 * production checklist requires it to be replaced with text approved by the
 * responsible authority before the destination is published.
 *
 * Its job is to exercise the engine: a destination, a multi-scene tour, a
 * connected navigation graph, hotspots of several action types, points of
 * interest, a festival with a schedule, and complete Arabic and English
 * translations so RTL is populated from the first run.
 */

export type SeedTranslation = { locale: 'ar' | 'en'; [key: string]: string };

export const DESTINATION = {
  slug: 'roman-theatre-jableh',
  defaultLocale: 'ar' as const,
  countryCode: 'SY',
  latitude: 35.3606,
  longitude: 35.9256,
  /**
   * Real photogrammetry scan of the actual theatre, by Iconem, from their
   * "REVIVAL" project with Syrian archaeologists:
   * https://sketchfab.com/3d-models/jableh-theatre-6adbb6547e484b66b65790f34e5aecfc
   * Not downloadable and not openly licensed, so it is embedded via
   * Sketchfab's own player rather than copied — see Model3DEmbed.
   */
  sketchfabModelId: '6adbb6547e484b66b65790f34e5aecfc',
  translations: [
    {
      locale: 'ar' as const,
      name: 'المسرح الروماني في جبلة',
      tagline: 'مدرّج من العصر الروماني على ساحل المتوسط',
      summary:
        'أحد أبرز المسارح الرومانية في الساحل السوري، يقع في قلب مدينة جبلة، ولا يزال يحتفظ بملامح تخطيطه الأصلي من مدرّج وأوركسترا ومداخل مقببة.',
      description:
        'يقع المسرح في وسط مدينة جبلة على الساحل السوري، وقد شُيّد في العهد الروماني ليكون فضاءً للعروض والتجمعات العامة.\n\nيتكوّن المسرح من مدرّج نصف دائري يحيط بساحة الأوركسترا، وتصل إليه مداخل مقببة كانت تسمح بدخول الجمهور وخروجه بانسيابية. وقد خضع الموقع لأعمال ترميم وصيانة على مراحل.\n\nهذه الجولة الافتراضية تتيح استكشاف الموقع والتنقّل بين مواضعه الرئيسية والاطلاع على معلومات عن كل جزء منه.',
      historicalContext:
        'المسارح الرومانية لم تكن مبانيَ للعرض فحسب، بل كانت أدوات هندسية دقيقة: تُصمَّم المدرّجات بزوايا محسوبة لتوزيع خطوط النظر، وتُستثمر الأشكال نصف الدائرية في نقل الصوت من الخشبة إلى أعلى صفوف الجلوس دون وسائل تضخيم.\n\nملاحظة: النصوص التاريخية المعروضة هنا نصوص تجريبية أولية، ويجب أن تُراجَع وتُعتمد من الجهة الثقافية المسؤولة قبل النشر.',
    },
    {
      locale: 'en' as const,
      name: 'Roman Theatre of Jableh',
      tagline: 'A Roman-period theatre on the Mediterranean coast',
      summary:
        'One of the most prominent Roman theatres on the Syrian coast, in the centre of Jableh, still showing the outline of its original plan: the tiered seating, the orchestra, and the vaulted entrances.',
      description:
        'The theatre stands in the centre of Jableh on the Syrian coast, built during the Roman period as a space for performance and public assembly.\n\nIt is arranged as a semicircular bank of seating wrapped around an orchestra, reached through vaulted passages that let audiences enter and leave without crossing the performance floor. The site has been conserved and partly restored in stages.\n\nThis virtual tour lets you move between the main positions in the theatre and read about each part of it.',
      historicalContext:
        'A Roman theatre was not only a building for performance but a precise piece of engineering. The rake of the seating was set so that sightlines cleared the rows in front, and the semicircular form carried an unamplified voice from the stage to the highest tier.\n\nNote: the historical text shown here is provisional scaffolding and must be reviewed and approved by the responsible cultural authority before publication.',
    },
  ],
};

export const POI_CATEGORIES = [
  {
    slug: 'architecture',
    color: '#4FB3A0',
    icon: 'column',
    translations: [
      { locale: 'ar' as const, name: 'عناصر معمارية' },
      { locale: 'en' as const, name: 'Architecture' },
    ],
  },
  {
    slug: 'performance',
    color: '#E0A03C',
    icon: 'stage',
    translations: [
      { locale: 'ar' as const, name: 'فضاءات العرض' },
      { locale: 'en' as const, name: 'Performance spaces' },
    ],
  },
  {
    slug: 'visitor',
    color: '#8D9AA6',
    icon: 'marker',
    translations: [
      { locale: 'ar' as const, name: 'معلومات الزائر' },
      { locale: 'en' as const, name: 'Visitor information' },
    ],
  },
];

export const POIS = [
  {
    slug: 'cavea',
    category: 'architecture',
    tags: ['seating', 'cavea'],
    translations: [
      {
        locale: 'ar' as const,
        title: 'المدرّج (الكافيا)',
        shortDescription: 'صفوف الجلوس نصف الدائرية التي تحيط بالأوركسترا.',
        description:
          'المدرّج هو بنية الجلوس المتدرّجة التي تحيط بساحة الأوركسترا على شكل نصف دائرة. ترتفع الصفوف تدريجياً كلما ابتعدت عن المركز، بما يتيح لكل صف رؤية الخشبة فوق رؤوس الصفوف الأمامية.',
        historicalInfo:
          'كان المدرّج يُقسَم أفقياً بممرات وعمودياً بسلالم، فتنتج قطاعات إسفينية تسهّل الحركة وتنظّم توزيع الجمهور.',
      },
      {
        locale: 'en' as const,
        title: 'The cavea (seating)',
        shortDescription: 'The semicircular tiers of seating wrapped around the orchestra.',
        description:
          'The cavea is the banked seating that curves around the orchestra in a half circle. Each row sits higher than the one in front, so that every seat looks over the heads below it and onto the stage.',
        historicalInfo:
          'The cavea was divided horizontally by walkways and vertically by stairways, producing wedge-shaped blocks that made it possible to fill and empty a large audience in an orderly way.',
      },
    ],
  },
  {
    slug: 'orchestra',
    category: 'performance',
    tags: ['orchestra'],
    translations: [
      {
        locale: 'ar' as const,
        title: 'الأوركسترا',
        shortDescription: 'الساحة نصف الدائرية بين الخشبة وصفوف الجلوس.',
        description:
          'الأوركسترا هي المساحة المستوية نصف الدائرية الواقعة بين خشبة المسرح وأول صفوف المدرّج. كانت تُستخدم للجوقة وللعروض، وفي بعض المسارح خُصّصت مقاعدها الأمامية لكبار الحاضرين.',
        historicalInfo:
          'شكل الأوركسترا نصف الدائري يسهم في انعكاس الصوت نحو صفوف الجلوس، وهو جزء من المعالجة الصوتية للمبنى وليس عنصراً زخرفياً.',
      },
      {
        locale: 'en' as const,
        title: 'The orchestra',
        shortDescription: 'The semicircular floor between the stage and the first row of seats.',
        description:
          'The orchestra is the flat semicircular area between the stage building and the lowest tier of seating. It was used by the chorus and for performance, and in many theatres its front seats were reserved for dignitaries.',
        historicalInfo:
          'The semicircular floor reflects sound up into the seating. It is part of the building’s acoustic design rather than a decorative choice.',
      },
    ],
  },
  {
    slug: 'stage-building',
    category: 'performance',
    tags: ['stage', 'scaenae'],
    translations: [
      {
        locale: 'ar' as const,
        title: 'بناء الخشبة',
        shortDescription: 'الواجهة المعمارية التي تشكّل خلفية العرض.',
        description:
          'يقع بناء الخشبة في مواجهة المدرّج، وكان يشكّل الخلفية المعمارية للعرض. تتضمّن واجهته عادةً مداخل ومحاريب وعناصر معمارية تعطي عمقاً بصرياً للمشهد.',
        historicalInfo:
          'إضافةً إلى دوره البصري، كان الجدار الخلفي المرتفع يعمل كسطح عاكس يوجّه الصوت نحو الجمهور بدل أن يتبدّد خلف الخشبة.',
      },
      {
        locale: 'en' as const,
        title: 'The stage building',
        shortDescription: 'The architectural facade that formed the backdrop to a performance.',
        description:
          'The stage building faces the seating and formed the permanent backdrop to every performance. Its facade typically carried doorways, niches and applied architectural orders that gave the scene visual depth.',
        historicalInfo:
          'Beyond its visual role, the tall rear wall acted as a reflector, directing sound back towards the audience instead of letting it escape behind the stage.',
      },
    ],
  },
  {
    slug: 'vaulted-entrances',
    category: 'architecture',
    tags: ['entrance', 'vomitoria'],
    translations: [
      {
        locale: 'ar' as const,
        title: 'المداخل المقببة',
        shortDescription: 'ممرات مقببة تنقل الجمهور إلى صفوف الجلوس.',
        description:
          'المداخل المقببة ممرات تمر تحت المدرّج وتفتح على صفوف الجلوس. تتيح للجمهور الوصول إلى مواقعه دون عبور ساحة العرض.',
        historicalInfo:
          'يسمّى هذا النوع من الممرات «فوميتوريا»، والتسمية تصف تدفّق الجمهور عبرها لا وظيفةً أخرى.',
      },
      {
        locale: 'en' as const,
        title: 'The vaulted entrances',
        shortDescription: 'Vaulted passages that deliver an audience into the seating.',
        description:
          'The vaulted entrances run beneath the seating and open onto the tiers. They let an audience reach its places without crossing the performance floor.',
        historicalInfo:
          'Passages of this kind are called vomitoria. The name describes the way a crowd pours through them, and nothing more.',
      },
    ],
  },
];

/**
 * One heritage site, so the feature has real content to show rather than
 * an empty section in the demo. Deliberately built from the same
 * already-disclaimed destination copy above rather than any new claim —
 * see the note at the end of each description.
 */
export const HERITAGE_SITES = [
  {
    slug: 'theatre-precinct',
    latitude: 35.3606,
    longitude: 35.9256,
    translations: [
      {
        locale: 'ar' as const,
        title: 'محيط المسرح الروماني',
        shortDescription: 'الرقعة الأثرية التي يقوم عليها المسرح ومرافقه.',
        description:
          'يضمّ هذا المحيط الأثري المسرح الروماني بعناصره الرئيسية: المدرّج، ساحة الأوركسترا، بناء الخشبة، والمداخل المقببة، إلى جانب الأرضية المحيطة التي خضعت لأعمال صيانة وترميم على مراحل.\n\nملاحظة: هذا المدخل هو محتوى تجريبي لعرض ميزة "مناطق التراث"، ويجب استبداله بمحتوى معتمد من الجهة الثقافية المسؤولة قبل النشر الفعلي.',
      },
      {
        locale: 'en' as const,
        title: 'The Theatre Precinct',
        shortDescription: 'The archaeological area the theatre and its structures occupy.',
        description:
          'This precinct contains the Roman theatre and its main elements — the cavea, the orchestra, the stage building, and the vaulted entrances — along with the surrounding ground, which has been conserved and restored in stages.\n\nNote: this entry is demo content included to show the Heritage Sites feature, and should be replaced with text approved by the responsible cultural authority before real publication.',
      },
    ],
  },
];

export const SCENES = [
  {
    slug: 'entrance',
    recipe: 'entrance',
    isStart: true,
    view: { yaw: 0, pitch: 0, fov: 78 },
    northOffsetDeg: 0,
    pois: ['vaulted-entrances'],
    translations: [
      {
        locale: 'ar' as const,
        title: 'المدخل الرئيسي',
        summary: 'نقطة البداية عند مدخل الموقع.',
        description: 'من هنا تبدأ الجولة. اسحب للنظر حولك، واختر العلامات للانتقال والاستكشاف.',
      },
      {
        locale: 'en' as const,
        title: 'Main entrance',
        summary: 'The starting point at the entrance to the site.',
        description:
          'The tour begins here. Drag to look around, and select a marker to move on or to read more.',
      },
    ],
  },
  {
    slug: 'orchestra',
    recipe: 'orchestra',
    isStart: false,
    view: { yaw: -20, pitch: -4, fov: 80 },
    northOffsetDeg: 12,
    pois: ['orchestra', 'cavea'],
    translations: [
      {
        locale: 'ar' as const,
        title: 'ساحة الأوركسترا',
        summary: 'المركز الذي تلتقي عنده خطوط النظر من كل الصفوف.',
        description: 'من وسط الأوركسترا يظهر المدرّج محيطاً بك من ثلاث جهات.',
      },
      {
        locale: 'en' as const,
        title: 'The orchestra',
        summary: 'The centre on which every sightline in the building converges.',
        description: 'From the middle of the orchestra the seating wraps around you on three sides.',
      },
    ],
  },
  {
    slug: 'cavea',
    recipe: 'cavea',
    isStart: false,
    view: { yaw: 150, pitch: 6, fov: 82 },
    northOffsetDeg: -35,
    pois: ['cavea'],
    translations: [
      {
        locale: 'ar' as const,
        title: 'أعلى المدرّج',
        summary: 'المشهد من الصفوف العليا.',
        description: 'من الصفوف العليا يتضح تدرّج المدرّج وعلاقته بالخشبة.',
      },
      {
        locale: 'en' as const,
        title: 'Upper seating',
        summary: 'The view from the highest tier.',
        description:
          'From the upper rows the rake of the seating, and its relationship to the stage, becomes clear.',
      },
    ],
  },
  {
    slug: 'stage',
    recipe: 'stage',
    isStart: false,
    view: { yaw: 180, pitch: 0, fov: 76 },
    northOffsetDeg: 180,
    pois: ['stage-building'],
    translations: [
      {
        locale: 'ar' as const,
        title: 'الخشبة',
        summary: 'الوقوف في موضع العرض.',
        description: 'من موضع الخشبة يظهر المدرّج كما كان يراه المؤدّون.',
      },
      {
        locale: 'en' as const,
        title: 'The stage',
        summary: 'Standing where the performers stood.',
        description: 'From the stage the seating appears as the performers would have seen it.',
      },
    ],
  },
];

/** Directed edges of the navigation graph, by scene slug. */
export const SCENE_LINKS: [string, string][] = [
  ['entrance', 'orchestra'],
  ['orchestra', 'entrance'],
  ['orchestra', 'cavea'],
  ['cavea', 'orchestra'],
  ['orchestra', 'stage'],
  ['stage', 'orchestra'],
];

/**
 * Hotspots, placed by bearing and elevation.
 *
 * Navigation markers sit near the horizon in the direction of travel;
 * informational markers sit on the feature they describe.
 */
export const HOTSPOTS: {
  scene: string;
  actionType: 'navigate' | 'poi' | 'info';
  target?: string;
  yaw: number;
  pitch: number;
  style: 'arrow' | 'pin' | 'pulse';
  icon: string;
  translations: { locale: 'ar' | 'en'; label: string; description?: string }[];
}[] = [
  {
    scene: 'entrance',
    actionType: 'navigate',
    target: 'orchestra',
    yaw: 8,
    pitch: -12,
    style: 'arrow',
    icon: 'arrow',
    translations: [
      { locale: 'ar', label: 'إلى ساحة الأوركسترا' },
      { locale: 'en', label: 'To the orchestra' },
    ],
  },
  {
    scene: 'entrance',
    actionType: 'poi',
    target: 'vaulted-entrances',
    yaw: -62,
    pitch: 2,
    style: 'pin',
    icon: 'column',
    translations: [
      { locale: 'ar', label: 'المداخل المقببة' },
      { locale: 'en', label: 'The vaulted entrances' },
    ],
  },
  {
    scene: 'entrance',
    actionType: 'info',
    yaw: 96,
    pitch: 10,
    style: 'pulse',
    icon: 'info',
    translations: [
      {
        locale: 'ar',
        label: 'كيف تتنقّل',
        description:
          'اسحب بالمؤشّر أو بإصبعك للنظر حولك. استخدم عجلة الفأرة أو حركة القرص للتقريب والتبعيد. يمكنك التنقّل بين العلامات بمفتاح Tab.',
      },
      {
        locale: 'en',
        label: 'How to move around',
        description:
          'Drag with the pointer or a finger to look around. Use the wheel or a pinch to zoom. Tab moves between markers.',
      },
    ],
  },
  {
    scene: 'orchestra',
    actionType: 'poi',
    target: 'orchestra',
    yaw: -8,
    pitch: -26,
    style: 'pin',
    icon: 'stage',
    translations: [
      { locale: 'ar', label: 'الأوركسترا' },
      { locale: 'en', label: 'The orchestra' },
    ],
  },
  {
    scene: 'orchestra',
    actionType: 'poi',
    target: 'cavea',
    yaw: 128,
    pitch: 8,
    style: 'pin',
    icon: 'column',
    translations: [
      { locale: 'ar', label: 'المدرّج' },
      { locale: 'en', label: 'The cavea' },
    ],
  },
  {
    scene: 'orchestra',
    actionType: 'navigate',
    target: 'cavea',
    yaw: 155,
    pitch: 4,
    style: 'arrow',
    icon: 'arrow',
    translations: [
      { locale: 'ar', label: 'إلى أعلى المدرّج' },
      { locale: 'en', label: 'Up to the seating' },
    ],
  },
  {
    scene: 'orchestra',
    actionType: 'navigate',
    target: 'stage',
    yaw: -40,
    pitch: -6,
    style: 'arrow',
    icon: 'arrow',
    translations: [
      { locale: 'ar', label: 'إلى الخشبة' },
      { locale: 'en', label: 'To the stage' },
    ],
  },
  {
    scene: 'orchestra',
    actionType: 'navigate',
    target: 'entrance',
    yaw: -155,
    pitch: -8,
    style: 'arrow',
    icon: 'arrow',
    translations: [
      { locale: 'ar', label: 'عودة إلى المدخل' },
      { locale: 'en', label: 'Back to the entrance' },
    ],
  },
  {
    scene: 'cavea',
    actionType: 'poi',
    target: 'cavea',
    yaw: 176,
    pitch: -18,
    style: 'pin',
    icon: 'column',
    translations: [
      { locale: 'ar', label: 'صفوف الجلوس' },
      { locale: 'en', label: 'The seating tiers' },
    ],
  },
  {
    scene: 'cavea',
    actionType: 'navigate',
    target: 'orchestra',
    yaw: 150,
    pitch: -22,
    style: 'arrow',
    icon: 'arrow',
    translations: [
      { locale: 'ar', label: 'النزول إلى الأوركسترا' },
      { locale: 'en', label: 'Down to the orchestra' },
    ],
  },
  {
    scene: 'stage',
    actionType: 'poi',
    target: 'stage-building',
    yaw: -170,
    pitch: 6,
    style: 'pin',
    icon: 'stage',
    translations: [
      { locale: 'ar', label: 'بناء الخشبة' },
      { locale: 'en', label: 'The stage building' },
    ],
  },
  {
    scene: 'stage',
    actionType: 'navigate',
    target: 'orchestra',
    yaw: 6,
    pitch: -14,
    style: 'arrow',
    icon: 'arrow',
    translations: [
      { locale: 'ar', label: 'عودة إلى الأوركسترا' },
      { locale: 'en', label: 'Back to the orchestra' },
    ],
  },
];

export const TOUR = {
  slug: 'virtual-tour',
  kind: 'panorama' as const,
  estimatedMinutes: 8,
  settings: {
    autoRotate: false,
    autoRotateSpeed: 0.3,
    showCompass: true,
    showSceneList: true,
    showHotspotLabels: false,
  },
  translations: [
    {
      locale: 'ar' as const,
      title: 'جولة افتراضية في المسرح',
      summary: 'أربعة مواضع تنقلك من المدخل إلى الخشبة.',
      description: 'جولة تفاعلية بين المواضع الرئيسية في المسرح، مع معلومات عن كل عنصر.',
      welcomeMessage: 'اسحب للنظر حولك، واختر العلامات للتنقّل بين المواضع.',
    },
    {
      locale: 'en' as const,
      title: 'Virtual tour of the theatre',
      summary: 'Four positions taking you from the entrance to the stage.',
      description:
        'An interactive tour of the main positions in the theatre, with information about each element.',
      welcomeMessage: 'Drag to look around, and select a marker to move between positions.',
    },
  ],
};

/**
 * A festival at the same site, to demonstrate that one content model serves
 * both a permanent monument and a temporary programme.
 */
export const EVENT = {
  slug: 'jableh-summer-nights',
  timezone: 'Asia/Damascus',
  /** Set relative to the seed run so the event is always current. */
  startsInDays: -2,
  endsInDays: 12,
  translations: [
    {
      locale: 'ar' as const,
      title: 'ليالي جبلة الصيفية',
      summary: 'برنامج ثقافي في المسرح الروماني.',
      description:
        'برنامج من الأمسيات الموسيقية والعروض والجولات المسائية في المسرح الروماني بجبلة.\n\nملاحظة: هذه فعالية تجريبية ضمن البيانات الأولية لغرض العرض.',
      organizer: 'مديرية الثقافة',
      venue: 'المسرح الروماني، جبلة',
      admissionInfo: 'الدخول مجاني، والمقاعد متاحة حسب توفرها.',
    },
    {
      locale: 'en' as const,
      title: 'Jableh Summer Nights',
      summary: 'A cultural programme at the Roman theatre.',
      description:
        'A programme of evening concerts, performances and after-dark tours at the Roman theatre in Jableh.\n\nNote: this is a sample event included in the seed data for demonstration.',
      organizer: 'Directorate of Culture',
      venue: 'Roman Theatre, Jableh',
      admissionInfo: 'Free entry, seating subject to availability.',
    },
  ],
  schedule: [
    {
      dayOffset: 0,
      hour: 19,
      scene: 'orchestra',
      translations: [
        {
          locale: 'ar' as const,
          title: 'أمسية موسيقية',
          performer: 'فرقة محلية',
          location: 'ساحة الأوركسترا',
          description: 'عرض موسيقي في الهواء الطلق.',
        },
        {
          locale: 'en' as const,
          title: 'Evening concert',
          performer: 'Local ensemble',
          location: 'The orchestra',
          description: 'An open-air musical performance.',
        },
      ],
    },
    {
      dayOffset: 1,
      hour: 20,
      scene: 'stage',
      translations: [
        {
          locale: 'ar' as const,
          title: 'جولة مسائية بصحبة مرشد',
          location: 'المدخل الرئيسي',
          description: 'جولة تعريفية في الموقع بعد الغروب.',
        },
        {
          locale: 'en' as const,
          title: 'Guided evening tour',
          location: 'Main entrance',
          description: 'An introductory walk through the site after sunset.',
        },
      ],
    },
    {
      dayOffset: 3,
      hour: 19,
      scene: 'cavea',
      translations: [
        {
          locale: 'ar' as const,
          title: 'عرض مسرحي',
          performer: 'فرقة المسرح',
          location: 'الخشبة',
          description: 'عرض مسرحي قصير.',
        },
        {
          locale: 'en' as const,
          title: 'Theatre performance',
          performer: 'Theatre company',
          location: 'The stage',
          description: 'A short staged performance.',
        },
      ],
    },
  ],
};
