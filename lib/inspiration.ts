export type Photo = { id: number; alt: string; photographer: string; source: string };
const photo = (id: number, alt: string, photographer: string, slug: string): Photo => ({ id, alt, photographer, source: `https://www.pexels.com/photo/${slug}-${id}/` });
export const photos = {
  garden: photo(26975888, 'Long wedding tables on a garden lawn beneath strings of lights', 'Josh Withers', 'wedding-reception-table-set-on-grass-field'),
  roses: photo(37393654, 'Lush rose arrangements and glassware at a garden wedding table', 'Kimy Moto', 'elegant-garden-wedding-table-setting-with-florals'),
  white: photo(19408255, 'White flowers and golden place settings', 'Luis Felipe Pérez', 'flower-arrangements-standing-on-a-table-at-a-wedding-reception'),
  colorful: photo(35279295, 'Bright yellow and red flowers in simple glass bud vases', 'Laura Oliveira', 'elegant-wedding-table-centerpiece-with-flowers'),
  draped: photo(35568777, 'White drapery, pink flowers and pearl details', 'Cansu Hangül', 'elegant-indoor-wedding-decoration-with-flowers'),
  rustic: photo(9703867, 'A wooden wedding table with woven chairs and dried flowers', 'Jonathan Borba', 'set-table-at-wedding-reception'),
  beach: photo(9294072, 'A simple timber ceremony arch and white drapery beside the sea', 'Engin Akyurt', 'wedding-set-up-on-the-beach'),
  seaside: photo(10733602, 'A white floral arch and petal-strewn aisle on the beach', 'Miriam Salgado', 'decoration-of-a-beach-wedding'),
  tropical: photo(31224898, 'A tropical floral ceremony arch overlooking the ocean', 'Luiz Lorencetti', 'beach-wedding-ceremony-with-floral-archway'),
  statement: photo(37302291, 'A tall floral centrepiece with vivid blue lighting', 'David Pastory', 'elegant-wedding-reception-table-setup-with-flowers'),
  jungle: photo(35279296, 'A vivid floral arch beneath tropical foliage', 'Laura Oliveira', 'colorful-floral-wedding-arch-in-tropical-garden'),
  woodland: photo(40521635, 'A draped wooden ceremony arch surrounded by woodland', 'Alexander Mass', 'outdoor-wedding-ceremony-arch-with-floral-arrangement'),
  courtyard: photo(32799679, 'Wooden ceremony chairs and a flower arch in a courtyard', 'Luis Morales Torres', 'outdoor-wedding-ceremony-setup-with-floral-arch'),
  sunshine: photo(31217382, 'White ceremony chairs with yellow sashes on a sunny lawn', 'Benedict Buston', 'outdoor-wedding-ceremony-with-floral-arch-decor'),
  botanical: photo(35985258, 'White hydrangeas and foliage on a green garden arch', 'Jonathan Borba', 'elegant-wedding-floral-arch-in-outdoor-setting'),
  pink: photo(32994505, 'A pink floral aisle and draped outdoor ceremony canopy', 'The Visionary Vows', 'romantic-outdoor-wedding-venue-with-floral-arch'),
  twilight: photo(4234545, 'A pink and white flower arch against a twilight sky', 'alleksana', 'beautiful-wedding-arch-decorated-with-flowers-and-feathers-on-pathway'),
  estate: photo(35629338, 'A clean white floral aisle and wooden chairs beneath trees', 'Qodak. stx', 'elegant-outdoor-wedding-ceremony-setup-with-floral-arch'),
  boho: photo(37901030, 'Pampas grass, timber and cream drapery in a covered ceremony space', 'Jonathan Borba', 'elegant-indoor-wedding-venue-with-floral-arrangement'),
  lanterns: photo(15316463, 'A beach tent illuminated by lights and candles at dusk', 'Alina Skazka', 'wedding-venue-on-a-beach'),
  monochrome: photo(37827340, 'Black and white place settings with sculptural folded napkins', 'NUDE Nahum', 'elegant-black-and-white-wedding-table-setup'),
  sunset: photo(14452884, 'A flower arch beside the sea at sunset', 'Ayşegül Aytören', 'flower-arch-on-beach-wedding-on-sunset'),
  lakeside: photo(17417907, 'A flower-lined ceremony aisle on a lakeside pier', 'Kadir Akman', 'wedding-decorations-and-red-carpet-on-pier'),
  waterfront: photo(30858894, 'A timber wedding dinner table beside the water in golden light', 'aytug cingiloglu', 'beautiful-beach-wedding-setup-at-izmir-sunset'),
  candles: photo(12317806, 'White roses, glassware and candlelight on an intimate dinner table', 'Key Notez', 'forman-table-setting-in-a-reception'),
  barn: photo(14813311, 'A geometric timber backdrop and pampas grass against a barn wall', 'Kingdom Shakers', 'wooden-ladder-with-flowers'),
  dinner: photo(37665541, 'An outdoor dinner setting with abundant flowers and greenery', 'Kimy Moto', 'elegant-outdoor-wedding-reception-setup-with-floral-decor'),
  fairylights: photo(9816246, 'A rustic wedding display with lanterns under twinkling fairy lights', 'Jonathan Borba', 'presentation-of-sweets-and-cookies-laying-on-imitation-of-coach'),
  bistro: photo(13259521, 'An outdoor dining space with a canopy of warm string lights', 'Zeynep Sude Emek', 'dining-table-and-chairs-set'),
} satisfies Record<string, Photo>;

