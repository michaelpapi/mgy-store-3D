#!/usr/bin/env python3
"""
MGY catalog builder
-------------------
Reads the photos in  uploads-mgy/with-logo  and  uploads-mgy/jewleries/mockups,
then writes:

  out/mgy_products_import.csv     Shopify product CSV (same 47 columns as products_schema.csv)
  out/mgy_inventory_import.csv    Shopify inventory CSV ("All states" format)
  out/images/                     renamed, upload-ready photos (drag all into Shopify > Content > Files)
  out/image-map.csv               original file -> new file name -> product

All product facts live in the PRODUCTS list below. Edit a price, weight, description or
quantity there and re-run:

    python3 build_catalog.py <path-to-uploads-mgy> <output-dir>

Weights are in pounds (the store shows lb), packed dimensions are in inches. All weights,
dimensions, costs and stock levels are PLACEHOLDERS - replace them with real numbers.
"""
import csv, os, re, sys, shutil
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else "uploads-mgy"
OUT = sys.argv[2] if len(sys.argv) > 2 else "out"

# ----------------------------------------------------------------------------------------
# SETTINGS YOU MAY NEED TO CHANGE
# ----------------------------------------------------------------------------------------
# Where Shopify will serve the images once you've uploaded them to Content > Files.
# This is the same folder the products in products_schema.csv already use.
IMAGE_BASE = "https://cdn.shopify.com/s/files/1/0721/9478/5414/files/"
# Must match the location name in Shopify (Settings > Locations) EXACTLY, including case.
LOCATION = "Shop location"
VENDOR = "Misguided Yutes"
SIZES = ["S", "M", "L", "XL", "XXL"]
SIZE_WEIGHT_FACTOR = {"S": 0.94, "M": 1.0, "L": 1.06, "XL": 1.12, "XXL": 1.18}
SIZE_STOCK = {"S": 6, "M": 10, "L": 10, "XL": 8, "XXL": 4}
GRAMS_PER_LB = 453.59237

WL = os.path.join(SRC, "with-logo")
JW = os.path.join(SRC, "jewleries", "mockups")

C_PUF = "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Puffer Jackets"
C_VEST = "Apparel & Accessories > Clothing > Outerwear > Vests"
C_BOMB = "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Bomber Jackets"
C_JKT = "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets"
C_VARS = "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Varsity Jackets"
C_HOOD = "Apparel & Accessories > Clothing > Clothing Tops > Hoodies"
C_SWEAT = "Apparel & Accessories > Clothing > Clothing Tops > Sweatshirts"
C_SWPT = "Apparel & Accessories > Clothing > Activewear > Activewear Pants > Sweatpants"
C_CARGO = "Apparel & Accessories > Clothing > Pants > Cargo Pants"
C_NECK = "Apparel & Accessories > Jewelry > Necklaces"
C_RING = "Apparel & Accessories > Jewelry > Rings"
C_BUCK = "Apparel & Accessories > Clothing Accessories > Belt Buckles"

LOGO_W = "white MGY oval logo on the chest"
LOGO_T = "tonal MGY oval logo on the chest"


def P(handle, title, type_, cat, sku, price, lb, dims, body, tags, photo, alt, stock=1.0, **kw):
    """One apparel product with Size S-XXL. photo = file name inside with-logo/."""
    d = dict(handle=handle, title=title, type=type_, cat=cat, sku=sku, price=price, lb=lb,
             dims=dims, body=body, tags=tags, stock=stock, kind="apparel",
             images=[(os.path.join(WL, photo), alt)])
    d.update(kw)
    return d


