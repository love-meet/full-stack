// Gift catalogue — ported verbatim from _archive/server/utils/flowers.js so the
// new app uses the same items the mobile app shipped. Prices are in USD here
// (matching the original `price` field); when M7 lands we'll convert to USDT
// cents at write time.

export type CatalogueGift = {
  giftId: string  // string for portability (Mongo used numbers)
  name: string
  price: number   // USD (or USDT-equivalent) — float, e.g. 1.3
  image: string   // CDN url
}

export const GIFT_CATALOGUE: readonly CatalogueGift[] = [
  { giftId: '456720', name: 'Rose flower in Glass',          price: 10,  image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707524/flower_z8xudz.webp' },
  { giftId: '456726', name: 'Classic Flower',                price: 35,  image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707526/flower7_gadpes.webp' },
  { giftId: '456727', name: 'Diamond Roses',                 price: 45,  image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707527/flower6_uchrz7.webp' },
  { giftId: '456728', name: 'Dark Wrist Watch',              price: 2,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/dark_watch_dqd0tc.jpg' },
  { giftId: '456729', name: 'Attractive teddy',              price: 1.3, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/attractive_teddy_qeiwpq.jpg' },
  { giftId: '456743', name: 'Titanum Wrist Watch',           price: 100, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/titanum_watch_xhngei.jpg' },
  { giftId: '456730', name: 'Fruit & Yogurt Parfait',        price: 0.4, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/fruit_and_yogurt_parfait_i1krav.jpg' },
  { giftId: '456731', name: 'Peodagar WristWatch',           price: 7,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125185/peodagar_615_rje1wi.jpg' },
  { giftId: '456732', name: 'Dual Analog WristWatch',        price: 3.3, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/dual_analog_watch_jqvufd.jpg' },
  { giftId: '456723', name: 'Orchid Flower',                 price: 4,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707529/flower8_nogxex.webp' },
  { giftId: '456733', name: 'Crystal Parfait',               price: 1.3, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/Crystal_parfait_tqcgvq.jpg' },
  { giftId: '456734', name: 'Cinnamon Apple Yogurt Parfait', price: 0.7, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/cinnamon_apple_yogurt_partfait_jmdksj.jpg' },
  { giftId: '456735', name: 'Love Teddy',                    price: 3,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/love_teddy_jvdmyp.jpg' },
  { giftId: '456736', name: 'Ice Wristwatch',                price: 50,  image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/ice_watch_krgwvx.jpg' },
  { giftId: '456721', name: 'Flower Bouquet',                price: 1,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707524/flower4_rgdwsx.webp' },
  { giftId: '456724', name: 'Lillies Rose',                  price: 6,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707528/flower2_ry31ft.webp' },
  { giftId: '456737', name: 'Two Hot Rounds',                price: 1.3, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/two_rounds_l5jmll.jpg' },
  { giftId: '456738', name: 'A Massage Teddy',               price: 1.2, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/a_massage_teddy_ak47pw.jpg' },
  { giftId: '456739', name: 'Wabby Soft Cute Teddy',         price: 1.3, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/wabby_soft_cute_zo1lnz.jpg' },
  { giftId: '456740', name: 'Corporate wristwatch',          price: 1.3, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/images_3_taaxsq.jpg' },
  { giftId: '456725', name: 'Exotic Flower',                 price: 9,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707527/flower5_pygwjt.webp' },
  { giftId: '456741', name: 'One Round',                     price: 0.2, image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/one_round_gxcoa1.jpg' },
  { giftId: '456742', name: 'Soft Two Rounds',               price: 2,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/soft_two_rounds_zmw8ol.jpg' },
  { giftId: '456722', name: 'Red Roses',                     price: 2,   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707532/flower3_h04yvs.webp' },
] as const

/** Convert USD price (float) to cents (int) for the DB. */
export const usdToCents = (usd: number) => Math.round(usd * 100)
