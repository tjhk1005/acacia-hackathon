import { photos, photoPath } from './inspiration.ts';

export type VisualReference = {
  id: string;
  src: string;
  alt: string;
  pinterest: string;
  tags: string[];
  source: 'pinterest-reference' | 'local-reference' | 'pinterest-live';
};
const pin = (id: string, src: string, alt: string, tags: string[]): VisualReference => ({
  id: `pin-${id}`, src, alt, tags, pinterest: `https://www.pinterest.com/pin/${id}/`, source: 'pinterest-reference',
});
// Public references discovered during development. These are not a live Pinterest search feed.
export const pinterestReferences: VisualReference[] = [
  pin('321303754676787992', 'https://i.pinimg.com/736x/3e/28/d3/3e28d35bcda8258b2bd475abb350ee45.jpg', 'Pastel garden dinner tables beneath string lights', ['garden','outdoor','botanical','romantic','soft','blue','intimate','abundant']),
  pin('528610075023779231', 'https://i.pinimg.com/736x/e5/e4/d4/e5e4d45f9a44f71ec5afb4cdd399b519.jpg', 'Cottage garden ceremony with pastel flowers and a round arch', ['garden','outdoor','botanical','romantic','soft','pink','abundant']),
  pin('249738741817185841', 'https://i.pinimg.com/736x/33/a4/a3/33a4a38dbd2e9d1018c911dff19f2724.jpg', 'A beachfront dinner with white drapery and string lights', ['beach','outdoor','botanical','romantic','soft','white','intimate','abundant']),
  pin('897342294506136914', 'https://i.pinimg.com/originals/09/2e/81/092e8176ca8b2a349109ad5f4f53a65d.jpg', 'An intimate beach ceremony with a white aisle and soft flowers', ['beach','outdoor','botanical','classic','soft','white','pink','abundant']),
  pin('214202526021618224', 'https://i.pinimg.com/736x/2f/ce/94/2fce94e6b3aa324817b8b7a30cb1bf25.jpg', 'A seaside wedding table with white drapery and greenery', ['beach','outdoor','botanical','classic','soft','white','abundant']),
  pin('492649954032730', 'https://i.pinimg.com/originals/d4/d7/1e/d4d71e21ef003e16efa8cb578324f16a.jpg', 'A woodland ceremony with a timber arch, macrame and lanterns', ['forest','outdoor','botanical','bohemian','rustic','green','abundant']),
  pin('17310779813566561', 'https://i.pinimg.com/736x/e6/7c/af/e67caf4424618041219684d3f574d45d.jpg', 'A colourful meadow-flower tablescape with taper candles', ['garden','outdoor','botanical','playful','colourful','pink','yellow','abundant']),
  pin('677580706452567052', 'https://i.pinimg.com/736x/96/74/3b/96743b5f50f08d89d311ec129b75dd2c.jpg', 'A modern indoor dinner with black napkins and white flowers', ['modern','indoor','architectural','minimal','black','white','intimate']),
  pin('512214157632679910', 'https://i.pinimg.com/736x/5a/59/61/5a5961eaa26fac2a0c264dafe7e53adc.jpg', 'A loose wildflower bouquet with bright yellow and purple blooms', ['garden','outdoor','botanical','playful','colourful','purple','yellow','abundant']),
  pin('99923685476205157', 'https://i.pinimg.com/736x/ff/46/05/ff460501a92b9f509560965c5f460799.jpg', 'Terracotta and sage wedding colour stories', ['palette','rustic','bohemian','earthy','green','orange']),
  pin('11329436556632498', 'https://i.pinimg.com/originals/b9/92/15/b99215e6576f52d209a81a00f60559ed.jpg', 'An earthy wedding moodboard with rust, sage and natural textures', ['palette','rustic','bohemian','earthy','green','orange','botanical']),
  pin('454793262385967622', 'https://i.pinimg.com/originals/c5/38/18/c53818ce931c8442398e3aad4daf1651.jpg', 'An elegant indoor ballroom with chandeliers and cream flowers', ['classic','indoor','architectural','dramatic','white','gold','abundant']),
  pin('412079434672110189', 'https://i.pinimg.com/originals/9c/c6/7a/9cc67a054e3d196513ac9635ba8d5951.jpg', 'Sage, rust and peach flowers in a natural wedding palette', ['palette','garden','botanical','earthy','green','orange','pink']),
  pin('914862421003719', 'https://i.pinimg.com/736x/ff/26/4e/ff264e90b968c3001bde4faea79131df.jpg', 'An autumn wedding moodboard with terracotta, sage and twinkling lights', ['palette','rustic','outdoor','botanical','earthy','green','orange']),
];
const localTags: Record<string, string[]> = {
  garden: ['garden','outdoor','botanical','romantic','green','intimate','abundant'], roses: ['garden','outdoor','botanical','romantic','pink','abundant'],
  white: ['classic','indoor','botanical','white','gold','minimal'], colorful: ['garden','indoor','botanical','playful','colourful','yellow','minimal'],
  draped: ['classic','indoor','architectural','romantic','soft','pink','white','abundant'], rustic: ['rustic','outdoor','botanical','earthy','minimal','brown'],
  beach: ['beach','outdoor','botanical','minimal','white','blue'], seaside: ['beach','outdoor','botanical','classic','white','pink','abundant'],
  tropical: ['beach','tropical','outdoor','botanical','green','blue','abundant'], statement: ['classic','indoor','architectural','dramatic','blue','abundant'],
  jungle: ['tropical','outdoor','botanical','playful','colourful','orange','abundant'], woodland: ['forest','outdoor','botanical','rustic','green','abundant'],
  courtyard: ['garden','outdoor','botanical','rustic','green','abundant'], sunshine: ['garden','outdoor','botanical','playful','yellow','minimal'],
  botanical: ['garden','outdoor','botanical','minimal','white','green'], pink: ['garden','outdoor','botanical','romantic','pink','abundant'],
  twilight: ['garden','outdoor','botanical','romantic','pink','abundant'], estate: ['garden','outdoor','botanical','classic','white','minimal'],
  boho: ['bohemian','indoor','botanical','earthy','white','brown','abundant'], lanterns: ['beach','outdoor','botanical','bohemian','intimate','soft','brown','minimal'],
  monochrome: ['modern','indoor','architectural','minimal','black','white'], sunset: ['beach','outdoor','botanical','romantic','orange','abundant'],
  lakeside: ['beach','outdoor','botanical','romantic','white','abundant'], waterfront: ['beach','outdoor','botanical','rustic','minimal','brown'],
  candles: ['classic','indoor','botanical','romantic','intimate','white','minimal'], barn: ['rustic','outdoor','botanical','earthy','brown','minimal'],
  dinner: ['garden','outdoor','botanical','romantic','green','abundant'], fairylights: ['garden','outdoor','botanical','bohemian','intimate','brown','minimal'],
  bistro: ['modern','outdoor','architectural','intimate','black','minimal'],
};
export const localReferences: VisualReference[] = Object.entries(photos).map(([key, photo]) => ({
  id: `local-${photo.id}`, src: photoPath(photo), alt: photo.alt, tags: localTags[key] ?? [],
  pinterest: '', source: 'local-reference',
}));
export const visualReferences = [...pinterestReferences, ...localReferences];
