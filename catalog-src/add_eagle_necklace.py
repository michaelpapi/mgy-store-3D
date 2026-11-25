#!/usr/bin/env python3
"""
Adds the MGY Eagle Necklace (gold) to the catalog CSVs, right ahead of the silver MGY Pendant & Curb Chain.

    python3 add_eagle_necklace.py
    cd .. && npm run catalog && npm run images

It copies the pendant chain's rows (same lengths, same columns) and changes the name, finish, SKUs, photos, price and weight.
Safe to run again. Prices, weights, stock and the description are PLACEHOLDERS: change them below and re-run.
The three photos are renders of the 3D model (photos-src/products/mgy-eagle-necklace*.webp, made by scripts/render-model-photos.mjs).
"""
import csv, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_catalog as bc

HERE = os.path.dirname(os.path.abspath(__file__))
HANDLE, SRC_HANDLE = "mgy-eagle-necklace", "mgy-pendant-curb-chain"
TITLE = "MGY Eagle Necklace"
BODY = "The MGY eagle crest pendant in a polished gold finish, hung on a Cuban chain with a lobster clasp. Available in 18, 20, 22 and 24 inch chain lengths."
PRICES = {"18 in": 120, "20 in": 125, "22 in": 130, "24 in": 135}      # USD, placeholders
GRAMS = {"18 in": 204, "20 in": 227, "22 in": 249, "24 in": 272}       # placeholders (copied from the silver chain)
STOCK = {"18 in": 6, "20 in": 8, "22 in": 8, "24 in": 6}               # placeholders
PHOTOS = [  # (file name without .webp, alt text); alt text must not contain the word "back"
    ("mgy-eagle-necklace", "MGY eagle crest pendant on a gold Cuban chain (3D render)"),
    ("mgy-eagle-necklace-2", "Close-up of the gold MGY eagle crest pendant hanging from its chain (3D render)"),
    ("mgy-eagle-necklace-3", "Front view of the gold eagle crest pendant with spread wings and a shield (3D render)"),
]
TAGS = "Jewelry, Gold, Eagle, Pendant, Necklace, Chain"
SKU = "JWL-04"

def rewrite(path, fields, make):
    with open(path, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if r["Handle"] != HANDLE]
    out, done = [], False
    for r in rows:
        if r["Handle"] == SRC_HANDLE and not done:
            out += make([x for x in rows if x["Handle"] == SRC_HANDLE]); done = True
        out.append(r)
    assert done, f"{SRC_HANDLE} not found in {path}"
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, quoting=csv.QUOTE_MINIMAL, lineterminator="\n", restval="")
        w.writeheader(); w.writerows(out)

def product_rows(src):
    new = []
    for i, r in enumerate(src):
        n = dict(r); length = r["Option1 Value"]
        n["Handle"] = HANDLE
        n["Variant SKU"] = f"{SKU}-{length.split()[0]}"
        n["Variant Price"] = f"{PRICES[length]:.2f}"; n["Variant Grams"] = str(GRAMS[length])
        n["Cost per item"] = f"{PRICES[length] * 0.4:.2f}"
        if i == 0:
            n["Title"] = TITLE; n["Body (HTML)"] = f"<p>{BODY}</p>"; n["Tags"] = TAGS
            n["SEO Title"] = f"{TITLE} | Misguided Yutes"; n["SEO Description"] = BODY
        if i < len(PHOTOS):
            fn, alt = PHOTOS[i]; n["Image Src"] = bc.url(fn + ".webp"); n["Image Alt Text"] = alt; n["Image Position"] = str(i + 1)
        else:
            n["Image Src"] = ""; n["Image Alt Text"] = ""; n["Image Position"] = ""
        new.append(n)
    return new

def inventory_rows(src):
    new = []
    for r in src:
        n = dict(r); length = r["Option1 Value"]
        n["Handle"] = HANDLE; n["Title"] = TITLE; n["SKU"] = f"{SKU}-{length.split()[0]}"
        n["Available (not editable)"] = str(STOCK[length]); n["On hand (new)"] = str(STOCK[length])
        new.append(n)
    return new

for a, _ in PHOTOS:
    p = os.path.join(os.path.dirname(HERE), "photos-src", "products", a + ".webp")
    assert os.path.exists(p), f"missing photo {p} (run scripts/render-model-photos.mjs)"
rewrite(os.path.join(HERE, "mgy_products_import.csv"), bc.COLS, product_rows)
rewrite(os.path.join(HERE, "mgy_inventory_import.csv"), bc.INV_COLS, inventory_rows)
print(f"added {TITLE} ({len(PRICES)} lengths). Next: cd .. && npm run catalog && npm run images")