# ----------------------------------------------------------------------------------------
# THE CATALOG
# ----------------------------------------------------------------------------------------
PRODUCTS = [
    # ---------------- PUFFERS ----------------
    P("funnel-neck-puffer", "Funnel Neck Puffer", "Puffers", C_PUF, "PUF-01", 150, 2.4, (18, 14, 7),
      "A black puffer with a wide funnel collar, elasticated cuffs and hem, and a full zip front. The MGY oval sits tonal on the chest.",
      "Puffers, Black, Outerwear, Tonal logo", "mgy-b-jacket1.jpg",
      "Black funnel neck puffer jacket with a tonal MGY oval logo on the chest", 1.0),
    P("detachable-hood-puffer", "Detachable Hood Puffer", "Puffers", C_PUF, "PUF-02", 175, 2.8, (18, 14, 8),
      "A black puffer with a removable hood, zip pockets and a clean quilted body. The white MGY oval sits on the chest and the script MGY mark runs down the sleeve.",
      "Puffers, Black, Hooded, Outerwear, Logo", "mgy-b-jacket2.jpg",
      "Black puffer jacket with a detachable hood, white MGY oval logo on the chest and MGY script mark on the sleeve", 1.1),
    P("cropped-hood-puffer", "Cropped Hood Puffer", "Puffers", C_PUF, "PUF-03", 160, 2.2, (16, 13, 6),
      "A cropped, boxy hooded puffer in black. Tonal MGY oval on the chest and a small MGY mark on the sleeve.",
      "Puffers, Black, Hooded, Cropped, Outerwear", "mgy-b-jacket3.jpg",
      "Black cropped hooded puffer jacket with a tonal MGY logo on the chest", 0.8),
    P("brown-expedition-puffer", "Brown Expedition Puffer", "Puffers", C_PUF, "PUF-04", 185, 3.0, (18, 14, 8),
      "A heavyweight hooded puffer in deep brown with a snap-and-zip front. White MGY oval on the chest and the MGY script mark on the sleeve.",
      "Puffers, Brown, Hooded, Outerwear, Logo", "mgy-b-jacket4.jpg",
      "Brown hooded puffer jacket with a white MGY oval logo on the chest and MGY script mark on the sleeve", 0.9),
    P("chocolate-hooded-puffer", "Chocolate Hooded Puffer", "Puffers", C_PUF, "PUF-05", 155, 2.3, (17, 14, 7),
      "A short, hooded puffer in chocolate brown with drawcord hem toggles. The MGY oval sits tonal on the chest.",
      "Puffers, Brown, Hooded, Outerwear, Tonal logo", "mgy-b-jacket6.jpg",
      "Chocolate brown hooded puffer jacket with a tonal MGY oval logo on the chest", 0.9),
    P("layered-hood-puffer", "Layered Hood Puffer", "Puffers", C_PUF, "PUF-06", 170, 2.6, (18, 14, 8),
      "A black puffer with a layered, structured hood and a full zip front. The MGY oval sits tonal on the chest.",
      "Puffers, Black, Hooded, Outerwear, Tonal logo", "mgy-b-jacket8.jpg",
      "Black puffer jacket with a layered hood and a tonal MGY oval logo on the chest", 1.0),
    P("boxy-hooded-puffer", "Boxy Hooded Puffer", "Puffers", C_PUF, "PUF-07", 160, 2.4, (18, 14, 7),
      "A boxy black hooded puffer with a hidden zip placket. The white MGY oval sits low on the chest.",
      "Puffers, Black, Hooded, Outerwear, Logo", "mgy-b-jacket9 (2).jpg",
      "Black boxy hooded puffer jacket with a white MGY oval logo on the chest", 1.2),
    P("quilted-zip-puffer", "Quilted Zip Puffer", "Puffers", C_PUF, "PUF-08", 140, 2.0, (17, 13, 6),
      "A lighter quilted puffer in black with a hood and zip front, finished with an MGY patch logo on the chest.",
      "Puffers, Black, Hooded, Quilted, Outerwear, Logo", "mgy-b-jacket10.jpg",
      "Black quilted hooded puffer jacket with an MGY patch logo on the chest", 1.0),
    P("drawcord-crop-puffer", "Drawcord Crop Puffer", "Puffers", C_PUF, "PUF-09", 150, 2.1, (16, 13, 6),
      "A cropped black puffer with a high collar and a drawcord hem that cinches the shape. Tonal MGY oval on the chest.",
      "Puffers, Black, Cropped, Outerwear, Tonal logo", "mgy-b-jacket11.jpg",
      "Black cropped puffer jacket with a high collar, drawcord hem and tonal MGY logo", 0.8),
    P("snap-front-crop-puffer", "Snap-Front Crop Puffer", "Puffers", C_PUF, "PUF-10", 165, 2.3, (16, 13, 6),
      "A cropped hooded puffer in black with a snap-button placket and drawcord hem. The white MGY oval sits on the upper chest.",
      "Puffers, Black, Hooded, Cropped, Outerwear, Logo", "mgy-b-jacket12 (2).jpg",
      "Black cropped hooded puffer jacket with a snap placket and a white MGY oval logo on the chest", 0.9),
    P("oversized-hood-puffer", "Oversized Hood Puffer", "Puffers", C_PUF, "PUF-11", 195, 3.1, (19, 15, 8),
      "An oversized black puffer built around a big, structured hood. Tonal MGY oval on the chest and an MGY armband on the sleeve.",
      "Puffers, Black, Hooded, Oversized, Outerwear", "mgy-b-jacket15.jpg",
      "Black oversized puffer jacket with a large hood, tonal MGY logo on the chest and an armband logo on the sleeve", 0.7),
    P("armband-hood-puffer", "Armband Hood Puffer", "Puffers", C_PUF, "PUF-12", 185, 2.9, (18, 14, 8),
      "A black hooded puffer with a white MGY oval on the chest and the MGY script mark worn as an armband on the sleeve.",
      "Puffers, Black, Hooded, Outerwear, Logo", "mgy-b-jacket16 (2).jpg",
      "Black hooded puffer jacket with a white MGY oval logo on the chest and an MGY armband on the sleeve", 1.1),
    # colour product: black + navy (b-jacket17 / b-jacket18)
    dict(handle="zip-through-hooded-puffer", title="Zip-Through Hooded Puffer", type="Puffers", cat=C_PUF,
         sku="PUF-13", price=150, lb=2.5, dims=(18, 14, 7), kind="apparel", stock=1.0,
         body="A zip-through hooded puffer with elasticated cuffs and a drawcord hem. Tonal MGY oval on the chest. Available in Black and Navy.",
         tags="Puffers, Black, Navy, Hooded, Outerwear, Tonal logo",
         colors=["Black", "Navy"],
         images=[(os.path.join(WL, "mgy-b-jacket17.jpg"), "Black zip-through hooded puffer jacket with a tonal MGY oval logo"),
                 (os.path.join(WL, "mgy-b-jacket18.jpg"), "Navy zip-through hooded puffer jacket with a tonal MGY oval logo")]),
    P("two-tone-panel-puffer", "Two-Tone Panel Puffer", "Puffers", C_PUF, "PUF-14", 180, 2.9, (18, 14, 8),
      "A black puffer with a textured panel across the chest and shoulders and a detachable hood. Tonal MGY oval on the chest.",
      "Puffers, Black, Hooded, Outerwear, Tonal logo", "mgy-b-jacket19.jpg",
      "Black two-tone puffer jacket with a textured chest panel, detachable hood and a tonal MGY logo", 0.9),
    P("sand-two-tone-puffer", "Sand Two-Tone Puffer", "Puffers", C_PUF, "PUF-15", 170, 2.8, (18, 14, 8),
      "A sand puffer with a brown hood and brown panelling across the chest. The white MGY oval sits on the chest.",
      "Puffers, Sand, Brown, Hooded, Outerwear, Logo", "mgy-b-jacket20.jpg",
      "Sand and brown two-tone hooded puffer jacket with a white MGY oval logo on the chest", 0.8),
    P("cream-stand-collar-puffer", "Cream Stand-Collar Puffer", "Puffers", C_PUF, "PUF-16", 165, 2.5, (18, 14, 7),
      "A cream puffer with a stand collar and a soft, rounded quilted shape. MGY oval on the chest.",
      "Puffers, Cream, Outerwear, Logo", "mgy-b-jacket21.jpg",
      "Cream stand-collar puffer jacket with an MGY oval logo on the chest", 0.8),
    P("hooded-puffer-vest", "Hooded Puffer Vest", "Puffers", C_VEST, "PUF-17", 110, 1.5, (14, 11, 4),
      "A black puffer vest with a hood and full zip front, for layering over hoodies and long sleeves. Tonal MGY oval on the chest.",
      "Puffers, Black, Vest, Hooded, Layering, Tonal logo", "mgy-b-jacket22.jpg",
      "Black hooded puffer vest with a tonal MGY oval logo on the chest", 1.0),
    P("stand-collar-puffer-vest", "Stand-Collar Puffer Vest", "Puffers", C_VEST, "PUF-18", 115, 1.6, (14, 11, 4),
      "A near-black stand-collar puffer vest with a quilted body, zip front and hand pockets. Tonal MGY oval on the chest.",
      "Puffers, Black, Vest, Layering, Tonal logo", "mgy-b-jacket23.jpg",
      "Dark stand-collar puffer vest with a tonal MGY oval logo on the chest", 0.9),
    P("collared-puffer-jacket", "Collared Puffer Jacket", "Puffers", C_PUF, "PUF-19", 155, 2.6, (18, 14, 7),
      "A black puffer with a stand collar and a boxy, quilted body. Tonal MGY oval on the chest.",
      "Puffers, Black, Outerwear, Tonal logo", "mgy-b-jacket24.jpg",
      "Black collared puffer jacket with a tonal MGY oval logo on the chest", 0.9),

    # ---------------- JACKETS ----------------
    P("flight-bomber-jacket", "Flight Bomber Jacket", "Jackets", C_BOMB, "JKT-01", 140, 1.9, (16, 13, 5),
      "A black flight bomber with a contrast orange lining, ribbed collar and hem, and a zip pocket on the sleeve. Tonal MGY oval on the chest.",
      "Jackets, Black, Bomber, Outerwear, Tonal logo", "mgy-b-jacket13.jpg",
      "Black flight bomber jacket with an orange lining, sleeve zip pocket and a tonal MGY logo", 0.9),
    P("zip-work-jacket", "Zip Work Jacket", "Jackets", C_JKT, "JKT-02", 120, 1.8, (16, 13, 4),
      "A black work jacket with a collar, a two-way zip and slanted front pockets. Tonal MGY oval on the chest.",
      "Jackets, Black, Workwear, Outerwear, Tonal logo", "mgy-jacket1.jpg",
      "Black collared zip work jacket with slanted pockets and a tonal MGY logo on the chest", 0.9),
    P("leather-varsity-bomber", "Leather Varsity Bomber", "Jackets", C_VARS, "JKT-03", 220, 3.4, (17, 14, 6),
      "A black leather varsity bomber with a snap-button front, a collar and a ribbed hem. Tonal MGY oval on the chest.",
      "Jackets, Black, Leather, Varsity, Outerwear, Tonal logo", "mgy-jacket2.jpg",
      "Black leather varsity bomber jacket with snap front and a tonal MGY logo on the chest", 0.6),
    P("hooded-leather-jacket", "Hooded Leather Jacket", "Jackets", C_JKT, "JKT-04", 215, 3.6, (17, 14, 7),
      "A black leather jacket with a lined hood, a full zip, textured sleeves and a ribbed hem. White MGY logo on the chest.",
      "Jackets, Black, Leather, Hooded, Outerwear, Logo", "mgy-leather-jacket1-1.jpg",
      "Black hooded leather jacket with textured sleeves and a white MGY logo on the chest", 0.6),
    P("leather-bomber-jacket", "Leather Bomber Jacket", "Jackets", C_BOMB, "JKT-05", 210, 3.2, (17, 14, 6),
      "A black leather bomber with a collar, a full zip and a ribbed hem. White MGY oval on the chest.",
      "Jackets, Black, Leather, Bomber, Outerwear, Logo", "mgy-leather-jacket2-1.jpg",
      "Black leather bomber jacket with a collar and a white MGY oval logo on the chest", 0.7),

    # ---------------- HOODIES ----------------
    P("quarter-zip-pullover", "Quarter-Zip Pullover", "Hoodies", C_SWEAT, "HOD-01", 80, 1.6, (14, 11, 4),
      "A black quarter-zip pullover with a stand collar and a relaxed fit. Tonal MGY oval on the chest.",
      "Hoodies, Black, Pullover, Quarter-zip, Tonal logo", "mgy-b-jacket14.jpg",
      "Black quarter-zip pullover with a stand collar and a tonal MGY logo on the chest", 1.0),
    P("boxy-logo-hoodie", "Boxy Logo Hoodie", "Hoodies", C_HOOD, "HOD-02", 75, 1.8, (14, 11, 4),
      "A boxy black hoodie with a wide hood and a ribbed hem. White MGY oval centred on the chest.",
      "Hoodies, Black, Boxy, Logo", "mgy-hoodie1-1.jpg",
      "Black boxy hoodie with a white MGY oval logo centred on the chest", 1.2),
    P("tech-zip-hoodie", "Tech Zip Hoodie", "Hoodies", C_HOOD, "HOD-03", 90, 2.0, (15, 12, 4),
      "A black zip-through hoodie with panelled seams and a zipped sleeve pocket. White MGY oval on the chest.",
      "Hoodies, Black, Zip, Tech, Logo", "mgy-hoodie3-1.jpg",
      "Black zip-through tech hoodie with panelled seams, a sleeve pocket and a white MGY logo", 1.1),
    P("cream-crop-hoodie", "Cream Crop Hoodie", "Hoodies", C_HOOD, "HOD-04", 65, 1.1, (12, 10, 3),
      "A cropped cream hoodie with a raw hem, a drawstring hood and a MGY logo patch.",
      "Hoodies, Cream, Cropped, Logo", "mgy-crop-jacket1.jpg",
      "Cream cropped hoodie with a drawstring hood, raw hem and an MGY logo patch", 0.8),
    P("black-crop-hoodie", "Black Crop Hoodie", "Hoodies", C_HOOD, "HOD-05", 65, 1.2, (12, 10, 3),
      "A cropped black hoodie with a drawstring hood and long sleeves. White MGY oval on the chest.",
      "Hoodies, Black, Cropped, Logo", "mgy-crop-jacket2-1.jpg",
      "Black cropped hoodie with a drawstring hood and a white MGY oval logo on the chest", 1.0),
    P("white-shrug-hoodie", "White Shrug Hoodie", "Hoodies", C_HOOD, "HOD-06", 60, 1.0, (12, 10, 3),
      "A white cropped shrug hoodie with long sleeves, a drawstring hood and the MGY script mark on the chest.",
      "Hoodies, White, Cropped, Shrug, Logo", "mgy-crop-jacket3.jpg",
      "White cropped shrug hoodie with long sleeves, a drawstring hood and an MGY script logo", 0.7),
    P("white-zip-crop-hoodie", "White Zip Crop Hoodie", "Hoodies", C_HOOD, "HOD-07", 70, 1.3, (12, 10, 3),
      "A cropped white zip hoodie with a soft lined hood. MGY oval on the chest.",
      "Hoodies, White, Cropped, Zip, Logo", "mgy-crop-jacket4.jpg",
      "White cropped zip hoodie with a lined hood and an MGY oval logo on the chest", 0.8),

    # ---------------- BOTTOMS ----------------
    P("wide-leg-sweatpants", "Wide-Leg Sweatpants", "Bottoms", C_SWPT, "BTM-01", 65, 1.7, (13, 11, 4),
      "Black wide-leg sweatpants with an elasticated, drawcord waist. A tonal MGY oval sits on the upper thigh.",
      "Bottoms, Black, Sweatpants, Wide leg, Tonal logo", "mgy-joggers1.jpg",
      "Black wide-leg sweatpants with a drawcord waist and a tonal MGY logo", 1.0),
    P("camo-cargo-pants", "Camo Cargo Pants", "Bottoms", C_CARGO, "BTM-02", 80, 2.1, (14, 11, 5),
      "Wide-leg cargo pants in a green camo print with a white MGY oval on the thigh.",
      "Bottoms, Camo, Cargo, Wide leg, Logo", "mgy-joggers3.jpg",
      "Green camo wide-leg cargo pants with a white MGY oval logo on the thigh", 0.9),
]

