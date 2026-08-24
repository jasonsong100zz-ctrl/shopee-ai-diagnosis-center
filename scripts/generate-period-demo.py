import json
import re
import zipfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "pkg": "http://schemas.openxmlformats.org/package/2006/relationships",
}
DOWNLOADS = Path("C:/Users/Administrator/Downloads")
OUTPUT = Path("assets/demo-periods.json")
SOURCES = {
    "product": (
        "Brand_Portal-Business_Insights---Product_Analysis---Product_Performance-2026.08.16_2026.08.22.xlsx",
        "Brand_Portal-Business_Insights---Product_Analysis---Product_Performance-2026.08.09_2026.08.15.xlsx",
    ),
    "ads": (
        "On-platform_Ads_Report---Product_Ads_Performance---Skintific-Group-2026.08.22.xlsx",
        "On-platform_Ads_Report---Product_Ads_Performance---Skintific-Group-2026.08.15.xlsx",
    ),
    "livestream": (
        "Livestream_Report---Product_Performance---Skintific-Group-2026.08.22.xlsx",
        "Livestream_Report---Product_Performance---Skintific-Group-2026.08.15.xlsx",
    ),
}

def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    result = 0
    for char in letters:
        result = result * 26 + ord(char) - 64
    return result - 1

def read_workbook(path):
    with zipfile.ZipFile(path) as archive:
        shared = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("main:si", NS):
                shared.append("".join(node.text or "" for node in item.iter() if node.tag.endswith("}t")))
        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall("pkg:Relationship", NS)}
        sheets = {}
        for sheet in workbook.findall("main:sheets/main:sheet", NS):
            target = rel_map[sheet.attrib[f"{{{NS['rel']}}}id"]]
            if not target.startswith("xl/"):
                target = "xl/" + target.lstrip("/")
            root = ET.fromstring(archive.read(target))
            rows = []
            for row in root.findall("main:sheetData/main:row", NS):
                values = {}
                for cell in row.findall("main:c", NS):
                    ref = cell.attrib.get("r", "A1")
                    value = cell.find("main:v", NS)
                    text = "" if value is None else value.text or ""
                    if cell.attrib.get("t") == "s" and text:
                        text = shared[int(text)]
                    if cell.attrib.get("t") == "inlineStr":
                        text = "".join(node.text or "" for node in cell.iter() if node.tag.endswith("}t"))
                    values[col_index(ref)] = text
                rows.append(values)
            headers = rows[0] if rows else {}
            header_map = {index: str(value).strip() for index, value in headers.items() if value not in (None, "")}
            sheets[sheet.attrib["name"]] = [
                {header_map[index]: values.get(index, "") for index in header_map}
                for values in rows[1:] if values
            ]
        return sheets

def number(value):
    if value in (None, "", "-", "—"):
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None

def integer(value):
    value = number(value)
    return None if value is None else int(round(value))

def text(value):
    return "" if value is None else str(value).strip()

def period_label(sheets, fallback):
    for row in sheets.get("Definitions", []):
        for key, value in row.items():
            if text(key).lower() == "time period" or text(value).lower() == "time period":
                candidate = text(row.get("Explanation") or row.get(key))
                if candidate:
                    return candidate
    return fallback

