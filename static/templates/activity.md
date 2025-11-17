## Names

{{#each ha.activity_names }}
- {{ activity_name }}
{{/each}}

{{#if ha.system_reference_numbers }}
## Reference Numbers

{{#if ha.system_reference_numbers.primaryreferencenumber }}
**Primary Reference Number**: {{ ha.system_reference_numbers.primaryreferencenumber.primary_reference_number }}

{{/if}}
{{#if ha.system_reference_numbers.uuid }}
**Resource ID**: {{ ha.system_reference_numbers.uuid.resource_id }}

{{/if}}
{{#if ha.heritage_asset_references.legacyid }}
**Legacy ID**: {{ ha.system_reference_numbers.legacyid.legacy_id }}

{{/if}}
---
{{/if}}

{{#if ha.record_status_assignment }}
## Record

**Record Status**: {{{ record_status }}}
{{/if}}

{{#if ha.location_data }}
## Location

{{#if ha.location_data.national_grid_references.irish_grid_reference_tm65 }}
**Irish Grid Reference**: {{ ha.location_data.national_grid_references.irish_grid_reference_tm65 }}
{{/if}}

{{#if ha.location_data.addresses.county_value }}
**County**: {{ ha.location_data.addresses.county_value }}
{{/if}}

---
{{/if}}

{{#if activity_descriptions }}

## Descriptions

{{#each ha.activity_descriptions }}
#### {{{ clean activity_description_type }}}

{{ replace (replace activity_description "_x000D_" "") "\n" "<br/>" }}

{{/each}}

---
{{/if}}

{{#if associated_licence }}
associated_licence
{{/if}}

{{#if ecrs }}

---

## Cross References

| &nbsp; | Name | Description
| ----- | - | - |
{{#each ecrs }}
| #{{ plus @index 1 }} | {{{ external_cross_reference_source }}} | {{ external_cross_reference }} |
{{/each}}

{{/if}}