# ---------------- JEWELRY (built separately: different options and image types) ----------------
JEWELRY = [
    dict(handle="mgy-pendant-curb-chain", title="MGY Pendant & Curb Chain", type="Jewelry", cat=C_NECK,
         sku="JWL-01", cost=34, kind="option", opt_name="Chain Length",
         # (value, price, lb, stock)
         opts=[("18 in", 85, 0.45, 8), ("20 in", 90, 0.50, 12), ("22 in", 95, 0.55, 12), ("24 in", 100, 0.60, 8)],
         dims=(7, 5, 2),
         body="The MGY pendant in a polished silver finish, hung on a heavy curb chain with a lobster clasp. Available in 18, 20, 22 and 24 inch chain lengths.",
         tags="Jewelry, Silver, Pendant, Necklace, Chain",
         images=[(os.path.join(JW, "Liquid Silver MGY Pendant Necklace.png"), "mgy-pendant-curb-chain",
                  "MGY pendant on a silver curb chain, laid flat on a dark surface"),
                 (os.path.join(JW, "Polished Silver MGY Pendant and Curb Chain.png"), "mgy-pendant-curb-chain-2",
                  "MGY pendant and curb chain worn on the neck over a black tee"),
                 (os.path.join(JW, "Liquid Chrome MGY Pendant.png"), "mgy-pendant-curb-chain-3",
                  "Close-up of the polished silver MGY pendant on its curb chain")]),
    dict(handle="mgy-sculptural-ring", title="MGY Sculptural Ring", type="Jewelry", cat=C_RING,
         sku="JWL-02", cost=22, kind="option", opt_name="Ring Size",
         opts=[("7", 75, 0.12, 6), ("8", 75, 0.13, 8), ("9", 75, 0.14, 8), ("10", 75, 0.15, 8), ("11", 75, 0.16, 6), ("12", 75, 0.17, 4)],
         dims=(4, 4, 2),
         body="A sculptural signet ring with the MGY wordmark in a liquid gold finish. Available in US ring sizes 7 to 12.",
         tags="Jewelry, Gold, Ring, Signet",
         images=[(os.path.join(JW, "Liquid Gold MGY Sculptural Ring.png"), "mgy-sculptural-ring",
                  "Gold MGY sculptural signet ring on a dark surface")]),
    dict(handle="mgy-belt-buckle", title="MGY Belt Buckle", type="Jewelry", cat=C_BUCK,
         sku="JWL-03", cost=20, kind="single", price=60, lb=0.40, stock=15, dims=(6, 4, 2),
         body="A polished silver belt buckle with the MGY wordmark set inside an open oval frame. Fits a standard belt strap.",
         tags="Jewelry, Silver, Belt buckle, Accessories",
         images=[(os.path.join(JW, "Polished Melted-Form Silver Belt Buckle.png"), "mgy-belt-buckle",
                  "Polished silver MGY belt buckle on a black leather belt")]),
]