export type Decor = { florals: string; lighting: string; tables: string };
export const emptyDecor: Decor = { florals: '', lighting: '', tables: '' };
const palettes = {
  rose: ['#b18a7c', '#ebd4ca', '#f6efdf', '#7e8c6b'], green: ['#6e805d', '#bac3a4', '#f2ebd9', '#a8956c'],
  bright: ['#bc655c', '#dda146', '#af9bba', '#8a9b70'], sand: ['#bd9c74', '#e5d6bd', '#f6f0e6', '#8a7562'],
  sea: ['#6e949d', '#c4d6d5', '#f1e8d6', '#bda476'], dark: ['#333b35', '#d9d3c8', '#faf5e9', '#a99570'],
};
// Each profile differs in arrangement, lighting and table layout, not just colour.
const profiles = {
  lush: ['Abundant blooms, layered place settings and a softly romantic atmosphere.', 'rose', 'Lush blush rose arrangements', 'Warm fairy-light canopy', 'Long tables with ivory linen', 'Check sightlines across the floral arrangements.'],
  meadow: ['Bright little blooms and a relaxed, just-picked feeling.', 'bright', 'Colourful seasonal bud vases', 'Warm festoon lights', 'Relaxed shared wooden tables', 'Ask which seasonal flowers suit your date.'],
  tropical: ['Vivid flowers and lush leaves for a joyful, nature-filled celebration.', 'bright', 'Tropical foliage and bright blooms', 'Soft garden lanterns', 'Natural timber with woven accents', 'Plan shade, ventilation and guest comfort.'],
  supper: ['One generous meal with soft lights and room for conversation.', 'green', 'Low white flowers and greenery', 'Overhead festoon lights', 'Long communal banquet tables', 'Confirm power supply and a sheltered rain backup.'],
  woodland: ['Loose greenery, flowing fabric and a ceremony beneath the trees.', 'green', 'Loose foliage around a timber arch', 'Hanging lantern clusters', 'Timber seating with simple runners', 'Check accessible paths and tree-attachment rules.'],
  minimal: ['A green-and-white palette with a sculptural floral focal point.', 'green', 'White hydrangeas and sculptural greenery', 'Discreet warm uplighting', 'Round tables with crisp white linen', 'Ask about the floral structure footprint and setup slot.'],
  rustic: ['Warm wood, natural textures and an earthy, welcoming dinner.', 'sand', 'Dried grasses and neutral seasonal flowers', 'Amber votives in enclosed holders', 'Bare wooden tables and woven chairs', 'Check furniture inclusions and candle restrictions.'],
  twilight: ['A dramatic floral ceremony with the evening sky as your backdrop.', 'rose', 'A statement pink floral ceremony arch', 'A softly lit aisle and lanterns', 'A compact dinner with layered linen', 'Plan ceremony photos around sunset and weather.'],
  coastal: ['A simple arch, flowing fabric and an open view doing the rest.', 'sea', 'Sparse white blooms on a timber arch', 'Soft lanterns along the aisle', 'Relaxed tables with natural linen', 'Check permits, tides, wind and accessible guest routes.'],
  sunset: ['Full flowers, warm light and a golden-hour ceremony.', 'rose', 'A full floral ceremony arch', 'Golden-hour light, then enclosed candles', 'Dinner tables with soft ivory linen', 'Check the sunset time for the chosen date.'],
  island: ['Lush greenery and white flowers framing a view of the water.', 'green', 'Tropical foliage and white flowers', 'Low coastal lanterns', 'Timber tables and natural woven details', 'Ask for a wind and wet-weather backup.'],
  picnic: ['A little tent, soft textures and an evening lit by lanterns.', 'sand', 'Dried grasses and loose neutral flowers', 'Fairy lights and enclosed lanterns', 'Low picnic tables and cushions', 'Include conventional chair seating for guests who need it.'],
  formal: ['White flowers, warm metallic details and polished place settings.', 'green', 'White roses with soft greenery', 'Warm candlelight in glass holders', 'Formal round tables with gold accents', 'Request itemised floral and tableware quotes.'],
  candles: ['An intimate evening where low flowers and soft light set the mood.', 'sand', 'Low white rose centrepieces', 'Clusters of enclosed candles', 'Linen-covered dinner tables', 'Check candle policy and private-dining minimum spends.'],
  draped: ['Layers of white fabric and delicate blush floral details.', 'rose', 'Blush flowers and delicate accents', 'Soft warm uplighting', 'Round tables with full-length linen', 'Confirm rigging points and drapery installation rules.'],
  editorial: ['Strong contrast, clean lines and beautifully considered details.', 'dark', 'Sparse sculptural white flowers', 'Focused warm lighting', 'Monochrome settings with crisp folded napkins', 'Ask for a sample place setting before renting.'],
  statement: ['Tall flowers and theatrical lighting for a bold evening celebration.', 'dark', 'Tall floral centrepieces on slim stands', 'Blue accent lighting and warm table light', 'Formal banquet tables with a dance floor', 'Test lighting against skin tones and photography.'],
  pier: ['A flower-lined aisle and a small ceremony beside the water.', 'rose', 'Small floral aisle arrangements', 'Low waterside lanterns', 'A compact dinner on the shore', 'Confirm pier capacity and safe accessible routes.'],
  waterfront: ['A warm timber table beside the water and a leisurely shared meal.', 'sea', 'Small neutral flower arrangements', 'Warm table-level lanterns', 'A long wooden table with shared plates', 'Check weather protection and catering access.'],
  pampas: ['Airy grasses, geometric timber and layers of natural texture.', 'sand', 'Pampas and dried neutral flowers', 'Soft warm ambient light', 'Rustic tables with textured linen', 'Check dried-flower rules near candles and heat sources.'],
  geometry: ['A geometric timber ceremony frame, airy grasses and a more architectural layout.', 'sand', 'Sparse dried grasses on a geometric timber frame', 'Focused warm backdrop spotlights', 'Small cocktail tables with a seated dinner area', 'Confirm frame stability and leave a clear accessible aisle.'],
} satisfies Record<string, string[]>;

