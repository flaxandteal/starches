## Names

{{#each ha.names }}
- {{ name }}
{{/each}}

## Classification

{{#if ha.category_type }}
[Category Type](@category_type): {{{ ha.category_type }}}
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
[Use Phase](@use_phases): {{ . }}
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

### Administrative Areas

| Area | Name |
| ---- | ---- |
{{#each ha.location_data.localities_administrative_areas }}
| [{{{ clean area_type }}}](@localities_administrative_areas) | {{{ area_names.area_name }}} |
{{/each}}

[OS Map No.](@current_base_map_name): {{ defaulty ha.location_data.geometry.current_base_map.current_base_map_names.current_base_map_name "(none)"}}

[Geometric Properties](@spatial_metadata_notes): {{ defaulty ha.location_data.geometry.spatial_metadata_descriptions.spatial_metadata_notes "(none)"}}

[Grid Reference](@irish_grid_reference_tm65_): {{ defaulty ha.location_data.national_grid_references.irish_grid_reference_tm65_ "(none)"}}

## Dates

{{#each ha.construction_phases }}
[Date](@construction_phase_display_date): {{ construction_phase_timespan.construction_phase_display_date }}
{{/each}}