# ----------------------------------------------------------------------------------------
# COLUMNS (identical to products_schema.csv)
# ----------------------------------------------------------------------------------------
COLS = ["Handle", "Title", "Body (HTML)", "Vendor", "Product Category", "Type", "Tags", "Published",
        "Option1 Name", "Option1 Value", "Option1 Linked To", "Option2 Name", "Option2 Value", "Option2 Linked To",
        "Option3 Name", "Option3 Value", "Option3 Linked To", "Variant SKU", "Variant Grams",
        "Variant Inventory Tracker", "Variant Inventory Policy", "Variant Fulfillment Service", "Variant Price",
        "Variant Compare At Price", "Variant Requires Shipping", "Variant Taxable", "Unit Price Total Measure",
        "Unit Price Total Measure Unit", "Unit Price Base Measure", "Unit Price Base Measure Unit",
        "Variant Barcodes", "Image Src", "Image Position", "Image Alt Text", "Gift Card", "SEO Title",
        "SEO Description", "Conversation starters (product.metafields.app--3026047.conversation_starters)",
        "Variant Image", "Variant Weight Unit", "Variant Tax Code", "Cost per item", "Status",
        "Variant Packed Length", "Variant Packed Width", "Variant Packed Height", "Variant Packed Dimension Unit"]