export type Direction = { id: string; title: string; description: string; photo: Photo; colors: string[]; decor: Decor; practical: string };
export type WeddingStyle = { id: string; title: string; subtitle: string; feeling: string; photo: Photo; colors: string[]; keywords: string[]; directions: Direction[] };
type Seed = [string, keyof typeof photos, keyof typeof profiles];
function directions(style: string, seeds: Seed[]): Direction[] {
  return seeds.map(([title, image, profile], index) => {
    const [description, palette, florals, lighting, tables, practical] = profiles[profile];
    return { id: `${style}-${index}`, title, description, photo: photos[image], colors: palettes[palette as keyof typeof palettes], decor: { florals, lighting, tables }, practical };
  });
}
function style(id: string, title: string, subtitle: string, feeling: string, image: keyof typeof photos, palette: keyof typeof palettes, keywords: string[], seeds: Seed[]): WeddingStyle {
  return { id, title, subtitle, feeling, photo: photos[image], colors: palettes[palette], keywords, directions: directions(id, seeds) };
}

export const styles: WeddingStyle[] = [
  style('garden', 'Garden', 'Flowers everywhere. Your favourite people, a little closer.', 'Soft, natural & romantic', 'garden', 'green', ['garden','botanical','nature','floral','flowers','romantic','wildflower','green','outdoor'], [
    ['English rose garden','roses','lush'], ['Wildflower gathering','colorful','meadow'], ['Tropical garden','jungle','tropical'], ['Long-table garden supper','garden','supper'],
    ['Woodland ceremony','woodland','woodland'], ['Sculptural white garden','botanical','minimal'], ['Rustic orchard dinner','rustic','rustic'], ['Twilight garden vows','twilight','twilight'],
  ]),
  style('beach', 'Beach', 'Salt in the air. Sand underfoot. Nothing too formal.', 'Airy, relaxed & sun-kissed', 'beach', 'sea', ['beach','sea','ocean','coastal','barefoot','breeze','sand','sunset','water'], [
    ['Barefoot coastal','beach','coastal'], ['Golden-hour romance','sunset','sunset'], ['Tropical ocean vows','tropical','island'], ['Bohemian beach picnic','lanterns','picnic'],
    ['Classic seaside ceremony','seaside','formal'], ['Waterfront dinner party','waterfront','waterfront'], ['Lakeside celebration','lakeside','pier'], ['Riviera-inspired supper','dinner','supper'],
  ]),
  style('classic', 'Classic', 'Timeless flowers, thoughtful details and a little elegance.', 'Elegant, polished & timeless', 'white', 'rose', ['classic','timeless','elegant','traditional','formal','white','rose','luxury','ballroom'], [
    ['White rose romance','white','formal'], ['Candlelit dinner','candles','candles'], ['Soft draped elegance','draped','draped'], ['Black-tie monochrome','monochrome','editorial'],
    ['Garden estate formal','estate','minimal'], ['Romantic garden reception','roses','lush'], ['Statement evening florals','statement','statement'], ['Classic by the sea','seaside','coastal'],
  ]),
  style('modern', 'Modern', 'Clean lines, beautiful spaces and details with intention.', 'Minimal, considered & contemporary', 'monochrome', 'dark', ['modern','minimal','minimalist','clean','editorial','sculptural','city','contemporary','black'], [
    ['Black & white editorial','monochrome','editorial'], ['Botanical minimalism','botanical','minimal'], ['Warm natural modern','rustic','rustic'], ['Colour-pop dinner','colorful','meadow'],
    ['Minimal coastal ceremony','beach','coastal'], ['Immersive blue evening','statement','statement'], ['Soft fabric installation','draped','draped'], ['Open-air supper club','garden','supper'],
  ]),
  style('rustic', 'Rustic', 'Warm wood, honest textures and a gathering that feels like home.', 'Earthy, welcoming & unhurried', 'rustic', 'sand', ['rustic','country','barn','wood','earthy','warm','cosy','cozy'], [
    ['Barn & pampas','barn','pampas'], ['Farm-table supper','rustic','rustic'], ['Woodland gathering','woodland','woodland'], ['Country wildflowers','colorful','meadow'],
    ['Lawn banquet','garden','supper'], ['Lakeside country vows','lakeside','pier'], ['Covered boho barn','boho','draped'], ['Golden-hour waterfront','waterfront','waterfront'],
  ]),
  style('bohemian', 'Bohemian', 'Soft layers, wild textures and a beautifully free spirit.', 'Textured, expressive & free-spirited', 'boho', 'sand', ['boho','bohemian','pampas','free','textured','laid-back','dried'], [
    ['Pampas & drapery','boho','pampas'], ['Beach tent at dusk','lanterns','picnic'], ['Wild colour story','colorful','meadow'], ['Timber & earth','rustic','rustic'],
    ['Forest drapery','woodland','woodland'], ['Geometric barn backdrop','barn','geometry'], ['Tropical free spirit','jungle','tropical'], ['Twilight flower ceremony','twilight','twilight'],
  ]),
  style('tropical', 'Tropical', 'Lush leaves, joyful colour and your own little paradise.', 'Vibrant, lush & celebratory', 'jungle', 'bright', ['tropical','island','lush','palm','vibrant','colourful','colorful','jungle'], [
    ['Colourful garden arch','jungle','tropical'], ['Ocean-view island vows','tropical','island'], ['Pink tropical celebration','pink','lush'], ['Lush garden banquet','roses','formal'],
    ['Minimal island ceremony','beach','coastal'], ['Sunny garden party','sunshine','meadow'], ['Tropical dinner club','dinner','supper'], ['Waterfront sunset feast','waterfront','waterfront'],
  ]),
  style('intimate', 'Intimate dinner', 'A beautiful meal and only the people who know you best.', 'Personal, cosy & connected', 'candles', 'sand', ['intimate','small','dinner','candlelit','candlelight','personal','restaurant','conversation'], [
    ['Candlelit supper','candles','candles'], ['Garden dinner party','garden','supper'], ['Waterfront table','waterfront','waterfront'], ['Modern private dining','monochrome','editorial'],
    ['Bohemian beach picnic','lanterns','picnic'], ['Rustic family table','rustic','rustic'], ['Colourful little celebration','colorful','meadow'], ['Romantic courtyard','courtyard','twilight'],
  ]),
];
export function rankStyles(keywords: string): WeddingStyle[] {
  const words = keywords.toLowerCase();
  const score = (item: WeddingStyle) => item.keywords.filter(word => words.includes(word)).length;
  return [...styles].sort((a, b) => score(b) - score(a));
}
export function photoPath(item: Photo) { return `/inspiration/${item.id}.jpg`; }
export function pinterestSearch(query: string) {
  const search = /\bwedding\b/i.test(query) ? query.trim() : `${query.trim()} wedding inspiration`;
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(search)}`;
}
