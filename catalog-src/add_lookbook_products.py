#!/usr/bin/env python3
"""
Adds the lookbook-drop products (tees, crop tees, hoodies, pants, skirt, caps) to the catalog CSVs.

    python3 add_lookbook_products.py <folder-with-products-images>      # e.g. the unzipped  lookbook/products
    cd .. && npm run catalog && npm run images

It is safe to run again: it removes these products' rows first, then re-adds them (at the FRONT of the shop, ahead of the
puffers and jackets). Photos are copied into ../photos-src/products as mgy-<handle>.webp and mgy-<handle>-back.webp.

Photo labels (from the file names): T tops, CRO crop tops, H hoodies, P pants, MIN mini skirt, C caps; F = front, B = back.
Names, prices, descriptions, weights (lb) and stock below are PLACEHOLDERS: change them here and re-run.
"""
import csv, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_catalog as bc   # reuses the column lists and helpers (importing it does not build anything)

SRC = sys.argv[1] if len(sys.argv) > 1 else "lookbook/products"
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
PHOTOS = os.path.join(ROOT, "photos-src", "products")

CAT_TEE = "Apparel & Accessories > Clothing > Clothing Tops > T-Shirts"
CAT_HOOD = bc.C_HOOD
CAT_PANTS = "Apparel & Accessories > Clothing > Pants"
CAT_SKIRT = "Apparel & Accessories > Clothing > Skirts"
CAT_CAP = "Apparel & Accessories > Clothing Accessories > Hats > Trucker Hats"
CAP_STOCK = 12


def A(handle, title, type_, cat, sku, price, lb, dims, body, tags, front, alt, back=None, alt_back=None, **kw):
    d = dict(handle=handle, title=title, type=type_, cat=cat, sku=sku, price=price, lb=lb, dims=dims, body=body, tags=tags,
             front=front, alt=alt, back=back, alt_back=alt_back)
    d.update(kw)
    return d

