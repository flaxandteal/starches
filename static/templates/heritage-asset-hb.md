# {{ title }}

## Names

{{#each (await ha.monument_names) }}
- {{ await monument_name }}
{{/each}}

---

## Reference Numbers

{{#if (not ha.heritage_asset_references.hb_number "") }}
**HB No.**: {{ await ha.heritage_asset_references.hb_number }}
{{/if}}
{{#if (not ha.heritage_asset_references.smr_number "") }}
**SMR No.**: {{ await ha.heritage_asset_references.smr_number }}
{{/if}}

---

## Summary

**Condition Type**: {{ defaulty ha.condition_type (defaulty ha.condition_description.condition "(none)") }}

---

## Descriptions

{{#each (await ha.descriptions) }}
#### {{ await description_type }} 

{{ replace (replace (await description) "_x000D_" "") "\n" "<br/>" }}

{{/each}}

---

## Location

### Addresses

{{#each (await ha.location_data.addresses) }}
| Address |       |
| --- | ----- |
| **Building Name** | {{ await building_name.building_name_value }} |
| **Full Address** | {{ replace (replace (await full_address) "_x000D_" "") "\n" "<br/>" }} |
| **Town/City** | {{ await town_or_city.town_or_city_value }} |
| **Ward** | {{ await locality.locality_value }} |

{{/each}}

### Administrative Areas

| Area | Name |
| ---- | ---- |
{{#each (await ha.location_data.localities_administrative_areas)}}
| **{{ await area_type }}** | {{ await area_names.area_name }} |
{{/each}}
| **Council** | {{ defaulty ha.location_data.council "(none)" }} |

**Grid Reference**: {{ defaulty ha.location_data.national_grid_references.irish_grid_reference_tm65_ "(none)"}}

---

## Dates

{{#each (await ha.construction_phases) }}
**Date**: {{ await construction_phase_timespan.construction_phase_display_date }}
{{/each}}


---

## Designation

| &nbsp; | &nbsp; |
| ------ | ------ |
{{#each (await ha.designation_and_protection_assignment) }}
| Name | {{ await designation_names.designation_name }} |
| Grade | {{ default (await grade) "N/A" }} |
| Type | {{ default (await designation_or_protection_type) "N/A" }} |
| Start Date | {{ await designation_and_protection_timespan.designation_start_date }} |
| Amendment Date | {{ await designation_and_protection_timespan.designation_amendment_date }} |
| End Date | {{ await designation_and_protection_timespan.designation_end_date }} |
| (TBC) | {{ await designation_and_protection_timespan.display_date }} |

---
{{/each}}

---

# External Cross References

| Source | Reference | Notes | URL |
| ------ | --------- | ----- | --- |
{{#each (await ha.external_cross_references) }}
| {{ await external_cross_reference_source }} | {{ await external_cross_reference }} | {{ await external_cross_reference_notes.external_cross_reference_description_type }} | {{ await external_cross_reference_notes.external_cross_reference_description }} |
{{/each}}

---

# Bibliography

TODO
