import type { Checkpoint, RoadSource } from '@/types';

/**
 * Checkpoints and junctions from the Wusool project. Coordinates come from
 * OpenStreetMap (Zaatara is the one Wusool could not verify there); aliases are
 * the spellings people actually use in road posts.
 */
export const CHECKPOINTS: Checkpoint[] = [
  {
    id: 'cp_qalandia',
    nameAr: 'حاجز قلنديا',
    nameEn: 'Qalandia Checkpoint',
    location: { latitude: 31.86233, longitude: 35.22743 },
    aliases: ['قلنديا', 'Qalandia', 'Qalandiya', 'كلنديا'],
  },
  {
    id: 'cp_container',
    nameAr: 'حاجز الكونتينر',
    nameEn: 'Container Checkpoint',
    location: { latitude: 31.74222, longitude: 35.28928 },
    aliases: ['الكونتينر', 'كونتينر', 'كونتاينر', 'الكونتيبر', 'Container', 'وادي النار'],
  },
  {
    id: 'cp_atara',
    nameAr: 'حاجز عطارة',
    nameEn: 'Atara Checkpoint',
    location: { latitude: 31.98284, longitude: 35.20056 },
    aliases: ['عطارة', 'عين سينيا', 'Atara', 'Ein Siniya', 'عطاره'],
  },
  {
    id: 'cp_beitel',
    nameAr: 'حاجز بيت إيل (الارتباط)',
    nameEn: 'Beit El DCO Checkpoint',
    location: { latitude: 31.923, longitude: 35.22 },
    aliases: ['بيت ايل', 'بيت إيل', 'الارتباط', 'DCO', 'Beit El'],
  },
  {
    id: 'cp_jaba',
    nameAr: 'حاجز جبع',
    nameEn: 'Jaba Checkpoint',
    location: { latitude: 31.85392, longitude: 35.2564 },
    aliases: ['جبع', 'Jaba', "Jab'a"],
  },
  {
    id: 'cp_huwara',
    nameAr: 'حاجز حوارة',
    nameEn: 'Huwara Checkpoint',
    location: { latitude: 32.1633, longitude: 35.26316 },
    aliases: ['حوارة', 'حواره', 'Huwara', 'Hawara'],
  },
  {
    id: 'cp_zaatara',
    nameAr: 'حاجز زعترة',
    nameEn: 'Zaatara Junction',
    location: { latitude: 32.112, longitude: 35.276 },
    aliases: ['زعترة', 'زعتره', 'تبوح', 'Zaatara', 'Tapuah'],
  },
  {
    id: 'cp_jalama',
    nameAr: 'حاجز الجلمة',
    nameEn: 'Jalama Checkpoint',
    location: { latitude: 32.50991, longitude: 35.30585 },
    aliases: ['الجلمة', 'الجلمه', 'Jalama', 'Gilboa'],
  },
];

/**
 * Community posts that seed the feed (from Wusool's sample set), re-issued
 * relative to "now" whenever the feed has gone quiet.
 */
export const SEED_POSTS: { source: Exclude<RoadSource, 'driver'>; text: string; minutesAgo: number }[] = [
  { source: 'telegram', text: 'بيت ايل الارتباط سالك ولا في حواجز طيارة', minutesAgo: 12 },
  { source: 'telegram', text: 'الوضع عالكونتينر مسكر بالكامل والبديل واد النار أزمة خانقة', minutesAgo: 18 },
  { source: 'telegram', text: 'حاجز قلنديا ازمة خانقة من ساعة، خدوا طريق الرام', minutesAgo: 26 },
  { source: 'whatsapp', text: 'شباب عطارة سالكة الحين مافي زحمة', minutesAgo: 34 },
  { source: 'telegram', text: 'الجيش سكر حاجز جبع، ممنوع المرور نهائيا', minutesAgo: 47 },
  { source: 'telegram', text: 'مفرق زعترة في تفتيش وبطيء جدا', minutesAgo: 52 },
  { source: 'whatsapp', text: 'الجلمة زحمة كتير اليوم، خذوا وقتكم', minutesAgo: 70 },
  { source: 'whatsapp', text: 'حوارة مسكر من الصبح، لا تجوا من هون', minutesAgo: 95 },
];

/** Posts the "try a sample" button cycles through on the road alerts screen. */
export const SAMPLE_ROAD_POSTS = [
  'الكونتينر فتح الحمدلله، الحركة رجعت طبيعية',
  'قلنديا صار في حركة، الوضع تحسن شوي',
  'عطارة مسكرة هلأ، ارجعوا',
  'بيت ايل الارتباط أزمة خانقة',
];
