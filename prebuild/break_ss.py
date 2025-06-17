import json

with open("business_data/ss_har_merged.json") as f:
    whole = json.load(f)
    parts = []
    for n, resource in enumerate(whole["business_data"]["resources"]):
        if n % 3000 == 0:
            part = []
            parts.append(part)
        part.append(resource)
for n, part in enumerate(parts):
    with open(f"business_data/ss_har_merged_{n}.json", "w") as f:
        json.dump({
            "business_data": {
                "resources": part
            }
        }, f, indent=2)
