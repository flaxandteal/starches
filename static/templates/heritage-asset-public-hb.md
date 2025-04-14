# {{ title }}

## Names

{{#each ha.monument_names }}
- {{ monument_name }}
{{/each}}

---

## Reference Numbers

{{#if (not ha.heritage_asset_references.hb_number "") }}
**HB No.**: {{ ha.heritage_asset_references.hb_number }}
{{/if}}
{{#if (not ha.heritage_asset_references.smr_number "") }}
**SMR No.**: {{ ha.heritage_asset_references.smr_number }}
{{/if}}

---

## Summary

**Condition Type**: {{{ defaulty ha.condition_type (defaulty ha.condition_description.condition "(none)") }}}

---

## Descriptions

{{#each ha.descriptions }}
#### {{{ clean description_type }}}

{{ replace (replace description "_x000D_" "") "\n" "<br/>" }}

{{/each}}

---

## Location

### Addresses

{{#each ha.location_data.addresses }}
| Address |       |
| --- | ----- |
| **Building Name** | {{ building_name.building_name_value }} |
| **Full Address** | {{ replace (replace full_address "_x000D_" "") "\n" "<br/>" }} |
| **Town/City** | {{ town_or_city.town_or_city_value }} |
| **Ward** | {{ locality.locality_value }} |

{{/each}}

### Administrative Areas

| Area | Name |
| ---- | ---- |
{{#each ha.location_data.localities_administrative_areas }}
| {{{ clean area_type }}} | {{{ area_names.area_name }}} |
{{/each}}
| **Council** | {{ defaulty ha.location_data.council "(none)" }} |

**Grid Reference**: {{ defaulty ha.location_data.national_grid_references.irish_grid_reference_tm65_ "(none)"}}

---

## Dates

{{#each ha.construction_phases }}
**Date**: {{ construction_phase_timespan.construction_phase_display_date }}
{{/each}}


---

## Designation

| &nbsp; | &nbsp; |
| ------ | ------ |
{{#each ha.designation_and_protection_assignment }}
| Name | {{ designation_names.designation_name }} |
| Grade | {{{ default grade "N/A" }}} |
| Type | {{{ default designation_or_protection_type "N/A" }}} |
| Start Date | {{ designation_and_protection_timespan.designation_start_date }} |
| Amendment Date | {{ designation_and_protection_timespan.designation_amendment_date }} |
| End Date | {{ designation_and_protection_timespan.designation_end_date }} |
| (TBC) | {{ designation_and_protection_timespan.display_date }} |

---
{{/each}}

{{#if ecrs}}
---

# External Cross References

| Source | Reference | Notes | URL |
| ------ | --------- | ----- | --- |
{{#each ecrs }}
| {{{ clean external_cross_reference_source }}} | {{ external_cross_reference }} | {{ external_cross_reference_notes.external_cross_reference_description_type }} | {{ external_cross_reference_notes.external_cross_reference_description }} |
{{/each}}
{{/if}}

{{#if images }}

---

# Images

| &nbsp; | Image | &nbsp; |
| - | ----- | - |
{{#each images }}
| Image {{ plus @index 1 }} | {{ image.external_cross_reference }} | {{dialogLink id=(concat "image_" index) linkText="Show"}} |
{{/each}}

{{/if}}

{{#if files }}

---

# Files

| &nbsp; | Name | File
| ----- | - | - |
{{#each files }}
| File {{ plus @index 1 }} | {{ external_cross_reference }} | [{{ defaulty external_cross_reference_notes.external_cross_reference_description "Download"}}]({{ nospace url }}) |
{{/each}}

{{/if}}

---

# Bibliography