INV_COLS = ["Handle", "Title", "Option1 Name", "Option1 Value", "Option2 Name", "Option2 Value", "Option3 Name",
            "Option3 Value", "SKU", "HS Code", "COO", "Location", "Bin name", "Incoming (not editable)",
            "Unavailable (not editable)", "Committed (not editable)", "Available (not editable)",
            "On hand (current)", "On hand (new)"]


def url(name):
    return IMAGE_BASE + name


def grams(lb):
    return str(int(round(lb * GRAMS_PER_LB)))


def money(x):
    return f"{x:.2f}"


def round05(x):
    return round(x * 20) / 20


def para(s):
    return f"<p>{s}</p>"


def seo_desc(body):
    s = re.sub(r"\s+", " ", body)
    return s if len(s) <= 155 else s[:152].rsplit(" ", 1)[0] + "..."


def prep_image(src, name_no_ext, force_webp=False):
    """Copy (JPG) or convert (PNG -> WebP) into OUT/images. Returns final file name."""
    os.makedirs(os.path.join(OUT, "images"), exist_ok=True)
    if src.lower().endswith(".png") or force_webp:
        fn = name_no_ext + ".webp"
        im = Image.open(src).convert("RGB")
        im.save(os.path.join(OUT, "images", fn), "WEBP", quality=90, method=6)
    else:
        fn = name_no_ext + ".jpg"
        shutil.copyfile(src, os.path.join(OUT, "images", fn))
    return fn