NEW = [
    # ---------------- TEES ----------------
    A("dark-romance-tee", "Dark Romance Tee", "Tees", CAT_TEE, "TEE-01", 42, 0.65, (12, 10, 2),
      "A black oversized tee with a vintage two-figure print and MISGUIDED YUTES lettering on the front. A scribbled MGY runs across the back.",
      "Tees, Black, Graphic, Oversized", "T-1F", "Black oversized tee with a vintage two-figure print and MISGUIDED YUTES lettering",
      "T-1B", "Back view of the black tee with a scribbled MGY across the shoulders"),
    A("fangs-tee", "Fangs Tee", "Tees", CAT_TEE, "TEE-02", 42, 0.65, (12, 10, 2),
      "A black oversized tee with MISGUIDED YUTES in red between a set of fangs. The back carries a line of colourful figures and a WORLDWIDE label.",
      "Tees, Black, Graphic, Oversized", "T-2F", "Black oversized tee with red MISGUIDED YUTES lettering between fangs",
      "T-2B", "Back view of the black tee with a row of colourful figures and a MISGUIDED YUTES WORLDWIDE label"),
    A("brackets-tee", "Brackets Tee", "Tees", CAT_TEE, "TEE-03", 40, 0.6, (12, 10, 2),
      "A white tee with MISGUIDED YUTES set inside black corner brackets on the chest. The back is a collage of drawn faces.",
      "Tees, White, Graphic, Oversized", "T-3F", "White tee with MISGUIDED YUTES inside black corner brackets on the chest",
      "T-3B", "Back view of the white tee with a collage of drawn faces"),
    # colour product: White + Cream (the cream one has a front photo only)
    A("crown-tee", "Crown Tee", "Tees", CAT_TEE, "TEE-04", 42, 0.6, (12, 10, 2),
      "A tee with a crowned, masked head over the MISGUIDED YUTES name on the chest. The white one has a green X mark on the back. Available in White and Cream.",
      "Tees, White, Cream, Graphic, Oversized", "T-4F", "Crown tee in white with a crowned masked head and MISGUIDED YUTES on the chest",
      "T-4B", "Crown tee in white, back view with a green X mark",
      colors=["White", "Cream"], color_images={"Cream": ("T-4IF", "Crown tee in cream with a crowned masked head and MISGUIDED YUTES on the chest")}),
    A("tape-tee", "Tape Tee", "Tees", CAT_TEE, "TEE-05", 42, 0.6, (12, 10, 2),
      "A white tee with a red caution-tape and hands panel across the chest. A black X mark sits on the back.",
      "Tees, White, Graphic, Oversized", "T-5F", "White tee with a black panel of red caution tape and hands across the chest",
      "T-5B", "Back view of the white tee with a black X mark"),
    A("warning-tee", "Warning Tee", "Tees", CAT_TEE, "TEE-06", 42, 0.6, (12, 10, 2),
      "A white off-the-shoulder tee with a yellow warning sign reading I love MISGUIDED YUTES. A black bubble MGY with hearts sits on the back.",
      "Tees, White, Graphic, Off-shoulder", "T-6F", "White off-the-shoulder tee with a warning sign reading I heart MISGUIDED YUTES",
      "T-6B", "Back view of the white tee with a black bubble MGY and hearts"),
    A("blob-tee", "Blob Tee", "Tees", CAT_TEE, "TEE-07", 42, 0.65, (12, 10, 2),
      "A cream oversized tee with MISGUIDED YUTES in black blob lettering across the chest. A DJ at the decks is printed on the back.",
      "Tees, Cream, Graphic, Oversized", "T-7F", "Cream oversized tee with MISGUIDED YUTES in black blob lettering",
      "T-7B", "Back view of the cream tee with a DJ at the decks print"),
    A("lips-tee", "Lips Tee", "Tees", CAT_TEE, "TEE-08", 42, 0.6, (12, 10, 2),
      "A white off-the-shoulder tee covered in red lips with an MGY in the middle. A black bubble MGY with hearts sits on the back.",
      "Tees, White, Graphic, Off-shoulder", "T-8F", "White off-the-shoulder tee covered in red lips with an MGY mark",
      "T-8B", "Back view of the white tee with a black bubble MGY and hearts"),
    A("flower-girl-tee", "Flower Girl Tee", "Tees", CAT_TEE, "TEE-09", 42, 0.6, (12, 10, 2),
      "A white off-the-shoulder tee with an ink drawing of a woman holding a flower.",
      "Tees, White, Graphic, Off-shoulder", "T-9F", "White off-the-shoulder tee with an ink drawing of a woman holding a flower"),
    A("pink-block-crop-tee", "Pink Block Crop Tee", "Tees", CAT_TEE, "CRO-01", 38, 0.45, (10, 8, 2),
      "A white cropped tee with blue MISGUIDED YUTES lettering over a pink block with a black X. A small gold crest sits on the back.",
      "Tees, White, Cropped, Graphic", "CRO-1F", "White cropped tee with blue MISGUIDED YUTES lettering over a pink block with a black X",
      "CRO-1B", "Back view of the white cropped tee with a small gold crest"),
    A("pretty-mgy-crop-tee", "Pretty MGY Crop Tee", "Tees", CAT_TEE, "CRO-02", 38, 0.45, (10, 8, 2),
      "A white cropped tee with PRETTY MGY in black and pink across the chest. A film clapperboard reading MISGUIDED YUTES is printed on the back.",
      "Tees, White, Cropped, Graphic", "CRO-2F", "White cropped tee with PRETTY MGY in black and pink across the chest",
      "CRO-2B", "Back view of the white cropped tee with a MISGUIDED YUTES clapperboard"),
    # ---------------- HOODIES ----------------
    A("gothic-hoodie", "Gothic Hoodie", "Hoodies", CAT_HOOD, "HDL-01", 85, 1.7, (14, 12, 4),
      "A black hoodie with MISGUIDED YUTES in gothic lettering across the chest.",
      "Hoodies, Black, Graphic", "H-1F", "Black hoodie with MISGUIDED YUTES in gothic lettering on the chest"),
    A("skate-hoodie", "Skate Hoodie", "Hoodies", CAT_HOOD, "HDL-02", 85, 1.7, (14, 12, 4),
      "A cream hoodie with a red skateboard graphic on the chest and a portrait print on the back.",
      "Hoodies, Cream, Graphic", "H-2F", "Cream hoodie with a red skateboard graphic on the chest",
      "H-2B", "Back view of the cream hoodie with a portrait print"),
    A("stamp-hoodie", "Stamp Hoodie", "Hoodies", CAT_HOOD, "HDL-03", 85, 1.7, (14, 12, 4),
      "A cream hoodie with a black stamped MISGUIDED YUTES print on the chest.",
      "Hoodies, Cream, Graphic", "H-3F", "Cream hoodie with a black stamped MISGUIDED YUTES print on the chest"),
    A("mask-hoodie", "Mask Hoodie", "Hoodies", CAT_HOOD, "HDL-04", 85, 1.7, (14, 12, 4),
      "A black hoodie with a white masked-face graphic and green MISGUIDED YUTES text on the chest.",
      "Hoodies, Black, Graphic", "H-4F", "Black hoodie with a white masked-face graphic and green MISGUIDED YUTES text"),
    # ---------------- BOTTOMS ----------------
    A("flame-track-pants", "Flame Track Pants", "Bottoms", CAT_PANTS, "PNT-01", 72, 1.5, (14, 11, 3),
      "Black track pants with white piping, flame artwork and a vertical MGY down the leg, finished with drawcord hems.",
      "Bottoms, Black, Track pants, Graphic", "P-1F", "Black track pants with white piping, flame artwork and a vertical MGY down the leg",
      "P-1B", "Back view of the black track pants with white piping"),
    A("pink-wash-wide-leg", "Pink Wash Wide-Leg", "Bottoms", CAT_PANTS, "PNT-02", 75, 1.5, (14, 11, 3),
      "Wide-leg pants in washed pink with MISGUIDED YUTES printed down the front in tall lettering.",
      "Bottoms, Pink, Wide leg, Graphic", "P-2F", "Washed pink wide-leg pants with MISGUIDED YUTES printed down the front"),
    A("crest-wide-leg-sweats", "Crest Wide-Leg Sweats", "Bottoms", CAT_PANTS, "PNT-03", 72, 1.6, (14, 11, 3),
      "Black wide-leg sweatpants with a gold crest at the hip and a vertical MGY down the leg.",
      "Bottoms, Black, Wide leg, Sweatpants, Graphic", "P-3F", "Black wide-leg sweatpants with a gold crest at the hip and a vertical MGY down the leg"),
    A("silhouette-sweats", "Silhouette Sweats", "Bottoms", CAT_PANTS, "PNT-04", 72, 1.6, (14, 11, 3),
      "Black wide-leg sweatpants with white hand and shoe silhouettes down the leg and a star at the hip.",
      "Bottoms, Black, Wide leg, Sweatpants, Graphic", "P-4F", "Black wide-leg sweatpants with white hand and shoe silhouettes and a star at the hip"),
    A("bubble-mgy-sweats", "Bubble MGY Sweats", "Bottoms", CAT_PANTS, "PNT-05", 72, 1.6, (14, 11, 3),
      "Black wide-leg sweatpants with a white bubble-letter MGY and hearts on the thigh.",
      "Bottoms, Black, Wide leg, Sweatpants, Graphic", "P-5F", "Black wide-leg sweatpants with a white bubble-letter MGY and hearts on the thigh"),
    A("x-track-pants", "X Track Pants", "Bottoms", CAT_PANTS, "PNT-06", 72, 1.4, (14, 11, 3),
      "Black track pants with white piping and white X marks down each leg.",
      "Bottoms, Black, Track pants, Graphic", "P-6F", "Black track pants with white piping and white X marks down each leg"),
    A("pleated-mini-skirt", "Pleated Mini Skirt", "Bottoms", CAT_SKIRT, "SKT-01", 48, 0.5, (12, 10, 2),
      "A white pleated mini skirt with a small MGY mark at the hem.",
      "Bottoms, White, Skirt, Pleated", "MIN-1F", "White pleated mini skirt with a small MGY mark at the hem"),
]

