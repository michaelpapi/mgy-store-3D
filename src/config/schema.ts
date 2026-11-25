import { z } from 'astro/zod';

/* Everything in src/data/*.json is validated at build time, so a typo fails the build with the exact path
   instead of shipping a broken store. */

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lowercase letters, numbers and hyphens only');

export const siteSchema = z.object({
  business: z.object({
    name: z.string().min(2).max(50),
    short: z.string().min(2).max(12),
    wordmark: z.string().min(2).max(40),
    tagline: z.string().min(3).max(100),
    description: z.string().min(40).max(200),
    city: z.string().max(60),
    footer: z.string().max(120),
  }),
  contact: z.object({
    // digits only, with country code, no "+" (e.g. 14045550123). Empty = checkout shows a "not connected yet" message.
    whatsapp: z.union([z.literal(''), z.string().regex(/^\d{10,15}$/, 'digits only, with country code, no + (e.g. 14045550123)')]),
    instagram: z.string().regex(/^[A-Za-z0-9._]{1,30}$/, 'instagram handle without the @'),
    email: z.union([z.literal(''), z.email()]).default(''),
  }),
  currency: z.literal('USD'),
  shipping: z.object({
    countries: z.array(z.object({ code: z.string().length(2), name: z.string().min(2).max(40) })).min(1),
    handlingDays: z.number().int().min(0).max(60),
    note: z.string().max(200),
  }),
  categories: z.array(z.string().min(2).max(30)).min(1),
  welcome: z.object({
    enabled: z.boolean(),
    launch: z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'must be a date like 2026-12-05T18:00:00-05:00'),
    video: z.string().default(''),
    rememberSession: z.boolean().default(true),
  }),
  chain: z.object({
    eyebrow: z.string().max(40),
    heading: z.string().max(40),
    subtitle: z.string().max(160),
    idleSway: z.boolean().default(true),
    /* the 3D pieces, left to right. They all fall in together; the visitor picks one to inspect. 1 to 3 pieces. */
    items: z.array(z.object({
      product: slug,                               // handle of the product the piece belongs to
      model: z.string().startsWith('/'),           // .glb file in public/models
      metal: z.enum(['gold', 'silver']).default('silver'),
      label: z.string().max(24).optional(),        // short name on the buttons (defaults to the product title)
    })).min(1).max(3),
  }),
  lookbook: z.object({ heading: z.string().max(40), subtitle: z.string().max(200) }),
  shop: z.object({ heading: z.string().max(50), subtitle: z.string().max(200) }),
  leads: z.object({
    url: z.union([z.literal(''), z.url().refine((u) => u.startsWith('https://'), 'must be an https:// URL')]),
    token: z.string().min(16),
    logOrders: z.boolean(),
  }),
});

export const productsSchema = z.object({
  currency: z.literal('USD'),
  products: z.array(z.object({
    handle: slug,
    title: z.string().min(2),
    type: z.string().min(2),
    category: z.string(),
    description: z.string(),
    seo: z.string().default(''),
    tags: z.array(z.string()),
    price: z.number().positive(),
    priceVaries: z.boolean(),
    options: z.array(z.object({ name: z.string(), values: z.array(z.string()).min(1) })),
    images: z.array(z.object({ file: z.string().min(1), alt: z.string() })).min(1),
    variants: z.array(z.object({
      sku: z.string().min(1),
      options: z.array(z.string()),
      price: z.number().positive(),
      stock: z.number().int().min(0).nullable(),
      image: z.string().nullable(),
    })).min(1),
  })).min(1),
});

export const looksSchema = z.object({
  looks: z.array(z.object({
    name: z.string().min(2).max(40),
    tagline: z.string().max(120).default(''),
    lead: slug.optional(),                        // product whose photo stands in if the look has no model photo
    image: z.string().startsWith('/').optional(), // model photo, e.g. /looks/night-shift.webp (made by npm run images from photos-src/looks)
    backImage: z.string().startsWith('/').optional(),
    showsBack: z.boolean().default(false),        // the front photo shows the model from behind
    half: z.boolean().default(false),             // waist-up shot
    products: z.array(slug).min(1).max(6),
  })),
});
