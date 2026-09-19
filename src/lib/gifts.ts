// Gift catalogue — ported from _archive/server/utils/flowers.js so the new app
// uses the same items the mobile app shipped.
//
// Gifts are free and purely cosmetic. There is no price field because there is
// no price: sending one costs nothing, and it grants the recipient nothing.
// Crediting the recipient would let two accounts gift each other free
// messaging for ever, so the credit ledger has no kind that could express it.

export type CatalogueGift = {
  giftId: string  // string for portability (Mongo used numbers)
  name: string
  image: string   // CDN url
}

export const GIFT_CATALOGUE: readonly CatalogueGift[] = [
  { giftId: '456720', name: 'Rose flower in Glass',  image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707524/flower_z8xudz.webp' },
  { giftId: '456726', name: 'Classic Flower',  image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707526/flower7_gadpes.webp' },
  { giftId: '456727', name: 'Diamond Roses',  image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707527/flower6_uchrz7.webp' },
  { giftId: '456728', name: 'Dark Wrist Watch',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/dark_watch_dqd0tc.jpg' },
  { giftId: '456729', name: 'Attractive teddy', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/attractive_teddy_qeiwpq.jpg' },
  { giftId: '456743', name: 'Titanum Wrist Watch', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/titanum_watch_xhngei.jpg' },
  { giftId: '456730', name: 'Fruit & Yogurt Parfait', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/fruit_and_yogurt_parfait_i1krav.jpg' },
  { giftId: '456731', name: 'Peodagar WristWatch',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125185/peodagar_615_rje1wi.jpg' },
  { giftId: '456732', name: 'Dual Analog WristWatch', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/dual_analog_watch_jqvufd.jpg' },
  { giftId: '456723', name: 'Orchid Flower',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707529/flower8_nogxex.webp' },
  { giftId: '456733', name: 'Crystal Parfait', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/Crystal_parfait_tqcgvq.jpg' },
  { giftId: '456734', name: 'Cinnamon Apple Yogurt Parfait', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/cinnamon_apple_yogurt_partfait_jmdksj.jpg' },
  { giftId: '456735', name: 'Love Teddy',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/love_teddy_jvdmyp.jpg' },
  { giftId: '456736', name: 'Ice Wristwatch',  image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/ice_watch_krgwvx.jpg' },
  { giftId: '456721', name: 'Flower Bouquet',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707524/flower4_rgdwsx.webp' },
  { giftId: '456724', name: 'Lillies Rose',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707528/flower2_ry31ft.webp' },
  { giftId: '456737', name: 'Two Hot Rounds', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/two_rounds_l5jmll.jpg' },
  { giftId: '456738', name: 'A Massage Teddy', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125184/a_massage_teddy_ak47pw.jpg' },
  { giftId: '456739', name: 'Wabby Soft Cute Teddy', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/wabby_soft_cute_zo1lnz.jpg' },
  { giftId: '456740', name: 'Corporate wristwatch', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/images_3_taaxsq.jpg' },
  { giftId: '456725', name: 'Exotic Flower',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707527/flower5_pygwjt.webp' },
  { giftId: '456741', name: 'One Round', image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/one_round_gxcoa1.jpg' },
  { giftId: '456742', name: 'Soft Two Rounds',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1763125183/soft_two_rounds_zmw8ol.jpg' },
  { giftId: '456722', name: 'Red Roses',   image: 'https://res.cloudinary.com/dqqxbiskk/image/upload/v1760707532/flower3_h04yvs.webp' },
] as const