# Caps: one product per design. "colors" = one variant per colour (file, alt). No sizes: one size fits.
CAPS = [
    dict(handle="crown-trucker-cap", title="MGY Crown Trucker Cap", type="Caps", cat=bc.C_BUCK.replace("Clothing Accessories > Belt Buckles", "Clothing Accessories > Hats > Trucker Hats"),
         sku="CAP-01", price=32, lb=0.4, dims=(9, 8, 6),
         body="A foam-front trucker cap with the crowned MGY script in black on white and a mesh back. Available in Red, Green, Gold, Gold & Red and Black. One size.",
         tags="Caps, Trucker, Mesh, Logo",
         colors=[("Red", "C-1"), ("Green", "C-2"), ("Gold", "C-3"), ("Gold & Red", "C-4"), ("Black", "C-5")]),
    dict(handle="crest-trucker-cap", title="MGY Crest Trucker Cap", type="Caps", cat=CAT_CAP, sku="CAP-02", price=38, lb=0.4, dims=(9, 8, 6),
         body="A black mesh trucker cap with a white foam front carrying the gold winged crest. One size.",
         tags="Caps, Trucker, Mesh, Black, Crest", single="C-I1"),
]
for c in CAPS: c["cat"] = CAT_CAP

NEW_HANDLES = {p["handle"] for p in NEW} | {c["handle"] for c in CAPS}