def product_period(path):
    sheets = read_workbook(path)
    items = {}
    for row in sheets.get("Product Performance Item Level", []):
        product_id = text(row.get("Product ID"))
        if not product_id:
            continue
        items[product_id] = {
            "productId": product_id, "name": text(row.get("Name")), "url": text(row.get("URL")),
            "shop": text(row.get("Shop name")), "shopId": text(row.get("Shop ID")),
            "category": text(row.get("Category")), "rating": number(row.get("Product Rating")),
            "netUnits": integer(row.get("Net Units Sold")), "netOrders": integer(row.get("Net Orders")),
            "netSalesIdr": number(row.get("Net Sales(Rp)")), "buyers": integer(row.get("Net # of Unique Buyers")),
            "grossUnits": integer(row.get("Gross Units Sold")), "grossOrders": integer(row.get("Gross Orders")),
            "grossSalesIdr": number(row.get("Gross Sales(Rp)")), "views": integer(row.get("Product Views")),
            "clicks": integer(row.get("Product Clicks")), "visitors": integer(row.get("Product Visitors")),
            "atc": integer(row.get("ATC Units")), "modelAtp": number(row.get("Model ATP %")),
            "stock": integer(row.get("Current Stock")), "adis": number(row.get("L30D ADIS")),
            "coverage": number(row.get("Stock Coverage in Days")),
        }
    models = defaultdict(list)
    for row in sheets.get("Product Performance SKU Level", []):
        product_id = text(row.get("Product ID"))
        model_id = text(row.get("Product_Model ID"))
        if not product_id or not model_id:
            continue
        models[product_id].append({
            "modelId": model_id, "variation": text(row.get("Variation")), "sku": text(row.get("SKU")),
            "units": integer(row.get("Net Units Sold")), "orders": integer(row.get("Net Orders")),
            "salesIdr": number(row.get("Net Sales(Rp)")), "atc": integer(row.get("ATC Units")),
            "stock": integer(row.get("Current Stock")), "adis": number(row.get("L30D ADIS")),
            "coverage": number(row.get("Stock Coverage in Days")),
        })
    for product_id, product in items.items():
        product["models"] = sorted(models.get(product_id, []), key=lambda row: row.get("units") or 0, reverse=True)[:40]
    return {"label": period_label(sheets, path.stem), "rows": sorted(items.values(), key=lambda row: row.get("netSalesIdr") or 0, reverse=True)}

def ads_period(path):
    sheets = read_workbook(path)
    rows = []
    for row in sheets.get("By Product", []):
        product_id = text(row.get("Product ID"))
        if not product_id:
            continue
        rows.append({
            "productId": product_id, "name": text(row.get("Product Name")), "shop": text(row.get("Shop Name")),
            "shopId": text(row.get("Shop ID")), "impressions": integer(row.get("Impressions")),
            "clicks": integer(row.get("Clicks")), "ctr": number(row.get("CTR")),
            "spendIdr": number(row.get("Ads Spend(Local currency)")), "orders": integer(row.get("Orders")),
            "salesIdr": number(row.get("Gross Sales(Local currency)")), "roas": number(row.get("ROAS")),
            "units": integer(row.get("Units Sold")), "cr": number(row.get("CR")), "cpc": number(row.get("CPC")),
        })
    return {"label": period_label(sheets, path.stem), "rows": sorted(rows, key=lambda row: row.get("salesIdr") or 0, reverse=True)}

def livestream_period(path):
    sheets = read_workbook(path)
    rows = []
    for row in sheets.get("By Product", []):
        product_id = text(row.get("Product ID"))
        if not product_id:
            continue
        rows.append({
            "productId": product_id, "name": text(row.get("Product Name")), "shop": text(row.get("Shop Name")),
            "shopId": text(row.get("Shop ID")), "buyers": integer(row.get("Buyers")),
            "atc": integer(row.get("ATC Units")), "units": integer(row.get("Units Sold")),
            "orders": integer(row.get("Orders")), "grossSalesIdr": number(row.get("Gross Sales(Local Currency)")),
            "netSalesIdr": number(row.get("Net Sales(Local Currency)")),
        })
    return {"label": period_label(sheets, path.stem), "rows": sorted(rows, key=lambda row: row.get("netSalesIdr") or 0, reverse=True)}

def compact(module, limit=None):
    if limit is None:
        return module
    current = module["current"]["rows"]
    compare = module["compare"]["rows"]
    ids = {row["productId"] for row in current[:limit]} | {row["productId"] for row in compare[:limit]}
    module["current"]["rows"] = [row for row in current if row["productId"] in ids]
    module["compare"]["rows"] = [row for row in compare if row["productId"] in ids]
    if module["current"]["rows"]:
        module["current"]["rows"] = module["current"]["rows"][:limit]
    if module["compare"]["rows"]:
        module["compare"]["rows"] = module["compare"]["rows"][:limit]
    return module

def main():
    modules = {}
    for key, (current_name, compare_name) in SOURCES.items():
        parser = {"product": product_period, "ads": ads_period, "livestream": livestream_period}[key]
        modules[key] = compact({"current": parser(DOWNLOADS / current_name), "compare": parser(DOWNLOADS / compare_name)})
    OUTPUT.write_text(json.dumps({"schemaVersion": "period-demo-v1", "generatedAt": "2026-08-24", "modules": modules}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({key: {"current": len(value["current"]["rows"]), "compare": len(value["compare"]["rows"])} for key, value in modules.items()}, ensure_ascii=False))

if __name__ == "__main__":
    main()
