// modules/i18n/i18n.js
// i18n foundation: loads locale JSON files, merges any locale over en.json
// so a missing key always falls back to English instead of breaking.
// Runs in the MAIN process; renderer reaches it via IPC (i18n:languages /
// i18n:strings).

const fs = require('fs')
const path = require('path')

const LOCALES_DIR = path.join(__dirname, 'locales')

const LANGUAGE_NAMES = {
  en: 'English', ja: '日本語', es: 'Español', ru: 'Русский',
  pl: 'Polski', nl: 'Nederlands', de: 'Deutsch',
  ko: '한국어', zh: '中文', fr: 'Français', ms: 'Bahasa Melayu', no: 'Norsk',
  pt: 'Português', ar: 'العربية', bn: 'বাংলা', hi: 'हिन्दी', id: 'Bahasa Indonesia',
  or: 'ଓଡ଼ିଆ', qu: 'Runasimi', sw: 'Kiswahili', ta: 'தமிழ்', ur: 'اردو',
  vi: 'Tiếng Việt', wuu: '吴语', xh: 'isiXhosa', yo: 'Yorùbá', zu: 'isiZulu',

  af: 'Afrikaans', sq: 'Shqip', am: 'አማርኛ', hy: 'Հայերեն', az: 'Azərbaycan dili',
  eu: 'Euskara', be: 'Беларуская', bs: 'Bosanski', bg: 'Български', my: 'မြန်မာဘာသာ',
  ca: 'Català', ceb: 'Cebuano', ny: 'Chichewa', co: 'Corsu', hr: 'Hrvatski',
  cs: 'Čeština', da: 'Dansk', eo: 'Esperanto', et: 'Eesti', fi: 'Suomi',
  fy: 'Frysk', ka: 'ქართული', el: 'Ελληνικά', ha: 'Hausa', haw: 'ʻŌlelo Hawaiʻi',
  he: 'עברית', hmn: 'Hmoob', hu: 'Magyar', is: 'Íslenska', it: 'Italiano',
  jv: 'Basa Jawa', kn: 'ಕನ್ನಡ', kk: 'Қазақ тілі', km: 'ខ្មែរ', rw: 'Kinyarwanda',
  rn: 'Ikirundi', ky: 'Кыргызча', lo: 'ລາວ', lv: 'Latviešu', lt: 'Lietuvių',
  lb: 'Lëtzebuergesch', mk: 'Македонски', mg: 'Malagasy', ml: 'മലയാളം', mt: 'Malti',
  mi: 'Māori', mr: 'मराठी', mn: 'Монгол', ne: 'नेपाली', ps: 'پښتو',
  fa: 'فارسی', pa: 'ਪੰਜਾਬੀ', ro: 'Română', sr: 'Српски', si: 'සිංහල',
  sk: 'Slovenčina', sl: 'Slovenščina', so: 'Soomaali', su: 'Basa Sunda', sv: 'Svenska',
  tl: 'Tagalog', tg: 'Тоҷикӣ', tt: 'Татар', te: 'తెలుగు', th: 'ไทย',
  bo: 'བོད་སྐད་', ti: 'ትግርኛ', to: 'Lea Fakatonga', tr: 'Türkçe', tk: 'Türkmençe',
  ug: 'ئۇيغۇرچە', uk: 'Українська', uz: 'Oʻzbekcha', cy: 'Cymraeg', yi: 'ייִדיש'
}

function listLanguages () {
  return fs.readdirSync(LOCALES_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      const code = f.replace(/\.json$/, '')
      return { code, name: LANGUAGE_NAMES[code] || code }
    })
}

function loadLocale (code) {
  const file = path.join(LOCALES_DIR, `${code}.json`)
  if (!fs.existsSync(file)) return {}
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (_) {
    return {}
  }
}

function getStrings (lang) {
  const en = loadLocale('en')
  if (!lang || lang === 'en') return en
  return { ...en, ...loadLocale(lang) }
}

module.exports = { listLanguages, getStrings }
