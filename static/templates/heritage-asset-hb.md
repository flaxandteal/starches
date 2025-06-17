## Names

{{#each ha.monument_names }}
- {{ monument_name }}
{{/each}}

---

## Classification

{{{ ha.category_type }}}

{{{ ha.monument_type_n1 }}}

{{#each ha.characterization }}
- {{{ . }}}
{{/each}}

---

## Reference Numbers

{{#if ha.heritage_asset_references.hb_number }}
**%HB No.**: {{ ha.heritage_asset_references.hb_number }}

{{/if}}
{{#if ha.heritage_asset_references.smr_number }}
**%SMR No.**: {{ ha.heritage_asset_references.smr_number }}

{{/if}}
{{#if ha.heritage_asset_references.ihr_number }}
**%IHR No.**: {{ ha.heritage_asset_references.ihr_number }}

{{/if}}
---

## Summary

**%Condition Type**: {{{ defaulty ha.condition_type (defaulty ha.condition_description.condition "(none)") }}}

---

## %Descriptions

#### This needs fixed to add permission filtering

{{#each ha.descriptions }}
#### {{{ clean description_type }}}

{{ replace (replace description "_x000D_" "") "\n" "<br/>" }}

{{/each}}

---

## Use Phases

{{#each ha.use_phases }}
**%Use Phase**: {{ . }}
{{/each}}

---

## Construction Phases

{{#each ha.construction_phases }}
**%Asset type**: {{{ phase_classification.monument_type }}}


{{/each}}

---

## Location

### Addresses

{{#each ha.location_data.addresses }}
| %Address |       |
| --- | ----- |
| **%Building Name** | {{ building_name.building_name_value }} |
| **%Full Address** | {{{ nl (replace full_address "_x000D_" "") "<br/>" }}} |
| **%Town/City** | {{ town_or_city.town_or_city_value }} |
| **%Townland** | {{{ townlands.townland }}} |
| **%County** | {{{ county.county_value }}} |
| **%Ward** | {{ locality.locality_value }} |

{{/each}}

### %Administrative Areas

| Area | Name |
| ---- | ---- |
{{#each ha.location_data.localities_administrative_areas }}
| {{{ clean area_type }}} | {{{ area_names.area_name }}} |
{{/each}}
| **%Council** | {{{ defaulty ha.location_data.council "(none)" }}} |

**%OS Map No.**: {{ defaulty ha.location_data.geometry.current_base_map.current_base_map_names.current_base_map_name "(none)"}}

**%Geometric Properties**: {{ defaulty ha.location_data.geometry.spatial_metadata_descriptions.spatial_metadata_notes "(none)"}}

**%Grid Reference**: {{ defaulty ha.location_data.national_grid_references.irish_grid_reference_tm65_ "(none)"}}

### Area Assignments

{{#each ha.location_data.area_assignments.area_assignment }}

{{{ area_reference.area_reference_value }}}

{{/each}}

### Location Descriptions

{{#each ha.location_data.location_descriptions }}

{{{ location_description }}}

{{/each}}

---

## Dates

{{#each ha.construction_phases }}
**%Date**: {{ construction_phase_timespan.construction_phase_display_date }}
{{/each}}

{{#if ha.sign_off.input_date.input_date_value }}
**%Record established**: {{{ ha.sign_off.input_date.input_date_value }}}
{{/if}}


---

## Designation

| &nbsp; | &nbsp; |
| ------ | ------ |
{{#each ha.designation_and_protection_assignment }}
| %Name | {{ designation_names.designation_name }} |
| %Grade | {{{ default grade "N/A" }}} |
| %Type | {{{ default designation_or_protection_type "N/A" }}} |
| %Criteria for Listing | {{{ join scheduling_criteria ", " }}} |
| %Start Date | {{{ designation_and_protection_timespan.designation_start_date }}} |
| %Amendment Date | {{{ designation_and_protection_timespan.designation_amendment_date }}} |
| %End Date | {{{ designation_and_protection_timespan.designation_end_date }}} |
| %Extent | {{ extent_of_designation_or_protection.description_of_extent }} |
| (TBC) | {{ designation_and_protection_timespan.display_date }} |

---
{{/each}}

## %Actor

{{#each ha.associated_actors }}
{{{ associated_actor.actor }}}
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

