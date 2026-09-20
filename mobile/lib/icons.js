// A small emoji per commodity, matched on the English or Malayalam name.
// First match wins, so more specific words (copra, coconut oil) come before
// the plain "coconut". Unknown items fall back to a neutral dot.
const RULES = [
  [/copra|കൊപ്ര/i, '🟤'],
  [/coconut oil|വെളിച്ചെണ്ണ/i, '🛢️'],
  [/oil ?cake|പിണ്ണാക്ക്/i, '🟫'],
  [/coconut|തേങ്ങ|നാളികേര/i, '🥥'],
  [/areca|arecanut|അടയ്ക്ക|അടക്ക|കൊട്ടപ്പാക്ക്|പാക്ക്/i, '🌰'],
  [/pepper|കുരുമുളക്/i, '⚫'],
  [/cardamom|ഏലം/i, '🟢'],
  [/ginger|ഇഞ്ചി|ചുക്ക്/i, '🫚'],
  [/turmeric|മഞ്ഞൾ/i, '🟡'],
  [/nutmeg|mace|ജാതി/i, '🔴'],
  [/clove|ഗ്രാമ്പൂ/i, '🟤'],
  [/cashew|കശുവണ്ടി|അണ്ടി/i, '🥜'],
  [/cocoa|കൊക്കോ/i, '🍫'],
  [/coffee|കാപ്പി/i, '☕'],
  [/tea|തേയില/i, '🍵'],
  [/rubber|റബ്ബർ|റബർ|latex|rss|isnr|ലാറ്റക്സ്/i, '🌳'],
  [/coir|കയർ|husk|ചകിരി/i, '🧶'],
  [/paddy|നെല്ല്/i, '🌾'],
  [/rice|അരി/i, '🍚'],
  [/sugar|പഞ്ചസാര|jaggery|ശർക്കര/i, '🍬'],
  [/gold|സ്വർണ്ണം|സ്വർണം|പവൻ/i, '🪙'],
  [/silver|വെള്ളി/i, '⚪'],
  [/banana|plantain|വാഴ|നേന്ത്ര|പഴം|ഏത്തയ്ക്ക/i, '🍌'],
  [/pineapple|കൈതച്ചക്ക/i, '🍍'],
  [/tapioca|cassava|കപ്പ|മരച്ചീനി/i, '🥔'],
  [/potato|ഉരുളക്കിഴങ്ങ്/i, '🥔'],
  [/onion|ഉള്ളി/i, '🧅'],
  [/garlic|വെളുത്തുള്ളി/i, '🧄'],
  [/tomato|തക്കാളി/i, '🍅'],
  [/chill?i|മുളക്/i, '🌶️'],
  [/lemon|lime|നാരങ്ങ/i, '🍋'],
  [/mango|മാങ്ങ/i, '🥭'],
  [/jack|ചക്ക/i, '🍈'],
  [/vegetable|പച്ചക്കറി|beans|പയർ|cucumber|വെള്ളരി|pumpkin|മത്തൻ|brinjal|വഴുതന|okra|വെണ്ട|cabbage|കാബേജ്|carrot|കാരറ്റ്|drumstick|മുരിങ്ങ/i, '🥕'],
  [/fish|മത്സ്യ|മീൻ|prawn|ചെമ്മീൻ|sardine|മത്തി|mackerel|അയല/i, '🐟'],
  [/egg|മുട്ട/i, '🥚'],
  [/chicken|കോഴി/i, '🐔'],
  [/beef|mutton|meat|മാംസം|ആട്/i, '🥩'],
  [/milk|പാൽ/i, '🥛'],
  [/wheat|ഗോതമ്പ്|flour|മാവ്/i, '🌾'],
  [/nux|കാഞ്ഞിരം|കാഞ്ഞിര/i, '🌱'],
  [/cement|സിമന്റ്|steel|കമ്പി/i, '🧱'],
];

export function itemIcon(name = '', nameMl = '') {
  const hay = `${name} ${nameMl}`;
  for (const [re, icon] of RULES) if (re.test(hay)) return icon;
  return '•';
}
