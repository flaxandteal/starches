## Names

{{#if ha.display_name }}
<em>{{ ha.display_name }}</em>
{{/if}}

{{#each ha.monument_names }}
- {{ monument_name }}
{{/each}}

## Classification

{{#if ha.category_type }}
[Category Type](@category_type): {{{ ha.category_type }}}
{{/if}}

{{#if ha.monument_type_n1 }}
[Heritage Asset Type](@monument_type_n1): {{{ ha.monument_type_n1 }}}
{{/if}}

{{#if ha.characterization }}
[Characterization](@characterization):

{{#each ha.characterization }}
- {{{ . }}}
{{/each}}
{{/if}}

## Reference Numbers

{{#if ha.heritage_asset_references.hb_number }}
[HB No.](@hb_number): {{ ha.heritage_asset_references.hb_number }}

{{/if}}
{{#if ha.heritage_asset_references.smr_number }}
[SMR No.](@smr_number): {{ ha.heritage_asset_references.smr_number }}

{{/if}}
{{#if ha.heritage_asset_references.ihr_number }}
[IHR No.](@ihr_number): {{ ha.heritage_asset_references.ihr_number }}

{{/if}}

## Summary

[Condition Type](@condition_type): {{{ defaulty ha.condition_type (defaulty ha.condition_description.condition "(none)") }}}

## Descriptions

[Descriptions](@descriptions)

{{#each ha.descriptions }}

### {{{ clean description_type }}}

{{{ replace (replace description "_x000D_" "") "\n" "<br/>" }}}

---

{{/each}}

{{#if ha.use_phases}}

## Use Phases

{{#each ha.use_phases }}
[Use Phase](@use_phase): {{ . }}
{{/each}}

{{/if}}

{{#if ha.construction_phases}}

## Construction Phases

{{#each ha.construction_phases }}
[Asset type](@monument_type): {{{ phase_classification.monument_type }}}

---

{{/each}}

{{/if}}

## Location

### Addresses

{{#each ha.location_data.addresses }}
| Address |       |
| --- | ----- |
{{#if building_name.building_name_value }}
| [Building Name](@building_name) | {{ building_name.building_name_value }} |
{{/if}}
{{#if full_address }}
| [Full Address](@full_address) | {{{ nl (replace full_address "_x000D_" "") "<br/>" }}} |
{{/if}}
{{#if town_or_city.town_or_city_value }}
| [Town/City](@town_or_city) | {{ town_or_city.town_or_city_value }} |
{{/if}}
{{#if townlands.townland }}
| [Townland](@townlands) | {{{ townlands.townland }}} |
{{/if}}
{{#if county.county_value }}
| [County](@county) | {{{ county.county_value }}} |
{{/if}}
{{#if locality.locality_value }}
| [Ward](@locality) | {{ locality.locality_value }} |
{{/if}}

{{/each}}

### Administrative Areas

| Area | Name |
| ---- | ---- |
{{#each ha.location_data.localities_administrative_areas }}
| [{{{ clean area_type }}}](@localities_administrative_areas) | {{{ area_names.area_name }}} |
{{/each}}
| [Council](@council) | {{{ defaulty ha.location_data.council "(none)" }}} |

[OS Map No.](@current_base_map_name): {{ defaulty ha.location_data.geometry.current_base_map.current_base_map_names.current_base_map_name "(none)"}}

[Geometric Properties](@spatial_metadata_notes): {{ defaulty ha.location_data.geometry.spatial_metadata_descriptions.spatial_metadata_notes "(none)"}}

[Grid Reference](@irish_grid_reference_tm65_): {{ defaulty ha.location_data.national_grid_references.irish_grid_reference_tm65_ "(none)"}}

## Dates

{{#if ha.historical_period_type }}
{{#each ha.historical_period_type }}
[Period](@historical_period_type): {{{ . }}}
{{/each}}
{{/if}}

{{#each ha.construction_phases }}
{{#if construction_phase_timespan.construction_phase_display_date }}
[Construction](@construction_phase_display_date): {{ construction_phase_timespan.construction_phase_display_date }}
{{/if}}
{{/each}}

{{#if ha.sign_off.input_date.input_date_value }}
[Record established](@input_date): {{{ ha.sign_off.input_date.input_date_value }}}
{{/if}}

{{#if ha.associated_actors.length }}
## People &amp; Organisations

{{#each ha.associated_actors }}
### {{{ associated_actor.role_type }}}

{{{ associated_actor.actor }}}

{{/each}}

{{/if}}

## Designation

{{#if ha.designation_and_protection_assignment.length }}
{{#each ha.designation_and_protection_assignment }}

| {{{ default designation_or_protection_type "N/A" }}} | &nbsp; |
| ------ | ------ |
{{#each designation_and_protection_timespan.recommended_designation_type }}
| [Recommended Designation](@recommended_designation_type) | {{{ . }}} |
{{/each}}
{{#if designation_names.designation_name }}
| [Name](@designation_name) | {{ designation_names.designation_name }} |
{{/if}}
{{#if grade }}
| [Grade](@grade) | {{{ default grade "N/A" }}} |
{{/if}}
{{#if scheduling_criteria }}
| [Criteria for Listing](@scheduling_criteria) | {{{ join scheduling_criteria ", " }}} |
{{/if}}
{{#if designation_and_protection_timespan.designation_start_date }}
| [Start Date](@designation_start_date) | {{{ designation_and_protection_timespan.designation_start_date }}} |
{{/if}}
{{#if designation_and_protection_timespan.designation_amendment_date }}
| [Amendment Date](@designation_amendment_date) | {{{ designation_and_protection_timespan.designation_amendment_date }}} |
{{/if}}
{{#if designation_and_protection_timespan.designation_end_date }}
| [End Date](@designation_end_date) | {{{ designation_and_protection_timespan.designation_end_date }}} |
{{/if}}
{{#if extent_of_designation_or_protection.description_of_extent }}
| [Extent](@description_of_extent) | {{ extent_of_designation_or_protection.description_of_extent }} |
{{/if}}

{{/each}}
{{else}}
### (No designation)

_NB: some physical assets have overlapping entries across multiple records, which could carry designations._
{{/if}}

{{#if images }}

## Images

| &nbsp; | Image | &nbsp; |
| - | ----- | - |
{{#each images }}
| Image {{ plus @index 1 }} | {{ image.external_cross_reference }} | {{dialogLink id=(concat "image_" index) linkText="Show"}} |
{{/each}}

{{/if}}

{{#if files }}

## Files

| &nbsp; | Name | File
| ----- | - | - |
{{#each files }}
| File {{ plus @index 1 }} | {{ external_cross_reference }} | [{{ defaulty external_cross_reference_notes.external_cross_reference_description "Download"}}]({{ nospace (clean url) }}) |
{{/each}}

{{/if}}

{{#if ecrs }}

## Cross References

| &nbsp; | Name | Description
| ----- | - | - |
{{#each ecrs }}
| #{{ plus @index 1 }} | {{{ external_cross_reference_source }}} | {{ external_cross_reference }} |
{{/each}}

{{/if}}