def photo(src_name, handle, suffix=""):
    """Copy a photo into photos-src/products and return the name WITHOUT extension."""
    name = f"mgy-{handle}{suffix}"
    src = os.path.join(SRC, src_name + ".webp")
    assert os.path.exists(src), f"missing photo {src}"
    os.makedirs(PHOTOS, exist_ok=True)
    shutil.copyfile(src, os.path.join(PHOTOS, name + ".webp"))
    return name


rows, inv = [], []

def add(p, variants, images):
    """variants: dicts(opt1, opt2, sku, lb, price, cost, variant_image, stock). images: list of (url, alt)."""
    n = max(len(variants), len(images))
    l, w, h = p["dims"]
    for i in range(n):
        r = {c: "" for c in bc.COLS}
        r["Handle"] = p["handle"]
        if i < len(variants):
            v = variants[i]
            r.update({"Option1 Value": v["opt1"], "Option2 Value": v.get("opt2", ""), "Variant SKU": v["sku"], "Variant Grams": bc.grams(v["lb"]),
                      "Variant Inventory Tracker": "shopify", "Variant Inventory Policy": "deny", "Variant Fulfillment Service": "manual",
                      "Variant Price": bc.money(v["price"]), "Variant Requires Shipping": "true", "Variant Taxable": "true",
                      "Variant Image": v.get("variant_image", ""), "Variant Weight Unit": "lb", "Cost per item": bc.money(v["cost"]),
                      "Variant Packed Length": l, "Variant Packed Width": w, "Variant Packed Height": h, "Variant Packed Dimension Unit": "in"})
            inv.append({"Handle": p["handle"], "Title": p["title"], "Option1 Name": p["opt1_name"], "Option1 Value": v["opt1"],
                        "Option2 Name": p.get("opt2_name", ""), "Option2 Value": v.get("opt2", ""), "SKU": v["sku"], "Location": bc.LOCATION,
                        "Incoming (not editable)": 0, "Unavailable (not editable)": 0, "Committed (not editable)": 0,
                        "Available (not editable)": v["stock"], "On hand (new)": v["stock"]})
        if i < len(images):
            r["Image Src"], r["Image Alt Text"] = images[i]
            r["Image Position"] = i + 1
        if i == 0:
            r.update({"Title": p["title"], "Body (HTML)": bc.para(p["body"]), "Vendor": bc.VENDOR, "Product Category": p["cat"], "Type": p["type"],
                      "Tags": p["tags"], "Published": "true", "Option1 Name": p["opt1_name"], "Option2 Name": p.get("opt2_name", ""),
                      "Gift Card": "false", "SEO Title": f"{p['title']} | {bc.VENDOR}", "SEO Description": bc.seo_desc(p["body"]), "Status": "active"})
        rows.append(r)