def build():
    shutil.rmtree(os.path.join(OUT, "images"), ignore_errors=True)
    rows, inv, imgmap = [], [], []
    seen_handles, seen_skus = set(), set()

    def add_rows(p, variants, images):
        """variants: list of dicts(opt1,opt2,sku,lb,price,cost,variant_image,stock). images: list of (url, alt)."""
        assert p["handle"] not in seen_handles, p["handle"]
        seen_handles.add(p["handle"])
        n = max(len(variants), len(images))
        l, w, h = p["dims"]
        for i in range(n):
            r = {c: "" for c in COLS}
            r["Handle"] = p["handle"]
            if i < len(variants):
                v = variants[i]
                assert v["sku"] not in seen_skus, v["sku"]
                seen_skus.add(v["sku"])
                r["Option1 Value"] = v["opt1"]
                r["Option2 Value"] = v.get("opt2", "")
                r["Variant SKU"] = v["sku"]
                r["Variant Grams"] = grams(v["lb"])
                r["Variant Inventory Tracker"] = "shopify"
                r["Variant Inventory Policy"] = "deny"
                r["Variant Fulfillment Service"] = "manual"
                r["Variant Price"] = money(v["price"])
                r["Variant Requires Shipping"] = "true"
                r["Variant Taxable"] = "true"
                r["Variant Image"] = v.get("variant_image", "")
                r["Variant Weight Unit"] = "lb"
                r["Cost per item"] = money(v["cost"])
                r["Variant Packed Length"], r["Variant Packed Width"], r["Variant Packed Height"] = l, w, h
                r["Variant Packed Dimension Unit"] = "in"
                inv.append({"Handle": p["handle"], "Title": p["title"], "Option1 Name": p["opt1_name"],
                            "Option1 Value": v["opt1"], "Option2 Name": p.get("opt2_name", ""),
                            "Option2 Value": v.get("opt2", ""), "SKU": v["sku"], "Location": LOCATION,
                            "Incoming (not editable)": 0, "Unavailable (not editable)": 0,
                            "Committed (not editable)": 0, "Available (not editable)": v["stock"],
                            "On hand (new)": v["stock"]})
            if i < len(images):
                r["Image Src"], r["Image Alt Text"] = images[i]
                r["Image Position"] = i + 1
            if i == 0:
                r["Title"] = p["title"]
                r["Body (HTML)"] = para(p["body"])
                r["Vendor"] = VENDOR
                r["Product Category"] = p["cat"]
                r["Type"] = p["type"]
                r["Tags"] = p["tags"]
                r["Published"] = "true"
                r["Option1 Name"] = p["opt1_name"]
                r["Option2 Name"] = p.get("opt2_name", "")
                r["Gift Card"] = "false"
                r["SEO Title"] = f"{p['title']} | {VENDOR}"
                r["SEO Description"] = seo_desc(p["body"])
                r["Status"] = "active"
            rows.append(r)

    # ---- apparel ----
    for p in PRODUCTS:
        cost_unit = round(p["price"] * 0.38, 2)
        colors = p.get("colors")
        stock_factor = p.get("stock", 1.0)
        p["opt1_name"] = "Size"
        variants, images = [], []
        base_img_names = []
        if colors:
            p["opt2_name"] = "Color"
            for ci, col in enumerate(colors):
                src, alt = p["images"][ci]
                fn = prep_image(src, f"mgy-{p['handle']}-{col.lower()}")
                base_img_names.append(fn)
                images.append((url(fn), alt))
                imgmap.append((os.path.relpath(src, SRC), fn, p["title"]))
            for ci, col in enumerate(colors):
                for s in SIZES:
                    variants.append(dict(opt1=s, opt2=col, sku=f"{p['sku']}-{col[:3].upper()}-{s}",
                                         lb=round05(p["lb"] * SIZE_WEIGHT_FACTOR[s]), price=p["price"], cost=cost_unit,
                                         variant_image=url(base_img_names[ci]),
                                         stock=max(1, round(SIZE_STOCK[s] * stock_factor))))
        else:
            src, alt = p["images"][0]
            fn = prep_image(src, f"mgy-{p['handle']}")
            images.append((url(fn), alt))
            imgmap.append((os.path.relpath(src, SRC), fn, p["title"]))
            for s in SIZES:
                variants.append(dict(opt1=s, sku=f"{p['sku']}-{s}", lb=round05(p["lb"] * SIZE_WEIGHT_FACTOR[s]),
                                     price=p["price"], cost=cost_unit,
                                     stock=max(1, round(SIZE_STOCK[s] * stock_factor))))
        add_rows(p, variants, images)

    # ---- jewelry ----
    for j in JEWELRY:
        images = []
        for k, (src, name, alt) in enumerate(j["images"]):
            fn = prep_image(src, name, force_webp=True)
            images.append((url(fn), alt))
            imgmap.append((os.path.relpath(src, SRC), fn, j["title"]))
        if j["kind"] == "option":
            j["opt1_name"] = j["opt_name"]
            variants = [dict(opt1=val, sku=f"{j['sku']}-{re.sub(r'[^0-9A-Za-z]', '', val.split()[0])}", lb=lb,
                             price=price, cost=j["cost"], stock=stock) for (val, price, lb, stock) in j["opts"]]
        else:
            j["opt1_name"] = "Title"
            variants = [dict(opt1="Default Title", sku=j["sku"], lb=j["lb"], price=j["price"], cost=j["cost"],
                             stock=j["stock"])]
        add_rows(j, variants, images)

    # ---- sanity: alt text must never contain the word "back" (the theme treats that as a back-view photo) ----
    for r in rows:
        assert "back" not in r["Image Alt Text"].lower().replace("black", ""), r["Image Alt Text"]

    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "mgy_products_import.csv"), "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=COLS, quoting=csv.QUOTE_MINIMAL, lineterminator="\n")
        wr.writeheader()
        wr.writerows(rows)
    with open(os.path.join(OUT, "mgy_inventory_import.csv"), "w", newline="", encoding="utf-8") as f:
        wr = csv.DictWriter(f, fieldnames=INV_COLS, quoting=csv.QUOTE_MINIMAL, lineterminator="\n", restval="")
        wr.writeheader()
        wr.writerows(inv)
    with open(os.path.join(OUT, "image-map.csv"), "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f, lineterminator="\n")
        wr.writerow(["original file", "upload-ready file", "product"])
        wr.writerows(imgmap)

    n_prod = len(seen_handles)
    print(f"{n_prod} products, {len(inv)} variants, {len(rows)} CSV rows, {len(imgmap)} images")


if __name__ == "__main__":
    build()