for p in NEW:
    cost = round(p["price"] * 0.38, 2)
    h = p["handle"]
    images = []                                           # (file name without extension, alt)
    images.append((photo(p["front"], h), p["alt"]))
    if p.get("back"): images.append((photo(p["back"], h, "-back"), p["alt_back"]))
    variants = []
    p["opt1_name"] = "Size"
    if p.get("colors"):
        p["opt2_name"] = "Color"
        extra = {}
        for col, (f, alt) in p.get("color_images", {}).items():
            fn = photo(f, h, "-" + col.lower()); images.append((fn, alt)); extra[col] = fn
        first = p["colors"][0]
        front_of = {c: extra.get(c, images[0][0]) for c in p["colors"]}
        for col in p["colors"]:
            for s in bc.SIZES:
                variants.append(dict(opt1=s, opt2=col, sku=f"{p['sku']}-{col[:3].upper()}-{s}", lb=bc.round05(p["lb"] * bc.SIZE_WEIGHT_FACTOR[s]),
                                     price=p["price"], cost=cost, variant_image=bc.url(front_of[col] + ".webp"), stock=bc.SIZE_STOCK[s]))
    else:
        for s in bc.SIZES:
            variants.append(dict(opt1=s, sku=f"{p['sku']}-{s}", lb=bc.round05(p["lb"] * bc.SIZE_WEIGHT_FACTOR[s]), price=p["price"], cost=cost,
                                 stock=bc.SIZE_STOCK[s]))
    add(p, variants, [(bc.url(fn + ".webp"), alt) for fn, alt in images])

for c in CAPS:
    cost = round(c["price"] * 0.38, 2)
    if c.get("single"):
        c["opt1_name"] = "Title"
        fn = photo(c["single"], c["handle"])
        add(c, [dict(opt1="Default Title", sku=c["sku"], lb=c["lb"], price=c["price"], cost=cost, stock=CAP_STOCK)],
            [(bc.url(fn + ".webp"), "Black mesh trucker cap with a white foam front and a gold winged crest")])
    else:
        c["opt1_name"] = "Color"
        variants, images = [], []
        for i, (col, f) in enumerate(c["colors"]):
            fn = photo(f, c["handle"], "-" + col.lower().replace(" & ", "-").replace(" ", "-"))
            images.append((bc.url(fn + ".webp"), f"{col} trucker cap with the crowned MGY script in black on a white front"))
            variants.append(dict(opt1=col, sku=f"{c['sku']}-{col[:3].upper().replace(' ', '')}{i}", lb=c["lb"], price=c["price"], cost=cost,
                                 variant_image=images[-1][0], stock=CAP_STOCK))
        add(c, variants, images)

# alt text must contain "back" only on back photos (the shop treats that word as "this is the back view")
for r in rows:
    alt = r["Image Alt Text"].lower().replace("black", "")
    if alt and "back" in alt: assert "back view" in alt, r["Image Alt Text"]

def merge(path, fields, new_rows):
    with open(path, newline="", encoding="utf-8") as f:
        old = [r for r in csv.DictReader(f) if r["Handle"] not in NEW_HANDLES]
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_MINIMAL, lineterminator="\n", restval="")
        w.writeheader(); w.writerows(new_rows + old)

merge(os.path.join(HERE, "mgy_products_import.csv"), bc.COLS, rows)
merge(os.path.join(HERE, "mgy_inventory_import.csv"), bc.INV_COLS, inv)
print(f"{len(NEW_HANDLES)} products added ({len(inv)} variants). Next: cd .. && npm run catalog && npm run images")
